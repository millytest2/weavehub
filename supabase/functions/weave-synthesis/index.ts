import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WeaveSynthesisOutput {
  synthesis: string;
  coreThemes: string[];
  emergingDirection: string;
  hiddenConnections: string[];
  whatYourMindIsSaying: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body for action type
    let action = "full_synthesis";
    let includeSynthesis = false;
    try {
      const body = await req.json();
      action = body?.action || "full_synthesis";
      includeSynthesis = body?.includeSynthesis === true;
    } catch {
      // Default action
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Handle "cluster_connection" action - shows how a topic cluster connects to Misogi
    if (action === "cluster_connection") {
      let clusterName = "";
      let insightTitles: string[] = [];
      let yearNote = "";
      
      try {
        const body = await req.clone().json();
        clusterName = body?.clusterName || "";
        insightTitles = body?.insightTitles || [];
        yearNote = body?.yearNote || "";
      } catch {
        // Default values
      }
      
      // Generate connection using AI
      if (LOVABLE_API_KEY && yearNote) {
        try {
          const systemPrompt = `You help users understand how clusters of knowledge connect to their life direction.

CLUSTER: ${clusterName}
INSIGHTS IN THIS CLUSTER: ${insightTitles.join(", ")}
USER'S 2026 DIRECTION: ${yearNote}

Return a JSON object with:
1. "connection": One sentence (max 20 words) showing how this topic cluster contributes to their 2026 direction. Be specific, reference their actual words.
2. "action": One simple thing they could do with this cluster (max 15 words). Concrete and actionable.

Be direct. No fluff. No generic advice.`;

          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Generate the connection and action. Return ONLY valid JSON." }
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            if (content) {
              try {
                const parsed = JSON.parse(content);
                return new Response(JSON.stringify({
                  connection: parsed.connection || `Your ${clusterName} insights support your direction.`,
                  action: parsed.action || `Review one ${clusterName} insight and apply it.`
                }), { 
                  headers: { ...corsHeaders, "Content-Type": "application/json" } 
                });
              } catch {
                // Fall through to default
              }
            }
          }
        } catch (aiError) {
          console.error("AI cluster connection error:", aiError);
        }
      }
      
      // Fallback
      return new Response(JSON.stringify({
        connection: `These ${insightTitles.length} insights in ${clusterName} are part of your growth trajectory.`,
        action: `Pick one insight from this cluster and experiment with it this week.`
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Handle "generate_milestones" action - reverse-engineer 2026 Misogi into monthly milestones
    if (action === "generate_milestones") {
      const { data: identityData } = await supabase
        .from("identity_seeds")
        .select("content, year_note, core_values, weekly_focus")
        .eq("user_id", userId)
        .maybeSingle();

      if (!identityData?.year_note) {
        return new Response(JSON.stringify({ 
          error: "No 2026 direction set",
          message: "Set your 2026 Misogi in Identity Seed first"
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Check if milestones already cached
      const { data: existingMilestones } = await supabase
        .from("thread_milestones")
        .select("*")
        .eq("user_id", userId)
        .eq("year", 2026)
        .order("month_number", { ascending: true });

      if (existingMilestones && existingMilestones.length >= 10) {
        // Return cached milestones
        return new Response(JSON.stringify({ 
          milestones: existingMilestones,
          cached: true 
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Fetch insight count per topic for context
      const { data: insightCounts } = await supabase
        .from("insights")
        .select("topic_id, title")
        .eq("user_id", userId)
        .limit(100);

      const { data: recentActions } = await supabase
        .from("action_history")
        .select("action_text, pillar, action_date")
        .eq("user_id", userId)
        .order("action_date", { ascending: false })
        .limit(30);

      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "AI not configured" }), { 
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const currentMonth = new Date().getMonth() + 1; // 1-12

      // Truncate content to avoid overly large prompts
      const yearNote = (identityData.year_note || "").substring(0, 2000);
      const identityContent = (identityData.content || "Not specified").substring(0, 1000);
      const coreValues = (identityData.core_values || "Not specified").substring(0, 500);
      const weeklyFocus = (identityData.weekly_focus || "Not specified").substring(0, 300);
      const recentActionsSummary = recentActions?.map(a => a.action_text).filter(Boolean).slice(0, 5).join("; ") || "None yet";

      const milestonePrompt = `Reverse-engineer this yearly goal into 12 monthly milestones.

2026 DIRECTION: ${yearNote}

WHO THEY'RE BECOMING: ${identityContent}

VALUES: ${coreValues}

WEEKLY FOCUS: ${weeklyFocus}

INSIGHTS CAPTURED: ${insightCounts?.length || 0}
RECENT ACTIONS: ${recentActionsSummary}

CURRENT MONTH: ${currentMonth} (${new Date().toLocaleDateString('en-US', { month: 'long' })})

Generate 12 milestones (months 1-12). Months before ${currentMonth} = "completed", month ${currentMonth} = "current", after = "upcoming". Each needs: title, description, capability_focus.`;

      try {
        console.log("LOVABLE_API_KEY present:", !!LOVABLE_API_KEY, "length:", LOVABLE_API_KEY?.length);
        console.log("Generating milestones, prompt length:", milestonePrompt.length);
        const aiBody = {
          model: "openai/gpt-5-mini",
          messages: [
            { role: "system", content: milestonePrompt },
            { role: "user", content: "Generate the 12 monthly milestones. Return ONLY a JSON object with key 'milestones'. No markdown, no explanation." }
          ],
        };
        console.log("AI request body size:", JSON.stringify(aiBody).length);
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(aiBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("AI gateway error:", response.status, errText);
          throw new Error(`AI error: ${response.status} - ${errText.substring(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        // Strip markdown code fences if present
        const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleanContent);
        const milestones = parsed.milestones || [];

        // Cache milestones in DB (upsert)
        for (const m of milestones) {
          await supabase
            .from("thread_milestones")
            .upsert({
              user_id: userId,
              month_number: m.month_number,
              year: 2026,
              title: m.title,
              description: m.description,
              capability_focus: m.capability_focus,
              status: m.status || "upcoming"
            }, { onConflict: "user_id,month_number,year" });
        }

        return new Response(JSON.stringify({ milestones, cached: false }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (aiError) {
        console.error("Milestone generation error:", aiError);
        return new Response(JSON.stringify({ 
          error: "Failed to generate milestones",
          message: String(aiError)
        }), { 
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    // Handle "surface_one" action - surfaces a single insight with connection to identity
    if (action === "surface_one") {
      // Fetch user's identity context
      const { data: identityData } = await supabase
        .from("identity_seeds")
        .select("content, year_note, core_values, weekly_focus")
        .eq("user_id", userId)
        .maybeSingle();

      // Fetch random insights (preferring less-accessed ones)
      const { data: insights } = await supabase
        .from("insights")
        .select("id, title, content, source, created_at, access_count")
        .eq("user_id", userId)
        .order("access_count", { ascending: true })
        .limit(30);

      if (!insights || insights.length === 0) {
        return new Response(JSON.stringify({ 
          error: "No insights found",
          message: "Add some insights first by pasting content on the Dashboard"
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      // Pick a random insight (weighted toward less-accessed)
      const weights = insights.map((_, i) => Math.max(1, insights.length - i));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selectedIndex = i;
          break;
        }
      }
      const selectedInsight = insights[selectedIndex];

      // Generate connection to identity using AI if available
      let connection = "Wisdom you captured";
      let application = "How might this inform a decision today?";
      let synthesis: string | null = null;

      if (LOVABLE_API_KEY && identityData) {
        try {
          const systemPrompt = `You help users see how their captured wisdom connects to their direction.

USER'S CONTEXT:
- Direction: ${identityData.year_note || identityData.content || "Not specified"}
- Values: ${identityData.core_values || "Not specified"}
- Weekly Focus: ${identityData.weekly_focus || "Not specified"}

INSIGHT TO CONNECT:
Title: ${selectedInsight.title}
Content: ${selectedInsight.content?.substring(0, 500)}

Return a JSON object with:
1. "connection": One sentence showing how this insight relates to their direction/values (be specific, not generic)
2. "application": One reflective question or micro-action they could take today (concrete, not vague)
${includeSynthesis ? '3. "synthesis": A brief pattern you notice - what theme does this insight suggest across their journey?' : ''}

Be direct. No fluff. Ground everything in their actual words.`;

          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Generate the connection and application. Return ONLY valid JSON." }
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            if (content) {
              try {
                const parsed = JSON.parse(content);
                connection = parsed.connection || connection;
                application = parsed.application || application;
                if (parsed.synthesis) {
                  synthesis = parsed.synthesis;
                }
              } catch {
                // Use defaults if parsing fails
              }
            }
          }
        } catch (aiError) {
          console.error("AI connection error:", aiError);
        }
      }

      // Local fallback for connection generation
      if (connection === "Wisdom you captured" && identityData) {
        const content = selectedInsight.content?.toLowerCase() || "";
        const title = selectedInsight.title?.toLowerCase() || "";
        
        if (identityData.core_values) {
          const values = identityData.core_values.split(',').map((v: string) => v.trim().toLowerCase());
          const matchedValue = values.find((v: string) => content.includes(v) || title.includes(v));
          if (matchedValue) {
            connection = `Connects to your value of ${matchedValue}`;
          }
        }
        
        if (connection === "Wisdom you captured" && identityData.year_note) {
          const yearWords = identityData.year_note.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
          if (yearWords.some((w: string) => content.includes(w) || title.includes(w))) {
            connection = "Aligned with your 2026 direction";
          }
        }
      }

      return new Response(JSON.stringify({
        insight: selectedInsight,
        connection,
        application,
        synthesis,
        totalInsights: insights.length
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Full synthesis requires API key
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    console.log(`Weave Synthesis: generating for user ${userId}`);

    // Fetch ALL user data in parallel - COMPREHENSIVE
    const [
      identityResult,
      insightsResult,
      documentsResult,
      experimentsResult,
      actionsResult,
      observationsResult,
      topicsResult,
      learningPathsResult,
      dailyTasksResult
    ] = await Promise.all([
      // Full identity seed with ALL fields
      supabase
        .from("identity_seeds")
        .select("content, core_values, year_note, weekly_focus, current_phase, current_monthly_income, target_monthly_income, days_to_move")
        .eq("user_id", userId)
        .maybeSingle(),
      // ALL insights with full content
      supabase
        .from("insights")
        .select("title, content, source, created_at, topics(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      // ALL documents with full summaries and extracted content
      supabase
        .from("documents")
        .select("title, summary, extracted_content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      // ALL experiments with full details
      supabase
        .from("experiments")
        .select("title, description, hypothesis, status, identity_shift_target, result_summary, steps, duration")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      // ALL action history
      supabase
        .from("action_history")
        .select("action_text, pillar, why_it_mattered, action_date")
        .eq("user_id", userId)
        .order("action_date", { ascending: false })
        .limit(100),
      // ALL observations
      supabase
        .from("observations")
        .select("content, observation_type, source, your_data, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      // All topics
      supabase
        .from("topics")
        .select("name, description")
        .eq("user_id", userId),
      // Learning paths
      supabase
        .from("learning_paths")
        .select("title, description, status, final_deliverable, topic_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      // Recent daily tasks
      supabase
        .from("daily_tasks")
        .select("title, one_thing, why_matters, pillar, completed, task_date")
        .eq("user_id", userId)
        .order("task_date", { ascending: false })
        .limit(30)
    ]);

    // Build comprehensive context
    const identity = identityResult.data;
    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const experiments = experimentsResult.data || [];
    const actions = actionsResult.data || [];
    const observations = observationsResult.data || [];
    const topics = topicsResult.data || [];
    const learningPaths = learningPathsResult.data || [];
    const dailyTasks = dailyTasksResult.data || [];

    // Count stats for context
    const stats = {
      insightsCount: insights.length,
      documentsCount: documents.length,
      experimentsCount: experiments.length,
      actionsCount: actions.length,
      observationsCount: observations.length,
      topicsCount: topics.length,
      learningPathsCount: learningPaths.length
    };

    // Build the FULL comprehensive context
    let contextParts: string[] = [];

    // IDENTITY - Full picture
    if (identity) {
      contextParts.push(`=== CURRENT REALITY (Where They Are Now) ===\n${identity.weekly_focus || "Not defined"}`);
      contextParts.push(`\n=== CORE VALUES (What They Stand For) ===\n${identity.core_values || "Not defined"}`);
      contextParts.push(`\n=== 2026 DIRECTION / MISOGI (Year Goals) ===\n${identity.year_note || "Not defined"}`);
      contextParts.push(`\n=== DREAM REALITY (Who They're Becoming) ===\n${identity.content || "Not defined"}`);
      if (identity.current_phase) contextParts.push(`\n=== CURRENT LIFE PHASE ===\n${identity.current_phase}`);
      if (identity.target_monthly_income || identity.current_monthly_income) {
        contextParts.push(`\n=== FINANCIAL CONTEXT ===\nCurrent: $${identity.current_monthly_income || 0}/mo | Target: $${identity.target_monthly_income || 0}/mo`);
      }
      if (identity.days_to_move) {
        contextParts.push(`\n=== TIME PRESSURE ===\n${identity.days_to_move} days to major move`);
      }
    }

    // Topics (areas of interest)
    if (topics.length > 0) {
      contextParts.push(`\n=== AREAS OF INTEREST (${topics.length}) ===\n${topics.map(t => `- ${t.name}${t.description ? `: ${t.description}` : ''}`).join('\n')}`);
    }

    // INSIGHTS - Full content, not truncated
    if (insights.length > 0) {
      const insightsFull = insights.map(i => {
        const topic = (i.topics as any)?.name || 'General';
        // Include full content for comprehensive synthesis
        return `[${topic}] ${i.title}\n${i.content}`;
      }).join('\n\n---\n\n');
      contextParts.push(`\n=== ALL CAPTURED INSIGHTS (${insights.length}) ===\n${insightsFull}`);
    }

    // DOCUMENTS - Full summaries and extracted content
    if (documents.length > 0) {
      const docsFull = documents.map(d => {
        let doc = `📄 ${d.title}`;
        if (d.summary) doc += `\nSummary: ${d.summary}`;
        if (d.extracted_content) doc += `\nKey Content: ${d.extracted_content.substring(0, 1000)}${d.extracted_content.length > 1000 ? '...' : ''}`;
        return doc;
      }).join('\n\n');
      contextParts.push(`\n=== CONSUMED DOCUMENTS & CONTENT (${documents.length}) ===\n${docsFull}`);
    }

    // EXPERIMENTS - Full details
    if (experiments.length > 0) {
      const expFull = experiments.map(e => {
        let exp = `🧪 [${e.status?.toUpperCase()}] ${e.title}`;
        if (e.description) exp += `\nDescription: ${e.description}`;
        if (e.hypothesis) exp += `\nHypothesis: ${e.hypothesis}`;
        if (e.identity_shift_target) exp += `\nIdentity Target: ${e.identity_shift_target}`;
        if (e.steps) exp += `\nSteps: ${e.steps}`;
        if (e.duration) exp += `\nDuration: ${e.duration}`;
        if (e.result_summary) exp += `\nResult: ${e.result_summary}`;
        return exp;
      }).join('\n\n');
      contextParts.push(`\n=== ALL EXPERIMENTS (${experiments.length}) ===\n${expFull}`);
    }

    // LEARNING PATHS
    if (learningPaths.length > 0) {
      const pathsFull = learningPaths.map(p => {
        let path = `📚 [${p.status?.toUpperCase()}] ${p.title}`;
        if (p.topic_name) path += ` (${p.topic_name})`;
        if (p.description) path += `\n${p.description}`;
        if (p.final_deliverable) path += `\nDeliverable: ${p.final_deliverable}`;
        return path;
      }).join('\n\n');
      contextParts.push(`\n=== LEARNING PATHS (${learningPaths.length}) ===\n${pathsFull}`);
    }

    // ALL ACTIONS with reflections
    if (actions.length > 0) {
      const actionsFull = actions.map(a => {
        let action = `✓ [${a.pillar || 'general'}] ${a.action_text}`;
        if (a.why_it_mattered) action += `\n  → Why it mattered: "${a.why_it_mattered}"`;
        return action;
      }).join('\n');
      contextParts.push(`\n=== ALL ACTIONS TAKEN (${actions.length}) ===\n${actionsFull}`);
    }

    // DAILY TASKS - Recent focus
    if (dailyTasks.length > 0) {
      const tasksFull = dailyTasks.slice(0, 20).map(t => {
        let task = `${t.completed ? '✓' : '○'} [${t.pillar || 'general'}] ${t.one_thing || t.title}`;
        if (t.why_matters) task += ` - ${t.why_matters}`;
        return task;
      }).join('\n');
      contextParts.push(`\n=== RECENT DAILY FOCUS (${dailyTasks.length}) ===\n${tasksFull}`);
    }

    // OBSERVATIONS - Full thoughts and patterns
    if (observations.length > 0) {
      const obsFull = observations.map(o => {
        let obs = `💭 [${o.observation_type}] ${o.content}`;
        if (o.your_data) obs += `\nPersonal Data: ${o.your_data}`;
        if (o.source) obs += `\nSource: ${o.source}`;
        return obs;
      }).join('\n\n');
      contextParts.push(`\n=== ALL OBSERVATIONS & THOUGHTS (${observations.length}) ===\n${obsFull}`);
    }

    const fullContext = contextParts.join('\n\n');

    const systemPrompt = `You are a personal synthesis engine. Your job is to weave together EVERYTHING this person has collected, thought, done, and aspired to become.

You're not a therapist. You're not a life coach. You're not an AI giving advice. You're a MIRROR that shows them what their entire collection of knowledge, actions, and aspirations are pointing toward.

THE FULL PICTURE OF THEIR MIND:
${fullContext}

DATA THEY'VE COLLECTED:
- ${stats.insightsCount} insights captured
- ${stats.documentsCount} documents consumed  
- ${stats.experimentsCount} experiments run
- ${stats.actionsCount} actions taken
- ${stats.observationsCount} observations noted
- ${stats.topicsCount} topics tracked
- ${stats.learningPathsCount} learning paths

YOUR TASK:
Weave together EVERYTHING above into ONE coherent picture. This person has been collecting knowledge from ChatGPT, Claude, Twitter, PDFs, YouTube, voice notes, and more. They want to see how it ALL connects.

Find the threads that connect their:
1. CURRENT REALITY (where they are now)
2. CORE VALUES (what they stand for)
3. 2026 DIRECTION (their Misogi / year goals)
4. DREAM REALITY (who they're becoming)
5. ALL THE KNOWLEDGE they've captured (insights, documents)
6. ALL THE EXPERIMENTS they've run or are running
7. ALL THE ACTIONS they've actually taken
8. ALL THE OBSERVATIONS and thoughts they've recorded

Be SPECIFIC. Use THEIR actual words, concepts, and language. Quote directly from their content.

Show them what THEIR mind is really saying when you look at ALL of it together. What patterns emerge? What's the throughline? Where is everything pointing?

Don't be generic. Don't be therapeutic. Don't give advice. Be a clear, comprehensive mirror.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Weave together everything I've captured, done, and am becoming. What is my mind really saying? What patterns connect it all? What direction is everything pointing?" }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "weave_synthesis",
              description: "Return a comprehensive synthesis of the user's mind",
              parameters: {
                type: "object",
                properties: {
                  synthesis: { 
                    type: "string", 
                    description: "2-3 paragraph synthesis of what their entire collection of knowledge, actions, and aspirations weaves into. Be specific, use their language." 
                  },
                  coreThemes: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 core themes that run through everything they've captured and done"
                  },
                  emergingDirection: {
                    type: "string",
                    description: "One sentence about the direction everything is pointing"
                  },
                  hiddenConnections: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 non-obvious connections between seemingly unrelated things in their mind"
                  },
                  whatYourMindIsSaying: {
                    type: "string",
                    description: "If their mind could speak as one voice, what would it say? One powerful sentence."
                  }
                },
                required: ["synthesis", "coreThemes", "emergingDirection", "hiddenConnections", "whatYourMindIsSaying"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "weave_synthesis" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI Gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(
        JSON.stringify({ 
          synthesis: "Unable to generate synthesis at this time.",
          coreThemes: [],
          emergingDirection: "Keep capturing and the patterns will emerge.",
          hiddenConnections: [],
          whatYourMindIsSaying: "Your mind is still weaving..."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: WeaveSynthesisOutput;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(
        JSON.stringify({ 
          synthesis: "Unable to parse synthesis.",
          coreThemes: [],
          emergingDirection: "Keep capturing and the patterns will emerge.",
          hiddenConnections: [],
          whatYourMindIsSaying: "Your mind is still weaving..."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ...result, stats }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error) {
    console.error("Weave Synthesis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
