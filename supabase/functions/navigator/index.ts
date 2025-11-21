import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema (simple runtime check)
interface NavigatorOutput {
  priority_for_today: string;
  do_this_now: string;
  why_it_matters: string;
  what_to_do_after: string;
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.priority_for_today || typeof data.priority_for_today !== 'string') {
    throw new Error('Invalid priority_for_today');
  }
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
    priority_for_today: "Skill",
    do_this_now: "Spend 30 minutes progressing your most important active experiment or learning path.",
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
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Fetch comprehensive user context using shared helper
    const userContext = await fetchUserContext(supabase, user.id);
    
    // Get phase info from identity_seeds
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, target_monthly_income, current_monthly_income, job_apps_this_week, job_apps_goal, days_to_move, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const baselineMetrics = identityData || {} as any;

    // Build comprehensive context from shared helper
    let contextPrompt = formatContextForAI(userContext);
    
    // Add phase-specific metrics
    if (phase === 'baseline' && baselineMetrics) {
      contextPrompt += `\n\nCURRENT PHASE: BASELINE
- Income: $${baselineMetrics.current_monthly_income || 0}/$${baselineMetrics.target_monthly_income || 4000}
- Job apps this week: ${baselineMetrics.job_apps_this_week || 0}/${baselineMetrics.job_apps_goal || 50}
${baselineMetrics.days_to_move ? `- Days to LA move: ${baselineMetrics.days_to_move}` : ''}
${baselineMetrics.weekly_focus ? `- This week's focus: ${baselineMetrics.weekly_focus}` : ''}`;
    } else {
      contextPrompt += `\n\nCURRENT PHASE: EMPIRE`;
    }

    const systemPrompt = `You are the user's personal operating system.
Your job is to take every piece of data the user enters and return ONE clear action at a time.

${contextPrompt}

GUIDING PRINCIPLES:
• Remove paradox of choice
• Increase clarity and alignment
• Give a single next step
• Keep users consistent
• Build identity proof through action
• Handle large amounts of information without overwhelm
• Point them toward progress in any domain of life
• Keep everything simple and executable

WEIGHTING RULES (combine all data into one evolving mental model):
• Identity Seed = 40%
• Active Experiments = 25%
• Recent Insights (emotional patterns) = 15%
• Weekly goals/intentions = 10%
• Documents/Knowledge inputs = 5%
• Rotation/Avoiding stagnation = 5%

DAILY PRIORITY ENGINE:
Before generating today's action, determine which pillar is most important TODAY.

Choose from six universal pillars:
• Cash (career stability, income, job search)
• Skill (project progress, learning paths, experiments)
• Content (communication, creation, output)
• Health (physical action, movement, nutrition)
• Presence (emotional regulation, identity shifts, nervous system)
• Admin (life maintenance, clearing blockers)

RULES FOR CHOOSING TODAY'S PRIORITY:
1. Rotate priority day to day, unless urgency exists
2. If one pillar is falling behind, prioritize it
3. If emotional instability shows up in insights, choose Presence
4. If skill development stalled, choose Skill
5. If behavior and identity misalign, choose identity-shifting experiment actions
6. If nothing is urgent, choose growth-oriented tasks over maintenance

${phase === "baseline" ? `
USER'S CURRENT PHASE: BASELINE
Weight Cash and Admin pillars higher. Prioritize:
- Job apps if below weekly goal
- Income-generating activities (bartending, UPath reports)
- Content that supports job search/networking
- Actions that stabilize foundation
` : `
USER'S CURRENT PHASE: EMPIRE
Weight Skill, Content, and Presence pillars higher. Prioritize:
- Content creation and distribution
- Experiment progress (test → document → framework)
- UPath growth and authority building
- Identity-shifting actions
`}

ACTION RULES:
Actions must be:
• 15 to 45 minutes
• Clear and frictionless
• Identity-aligned
• Experiment-friendly
• Grounded in the priority of the day
• Designed to reduce overwhelm

Never give:
• Three options
• Long planning tasks
• Vague suggestions
• Theory without action
• Emotional disclaimers`;

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
          { role: "user", content: `Context:\n${contextPrompt}\n\nWhat is the ONE thing I should do today?` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "choose_daily_action",
              description: "Return one clear action with priority pillar",
              parameters: {
                type: "object",
                properties: {
                  priority_for_today: { 
                    type: "string", 
                    enum: ["Cash", "Skill", "Content", "Health", "Presence", "Admin"],
                    description: "The pillar chosen for today's focus" 
                  },
                  do_this_now: { type: "string", description: "One clear imperative action, 15-45 minutes" },
                  why_it_matters: { type: "string", description: "Identity-level + practical reasoning in 2-3 sentences" },
                  what_to_do_after: { type: "string", description: "The next small step after completion" }
                },
                required: ["priority_for_today", "do_this_now", "why_it_matters", "what_to_do_after"]
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
