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
    
    // Fetch phase info
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, target_monthly_income, current_monthly_income, job_apps_this_week, job_apps_goal, days_to_move, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const baselineMetrics = identityData || {} as any;

    const systemPrompt = phase === "baseline"
      ? `You are a focused coach for ONE user in BASELINE PHASE.

BASELINE PHASE = Lock stable $${baselineMetrics.target_monthly_income || 4000}/month income FIRST. Everything else waits.

Current metrics:
- Income: $${baselineMetrics.current_monthly_income || 0}/$${baselineMetrics.target_monthly_income || 4000}
- Job apps this week: ${baselineMetrics.job_apps_this_week || 0}/${baselineMetrics.job_apps_goal || 50}
${baselineMetrics.days_to_move ? `- Days to LA move: ${baselineMetrics.days_to_move}` : ''}
${baselineMetrics.weekly_focus ? `- This week's focus: ${baselineMetrics.weekly_focus}` : ''}

Your job: Choose ONE action for TODAY that DIRECTLY serves baseline:
1. Job applications (hospitality or tech SDR)
2. Bartending shifts
3. Delivering UPath reports (for cash)
4. Content that feeds job search proof/networking

RULES:
- 15-45 minutes max
- No "empire building" experiments unless they make money THIS WEEK
- No deep planning, no 7-day challenges, no identity work UNLESS income is on track
- Math-driven: 50 apps/week = job in 30 days = baseline locked = then you can experiment

If job apps are below weekly goal, ALWAYS suggest job applications.
If income is below target and no active bartending/UPath work, suggest those.
Only suggest content/experiments if baseline is on track.`
      : `You are a focused coach for ONE user in EMPIRE PHASE.

EMPIRE PHASE = Baseline is locked. Now: scale content, experiments, UPath authority.

Your job: Choose ONE action for TODAY that builds:
- Content authority (3 buckets: Personal Proof, Clarity Systems, UPath)
- Experiment proof (test → document → framework → offer)
- UPath growth (reports → insights → scale)

User philosophy:
- Proof > theory
- Small tests > big plans
- Identity > productivity
- Ease > force

RULES:
- 15-45 minutes max
- Emotionally light
- Moves needle on content/experiments/UPath
- Clear first step`;

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
