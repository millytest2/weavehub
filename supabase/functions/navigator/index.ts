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
            content: `You are a focused coach for ONE specific user.

Your job: based on the provided context, choose ONE concrete action for TODAY that:
- Takes 15–45 minutes.
- Is emotionally doable (low friction).
- Moves at least ONE pillar:
  • UPath / AI / career clarity
  • Identity & belief rewiring / emotional stability
  • Relationships & presence
  • Body & energy (165 protocol)

User philosophy:
- Proof > theory.
- Small tests > big plans.
- Identity > productivity.
- Ease > force.
- Simplicity > complexity.

You receive a compact JSON 'context' with:
- identity_seed
- topics
- experiments (in_progress, recent_completed, planning)
- key_insights
- key_documents
- recent_actions (last 7 daily tasks with reflections)

Decision rules:
1) If there is an experiment with status 'in_progress':
   Prefer the next step of that experiment, as long as it can be done in ≤ 45 minutes.
2) If no active experiment:
   Prefer a move that progresses UPath/AI OR body/energy OR relationship presence.
   Avoid vague planning. Make it specific and concrete.
3) The action MUST be clear enough that the user knows what to do in the first 5 minutes.

Avoid:
- 'Redesign X completely.'
- 'Plan the next 3 months.'
- Multi-hour deep work or research.
- Pure journaling unless it's part of an experiment.

OUTPUT (JSON ONLY):
{
  'one_thing': '1 short imperative sentence',
  'why_matters': '2–4 sentences tying this to identity_seed and 1–2 pillars',
  'how_to_start': '1–2 sentences describing the first 5 minutes concretely'
}
No extra fields, no commentary outside this JSON.`
          },
          {
            role: "user",
            content: `Based on my Identity Seed and current context, what's my ONE thing for today?\n${context}`
          }
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
