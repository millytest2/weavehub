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
  if (!data.headline || typeof data.headline !== 'string' || data.headline.length > 80) {
    throw new Error('Invalid headline');
  }
  if (!data.summary || typeof data.summary !== 'string') {
    throw new Error('Invalid summary');
  }
  // Check summary isn't too long (rough sentence count check)
  const sentenceCount = (data.summary.match(/[.!?]+/g) || []).length;
  if (sentenceCount > 10) {
    throw new Error('Summary too long');
  }
  if (!data.suggested_next_step || typeof data.suggested_next_step !== 'string') {
    throw new Error('Invalid suggested_next_step');
  }
  return data as SynthesizerOutput;
}

function getFallbackSynthesis(): SynthesizerOutput {
  return {
    headline: "Building momentum through consistent small actions",
    summary: "You're making steady progress. Your recent actions show commitment to testing ideas rather than overthinking them. Focus on maintaining this momentum by continuing your active experiments and avoiding new complexity. The key is to keep showing up for what matters most.",
    recommended_topic_id: null,
    recommended_experiment_id: null,
    suggested_next_step: "Spend 30 minutes on the next step of your most important active experiment, or if none, work on your primary UPath/AI task."
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
            content: `You are a strategic mirror for ONE user.

Your job: read the user's context and return a SHORT direction sync:
- What direction their recent behavior points toward.
- How it compares to their identity_seed.
- ONE topic or experiment to focus on next.
- ONE concrete next step (15–45 minutes).

Context: same compact 'context' object.

Analysis:
1) Identify themes from recent_actions, in_progress + recent_completed experiments, and key_insights.
2) Compare behavior to identity_seed: where aligned vs drifting.
3) Choose ONE focus:
   - a topic to lean into OR
   - an experiment to prioritize OR
   - a loop to stop feeding.
4) Propose ONE next step that follows logically and is executable in 15–45 minutes.

OUTPUT (JSON ONLY):
{
  'headline': 'short phrase (<= 80 chars) describing direction/shift',
  'summary': '4–8 sentences max: what's aligned, what's off, what matters now',
  'recommended_topic_id': 'topic id or null',
  'recommended_experiment_id': 'experiment id or null',
  'suggested_next_step': 'one clear 15–45 minute action'
}
No more than 8 sentences in summary. No extra fields.`
          },
          {
            role: "user",
            content: `Synthesize my current direction based on my context:\n${context}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_direction",
              description: "Synthesize user's current direction and next step",
              parameters: {
                type: "object",
                properties: {
                  headline: { 
                    type: "string", 
                    description: "Short phrase (<= 80 chars) describing direction/shift",
                    maxLength: 80
                  },
                  summary: { 
                    type: "string", 
                    description: "4-8 sentences max: what's aligned, what's off, what matters now"
                  },
                  recommended_topic_id: { 
                    type: "string", 
                    description: "Topic ID to focus on, or null",
                    nullable: true
                  },
                  recommended_experiment_id: { 
                    type: "string", 
                    description: "Experiment ID to prioritize, or null",
                    nullable: true
                  },
                  suggested_next_step: { 
                    type: "string", 
                    description: "One clear 15-45 minute action"
                  }
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
        JSON.stringify(getFallbackSynthesis()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let synthesis;
    try {
      synthesis = JSON.parse(toolCall.function.arguments);
      synthesis = validateSynthesizerOutput(synthesis);
    } catch (parseError) {
      console.error("Failed to parse/validate AI response:", parseError);
      return new Response(
        JSON.stringify(getFallbackSynthesis()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(synthesis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Synthesizer error:", error);
    return new Response(
      JSON.stringify(getFallbackSynthesis()),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
