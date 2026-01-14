import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatWeightedContextForAgent } from "../shared/context.ts";
import { checkRateLimit, rateLimitResponse } from "../shared/rateLimit.ts";

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

// BANNED WORDS - only truly problematic therapy-speak and course language
const BANNED_WORDS = [
  // Therapy-speak
  "inner pressure", "saboteur", "embrace your", "unlock your", 
  "journey to", "authentic self", "mindfulness", "self-discovery",
  // Course-like language  
  "module", "bootcamp", "program", "course", "curriculum", "fundamentals",
  "introduction to", "foundations of", "basics of", "overview of", "principles of",
  // Abstract fluff
  "growth mindset", "potential", "cultivate", "deepen your"
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
  
  // Get clean source titles (filter out numeric-only titles)
  const cleanSources = sources.filter(s => s.title && s.title.length > 5 && !/^\d+(\.\d+)?[kK]?$/.test(s.title.trim()));
  const primarySource = cleanSources[0] || sources[0];
  const secondarySource = cleanSources[1] || sources[1];
  const tertiarySource = cleanSources[2] || sources[2];
  
  // Create sources list for description
  const sourcesList = cleanSources.slice(0, 3).map((s, i) => `- [${i + 1}] ${s.title}`).join('\n');
  
  if (sourceCount === 0 || !primarySource) {
    const deliverable = focusArea || "Working Prototype";
    return {
      path_title: `${deliverable} Shipped in 5 Days`,
      path_description: `Build and ship a working ${focusArea || "prototype"} with concrete deliverables each sprint.`,
      sources_used: [],
      final_deliverable: `Live ${focusArea || "MVP"} sent to 5 people for feedback`,
      steps: [
        {
          title: "Sprint 1 (Days 1-2): Define Scope and Create Wireframe",
          description: "Try it: List exactly 3 core features. Write one sentence describing what it does. Sketch a simple wireframe on paper or Figma. Deadline: End of Day 2.",
          order_index: 1,
          deliverable: "Written scope doc with 3 features + wireframe image"
        },
        {
          title: "Sprint 2 (Days 3-4): Build Core Feature",
          description: "Try it: Build only the #1 most important feature. Ignore everything else. Get it working even if ugly. Deadline: End of Day 4.",
          order_index: 2,
          deliverable: "Working core feature you can demo in 30 seconds"
        },
        {
          title: "Sprint 3 (Day 5): Ship and Collect Feedback",
          description: "Try it: Deploy what you have. Send link to 5 specific people. Ask them one question about it. Document their responses. Deadline: End of Day 5.",
          order_index: 3,
          deliverable: "Live link + 5 feedback responses in a doc"
        }
      ]
    };
  }
  
  // Use actual source titles to create meaningful path
  const primaryTitle = primarySource.title.substring(0, 40);
  const actionFocus = focusArea || "actionable system";
  
  return {
    path_title: `${actionFocus} Built in 5 Days Using "${primaryTitle}"`,
    path_description: `You saved:\n${sourcesList}\n\nThis sprint path applies techniques from your saved content to ship something real.`,
    sources_used: cleanSources.slice(0, 3).map(s => `${s.ref} ${s.title}`),
    final_deliverable: `Working ${actionFocus} using techniques from your saved sources, sent to 5 people`,
    steps: [
      {
        title: "Sprint 1 (Days 1-2): Extract and Apply Core Technique",
        description: `You saved [1] "${primaryTitle}". Review it and find the ONE core technique.\n\nTry it: Write the technique in your own words (2 sentences max). Create a simple plan to apply it to ${actionFocus}. Deadline: End of Day 2.`,
        order_index: 1,
        deliverable: `Written technique summary from [1] + application plan`
      },
      {
        title: "Sprint 2 (Days 3-4): Build First Working Version",
        description: secondarySource 
          ? `Apply the technique from [1]. Use [2] "${secondarySource.title.substring(0, 30)}" for additional context.\n\nTry it: Build the simplest working version. Focus on function, not polish. Deadline: End of Day 4.`
          : `Apply the technique from [1] to build your ${actionFocus}.\n\nTry it: Build the simplest working version. Focus on function, not polish. Deadline: End of Day 4.`,
        order_index: 2,
        deliverable: `Working first version applying [1] technique`
      },
      {
        title: "Sprint 3 (Day 5): Test and Ship",
        description: `Test your build with real use. Fix only critical bugs.\n\nTry it: Deploy/publish/send to 5 specific people. Ask each one question. Document responses. Deadline: End of Day 5.`,
        order_index: 3,
        deliverable: `Shipped version + 5 feedback responses documented`
      }
    ]
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Check rate limit (20 requests/hour)
    const rateCheck = await checkRateLimit(userId, 'path-generator', 20, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse();
    }

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

    // Build past paths avoidance list
    const pastPathsTitles = userContext.past_paths?.map((p: any) => p.title?.toLowerCase()).filter(Boolean) || [];
    const pastExperimentsTitles = userContext.past_experiments?.map((e: any) => e.title?.toLowerCase()).filter(Boolean) || [];
    const allPastTitles = [...pastPathsTitles, ...pastExperimentsTitles];
    
    const avoidList = allPastTitles.length > 0 
      ? `\n\nALREADY CREATED (DO NOT RECREATE SIMILAR):\n${allPastTitles.slice(0, 15).map(t => `- ${t}`).join('\n')}`
      : '';

    const systemPrompt = `You create CONCRETE SPRINT PATHS that ship real deliverables. NOT courses. NOT learning journeys. SHORT sprints with REAL output.

${contextPrompt}

${focusArea ? `USER'S FOCUS: ${focusArea}` : ""}
${avoidList}

=== USER'S SAVED SOURCES (MUST cite using [1], [2], etc.) ===
${sourceList || "No sources saved."}
=== END SOURCES ===

EXACT OUTPUT FORMAT REQUIRED:

TITLE FORMAT (deliverable-first):
"[Concrete Deliverable] in [X Days] Using Your Saved Content"

EXAMPLES OF GOOD TITLES:
- "50 Cold Emails Sent in 4 Days Using Hormozi's Framework"
- "Live Landing Page in 3 Days Using Saved Examples"
- "First YouTube Video Posted in 5 Days Using MrBeast's Playbook"

EXAMPLES OF BAD TITLES (NEVER USE):
- "Ship Cold Email System" (too vague - what's the deliverable?)
- "Build Landing Page Skills" (learning-focused, not output-focused)
- "Journey to YouTube Mastery" (abstract, no deliverable)
- "Creator Path" or "Business Bootcamp" (course language)

EXACT DESCRIPTION FORMAT:
"You saved:
- [1] [Source 1 title]
- [2] [Source 2 title]
- [3] [Source 3 title]

[One sentence: what you'll ship using these sources]"

EXACT SPRINT FORMAT (each sprint):
"Sprint X (Days X-Y): [Action] [Deliverable]

You saved [1] "[source title]". [What they do/teach/recommend in 1 sentence].

Try it: [Exact constraint]. [Exact deliverable]. [Deadline within sprint].

Deliverable: [Specific thing that exists when done]"

EXAMPLE SPRINT:
"Sprint 1 (Days 1-2): Write 25 Cold Emails

You saved [1] "Hormozi $100M Leads". He recommends writing personalized first lines based on LinkedIn research.

Try it: Block 2 hours each morning. Research 25 prospects. Write one personalized email per prospect. Finish by end of Day 2.

Deliverable: 25 emails drafted in spreadsheet with prospect name, first line, and email body"

FINAL DELIVERABLE (at end of path):
"Deliverable: [Specific shipped/published/sent thing with quantity]"

HARD RULES:
1. Title = deliverable with quantity when possible ("50 Emails Sent" not "Email System Built")
2. Description MUST list saved sources with [1], [2], [3] format
3. Each sprint MUST cite which source it's applying with [1], [2] notation
4. Each sprint MUST have "Try it:" section with exact constraint + exact deliverable + deadline
5. Maximum 3-5 sprints, each 1-3 days
6. Total path duration: 3-7 days max
7. Every deliverable is concrete and countable when possible

BANNED WORDS (never use):
${BANNED_WORDS.join(', ')}

BANNED PATTERNS:
- Titles without concrete deliverables
- Sprints without "Try it:" section
- Generic advice without source citations [1], [2]
- "Week 1" or "Module 1" (use "Sprint 1 (Days 1-2)")
- Course-like language (bootcamp, program, curriculum, fundamentals)
- Any sprint without specific deadline and output

ACTION VERBS ONLY:
Ship, Build, Write, Send, Post, Launch, Create, Test, Record, Publish, Deploy, Draft

NO EMOJIS. CITE SOURCES [1], [2]. CONCRETE DELIVERABLES.`;

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
