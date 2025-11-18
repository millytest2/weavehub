import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExperimentOutput {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  identity_shift_target: string;
  baseline_impact: number;
  content_fuel: number;
  identity_alignment: number;
}

function validateExperiments(data: any): ExperimentOutput[] {
  if (!data.experiments || !Array.isArray(data.experiments)) {
    throw new Error('Invalid experiments array');
  }
  
  data.experiments.forEach((exp: any) => {
    if (!exp.title || typeof exp.title !== 'string') throw new Error('Invalid experiment title');
    if (!exp.description || typeof exp.description !== 'string') throw new Error('Invalid experiment description');
    if (!exp.steps || !Array.isArray(exp.steps) || exp.steps.length < 2) throw new Error('Invalid experiment steps');
    if (!exp.duration || typeof exp.duration !== 'string') throw new Error('Invalid experiment duration');
    if (!exp.identity_shift_target || typeof exp.identity_shift_target !== 'string') throw new Error('Invalid identity_shift_target');
  });
  
  return data.experiments as ExperimentOutput[];
}

function getFallbackExperiments(): ExperimentOutput[] {
  return [
    {
      title: "30-Minute Daily Job Application Sprint",
      description: "Apply to 10 targeted LA hospitality jobs per day for 7 days. Track quality, speed, and interviews generated.",
      steps: [
        "Research 15 upscale LA venues each morning",
        "Apply to 10 roles (hospitality/SDR) in 30 minutes",
        "Log applications + response rate",
        "Reflect on what gets responses"
      ],
      duration: "7 days",
      identity_shift_target: "I am someone who takes massive, focused action on what matters most.",
      baseline_impact: 10,
      content_fuel: 6,
      identity_alignment: 8
    }
  ];
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

    console.log("Experiment generator called for user:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch user's context using shared helper
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);
    
    // Fetch phase
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, target_monthly_income, current_monthly_income")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const incomeGap = (identityData?.target_monthly_income || 4000) - (identityData?.current_monthly_income || 0);

    const systemPrompt = phase === "baseline"
      ? `You are an experiment designer for ONE user in BASELINE PHASE.

BASELINE PHASE = Income gap: $${incomeGap}. Lock stable income FIRST.

Your job: Design 1-3 experiments that SERVE BASELINE:

Triple-Score System (0-10 each):
1. Baseline Impact: Does this make money or get job offers THIS WEEK?
2. Content Fuel: Does this create X posts, Shorts, or Thread content?
3. Identity Alignment: Does this prove Calm Rebel thesis (peace + power + play)?

BASELINE EXPERIMENT RULES:
- Baseline Impact must be 7+ (or don't suggest it)
- 7 days max
- Visible, social proof, fast content
- Examples: Job app sprints, bartending challenges, UPath report blitzes, networking experiments

Each experiment MUST include:
- title
- description (2-3 sentences)
- steps (2-4 clear actions)
- duration (e.g. '7 days')
- identity_shift_target ('I am someone who...')
- baseline_impact (0-10)
- content_fuel (0-10)
- identity_alignment (0-10)`
      : `You are an experiment designer for ONE user in EMPIRE PHASE.

EMPIRE PHASE = Baseline locked. Now: scale content, authority, experiments.

Triple-Score System (0-10 each):
1. Baseline Impact: Does this maintain/grow income?
2. Content Fuel: Does this create X posts, Shorts, Threads?
3. Identity Alignment: Does this prove Calm Rebel thesis?

EMPIRE EXPERIMENT RULES:
- Content Fuel must be 7+
- Identity Alignment must be 7+
- 7-14 days
- Examples: Presence challenges, content sprints, belief rewiring, creator rituals

Each experiment MUST include all triple-score fields.`;

    console.log("Fetched user context, calling AI gateway...");

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
          { role: "user", content: `Context:\n${context}\n\nGenerate 1-3 experiments for my current phase.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate 1-3 small experiment suggestions",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short experiment title" },
                        description: { type: "string", description: "What you're testing (2-3 sentences)" },
                        steps: { 
                          type: "array", 
                          items: { type: "string" }, 
                          description: "2-4 concrete action steps",
                          minItems: 2,
                          maxItems: 4
                        },
                        duration: { type: "string", description: "e.g., '7 days', '2 weeks'" },
                        identity_shift_target: { type: "string", description: "The identity shift you're testing (I am someone who...)" },
                        baseline_impact: { type: "integer", minimum: 0, maximum: 10 },
                        content_fuel: { type: "integer", minimum: 0, maximum: 10 },
                        identity_alignment: { type: "integer", minimum: 0, maximum: 10 }
                      },
                      required: ["title", "description", "steps", "duration", "identity_shift_target", "baseline_impact", "content_fuel", "identity_alignment"],
                      additionalProperties: false
                    },
                    minItems: 1,
                    maxItems: 3
                  }
                },
                required: ["experiments"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_experiments" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status, await response.text());
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
    console.log("AI response received, tool calls:", data.choices[0].message.tool_calls);
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in response, using fallback");
      return new Response(
        JSON.stringify({ experiments: getFallbackExperiments() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let experiments;
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log("Parsed tool call arguments:", parsed);
      experiments = validateExperiments(parsed);
      console.log("Validated experiments:", experiments.length);
    } catch (parseError) {
      console.error("Failed to parse/validate AI response:", parseError);
      return new Response(
        JSON.stringify({ experiments: getFallbackExperiments() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert experiments with triple scores
    for (const exp of experiments) {
      await supabase.from("experiments").insert({
        user_id: user.id,
        title: exp.title,
        description: exp.description,
        steps: exp.steps.join("\n"),
        duration: exp.duration,
        identity_shift_target: exp.identity_shift_target,
        status: "planning",
        baseline_impact: exp.baseline_impact,
        content_fuel: exp.content_fuel,
        identity_alignment: exp.identity_alignment
      });
    }

    return new Response(
      JSON.stringify({ experiments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Experiment generator error:", error);
    return new Response(
      JSON.stringify({ experiments: getFallbackExperiments() }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
