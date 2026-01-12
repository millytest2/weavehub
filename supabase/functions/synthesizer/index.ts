import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatWeightedContextForAgent } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SynthesizerOutput {
  headline: string;
  summary: string;
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
    headline: "Keep building momentum through small actions",
    summary: "Focus on identity-aligned action over planning. The key is consistent proof of who you are becoming.",
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
    
    // Check if this is a post generation request
    const body = await req.json().catch(() => ({}));
    const { mode, observation, experiment } = body;

    // POST GENERATOR MODE
    if (mode === "post_generator" && observation) {
      const templateMap: Record<string, string> = {
        quote: `Curated Synthesis Template:
- Lead with the quote or insight
- Add your personal data/results that validate or challenge it
- End with a takeaway or question for the reader
- Keep it punchy, 280 chars ideal, can go up to thread if needed`,
        
        decision: `Building Decision Template:
- Start with the decision you made
- Share the context briefly
- Show the result or what you learned
- End with what you'd tell someone facing the same choice`,
        
        presence: `Presence Template:
- Set the scene (who, where, context)
- Share the unexpected insight or moment
- Connect it to a bigger principle
- Keep it human and relatable`,
        
        insight: `Insight Template:
- Lead with the insight/realization
- Show how you discovered it
- Add specific data or example if you have it
- End with the "so what" for the reader`
      };

      const systemPrompt = `You are a content strategist helping create authentic, data-backed social media posts.

Your style:
- No fluff, no filler words
- Real data beats generic advice
- Personal experience > theory
- Contrarian when honest
- Never use: "game-changer", "unlock", "leverage", "mindset shift"
- Write like you talk to a smart friend

${templateMap[observation.type] || templateMap.insight}`;

      const userPrompt = `Create a post from this observation:

Type: ${observation.type}
Content: ${observation.content}
${observation.source ? `Source: ${observation.source}` : ''}
${observation.your_data ? `My data/results: ${observation.your_data}` : ''}

Write a compelling post that I can use on Twitter/LinkedIn. Make it authentic and backed by the data I provided. If I didn't provide data, focus on the insight itself.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate post");
      }

      const data = await response.json();
      const post = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ post }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // EXPERIMENT SYNTHESIS MODE
    if (mode === "experiment_synthesis" && experiment) {
      const systemPrompt = `You are helping synthesize experiment results into shareable content.

Style:
- Data-first
- Honest about what worked and didn't
- No hype, just facts
- Include specific numbers when available`;

      const userPrompt = `Create a synthesis post for this completed experiment:

Title: ${experiment.title}
Duration: ${experiment.duration_days} days
Hypothesis: ${experiment.hypothesis || 'Not specified'}
Results: ${JSON.stringify(experiment.results || {})}

Write a thread-style post (can be multiple tweets) summarizing what I tested, what I found, and what I'm testing next.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate synthesis");
      }

      const data = await response.json();
      const post = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ post }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // ORIGINAL DIRECTION CHECK MODE (default)
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatWeightedContextForAgent(userContext, "decision-mirror");

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
            content: `You are a strategic mirror. Give a SHORT direction check grounded in THIS PERSON'S specific context.

CORE QUESTION: Is their behavior aligned with their stated identity? What's the gap?

${context}

YOUR JOB:
1. See patterns in THEIR identity + insights + experiments + hurdles
2. Identify if recent actions match identity direction
3. Name the ONE focus now (based on their weekly focus or active experiment)
4. Give ONE concrete next step (15-45 min) that advances THEIR specific situation

WEAVE MISSION: This replaces generic AI advice. The direction check should feel like it was written for THEM specifically.

PERSONALIZATION REQUIREMENTS:
- Reference their specific hurdles, projects, or experiments by name
- Connect to their weekly focus or values
- The next step should directly address something in their context

RULES:
- No emojis
- No fluff
- Keep it short
- Identity-first, not productivity-first
- SPECIFIC to their situation, not generic`
          },
          {
            role: "user",
            content: `Give me my direction check.`
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
                  headline: { type: "string", maxLength: 80, description: "Short phrase, no emojis" },
                  summary: { type: "string", description: "3-4 sentences max, no emojis" },
                  suggested_next_step: { type: "string", description: "One action, 15-45 min, no emojis" }
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
