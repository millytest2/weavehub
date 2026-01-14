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

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Properly validate JWT using Supabase auth
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = user.id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user context for identity mirroring
    const userContext = await fetchUserContext(supabase, userId);
    const contextPrompt = formatContextForAI(userContext);

    console.log(`Decision Mirror: "${decision.substring(0, 50)}..." for user ${userId}`);

    const systemPrompt = `You are an identity mirror. You reflect the user's stated identity back to them in context of their decision.

${contextPrompt}

TASK:
The user will tell you what they're about to do (or not do). Your job is to mirror back what someone with their specific identity would do in that exact situation.

FORMAT:
"Someone becoming [2-4 specific identity traits from their seed] would probably [specific action directly related to their decision]."

EXAMPLES of good mirrors:
- Decision: "skip my workout" → "Someone becoming disciplined and physically strong would probably do the workout anyway, even if shorter."
- Decision: "say yes to this meeting" → "Someone becoming focused and protective of their time would probably decline unless it directly serves their priorities."
- Decision: "scroll social media" → "Someone becoming a builder and creator would probably close the app and work on their project instead."

RULES:
- Be SPECIFIC to their decision - mention the actual thing they're considering
- Use their ACTUAL identity traits from the seed, not generic descriptions
- State what that person would DO, not how they'd "feel" or "approach"
- One sentence, under 35 words
- No questions, no advice, no emojis
- Direct and concrete, not philosophical`;

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
