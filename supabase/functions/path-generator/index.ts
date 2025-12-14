import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatWeightedContextForAgent } from "../shared/context.ts";

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

// Extract keywords from text for matching
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'this', 'that', 'am', 'your', 'my', 'our']);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user ID from JWT claims directly
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Get and validate request body
    let focusArea = "";
    try {
      const body = await req.json();
      // Input validation: limit focus area length to prevent resource exhaustion
      const rawFocus = body.focus;
      if (typeof rawFocus === 'string') {
        focusArea = rawFocus.trim().slice(0, 1000); // Max 1000 chars
      }
    } catch {
      // No body provided
    }

    const userContext = await fetchUserContext(supabase, userId);
    // Use path-specific weights: Documents 40%, Identity 25%, Insights 25%
    const contextPrompt = formatWeightedContextForAgent(userContext, "path", { includeDocContent: true });

    const systemPrompt = `You are creating a STEP-BY-STEP ACTION PATH. Not a curriculum. Not a reading list. A sequence of CONCRETE ACTIONS.

${contextPrompt}

${focusArea ? `USER'S FOCUS AREA: ${focusArea}` : ""}

WHAT MAKES A GREAT PATH:
Each step is ONE concrete action that:
1. Takes 15-60 minutes to complete
2. Has a VISIBLE output (something created, shipped, or done)
3. Builds on the previous step
4. Has a clear timeframe (this week, next 3 days, etc.)

STEP STRUCTURE (each step must have):
- VERB-FIRST title: "Ship..." "Create..." "Send..." "Build..." "Record..."
- TIME estimate: "30 min" or "1 hour" or "This week"
- OUTPUT: What exists after this step is done?
- CONNECTION: How does this connect to user's experiments/insights?

EXAMPLE GREAT STEPS:
- "Ship landing page v1 for [project] (2 hours, this week)"
- "Record 3-min video explaining [concept from their insights] (30 min)"
- "Send 5 cold DMs to [specific type of person] (45 min)"
- "Create outline for [content piece based on their topic] (1 hour)"
- "Build basic [feature] that does [specific thing] (2 hours)"

BANNED PATTERNS:
- "Research..." or "Learn about..." - Instead: "Build a [thing] using [concept]"
- "Reflect on..." - Instead: "Write 300 words about [specific question]"
- "Explore..." - Instead: "Create [specific artifact]"
- "Continue..." - Instead: "Complete [specific milestone]"
- Any step without a clear DELIVERABLE

PATH TIMELINE:
- 5-7 steps total
- First 2 steps: This week
- Middle steps: Next 1-2 weeks
- Final steps: Week 3-4
- Each step should unlock the next

CONNECT TO THEIR DATA:
- Reference their specific projects/products
- Build on their active experiments
- Use their captured insights as content
- Tie back to their identity shift

NO EMOJIS. ACTION VERBS ONLY. CONCRETE OUTPUTS.`;

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
              description: "Create a structured action path with concrete steps",
              parameters: {
                type: "object",
                properties: {
                  path_title: { type: "string", description: "Action-oriented title (e.g., 'Ship UPath MVP in 3 Weeks')" },
                  path_description: { type: "string", description: "What visible outcome this path creates" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Verb-first action with time estimate (e.g., 'Ship landing page v1 (2 hours, this week)')" },
                        description: { type: "string", description: "Specific instructions: what to do, what the output is, how it connects to their goals" },
                        order_index: { type: "number" }
                      },
                      required: ["title", "description", "order_index"]
                    },
                    minItems: 5,
                    maxItems: 7
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
        user_id: userId,
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

    const { data: createdItems, error: itemsError } = await supabase
      .from("path_items")
      .insert(pathItems)
      .select();

    if (itemsError) throw itemsError;

    // Auto-connect related content
    console.log("Auto-connecting related content...");
    
    // Get all path text for keyword extraction
    const allPathText = `${pathData.path_title} ${pathData.path_description} ${pathData.steps.map(s => `${s.title} ${s.description}`).join(' ')}`;
    const pathKeywords = extractKeywords(allPathText);
    console.log("Path keywords:", pathKeywords.slice(0, 10));

    // Fetch user's insights
    const { data: userInsights } = await supabase
      .from("insights")
      .select("id, title, content")
      .eq("user_id", userId);

    // Fetch user's documents
    const { data: userDocuments } = await supabase
      .from("documents")
      .select("id, title, summary")
      .eq("user_id", userId);

    // Fetch user's experiments
    const { data: userExperiments } = await supabase
      .from("experiments")
      .select("id, title, description, hypothesis")
      .eq("user_id", userId);

    const connections: Array<{
      user_id: string;
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
    }> = [];

    // Match insights to path
    if (userInsights) {
      for (const insight of userInsights) {
        const insightText = `${insight.title} ${insight.content}`;
        const insightKeywords = extractKeywords(insightText);
        const overlap = pathKeywords.filter(k => insightKeywords.includes(k));
        
        if (overlap.length >= 2) {
          connections.push({
            user_id: userId,
            source_type: "learning_path",
            source_id: newPath.id,
            target_type: "insight",
            target_id: insight.id
          });
          console.log(`Matched insight: ${insight.title} (${overlap.length} keywords)`);
        }
      }
    }

    // Match documents to path
    if (userDocuments) {
      for (const doc of userDocuments) {
        const docText = `${doc.title} ${doc.summary || ''}`;
        const docKeywords = extractKeywords(docText);
        const overlap = pathKeywords.filter(k => docKeywords.includes(k));
        
        if (overlap.length >= 2) {
          connections.push({
            user_id: userId,
            source_type: "learning_path",
            source_id: newPath.id,
            target_type: "document",
            target_id: doc.id
          });
          console.log(`Matched document: ${doc.title} (${overlap.length} keywords)`);
        }
      }
    }

    // Match experiments to path
    if (userExperiments) {
      for (const exp of userExperiments) {
        const expText = `${exp.title} ${exp.description || ''} ${exp.hypothesis || ''}`;
        const expKeywords = extractKeywords(expText);
        const overlap = pathKeywords.filter(k => expKeywords.includes(k));
        
        if (overlap.length >= 2) {
          connections.push({
            user_id: userId,
            source_type: "learning_path",
            source_id: newPath.id,
            target_type: "experiment",
            target_id: exp.id
          });
          console.log(`Matched experiment: ${exp.title} (${overlap.length} keywords)`);
        }
      }
    }

    // Insert all connections
    if (connections.length > 0) {
      const { error: connectError } = await supabase
        .from("connections")
        .insert(connections);
      
      if (connectError) {
        console.error("Failed to create connections:", connectError);
      } else {
        console.log(`Created ${connections.length} connections`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      path: newPath,
      steps_created: pathItems.length,
      connections_created: connections.length
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
