import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RealignOutput {
  mode: "push" | "flow";
  headline: string;
  currentState: string;
  dreamReality: string;
  gap?: string; // push mode only
  intensity?: string; // push mode only
  todayMatters?: string; // flow mode only
  valuesInPlay?: string; // flow mode only
  oneMove: string;
}

function getFallback(mode: "push" | "flow"): RealignOutput {
  if (mode === "push") {
    return {
      mode: "push",
      headline: "You're building momentum",
      currentState: "You are here, ready to move.",
      dreamReality: "The version of you that has already arrived.",
      gap: "The distance is closed through daily action.",
      intensity: "Pick one thing. Do it with full presence.",
      oneMove: "What's the hardest thing you've been avoiding? Start there."
    };
  }
  return {
    mode: "flow",
    headline: "You're already aligned",
    currentState: "Right here is exactly where you need to be.",
    dreamReality: "Alignment isn't a destination—it's how you move.",
    todayMatters: "Today matters because you showed up.",
    valuesInPlay: "Presence. Growth. Creation.",
    oneMove: "What feels right to do next? Trust that."
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode } = await req.json();
    const realignMode: "push" | "flow" = mode === "push" ? "push" : "flow";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify(getFallback(realignMode)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user context
    const [identityResult, insightsResult, documentsResult, actionsResult, experimentsResult] = await Promise.all([
      supabase.from("identity_seeds").select("content, core_values, year_note").eq("user_id", user.id).maybeSingle(),
      supabase.from("insights").select("title, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("documents").select("title, summary, extracted_content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("action_history").select("action_text, why_it_mattered, pillar").eq("user_id", user.id).order("completed_at", { ascending: false }).limit(10),
      supabase.from("experiments").select("title, status, identity_shift_target").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    const identity = identityResult.data;
    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const recentActions = actionsResult.data || [];
    const experiments = experimentsResult.data || [];

    // Build context
    const whoYouAre = identity?.content || "Not defined yet";
    const coreValues = identity?.core_values || "Not defined yet";
    const yearNote = identity?.year_note || "Not defined yet";

    const yourMind = [
      ...insights.map(i => `INSIGHT: ${i.title} - ${i.content}`),
      ...documents.map(d => `DOC: ${d.title} - ${d.summary || d.extracted_content?.substring(0, 300) || ""}`),
    ].slice(0, 10).join("\n");

    const recentMoves = recentActions.map(a => `• ${a.action_text}${a.why_it_mattered ? ` (${a.why_it_mattered})` : ""}`).join("\n");

    const activeExperiments = experiments
      .filter(e => e.status === "active" || e.status === "in_progress")
      .map(e => `• ${e.title}${e.identity_shift_target ? ` → ${e.identity_shift_target}` : ""}`)
      .join("\n");

    let systemPrompt = "";
    let userMessage = "";

    if (realignMode === "push") {
      systemPrompt = `You are a strategic clarity engine for someone who wants to MOVE. Not therapy. Not advice. Pure strategic awareness.

USER CONTEXT:
- Who they're becoming: ${whoYouAre}
- Core values: ${coreValues}
- 2026 Direction: ${yearNote}
- Their mind (insights/docs): 
${yourMind}
- Recent actions:
${recentMoves || "None tracked"}
- Active experiments:
${activeExperiments || "None active"}

Your job: Show them the GAP between where they are and where they want to be, then suggest INTENSITY.

RULES:
- Be direct. No fluff.
- Show the gap clearly but not harshly
- Suggest ONE specific move with high leverage
- Don't be a cheerleader. Be a strategist.
- No therapy speak. No "you're doing great." Just clarity.
- Reference their actual data, values, direction`;

      userMessage = "I want to push. Show me where I am vs where I want to be, and what move would close the gap fastest.";
    } else {
      systemPrompt = `You are a grounding mirror for someone who wants to ALIGN, not grind. Not therapy. Not productivity. Just presence and values.

USER CONTEXT:
- Who they're becoming: ${whoYouAre}
- Core values: ${coreValues}
- 2026 Direction: ${yearNote}
- Their mind (insights/docs):
${yourMind}
- Recent actions:
${recentMoves || "None tracked"}
- Active experiments:
${activeExperiments || "None active"}

Your job: Help them see what MATTERS today based on their values and current state. Not what's urgent—what's aligned.

RULES:
- Be grounding, not pushy
- Focus on values, not tasks
- Show them they're already on path
- Suggest ONE aligned move, not a to-do list
- No productivity hacks. Just alignment.
- Reference their actual values and direction`;

      userMessage = "I want to flow today. What actually matters based on my values and where I'm headed?";
    }

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
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: realignMode === "push" ? "show_push_clarity" : "show_flow_clarity",
              description: realignMode === "push" 
                ? "Show the gap between current and dream reality with intensity suggestion"
                : "Show what matters today based on values and alignment",
              parameters: realignMode === "push" 
                ? {
                    type: "object",
                    properties: {
                      headline: { type: "string", description: "One line summary of where they are (max 10 words)" },
                      currentState: { type: "string", description: "Where they are right now based on recent actions (2-3 sentences)" },
                      dreamReality: { type: "string", description: "Where they said they want to be, referencing their 2026 direction (2-3 sentences)" },
                      gap: { type: "string", description: "The specific gap between current and dream - be concrete (2-3 sentences)" },
                      intensity: { type: "string", description: "How to approach closing the gap today - fast and focused (1-2 sentences)" },
                      oneMove: { type: "string", description: "ONE specific high-leverage action to take right now (1 sentence)" },
                    },
                    required: ["headline", "currentState", "dreamReality", "gap", "intensity", "oneMove"],
                  }
                : {
                    type: "object",
                    properties: {
                      headline: { type: "string", description: "One line grounding statement (max 10 words)" },
                      currentState: { type: "string", description: "Gentle reflection of where they are right now (2-3 sentences)" },
                      dreamReality: { type: "string", description: "Reminder of the life they're building, not rushing toward (2-3 sentences)" },
                      todayMatters: { type: "string", description: "Why today matters in the bigger picture (1-2 sentences)" },
                      valuesInPlay: { type: "string", description: "Which of their values are most relevant today (list 2-3)" },
                      oneMove: { type: "string", description: "ONE aligned action that honors their values (1 sentence)" },
                    },
                    required: ["headline", "currentState", "dreamReality", "todayMatters", "valuesInPlay", "oneMove"],
                  },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: realignMode === "push" ? "show_push_clarity" : "show_flow_clarity" } },
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify(getFallback(realignMode)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response");
      return new Response(JSON.stringify(getFallback(realignMode)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      const result: RealignOutput = {
        mode: realignMode,
        headline: parsed.headline || getFallback(realignMode).headline,
        currentState: parsed.currentState || getFallback(realignMode).currentState,
        dreamReality: parsed.dreamReality || getFallback(realignMode).dreamReality,
        oneMove: parsed.oneMove || getFallback(realignMode).oneMove,
      };

      if (realignMode === "push") {
        result.gap = parsed.gap;
        result.intensity = parsed.intensity;
      } else {
        result.todayMatters = parsed.todayMatters;
        result.valuesInPlay = parsed.valuesInPlay;
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify(getFallback(realignMode)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Realign error:", error);
    return new Response(JSON.stringify(getFallback("flow")), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
