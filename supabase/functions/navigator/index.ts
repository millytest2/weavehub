import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema (simple runtime check)
interface NavigatorOutput {
  do_this_now: string;
  why_it_matters: string;
  what_to_do_after: string;
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.do_this_now || typeof data.do_this_now !== 'string') {
    throw new Error('Invalid do_this_now');
  }
  if (!data.why_it_matters || typeof data.why_it_matters !== 'string') {
    throw new Error('Invalid why_it_matters');
  }
  if (!data.what_to_do_after || typeof data.what_to_do_after !== 'string') {
    throw new Error('Invalid what_to_do_after');
  }
  return data as NavigatorOutput;
}

function getFallbackSuggestion(): NavigatorOutput {
  return {
    do_this_now: "Spend 30 minutes progressing your most important active experiment or, if none, your main UPath task.",
    why_it_matters: "Small, consistent progress compounds. This keeps momentum alive and tests what you're learning.",
    what_to_do_after: "Once done, mark it complete and I'll generate your next action."
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

    const systemPrompt = `You are my personal operating system. You replace GPT, Claude, Manus, Gemini, and all other tools.

Your job: ingest all my data and return ONE clear action at a time.

${contextPrompt}

GOALS:
• Remove paradox of choice
• Give clarity and alignment
• Give one next step
• Keep me consistent
• Build identity through action
• Eliminate overwhelm

HOW TO PROCESS MY DATA:
• Read the Identity Seed first
• Treat insights as signals of emotional state
• Treat experiments as identity reps
• Treat documents as knowledge input
• Treat topics as long term skill stacks
• Treat daily tasks as tactical execution
• Compress all information into a single direction
• Remove duplication and noise
• Always move me toward my identity and outcomes

NAVIGATOR RULES:
Return ONE action. Not multiple. Not options. One.

The action must:
• Take 15 to 45 minutes
• Be small, clear, executable
• Align with my identity seed
• Push forward an active experiment or path
• Reduce overwhelm
• Move me toward: stable income, UPath output, content volume, presence, consistency

${phase === "baseline" ? `
BASELINE FOCUS: Prioritize actions that lock stable income:
- Job apps (hospitality/tech SDR) if below weekly goal
- Bartending shifts
- UPath reports for cash
- Content that supports job search/networking
` : `
EMPIRE FOCUS: Build content, experiments, and UPath growth.
Philosophy: Proof > theory. Ease > force. Identity > productivity.
`}

OUTPUT RULES:
• Do not overwhelm
• Do not give theory or planning
• Do not ask how they feel
• Return only action
• Be hyper-specific using their actual context
• No generic advice`;

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
              description: "Return one clear action",
              parameters: {
                type: "object",
                properties: {
                  do_this_now: { type: "string", description: "One clear imperative action, 15-45 minutes" },
                  why_it_matters: { type: "string", description: "2-3 sentences connecting this action to identity seed and current goals" },
                  what_to_do_after: { type: "string", description: "1 sentence on what happens after completion" }
                },
                required: ["do_this_now", "why_it_matters", "what_to_do_after"]
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
