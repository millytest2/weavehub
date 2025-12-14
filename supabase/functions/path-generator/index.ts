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

    // Check if user has saved content about the focus area
    const hasRelevantContent = userContext.key_documents.length > 0 || userContext.key_insights.length > 0;
    
    if (!hasRelevantContent && focusArea) {
      return new Response(JSON.stringify({ 
        error: `You haven't saved anything about "${focusArea}" yet. Save a course, tutorial, article, or insight first, then I'll build a path around it.`,
        needs_content: true
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Build numbered source list for citation
    const sources: Array<{ ref: string; title: string; type: string; content: string }> = [];
    userContext.key_documents.forEach((doc: any, i: number) => {
      sources.push({
        ref: `[${i + 1}]`,
        title: doc.title,
        type: 'document',
        content: doc.extracted_content?.substring(0, 500) || doc.summary?.substring(0, 300) || ''
      });
    });
    userContext.key_insights.forEach((insight: any, i: number) => {
      sources.push({
        ref: `[${sources.length + 1}]`,
        title: insight.title,
        type: insight.source || 'insight',
        content: insight.content?.substring(0, 400) || ''
      });
    });

    const sourceList = sources.map(s => `${s.ref} "${s.title}" (${s.type}): ${s.content}`).join('\n\n');

    const systemPrompt = `You are creating a SHORT, ACTION-BASED SPRINT PATH. NOT a curriculum. NOT a reading list. A sequence of BUILD/SHIP sprints.

${contextPrompt}

${focusArea ? `USER'S FOCUS AREA: ${focusArea}` : ""}

=== AVAILABLE SOURCES (cite these using [1], [2], etc.) ===
${sourceList || "No sources saved yet."}
=== END SOURCES ===

CRITICAL RULES - FOLLOW EXACTLY:

1. MAXIMUM 3-5 STEPS TOTAL (never more)
2. Each step is 2-4 DAYS MAX (use "Days 1-3", never "Week 1")
3. Use SPRINT language: "Sprint 1", "Sprint 2", NOT "Module" or "Week"
4. CITE SPECIFIC SOURCES using [1], [2] notation
5. QUOTE actual techniques, timestamps, chapters from those sources
6. Each step MUST have a CONCRETE DELIVERABLE (build/create/ship something)
7. Connect to user's active projects when possible

STEP FORMAT (follow exactly):
\`\`\`
Sprint X: [Action Verb] [Specific Thing] (Days X-Y)

You saved [1] "[source title]" and [2] "[source title]".

[Explain what the sources teach and how to apply it]

Your task: [Specific action with concrete output]

Deliverable: [What exists when done - file, function, prototype, etc.]

Sources used: [1] [specific section], [2] [specific part]
\`\`\`

EXAMPLE GOOD STEP:
\`\`\`
Sprint 1: Build Recommendation Prototype (Days 1-3)

You saved [1] "Andrew Ng's ML Course" and [2] "Collaborative Filtering in Python".

Ng explains cosine similarity for user preferences in lecture 4. The article has working Python code for similarity scoring.

Your task: Build a mini "suggest next career step" function for UPath. Take 10 sample user profiles, calculate similarity scores, return top 3 matches.

Deliverable: Working Python function + test results with 10 sample profiles.

Sources used: [1] Lecture 4 similarity section, [2] Python implementation example
\`\`\`

BANNED PATTERNS (never do these):
- "Week 1: Introduction to..." - Use "Sprint 1: Build..." instead
- "Learn the fundamentals..." - Instead cite a specific source and build something
- "Read chapters 1-3..." - Instead extract the key technique and apply it
- "Practice problems..." - Instead create a real deliverable
- Any step without a shippable output
- Generic advice without source citations

NO EMOJIS. SPRINT LANGUAGE. CITE SOURCES. SHIP DELIVERABLES.`;

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
            ? `Create a 3-5 step sprint path for: ${focusArea}. Use my saved sources with [1], [2] citations. Each sprint should be 2-4 days with a concrete deliverable.`
            : `Create a 3-5 step sprint path that synthesizes my saved content into actionable sprints. Use [1], [2] source citations.` 
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_sprint_path",
              description: "Create a short sprint-based action path with source citations",
              parameters: {
                type: "object",
                properties: {
                  path_title: { type: "string", description: "Action-oriented sprint title (e.g., 'Build UPath Recommender in 2 Sprints')" },
                  path_description: { type: "string", description: "What visible outcome this path creates in 1-2 sentences" },
                  sources_used: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of source references used (e.g., '[1] Andrew Ng ML Course')"
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Sprint title with days (e.g., 'Sprint 1: Build Prototype (Days 1-3)')" },
                        description: { type: "string", description: "Full step with source citations [1], [2], technique explanation, specific task, and deliverable" },
                        order_index: { type: "number" },
                        deliverable: { type: "string", description: "What exists when this sprint is done" },
                        sources_cited: { type: "array", items: { type: "string" } }
                      },
                      required: ["title", "description", "order_index", "deliverable"]
                    },
                    minItems: 3,
                    maxItems: 5
                  }
                },
                required: ["path_title", "path_description", "steps"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_sprint_path" } }
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
