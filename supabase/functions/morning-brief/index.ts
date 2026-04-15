import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    let timezone: string | undefined;
    try {
      const body = await req.json();
      timezone = body?.timezone;
    } catch { /* no body */ }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Check if brief already exists for today (use user's timezone)
    const getLocalDate = (tz?: string) => {
      try {
        if (tz) {
          return new Date().toLocaleDateString('en-CA', { timeZone: tz });
        }
      } catch { /* fallback */ }
      return new Date().toISOString().split('T')[0];
    };
    const today = getLocalDate(timezone);
    const { data: existingBrief } = await supabase
      .from("daily_briefs")
      .select("*")
      .eq("user_id", user.id)
      .eq("brief_date", today)
      .maybeSingle();

    if (existingBrief) {
      // Return existing brief with tasks
      const { data: tasks } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("task_sequence", { ascending: true });

      const { data: credits } = await supabase
        .from("daily_credits")
        .select("*")
        .eq("user_id", user.id)
        .eq("credit_date", today)
        .maybeSingle();

      return new Response(JSON.stringify({
        brief: existingBrief,
        actions: tasks || [],
        credits: credits || { total_credits: 3, credits_spent: 0, actions_committed: [] },
        cached: true
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== GATHER ALL USER DATA =====
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const currentWeek = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

    const [
      identityRes, profileRes, recentInsightsRes, olderInsightsRes,
      recentActionsRes, actionHistoryRes, weeklyIntentionsRes,
      monthlyPlansRes, threadMilestonesRes, observationsRes,
      dailyClosesRes, learnedPatternsRes, experimentsRes
    ] = await Promise.all([
      supabase.from("identity_seeds").select("content, core_values, year_note, weekly_focus, life_domains, current_phase").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      // Last 14 days insights
      supabase.from("insights").select("id, title, content, source, created_at").eq("user_id", user.id).gte("created_at", fourteenDaysAgo).order("created_at", { ascending: false }).limit(12),
      // Older high-relevance insights (for forgotten gems)
      supabase.from("insights").select("id, title, content, source, created_at").eq("user_id", user.id).lt("created_at", thirtyDaysAgo).gte("created_at", ninetyDaysAgo).order("relevance_score", { ascending: false, nullsFirst: false }).limit(10),
      // Recent actions (last 7 days)
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).gte("task_date", sevenDaysAgo.split('T')[0]).order("task_date", { ascending: false }),
      // Action history (completed actions, last 30 days)
      supabase.from("action_history").select("action_text, pillar, action_date, why_it_mattered").eq("user_id", user.id).gte("action_date", thirtyDaysAgo.split('T')[0]).order("action_date", { ascending: false }).limit(30),
      // Weekly intentions
      supabase.from("weekly_intentions").select("text, pillar, completed").eq("user_id", user.id).eq("week_number", currentWeek).eq("year", currentYear),
      // Monthly plans
      supabase.from("monthly_plans").select("text, plan_type, completed").eq("user_id", user.id).eq("month_number", currentMonth).eq("year", currentYear),
      // Thread milestones
      supabase.from("thread_milestones").select("title, description, capability_focus, month_number, status").eq("user_id", user.id).eq("year", currentYear).gte("month_number", currentMonth).order("month_number", { ascending: true }).limit(3),
      // Recent observations/journal
      supabase.from("observations").select("content, observation_type, source, created_at").eq("user_id", user.id).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(8),
      // Evening closes (last 7 days)
      supabase.from("daily_closes").select("journal_entry, patterns_noticed, close_date").eq("user_id", user.id).gte("close_date", sevenDaysAgo.split('T')[0]).order("close_date", { ascending: false }),
      // Learned patterns
      supabase.from("learned_patterns").select("pattern_type, trigger_condition, outcome, confidence, times_observed").eq("user_id", user.id).order("confidence", { ascending: false }).limit(5),
      // Active experiments
      supabase.from("experiments").select("title, description, status, identity_shift_target").eq("user_id", user.id).in("status", ["in_progress", "planning"]).limit(3),
    ]);

    const identity = identityRes.data;
    const userName = profileRes.data?.full_name?.split(' ')[0] || '';
    const recentInsights = recentInsightsRes.data || [];
    const olderInsights = olderInsightsRes.data || [];
    const recentTasks = recentActionsRes.data || [];
    const actionHistory = actionHistoryRes.data || [];
    const weeklyIntentions = weeklyIntentionsRes.data || [];
    const monthlyPlans = monthlyPlansRes.data || [];
    const milestones = threadMilestonesRes.data || [];
    const observations = observationsRes.data || [];
    const eveningCloses = dailyClosesRes.data || [];
    const patterns = learnedPatternsRes.data || [];
    const experiments = experimentsRes.data || [];

    // ===== ANALYZE DOMAIN NEGLECT =====
    const pillarLastActive: Record<string, string> = {};
    for (const action of actionHistory) {
      if (action.pillar && !pillarLastActive[action.pillar]) {
        pillarLastActive[action.pillar] = action.action_date;
      }
    }

    const allPillars = ["Stability", "Skill", "Content", "Health", "Presence", "Connection", "Learning"];
    const neglectedDomains = allPillars.filter(p => {
      const lastDate = pillarLastActive[p];
      if (!lastDate) return true;
      const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
      return daysSince >= 3;
    });

    // ===== BUILD JOURNAL CONTEXT =====
    const journalContext = eveningCloses.map(c =>
      `[${c.close_date}] ${c.journal_entry || ''} ${c.patterns_noticed || ''}`
    ).filter(s => s.trim().length > 12).join('\n');

    // ===== FIND FORGOTTEN GEM =====
    let forgottenGem: any = null;
    if (olderInsights.length > 0 && identity?.content) {
      // Try semantic match against current identity
      try {
        const embedResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: (identity.content + ' ' + (identity.weekly_focus || '')).substring(0, 2000)
          }),
        });

        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          const embedding = embedData.data?.[0]?.embedding;
          if (embedding) {
            const { data: gems } = await supabase.rpc('search_insights_semantic', {
              user_uuid: user.id,
              query_embedding: `[${embedding.join(',')}]`,
              match_count: 3,
              similarity_threshold: 0.4
            });
            // Pick one that's 30-90 days old
            const oldGems = (gems || []).filter((g: any) => {
              const age = (Date.now() - new Date(g.created_at).getTime()) / 86400000;
              return age >= 30 && age <= 90;
            });
            if (oldGems.length > 0) {
              forgottenGem = oldGems[0];
            }
          }
        }
      } catch (e) {
        console.error('Gem search error:', e);
      }
    }
    // Fallback: just pick oldest relevant insight
    if (!forgottenGem && olderInsights.length > 0) {
      forgottenGem = olderInsights[Math.floor(Math.random() * olderInsights.length)];
    }

    // ===== COMPLETION PATTERNS =====
    const completedTasks = recentTasks.filter(t => t.completed);
    const skippedTasks = recentTasks.filter(t => !t.completed);
    const completionRate = recentTasks.length > 0
      ? Math.round((completedTasks.length / recentTasks.length) * 100)
      : 0;

    // ===== BUILD AI PROMPT =====
    const recentInsightsText = recentInsights
      .map(i => `- [${new Date(i.created_at).toLocaleDateString()}] "${i.title}": ${i.content.substring(0, 150)}`)
      .join('\n');

    const observationsText = observations
      .map(o => `- [${new Date(o.created_at).toLocaleDateString()}] ${o.content.substring(0, 150)}`)
      .join('\n');

    const actionHistoryText = actionHistory.slice(0, 15)
      .map(a => `- [${a.action_date}] [${a.pillar}] ${a.action_text}`)
      .join('\n');

    const weeklyIntentionsText = weeklyIntentions
      .map(w => `- ${w.completed ? '✓' : '○'} [${w.pillar || 'General'}] ${w.text}`)
      .join('\n');

    const monthlyPlansText = monthlyPlans
      .map(p => `- ${p.completed ? '✓' : '○'} ${p.text}`)
      .join('\n');

    const milestonesText = milestones
      .map(m => `- [Month ${m.month_number}] ${m.title}: ${m.description || ''} (${m.status})`)
      .join('\n');

    const patternsText = patterns
      .map(p => `- [${p.pattern_type}] ${p.trigger_condition} → ${p.outcome} (confidence: ${Math.round(p.confidence * 100)}%, observed ${p.times_observed}x)`)
      .join('\n');

    const neglectedText = neglectedDomains.length > 0
      ? `Neglected domains (3+ days): ${neglectedDomains.join(', ')}`
      : 'All domains active recently';

    const systemPrompt = `You are generating a personalized morning brief for a user. You KNOW this person deeply from their data.

USER IDENTITY:
${identity?.content || 'No identity set'}

CORE VALUES: ${identity?.core_values || 'Not set'}
CURRENT PHASE: ${identity?.current_phase || 'Not set'}
WEEKLY FOCUS: ${identity?.weekly_focus || 'Not set'}
2026 DIRECTION: ${identity?.year_note || 'Not set'}
LIFE DOMAINS: ${identity?.life_domains || 'Not set'}

WEEKLY INTENTIONS (this week):
${weeklyIntentionsText || 'None set'}

MONTHLY PLANS:
${monthlyPlansText || 'None set'}

MILESTONES:
${milestonesText || 'None set'}

RECENT CAPTURES (last 14 days):
${recentInsightsText || 'None'}

RECENT OBSERVATIONS/JOURNAL:
${observationsText || 'None'}

EVENING JOURNAL ENTRIES (last 7 days):
${journalContext || 'None'}

ACTION HISTORY (last 30 days):
${actionHistoryText || 'None'}

COMPLETION RATE: ${completionRate}% (${completedTasks.length}/${recentTasks.length} tasks)
${neglectedText}

ACTIVE EXPERIMENTS:
${experiments.map(e => `- ${e.title}: ${e.description || ''}`).join('\n') || 'None'}

LEARNED PATTERNS:
${patternsText || 'None detected yet'}

ACTIONS ALREADY DONE (DO NOT REPEAT):
${actionHistory.slice(0, 10).map(a => `- ${a.action_text}`).join('\n') || 'None'}

TASK: Generate a morning brief with these EXACT sections:

1. WHAT_SHIFTED: 2-3 bullet points about what changed in the last 48 hours. Reference specific journal entries, captures, or patterns WITH dates. Be concrete — "You mentioned X on [date]" not "You've been thinking about X".

2. THREE RECOMMENDED ACTIONS (one per type):
   - ACTION 1 (goal_gap): Addresses the biggest gap in their milestones or weekly intentions
   - ACTION 2 (domain_balance): Addresses a neglected domain or leverages a learned pattern
   - ACTION 3 (capture_test): Tests or applies something from a recent capture/insight
   
   Each action needs: action_text, why (citing specific user data with dates), impact (connection to their goal), time_estimate, pillar, action_type

3. ONE BONUS ACTION (nice_to_have): Lower priority but still aligned

4. FORGOTTEN GEM CONTEXT: If a gem is provided, explain why it's relevant NOW given their current situation.

CRITICAL RULES:
- All citations must reference ACTUAL user data with dates
- Actions must be specific and concrete (not "think about" or "plan")
- Connect actions to their stated goals explicitly
- Use their language/tone from journal entries when possible
- NEVER repeat actions they already did
- Respect their current phase and energy patterns`;

    const userPrompt = forgottenGem
      ? `Generate my morning brief. The forgotten gem to contextualize is: "${forgottenGem.title}" — "${(forgottenGem.content || '').substring(0, 200)}"`
      : `Generate my morning brief.`;

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
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_morning_brief",
            description: "Generate a complete morning brief",
            parameters: {
              type: "object",
              properties: {
                what_shifted: { type: "string", description: "2-3 bullet points about last 48 hours" },
                    actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action_text: { type: "string" },
                      why: { type: "string" },
                      impact: { type: "string" },
                      time_estimate: { type: "string" },
                      pillar: { type: "string" },
                      action_type: { type: "string", enum: ["goal_gap", "domain_balance", "capture_test", "bonus"] },
                      priority: { type: "string", enum: ["HIGH", "NICE_TO_HAVE"] },
                      sources: {
                        type: "array",
                        description: "The 2-4 specific data points that wove together to produce this action. Each source is a thread in the weave.",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string", description: "Short label (3-6 words) e.g. 'Chess insight Mar 28', 'Health gap 4 days', 'June milestone'" },
                            type: { type: "string", enum: ["capture", "pattern", "goal", "journal", "gem", "experiment", "gap"] },
                            detail: { type: "string", description: "One sentence explaining this thread's connection" }
                          },
                          required: ["label", "type", "detail"]
                        },
                        minItems: 2,
                        maxItems: 4
                      }
                    },
                    required: ["action_text", "why", "impact", "time_estimate", "pillar", "action_type", "priority", "sources"]
                  },
                  minItems: 3,
                  maxItems: 4
                },
                forgotten_gem_context: { type: "string", description: "Why the forgotten gem is relevant now" }
              },
              required: ["what_shifted", "actions"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_morning_brief" } }
      }),
    });

    let briefData: any;

    if (!response.ok) {
      console.error(`AI error ${response.status}`);
      // Fallback brief
      briefData = {
        what_shifted: neglectedDomains.length > 0
          ? `• ${neglectedDomains.join(', ')} haven't been touched in 3+ days\n• Completion rate this week: ${completionRate}%`
          : `• Completion rate this week: ${completionRate}%\n• All domains active recently`,
        actions: [
          {
            action_text: weeklyIntentions.find(w => !w.completed)?.text || "Take one step toward your biggest goal",
            why: "This is your top unfinished weekly intention",
            impact: "Advances your weekly commitments",
            time_estimate: "30 min",
            pillar: weeklyIntentions.find(w => !w.completed)?.pillar || "Skill",
            action_type: "goal_gap",
            priority: "HIGH"
          },
          {
            action_text: neglectedDomains.length > 0
              ? `Do something for ${neglectedDomains[0]}`
              : "Move your body for 20 minutes",
            why: neglectedDomains.length > 0
              ? `${neglectedDomains[0]} hasn't been active in 3+ days`
              : "Physical energy creates mental clarity",
            impact: "Balances your domains",
            time_estimate: "20 min",
            pillar: neglectedDomains[0] || "Health",
            action_type: "domain_balance",
            priority: "HIGH"
          },
          {
            action_text: recentInsights.length > 0
              ? `Apply your insight "${recentInsights[0].title}" to one concrete action`
              : "Capture one thing you learned today",
            why: recentInsights.length > 0
              ? `You captured this recently but haven't acted on it`
              : "Turn consumption into creation",
            impact: "Converts learning to doing",
            time_estimate: "25 min",
            pillar: "Learning",
            action_type: "capture_test",
            priority: "HIGH"
          }
        ],
        forgotten_gem_context: null
      };
    } else {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall) {
        try {
          briefData = JSON.parse(toolCall.function.arguments);
        } catch {
          console.error("Failed to parse brief");
          briefData = null;
        }
      }
    }

    if (!briefData) {
      return new Response(JSON.stringify({ error: "Failed to generate brief" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ===== SAVE BRIEF =====
    const { data: savedBrief, error: briefError } = await supabase
      .from("daily_briefs")
      .insert({
        user_id: user.id,
        brief_date: today,
        what_shifted: briefData.what_shifted,
        recommended_actions: briefData.actions,
        forgotten_gem_id: forgottenGem?.id || null,
        forgotten_gem_context: briefData.forgotten_gem_context || null,
      })
      .select()
      .single();

    if (briefError) {
      console.error("Brief save error:", briefError);
      // Might be duplicate - fetch existing
      const { data: existing } = await supabase
        .from("daily_briefs")
        .select("*")
        .eq("user_id", user.id)
        .eq("brief_date", today)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({
          brief: existing,
          actions: [],
          credits: { total_credits: 3, credits_spent: 0, actions_committed: [] },
          cached: true
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw briefError;
    }

    // ===== SAVE ACTIONS AS DAILY_TASKS =====
    const taskInserts = (briefData.actions || []).map((action: any, idx: number) => ({
      user_id: user.id,
      task_date: today,
      task_sequence: idx + 1,
      title: action.pillar || "Action",
      one_thing: action.action_text,
      why_matters: action.why,
      description: action.time_estimate,
      pillar: action.pillar,
      impact_description: action.impact,
      action_type: action.action_type,
      priority: action.priority || "HIGH",
      credit_cost: 1,
      daily_brief_id: savedBrief.id,
      completed: false,
      cited_sources: action.sources || [],
    }));

    const { data: savedTasks } = await supabase
      .from("daily_tasks")
      .insert(taskInserts)
      .select();

    // ===== ENSURE CREDITS ROW =====
    await supabase.from("daily_credits").upsert({
      user_id: user.id,
      credit_date: today,
      total_credits: 3,
      credits_spent: 0,
      actions_committed: [],
    }, { onConflict: 'user_id,credit_date' });

    const { data: credits } = await supabase
      .from("daily_credits")
      .select("*")
      .eq("user_id", user.id)
      .eq("credit_date", today)
      .maybeSingle();

    // Include forgotten gem details
    let gemDetails = null;
    if (forgottenGem) {
      const ageInDays = Math.floor((Date.now() - new Date(forgottenGem.created_at).getTime()) / 86400000);
      gemDetails = {
        id: forgottenGem.id,
        title: forgottenGem.title,
        content: (forgottenGem.content || '').substring(0, 300),
        source: forgottenGem.source,
        age_days: ageInDays,
        why_now: briefData.forgotten_gem_context || null,
      };
    }

    return new Response(JSON.stringify({
      brief: savedBrief,
      actions: savedTasks || [],
      credits: credits || { total_credits: 3, credits_spent: 0, actions_committed: [] },
      forgotten_gem: gemDetails,
      cached: false,
      user_name: userName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Morning brief error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
