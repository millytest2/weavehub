import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SynthesizerOutput {
  headline: string;
  summary: string;
  recommended_topic_id: string | null;
  recommended_experiment_id: string | null;
  suggested_next_step: string;
}

function validateSynthesizerOutput(data: any): SynthesizerOutput {
  if (!data.headline || typeof data.headline !== 'string' || data.headline.length > 80) throw new Error('Invalid headline');
  if (!data.summary || typeof data.summary !== 'string') throw new Error('Invalid summary');
  if (!data.suggested_next_step || typeof data.suggested_next_step !== 'string') throw new Error('Invalid suggested_next_step');
  return data as SynthesizerOutput;
}

function getFallbackSynthesis(): SynthesizerOutput {
  return {
    headline: "Momentum through small, consistent actions",
    summary: "You're building. Keep showing up for experiments and insights over planning. The key is action over analysis.",
    recommended_topic_id: null,
    recommended_experiment_id: null,
    suggested_next_step: "Spend 20 minutes on your most important active experiment."
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

    // Fetch context
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Faster model
        messages: [
          {
            role: "system",
            content: `You are a strategic mirror. Give a SHORT direction sync.

WEIGHTING:
• Insights (30%): Emotional/behavioral signals - weight HIGH
• Experiments (30%): Identity shifts - weight HIGH
• Identity Seed (20%): Compass only, not daily command
• Tasks/Docs (20%): Reference only

Your job:
1. What themes emerge from insights + experiments?
2. Is behavior aligned with identity seed?
3. What's the ONE focus now?
4. ONE concrete next step (15-45 min)

OUTPUT (JSON only):
{
  "headline": "short phrase <= 80 chars",
  "summary": "3-5 sentences max",
  "recommended_topic_id": null,
  "recommended_experiment_id": null,
  "suggested_next_step": "one clear 15-45 min action"
}

Keep it SHORT. No fluff.`
          },
          {
            role: "user",
            content: `Synthesize:\n${context}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_direction",
              description: "Synthesize direction and next step",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string", maxLength: 80 },
                  summary: { type: "string" },
                  recommended_topic_id: { type: "string", nullable: true },
                  recommended_experiment_id: { type: "string", nullable: true },
                  suggested_next_step: { type: "string" }
                },
                required: ["headline", "summary", "suggested_next_step"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "synthesize_direction" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call");
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let synthesis;
    try {
      synthesis = JSON.parse(toolCall.function.arguments);
      synthesis = validateSynthesizerOutput(synthesis);
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(synthesis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Synthesizer error:", error);
    return new Response(JSON.stringify(getFallbackSynthesis()), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
