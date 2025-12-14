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
  deliverable?: string;
}

interface PathOutput {
  path_title: string;
  path_description: string;
  sources_used?: string[];
  final_deliverable?: string;
  steps: PathStep[];
}

// BANNED WORDS - same approach as experiment generator
const BANNED_WORDS = [
  // Therapy-speak
  "inner pressure", "anxiety", "saboteur", "deep dive", "embrace", "unlock", 
  "journey", "explore", "reflect", "consider", "embrace", "authentic",
  // Abstract concepts
  "clarity", "presence", "mindful", "awareness", "potential", "growth mindset",
  // Course-like language
  "module", "week", "bootcamp", "program", "course", "curriculum", "fundamentals",
  "introduction", "foundations", "basics", "overview", "principles",
  // Vague outcomes
  "develop", "enhance", "cultivate", "strengthen", "deepen", "expand"
];

function containsBannedWords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some(word => lowerText.includes(word.toLowerCase()));
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

// Generate fallback path when AI produces banned content
function generateFallbackPath(sources: Array<{ ref: string; title: string; type: string; content: string }>, focusArea: string): PathOutput {
  const sourceCount = sources.length;
  const primarySource = sources[0];
  const secondarySource = sources[1];
  
  if (sourceCount === 0) {
    return {
      path_title: `Ship ${focusArea || "MVP"} in 5 Days`,
      path_description: `Build and ship a working ${focusArea || "prototype"} with concrete deliverables each day.`,
      sources_used: [],
      final_deliverable: `Live ${focusArea || "MVP"} ready for feedback`,
      steps: [
        {
          title: "Sprint 1: Define and Scope (Days 1-2)",
          description: "Define exactly what you're building. List 3 core features max. Write one sentence describing what it does. Create a simple sketch or wireframe.",
          order_index: 1,
          deliverable: "Written scope doc with 3 features and wireframe"
        },
        {
          title: "Sprint 2: Build Core Feature (Days 3-4)",
          description: "Build the single most important feature first. Ignore everything else. Get it working, even if ugly.",
          order_index: 2,
          deliverable: "Working core feature you can demo"
        },
        {
          title: "Sprint 3: Ship and Get Feedback (Day 5)",
          description: "Deploy what you have. Send to 5 people. Collect their feedback via text/email. Document what they say.",
          order_index: 3,
          deliverable: "Live link + 5 feedback responses documented"
        }
      ]
    };
  }
  
  return {
    path_title: `Ship Using ${primarySource.title.substring(0, 30)} in 5 Days`,
    path_description: `Apply techniques from your saved content to build something real in 5 days.`,
    sources_used: sources.slice(0, 3).map(s => `${s.ref} ${s.title}`),
    final_deliverable: `Working prototype using techniques from ${primarySource.ref}`,
    steps: [
      {
        title: "Sprint 1: Extract Key Technique (Days 1-2)",
        description: `Review ${primarySource.ref} "${primarySource.title}". Find the ONE core technique. Write it in your own words in 2 sentences. Create a simple plan to apply it.`,
        order_index: 1,
        deliverable: `Written technique summary + application plan from ${primarySource.ref}`
      },
      {
        title: "Sprint 2: Build First Version (Days 3-4)",
        description: secondarySource 
          ? `Apply the technique from ${primarySource.ref}. Reference ${secondarySource.ref} for additional context. Build the simplest working version. Don't polish.`
          : `Apply the technique from ${primarySource.ref}. Build the simplest working version. Focus on functionality, not polish.`,
        order_index: 2,
        deliverable: `Working first version applying ${primarySource.ref} technique`
      },
      {
        title: "Sprint 3: Test and Ship (Day 5)",
        description: `Test your build with real use. Fix only critical bugs. Deploy/publish/send to 5 people for feedback.`,
        order_index: 3,
        deliverable: `Shipped version + 5 feedback responses`
      }
    ]
  };
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
      const rawFocus = body.focus;
      if (typeof rawFocus === 'string') {
        focusArea = rawFocus.trim().slice(0, 1000);
      }
    } catch {
      // No body provided
    }

    const userContext = await fetchUserContext(supabase, userId);
    const contextPrompt = formatWeightedContextForAgent(userContext, "path", { includeDocContent: true });

    // If user specified a focus area, check if they have RELEVANT content
    if (focusArea) {
      const focusKeywords = extractKeywords(focusArea);
      console.log("Focus keywords:", focusKeywords);
      
      let relevantDocs: typeof userContext.key_documents = [];
      for (const doc of userContext.key_documents) {
        if (!doc.extracted_content && !doc.summary) {
          console.log(`Skipping doc "${doc.title}" - no extracted content`);
          continue;
        }
        
        const docText = `${doc.title} ${doc.summary || ''} ${doc.extracted_content?.substring(0, 2000) || ''}`.toLowerCase();
        const docKeywords = extractKeywords(docText);
        const overlap = focusKeywords.filter(k => docKeywords.includes(k));
        
        if (overlap.length >= 1) {
          console.log(`Matched doc "${doc.title}" with keywords: ${overlap.join(', ')}`);
          relevantDocs.push(doc);
        }
      }
      
      let relevantInsights: typeof userContext.key_insights = [];
      for (const insight of userContext.key_insights) {
        if (!insight.content || insight.content.length < 20) {
          console.log(`Skipping insight "${insight.title}" - no meaningful content`);
          continue;
        }
        
        const insightText = `${insight.title} ${insight.content}`.toLowerCase();
        const insightKeywords = extractKeywords(insightText);
        const overlap = focusKeywords.filter(k => insightKeywords.includes(k));
        
        if (overlap.length >= 1) {
          console.log(`Matched insight "${insight.title}" with keywords: ${overlap.join(', ')}`);
          relevantInsights.push(insight);
        }
      }
      
      console.log(`Found ${relevantDocs.length} relevant docs, ${relevantInsights.length} relevant insights for "${focusArea}"`);
      
      if (relevantDocs.length === 0 && relevantInsights.length === 0) {
        const hasAnyContent = userContext.key_documents.some((d: any) => d.extracted_content || d.summary) ||
                              userContext.key_insights.some((i: any) => i.content && i.content.length > 20);
        
        const errorMsg = hasAnyContent
          ? `You haven't saved anything about "${focusArea}" yet. Save a course, tutorial, or article about "${focusArea}" first, then I'll build a sprint path around it.`
          : `You haven't saved any content yet. Save a course, tutorial, article, or insight first, then I'll build a sprint path around it.`;
        
        return new Response(JSON.stringify({ 
          error: errorMsg,
          needs_content: true
        }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      userContext.key_documents = relevantDocs;
      userContext.key_insights = relevantInsights;
    } else {
      userContext.key_documents = userContext.key_documents.filter((d: any) => d.extracted_content || d.summary);
      userContext.key_insights = userContext.key_insights.filter((i: any) => i.content && i.content.length > 20);
      
      if (userContext.key_documents.length === 0 && userContext.key_insights.length === 0) {
        return new Response(JSON.stringify({ 
          error: `You haven't saved any processed content yet. Save a course, tutorial, article, or insight first, then I'll build a sprint path around it.`,
          needs_content: true
        }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
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
    userContext.key_insights.forEach((insight: any) => {
      sources.push({
        ref: `[${sources.length + 1}]`,
        title: insight.title,
        type: insight.source || 'insight',
        content: insight.content?.substring(0, 400) || ''
      });
    });

    const sourceList = sources.map(s => `${s.ref} "${s.title}" (${s.type}): ${s.content}`).join('\n\n');

    const systemPrompt = `You create CONCRETE SPRINT PATHS that ship real deliverables. NOT courses. NOT learning journeys. SHORT sprints with REAL output.

${contextPrompt}

${focusArea ? `USER'S FOCUS: ${focusArea}` : ""}

=== USER'S SAVED SOURCES (MUST cite using [1], [2], etc.) ===
${sourceList || "No sources saved."}
=== END SOURCES ===

REQUIRED TITLE FORMAT:
"[Ship/Build/Launch] [Specific Thing] in [3-5 Days] Using Your Saved Content"

EXAMPLES OF GOOD TITLES:
- "Ship Cold Email System in 4 Days Using Hormozi's Framework"
- "Build UPath Landing Page in 3 Days Using Saved Examples"
- "Launch YouTube Channel in 5 Days Using MrBeast's Playbook"

EXAMPLES OF BAD TITLES (NEVER USE):
- "Creator-Athlete Clarity and Presence Path" 
- "Journey to Authentic Self-Expression"
- "Mindful Business Building Bootcamp"
- "Unlock Your Creative Potential Program"

REQUIRED PATH STRUCTURE:

1. TITLE: [Action Verb] [Specific Deliverable] in [X Days] Using [Source Name]

2. DESCRIPTION: Lists the sources being used:
   "You saved:
   - [1] [Source 1 title]
   - [2] [Source 2 title]
   - [3] [Source 3 title]"

3. SPRINTS (3-5 total, each 1-3 days):
   Each sprint follows this format:
   
   Sprint X (Days X-Y): [Action Verb] [Specific Thing]
   
   You saved [1] "[source title]" which teaches [specific technique].
   
   Your task: [Concrete action with specific output]
   
   Deliverable: [Exact thing that exists when done]

4. FINAL DELIVERABLE: [Specific shipped/published/sent thing]

HARD RULES:
1. MAXIMUM 3-5 sprints total
2. Each sprint is 1-3 DAYS max (use "Days 1-2" not "Week 1")
3. CITE SOURCES using [1], [2] - quote actual techniques
4. Every sprint has a CONCRETE DELIVERABLE (file, prototype, sent emails, published post)
5. Action verbs ONLY: Build, Ship, Write, Send, Post, Launch, Create, Test
6. Total path duration: 3-5 days max

BANNED WORDS (never use these):
${BANNED_WORDS.join(', ')}

BANNED PATTERNS:
- "Week 1: Introduction to..." → Use "Sprint 1: Build..."
- "Learn the fundamentals..." → Cite source, extract technique, apply it
- "Practice problems..." → Create real deliverable instead
- "Explore your..." → Ship something concrete instead
- Any step without shippable output
- Generic advice without source citations
- Titles with "Path", "Journey", "Bootcamp", "Program", "Course"

TONE:
- Sprint-based, not course-based
- Build/ship focused, not learning focused
- Uses USER'S saved content with citations, not generic curriculum
- Concrete deliverables, not abstract outcomes
- 3-5 days max, not weeks/months

Each path should feel like a mini product sprint ending in something SHIPPED.

NO EMOJIS. CITE SOURCES. SHIP DELIVERABLES.`;

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
            ? `Create a 3-5 day sprint path for: ${focusArea}. Use my saved sources with [1], [2] citations. Format: "[Ship/Build] [Thing] in [X Days] Using [Source]". Each sprint 1-3 days with concrete deliverable.`
            : `Create a 3-5 day sprint path that synthesizes my saved content into a shippable deliverable. Use [1], [2] source citations. Format: "[Ship/Build] [Thing] in [X Days] Using [Source]".` 
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_sprint_path",
              description: "Create a concrete sprint path with source citations and shippable deliverables",
              parameters: {
                type: "object",
                properties: {
                  path_title: { 
                    type: "string", 
                    description: "Action-oriented title: '[Ship/Build] [Thing] in [X Days] Using [Source]'" 
                  },
                  path_description: { 
                    type: "string", 
                    description: "Lists sources used. Format: 'You saved:\\n- [1] Source 1\\n- [2] Source 2\\n\\nThis sprint path will...'" 
                  },
                  sources_used: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of source references (e.g., '[1] Andrew Ng ML Course')"
                  },
                  final_deliverable: {
                    type: "string",
                    description: "What is shipped at the end (e.g., 'Live landing page with 20 signups')"
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string", 
                          description: "Sprint title: 'Sprint X (Days X-Y): [Action] [Thing]'" 
                        },
                        description: { 
                          type: "string", 
                          description: "Cites source [1], explains technique, gives specific task, states deliverable" 
                        },
                        order_index: { type: "number" },
                        deliverable: { 
                          type: "string", 
                          description: "What exists when this sprint is done" 
                        }
                      },
                      required: ["title", "description", "order_index", "deliverable"]
                    },
                    minItems: 3,
                    maxItems: 5
                  }
                },
                required: ["path_title", "path_description", "final_deliverable", "steps"]
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

    let pathData: PathOutput = JSON.parse(toolCall.function.arguments);
    
    // Validate against banned words - use fallback if needed
    const allText = `${pathData.path_title} ${pathData.path_description} ${pathData.steps.map(s => `${s.title} ${s.description}`).join(' ')}`;
    if (containsBannedWords(allText)) {
      console.log("AI output contained banned words, using fallback path");
      pathData = generateFallbackPath(sources, focusArea);
    }
    
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
    
    const allPathText = `${pathData.path_title} ${pathData.path_description} ${pathData.steps.map(s => `${s.title} ${s.description}`).join(' ')}`;
    const pathKeywords = extractKeywords(allPathText);

    const { data: userInsights } = await supabase
      .from("insights")
      .select("id, title, content")
      .eq("user_id", userId);

    const { data: userDocuments } = await supabase
      .from("documents")
      .select("id, title, summary")
      .eq("user_id", userId);

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
        }
      }
    }

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
        }
      }
    }

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
        }
      }
    }

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
