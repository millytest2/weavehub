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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    console.log(`Weave Synthesis: generating for user ${userId}`);

    // Fetch ALL user data in parallel
    const [
      identityResult,
      insightsResult,
      documentsResult,
      experimentsResult,
      actionsResult,
      observationsResult,
      topicsResult
    ] = await Promise.all([
      supabase
        .from("identity_seeds")
        .select("content, core_values, year_note, weekly_focus, current_phase")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("insights")
        .select("title, content, source, created_at, topics(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("documents")
        .select("title, summary, created_at")
        .eq("user_id", userId)
        .not("summary", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("experiments")
        .select("title, description, hypothesis, status, identity_shift_target, result_summary")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("action_history")
        .select("action_text, pillar, why_it_mattered, action_date")
        .eq("user_id", userId)
        .order("action_date", { ascending: false })
        .limit(50),
      supabase
        .from("observations")
        .select("content, observation_type, source, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("topics")
        .select("name, description")
        .eq("user_id", userId)
    ]);

    // Build comprehensive context
    const identity = identityResult.data;
    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const experiments = experimentsResult.data || [];
    const actions = actionsResult.data || [];
    const observations = observationsResult.data || [];
    const topics = topicsResult.data || [];

    // Count stats for context
    const stats = {
      insightsCount: insights.length,
      documentsCount: documents.length,
      experimentsCount: experiments.length,
      actionsCount: actions.length,
      observationsCount: observations.length,
      topicsCount: topics.length
    };

    // Build the comprehensive context
    let contextParts: string[] = [];

    // Identity
    if (identity) {
      contextParts.push(`=== WHO THEY'RE BECOMING ===\n${identity.content || "Not defined"}`);
      if (identity.core_values) contextParts.push(`\n=== CORE VALUES ===\n${identity.core_values}`);
      if (identity.year_note) contextParts.push(`\n=== YEAR DIRECTION ===\n${identity.year_note}`);
      if (identity.weekly_focus) contextParts.push(`\n=== CURRENT FOCUS ===\n${identity.weekly_focus}`);
      if (identity.current_phase) contextParts.push(`\n=== LIFE PHASE ===\n${identity.current_phase}`);
    }

    // Topics (areas of interest)
    if (topics.length > 0) {
      contextParts.push(`\n=== AREAS OF INTEREST (${topics.length}) ===\n${topics.map(t => `- ${t.name}${t.description ? `: ${t.description}` : ''}`).join('\n')}`);
    }

    // Insights (knowledge captured)
    if (insights.length > 0) {
      const insightsSummary = insights.slice(0, 50).map(i => {
        const topic = (i.topics as any)?.name || 'General';
        return `[${topic}] ${i.title}: ${i.content.substring(0, 200)}${i.content.length > 200 ? '...' : ''}`;
      }).join('\n');
      contextParts.push(`\n=== CAPTURED INSIGHTS (${insights.length} total, showing 50) ===\n${insightsSummary}`);
    }

    // Documents (what they've consumed)
    if (documents.length > 0) {
      const docsSummary = documents.map(d => `- ${d.title}: ${d.summary?.substring(0, 150) || 'No summary'}...`).join('\n');
      contextParts.push(`\n=== CONSUMED CONTENT (${documents.length}) ===\n${docsSummary}`);
    }

    // Experiments (what they're testing)
    if (experiments.length > 0) {
      const expSummary = experiments.map(e => {
        let exp = `- [${e.status}] ${e.title}`;
        if (e.hypothesis) exp += `\n  Hypothesis: ${e.hypothesis}`;
        if (e.identity_shift_target) exp += `\n  Identity Target: ${e.identity_shift_target}`;
        if (e.result_summary) exp += `\n  Result: ${e.result_summary}`;
        return exp;
      }).join('\n');
      contextParts.push(`\n=== EXPERIMENTS (${experiments.length}) ===\n${expSummary}`);
    }

    // Recent actions (what they've actually done)
    if (actions.length > 0) {
      const actionsSummary = actions.slice(0, 30).map(a => {
        let action = `- [${a.pillar || 'general'}] ${a.action_text}`;
        if (a.why_it_mattered) action += ` → "${a.why_it_mattered}"`;
        return action;
      }).join('\n');
      contextParts.push(`\n=== RECENT ACTIONS (${actions.length} total) ===\n${actionsSummary}`);
    }

    // Observations (thoughts and patterns noticed)
    if (observations.length > 0) {
      const obsSummary = observations.map(o => `- [${o.observation_type}] ${o.content.substring(0, 200)}${o.content.length > 200 ? '...' : ''}`).join('\n');
      contextParts.push(`\n=== OBSERVATIONS & THOUGHTS (${observations.length}) ===\n${obsSummary}`);
    }

    const fullContext = contextParts.join('\n\n');

    const systemPrompt = `You are a personal synthesis engine. Your job is to weave together EVERYTHING this person has collected, thought, done, and aspired to become.

You're not a therapist. You're not a life coach. You're a mirror that shows them what their entire collection of knowledge, actions, and aspirations are pointing toward.

CONTEXT FROM THEIR MIND:
${fullContext}

DATA STATS:
- ${stats.insightsCount} insights captured
- ${stats.documentsCount} documents consumed
- ${stats.experimentsCount} experiments run
- ${stats.actionsCount} actions taken
- ${stats.observationsCount} observations noted
- ${stats.topicsCount} topics tracked

YOUR TASK:
Synthesize ALL of this into a coherent picture. Find the threads that connect their:
- Identity and values
- Knowledge they've collected
- Actions they've taken
- Experiments they're running
- Observations they've made
- The direction it all points

Be specific. Use their actual words and concepts. Show them what THEIR mind is really saying when you look at all of it together.

Don't be generic. Don't be therapeutic. Be a clear mirror.`;

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
