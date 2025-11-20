import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema (simple runtime check)
interface NavigatorOutput {
  one_thing: string;
  why_matters: string;
  how_to_start: string;
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.one_thing || typeof data.one_thing !== 'string') {
    throw new Error('Invalid one_thing');
  }
  if (!data.why_matters || typeof data.why_matters !== 'string') {
    throw new Error('Invalid why_matters');
  }
  if (!data.how_to_start || typeof data.how_to_start !== 'string') {
    throw new Error('Invalid how_to_start');
  }
  return data as NavigatorOutput;
}

function getFallbackSuggestion(): NavigatorOutput {
  return {
    one_thing: "Spend 30 minutes progressing your most important active experiment or, if none, your main UPath task.",
    why_matters: "Small, consistent progress compounds. This keeps momentum alive and tests what you're learning.",
    how_to_start: "Set a 30-minute timer, open the relevant doc/experiment, and do the next obvious step."
  };
}

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch user's context using shared helper
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);
    
    // Fetch comprehensive context
    const [identityRes, experimentsRes, tasksRes] = await Promise.all([
      supabase
        .from("identity_seeds")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("experiments")
        .select("title, status, baseline_impact, content_fuel, identity_alignment, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("daily_tasks")
        .select("task_date, title, one_thing, completed")
        .eq("user_id", user.id)
        .order("task_date", { ascending: false })
        .limit(7)
    ]);

    const identityData = identityRes.data;
    const recentExperiments = experimentsRes.data || [];
    const recentTasks = tasksRes.data || [];

    const phase = identityData?.current_phase || "baseline";
    const baselineMetrics = identityData || {} as any;

    // Build rich context
    let contextPrompt = `## IDENTITY & PHASE
Identity Statement: ${identityData?.content?.substring(0, 400) || 'Not set'}...

Current Phase: ${phase.toUpperCase()}
${phase === 'baseline' ? `
BASELINE FOCUS: Lock $${baselineMetrics.target_monthly_income || 4000}/month stable income.
- Income: $${baselineMetrics.current_monthly_income || 0}/$${baselineMetrics.target_monthly_income || 4000}
- Job apps this week: ${baselineMetrics.job_apps_this_week || 0}/${baselineMetrics.job_apps_goal || 50}
${baselineMetrics.days_to_move ? `- Days to LA move: ${baselineMetrics.days_to_move}` : ''}
${baselineMetrics.weekly_focus ? `- This week's focus: ${baselineMetrics.weekly_focus}` : ''}
` : 'EMPIRE FOCUS: Scale content, experiments, authority.'}`;

    if (recentExperiments.length > 0) {
      contextPrompt += `\n## RECENT EXPERIMENTS (last 5)\n`;
      recentExperiments.forEach(exp => {
        contextPrompt += `- "${exp.title}" (${exp.status}) | B:${exp.baseline_impact || '?'} C:${exp.content_fuel || '?'} I:${exp.identity_alignment || '?'}\n`;
      });
    }

    if (recentTasks.length > 0) {
      contextPrompt += `\n## RECENT DAILY FOCUS (last 7 days)\n`;
      recentTasks.slice(0, 5).forEach(task => {
        contextPrompt += `- ${task.task_date}: "${task.one_thing || task.title}" ${task.completed ? '✓' : '○'}\n`;
      });
    }

    const systemPrompt = phase === "baseline"
      ? `You are a hyper-personalized coach who replaces ChatGPT/Claude/Manus. You have FULL context on this user.

${contextPrompt}

YOUR JOB: Choose ONE action for TODAY (15-45 min) that serves baseline stability:
1. Job apps (hospitality/tech SDR) - PRIORITY if below weekly goal
2. Bartending shifts
3. UPath reports (for cash)
4. Content that supports job search/networking

RULES:
- If job apps < goal → suggest job apps
- If income < target → suggest bartending/UPath
- Only suggest experiments/content if baseline is on track
- Be so specific they don't need to think
- No generic advice - use their actual context`
      : `You are a hyper-personalized coach who replaces ChatGPT/Claude/Manus. You have FULL context on this user.

${contextPrompt}

YOUR JOB: Choose ONE action for TODAY (15-45 min) that builds:
- Content (Personal Proof / Clarity Systems / UPath)
- Experiment progress (test → document → framework)
- UPath growth

Philosophy: Proof > theory. Ease > force. Identity > productivity.

RULES:
- Emotionally light
- Builds momentum
- Uses their actual patterns/experiments
- No generic advice - hyper-specific to their context`;

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
          { role: "user", content: `Context:\n${context}\n\nWhat is the ONE thing I should do today?` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "choose_daily_action",
              description: "Choose one daily action",
              parameters: {
                type: "object",
                properties: {
                  one_thing: { type: "string", description: "1 short imperative sentence" },
                  why_matters: { type: "string", description: "2-4 sentences tying this to identity_seed and 1-2 pillars" },
                  how_to_start: { type: "string", description: "1-2 sentences describing the first 5 minutes concretely" }
                },
                required: ["one_thing", "why_matters", "how_to_start"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "choose_daily_action" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in response, using fallback");
      return new Response(
        JSON.stringify(getFallbackSuggestion()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let action;
    try {
      action = JSON.parse(toolCall.function.arguments);
      action = validateNavigatorOutput(action);
    } catch (parseError) {
      console.error("Failed to parse/validate AI response:", parseError);
      return new Response(
        JSON.stringify(getFallbackSuggestion()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(action),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Navigator error:", error);
    return new Response(
      JSON.stringify(getFallbackSuggestion()),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
