import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DecisionMirrorOutput {
  mirror: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { decision } = await req.json();
    
    if (!decision || typeof decision !== 'string' || decision.length > 500) {
      return new Response(
        JSON.stringify({ error: "Invalid decision input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user context for identity mirroring
    const userContext = await fetchUserContext(supabase, user.id);
    const contextPrompt = formatContextForAI(userContext);

    console.log(`Decision Mirror: "${decision.substring(0, 50)}..."`);

    const systemPrompt = `You are an identity mirror. You reflect back who the user is becoming based on their identity seed.

${contextPrompt}

YOUR ONLY JOB:
When a user says they're about to do something, you mirror back what someone becoming their identity would likely do.

FORMAT:
"Someone becoming [condensed identity description] would probably [what that person would do in this situation]."

RULES:
- One sentence only
- Under 30 words
- No questions
- No advice
- No judgment
- No emojis
- Mirror, don't advise
- Be direct and clear`;

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
          { role: "user", content: `I'm about to: ${decision}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_mirror",
              description: "Return identity mirror reflection",
              parameters: {
                type: "object",
                properties: {
                  mirror: { 
                    type: "string", 
                    description: "One sentence mirror statement starting with 'Someone becoming...'" 
                  }
                },
                required: ["mirror"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_mirror" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI Gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      // Fallback if no tool call
      return new Response(
        JSON.stringify({ mirror: "Someone becoming who you want to be would trust their instincts here." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: DecisionMirrorOutput;
    try {
      result = JSON.parse(toolCall.function.arguments);
      if (!result.mirror) {
        throw new Error("Invalid response structure");
      }
    } catch {
      return new Response(
        JSON.stringify({ mirror: "Someone becoming who you want to be would trust their instincts here." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error) {
    console.error("Decision Mirror error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
