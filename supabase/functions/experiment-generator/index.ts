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
      title: "30-Minute Daily AI Practice",
      description: "Commit to 30 minutes of focused AI/coding work every day for 7 days. No skipping, no multi-tasking.",
      steps: [
        "Set a 30-minute timer each day",
        "Work on one small AI/coding task",
        "Log what you did in 1-2 sentences",
        "Reflect at day 7 on what shifted"
      ],
      duration: "7 days",
      identity_shift_target: "I am someone who shows up consistently for what matters, even in small doses."
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
          {
            role: "system",
            content: `You are an experiment designer for ONE user.

Your job: propose 1–3 SMALL, testable experiments that:
- Last 7–14 days.
- Have 2–4 steps each.
- Feel emotionally light and doable.
- Target an identity shift ('I am someone who…'), not just productivity.

Context: same compact 'context' object as navigator.

Scan insights, reflections, and experiments for loops:
- Overthinking, avoidance, tool hopping, performance anxiety, chaos vs ease, etc.

Design experiments that:
- Put the user into a new behavioral pattern around those loops.
- Require at most ~30–45 minutes per day.
- Are easy to explain and track.

Each experiment MUST include:
- title
- description (2–3 sentences)
- steps (2–4 clear actions)
- duration (e.g. '7 days')
- identity_shift_target ('I am someone who…')

Avoid:
- 'Overhaul everything' style experiments.
- Vague 'be more X' without clear actions.

OUTPUT (JSON ONLY):
{
  'experiments': [
    {
      'title': 'string',
      'description': 'string',
      'steps': ['string', 'string'],
      'duration': 'string',
      'identity_shift_target': 'string'
    }
  ]
}`
          },
          {
            role: "user",
            content: `Based on my Identity Seed and patterns, generate experiment suggestions:\n${context}`
          }
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
                        identity_shift_target: { type: "string", description: "The identity shift you're testing (I am someone who...)" }
                      },
                      required: ["title", "description", "steps", "duration", "identity_shift_target"]
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
