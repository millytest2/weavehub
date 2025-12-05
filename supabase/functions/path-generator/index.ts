import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PathStep {
  title: string;
  description: string;
  order_index: number;
}

interface PathOutput {
  path_title: string;
  path_description: string;
  steps: PathStep[];
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu, '').trim();
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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Get request body for focus area
    let focusArea = "";
    try {
      const body = await req.json();
      focusArea = body.focus || "";
    } catch {
      // No body provided
    }

    const userContext = await fetchUserContext(supabase, user.id);
    const contextPrompt = formatContextForAI(userContext);

    const systemPrompt = `You are a learning path architect. Create a structured learning path with 5-8 concrete steps.

${contextPrompt}

${focusArea ? `USER'S FOCUS AREA: ${focusArea}` : ""}

Create a learning path that:
1. Synthesizes the user's identity, insights, documents, and experiments into a coherent growth trajectory
2. Each step should be ACTIONABLE (do something, not read something)
3. Steps should build on each other progressively
4. Tie everything back to the user's identity shift
5. Include specific time frames (e.g., "2-3 days", "1 week")
6. NO EMOJIS anywhere

RULES:
- Steps must be concrete actions, not vague suggestions
- Each step 15-60 minutes to complete
- Path should take 2-4 weeks total
- Connect dots between user's different areas of focus
- No reading/reviewing tasks - only DO tasks`;

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
          { role: "user", content: focusArea 
            ? `Create a learning path focused on: ${focusArea}. Synthesize everything I'm working on into actionable steps.`
            : `Create a learning path that synthesizes my identity, insights, and experiments into a coherent growth trajectory with actionable steps.` 
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_learning_path",
              description: "Create a structured learning path with actionable steps",
              parameters: {
                type: "object",
                properties: {
                  path_title: { type: "string", description: "Concise title for the path (3-6 words)" },
                  path_description: { type: "string", description: "1-2 sentence description of what this path achieves" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Actionable step title (verb-first)" },
                        description: { type: "string", description: "Specific instructions and expected outcome" },
                        order_index: { type: "number" }
                      },
                      required: ["title", "description", "order_index"]
                    }
                  }
                },
                required: ["path_title", "path_description", "steps"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_learning_path" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { 
          status: 429, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), { 
          status: 402, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      throw new Error("AI generation failed");
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No path generated");
    }

    const pathData: PathOutput = JSON.parse(toolCall.function.arguments);
    
    // Clean emojis from all text
    pathData.path_title = stripEmojis(pathData.path_title);
    pathData.path_description = stripEmojis(pathData.path_description);
    pathData.steps = pathData.steps.map(step => ({
      ...step,
      title: stripEmojis(step.title),
      description: stripEmojis(step.description)
    }));

    // Create the learning path
    const { data: newPath, error: pathError } = await supabase
      .from("learning_paths")
      .insert({
        user_id: user.id,
        title: pathData.path_title,
        description: pathData.path_description,
        status: "active"
      })
      .select()
      .single();

    if (pathError) throw pathError;

    // Create path items
    const pathItems = pathData.steps.map((step, index) => ({
      path_id: newPath.id,
      title: step.title,
      description: step.description,
      order_index: index + 1,
      completed: false
    }));

    const { error: itemsError } = await supabase
      .from("path_items")
      .insert(pathItems);

    if (itemsError) throw itemsError;

    return new Response(JSON.stringify({ 
      success: true,
      path: newPath,
      steps_created: pathItems.length
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error("Path generator error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Failed to generate path" 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
