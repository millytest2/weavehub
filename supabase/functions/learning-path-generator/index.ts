import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Career keywords that should redirect to upath.ai
const CAREER_KEYWORDS = [
  'career', 'careers', 'job', 'jobs', 'career path', 'careerpath',
  'career transition', 'career change', 'career move', 'career journey',
  'career advice', 'career guidance', 'career planning', 'career decision',
  'job search', 'job hunting', 'job market', 'applying for jobs',
  'resume', 'interviews', 'recent grad', 'professional path',
  'what career', 'which career', 'career exploration',
  'purpose', 'meaning', 'mission', 'what to do with my life',
  'pivot', 'switch careers', 'transition careers',
  'lost in career', 'career confused', 'career stuck',
  'upath'
];

function detectCareerTopic(topic: string): boolean {
  const lowerTopic = topic.toLowerCase();
  return CAREER_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
}

interface Source {
  id: string;
  title: string;
  content: string;
  type: string;
}

interface DailyTask {
  day: number;
  learning_task: string;
  learning_source_ref: string;
  application_task: string;
  is_rest_day: boolean;
}

interface Section {
  section_number: number;
  title: string;
  days: number[];
  objective: string;
  key_understanding: string;
  sources_used: string[];
  daily_breakdown: Array<{ day: number; learning_task: string; application_task: string }>;
  section_deliverable: string;
}

interface PathStructure {
  sections?: Section[];
  sub_topics: string[];
  why_this_matters: string;
  final_deliverable: string;
  daily_structure: DailyTask[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, durationDays = 14, regenerate = false, pathId = null } = await req.json();

    // Cap duration at 14 days max for focused learning
    const actualDuration = Math.min(durationDays, 14);

    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for career-related topics and redirect to upath.ai
    if (detectCareerTopic(topic)) {
      console.log(`Career topic detected: ${topic} - suggesting upath.ai`);
      return new Response(JSON.stringify({
        error: "career_topic",
        message: `For career-related learning like "${topic}", we recommend upath.ai - a specialized tool for career clarity and path finding.`,
        redirect_url: "https://upath.ai",
        topic: topic
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating ${actualDuration}-day learning path for topic: ${topic}${regenerate ? ' (regenerating)' : ''}`);

    let sources: Source[] = [];
    let existingPath: any = null;

    // If regenerating, fetch existing path and reuse its sources
    if (regenerate && pathId) {
      const { data: pathData } = await supabase
        .from("learning_paths")
        .select("sources_used, topic_name")
        .eq("id", pathId)
        .eq("user_id", user.id)
        .single();

      if (pathData?.sources_used && Array.isArray(pathData.sources_used) && pathData.sources_used.length > 0) {
        existingPath = pathData;
        console.log(`Regenerating path with ${pathData.sources_used.length} existing sources`);
        
        // Fetch full content for existing sources
        const sourceIds = pathData.sources_used.map((s: any) => s.id);
        const insightIds = sourceIds.filter((id: string) => id.startsWith('insight-')).map((id: string) => id.replace('insight-', ''));
        const docIds = sourceIds.filter((id: string) => id.startsWith('doc-')).map((id: string) => id.replace('doc-', ''));

        const [insightsResult, documentsResult] = await Promise.all([
          insightIds.length > 0 
            ? supabase.from("insights").select("id, title, content, source").eq("user_id", user.id).in("id", insightIds)
            : Promise.resolve({ data: [] }),
          docIds.length > 0
            ? supabase.from("documents").select("id, title, extracted_content, file_type").eq("user_id", user.id).in("id", docIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (insightsResult.data) {
          insightsResult.data.forEach((i: any) => {
            sources.push({
              id: `insight-${i.id}`,
              title: i.title,
              content: i.content?.substring(0, 800) || "",
              type: i.source || "insight",
            });
          });
        }

        if (documentsResult.data) {
          documentsResult.data.forEach((d: any) => {
            sources.push({
              id: `doc-${d.id}`,
              title: d.title,
              content: d.extracted_content?.substring(0, 800) || "",
              type: d.file_type || "document",
            });
          });
        }
      } else {
        // Legacy path without sources - cannot regenerate
        console.log(`Legacy path ${pathId} has no sources_used - cannot regenerate`);
        return new Response(JSON.stringify({ 
          error: "legacy_path",
          message: "This is a legacy learning path without saved sources. Please delete it and create a new path with your saved content.",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete old progress entries
      await supabase.from("path_daily_progress").delete().eq("path_id", pathId);
      console.log(`Deleted old progress for path: ${pathId}`);
    }

    // Only search for new sources if creating new path (not regenerating)
    if (sources.length === 0 && !regenerate) {
      // Extract keywords from topic for broader matching
      const topicWords = topic.toLowerCase()
        .replace(/[&\-\/\\]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !['with', 'that', 'this', 'from', 'about', 'your', 'the', 'and', 'for'].includes(w));
      
      console.log(`Searching with keywords: ${topicWords.join(', ')}`);
      
      // Build OR conditions for each keyword
      const keywordConditions = topicWords.slice(0, 4).map((kw: string) => 
        `title.ilike.%${kw}%,content.ilike.%${kw}%`
      ).join(',');
      
      const docKeywordConditions = topicWords.slice(0, 4).map((kw: string) => 
        `title.ilike.%${kw}%,extracted_content.ilike.%${kw}%`
      ).join(',');

      const [insightsResult, documentsResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, source")
          .eq("user_id", user.id)
          .or(keywordConditions || `title.ilike.%${topic}%,content.ilike.%${topic}%`)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("documents")
          .select("id, title, extracted_content, file_type")
          .eq("user_id", user.id)
          .or(docKeywordConditions || `title.ilike.%${topic}%,extracted_content.ilike.%${topic}%`)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      console.log(`Found ${insightsResult.data?.length || 0} insights, ${documentsResult.data?.length || 0} documents`);

      if (insightsResult.data) {
        insightsResult.data.forEach((i: any) => {
          sources.push({
            id: `insight-${i.id}`,
            title: i.title,
            content: i.content?.substring(0, 800) || "",
            type: i.source || "insight",
          });
        });
      }

      if (documentsResult.data) {
        documentsResult.data.forEach((d: any) => {
          sources.push({
            id: `doc-${d.id}`,
            title: d.title,
            content: d.extracted_content?.substring(0, 800) || "",
            type: d.file_type || "document",
          });
        });
      }
    }

    console.log(`Found ${sources.length} sources for topic: ${topic}`);

    if (sources.length < 5) {
      return new Response(JSON.stringify({ 
        error: "insufficient_sources",
        message: `Only found ${sources.length} sources about "${topic}". Save at least 5 sources (videos, articles, notes) about this topic first.`,
        sources_found: sources.length
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch identity seed + archetype context
    const { data: identitySeed } = await supabase
      .from("identity_seeds")
      .select("content, core_values, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    // Detect archetype from identity and content
    const allContent = [
      identitySeed?.content || '',
      identitySeed?.core_values || '',
      identitySeed?.weekly_focus || '',
      ...sources.map(s => s.content),
    ].join(' ').toLowerCase();
    
    const archetypeSignals = {
      creator: ['content', 'youtube', 'twitter', 'instagram', 'tiktok', 'podcast', 'creator', 'audience', 'followers', 'document', 'story', 'publish', 'post'].filter(s => allContent.includes(s)).length,
      builder: ['build', 'ship', 'code', 'product', 'startup', 'launch', 'app', 'saas', 'revenue', 'customers', 'users', 'deploy'].filter(s => allContent.includes(s)).length,
      professional: ['career', 'job', 'promotion', 'manager', 'leadership', 'corporate', 'interview', 'salary', 'team'].filter(s => allContent.includes(s)).length,
      student: ['learn', 'study', 'course', 'degree', 'university', 'college', 'exam', 'research'].filter(s => allContent.includes(s)).length,
    };
    
    const sortedArchetypes = Object.entries(archetypeSignals).sort((a, b) => b[1] - a[1]);
    const archetype = sortedArchetypes[0][1] >= 2 ? sortedArchetypes[0][0] : 'general';
    
    const archetypeValueMap: Record<string, string> = {
      creator: 'CONTENT FUEL - every application task should produce something postable (thread, story, teaching moment)',
      builder: 'SHIPPING - every application task should produce working code, deployed feature, or tangible prototype',
      professional: 'CAREER CAPITAL - every application task should demonstrate skill, expand network, or increase visibility',
      student: 'PORTFOLIO - every application task should create study artifact or portfolio-worthy project piece',
      general: 'TANGIBLE OUTPUT - every application task should produce visible result they can point to',
    };
    
    console.log(`Detected archetype for learning path: ${archetype}`);

    const sourcesForPrompt = sources.slice(0, 12).map((s, idx) => 
      `[${idx + 1}] "${s.title}" (${s.type}): ${s.content.substring(0, 400)}`
    ).join("\n\n");

    const systemPrompt = `You are generating a ${actualDuration}-day SECTION-BASED learning path. Not overwhelming daily curriculum - a FOCUSED path with clear sections.

${identitySeed?.content ? `WHO THEY ARE: ${identitySeed.content.substring(0, 400)}` : ''}
${identitySeed?.core_values ? `THEIR VALUES: ${identitySeed.core_values}` : ''}
${identitySeed?.weekly_focus ? `CURRENT FOCUS: ${identitySeed.weekly_focus}` : ''}

ARCHETYPE: ${archetype.toUpperCase()}
VALUE REQUIREMENT: ${archetypeValueMap[archetype]}

PATH STRUCTURE (${actualDuration} days total):
- 3-4 SECTIONS, each 3-4 days
- Each section has: clear OBJECTIVE, what you'll UNDERSTAND, what you'll DO
- Day 7 and Day 14 are REST/REVIEW days if applicable
- Final section is SYNTHESIS + creating TANGIBLE deliverable

CRITICAL RULES:
1. ONLY reference sources the user has saved - cite them as [1], [2], etc.
2. Each day: 20-30 mins learning + 15-20 mins application
3. Every section ends with something CONCRETE produced
4. Be SPECIFIC about which part of each source to consume
5. Connect to their identity - this is THEIR path, not generic learning

SECTION FORMAT:
Each section should feel like a mini-sprint with:
- Clear objective (what you'll be able to do)
- Learning focus (what concepts from sources)
- Application output (what you'll create/ship)
- Why it matters for them specifically

BANNED:
- Overwhelming 30-day calendars
- Daily minutiae without purpose
- Generic advice not tied to their sources
- Vague tasks like "reflect on your learnings"
- Course-like language (module, bootcamp, curriculum)

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "sections": [
    {
      "section_number": 1,
      "title": "Section title (action-oriented)",
      "days": [1, 2, 3],
      "objective": "By end of this section, you'll be able to...",
      "key_understanding": "The core concept you'll grasp",
      "sources_used": ["[1]", "[2]"],
      "daily_breakdown": [
        { "day": 1, "learning_task": "Watch [1] first 15 min...", "application_task": "Draft/Create/Build..." },
        { "day": 2, "learning_task": "Continue [1]...", "application_task": "Refine/Test..." },
        { "day": 3, "learning_task": "Review [2]...", "application_task": "Complete section deliverable" }
      ],
      "section_deliverable": "Specific thing produced by end of section"
    }
  ],
  "sub_topics": ["Sub-topic 1", "Sub-topic 2", "Sub-topic 3"],
  "why_this_matters": "One sentence connecting to THEIR identity - make it personal",
  "final_deliverable": "The TANGIBLE thing they'll have created by day ${actualDuration}",
  "daily_structure": [
    { "day": 1, "learning_task": "...", "learning_source_ref": "[1]", "application_task": "...", "is_rest_day": false },
    { "day": 7, "learning_task": "", "learning_source_ref": "", "application_task": "", "is_rest_day": true }
  ]
}`;

    const userPrompt = `Generate a ${actualDuration}-day SECTION-BASED learning path for: ${topic}

${identitySeed ? `User's identity: ${identitySeed.content?.substring(0, 300)}` : ""}
${identitySeed?.core_values ? `Core values: ${identitySeed.core_values}` : ""}

User's saved sources about this topic:
${sourcesForPrompt}

Create a structured path with:
1. 3-4 clear SECTIONS (not overwhelming daily tasks)
2. Each section has an objective, key understanding, and deliverable
3. Progress from basics to advanced within sections
4. Rest day on day 7${actualDuration > 7 ? ' and day 14' : ''}
5. Final section is synthesis + creating TANGIBLE proof of learning
6. Every section produces something concrete

Return ONLY valid JSON.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from AI");
    }

    // Parse JSON from response
    let pathStructure: PathStructure;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1].trim();
      pathStructure = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse learning path structure");
    }

    // Create or update the learning path
    let learningPath;
    
    if (regenerate && pathId) {
      // Update existing path
      const { data, error: pathError } = await supabase
        .from("learning_paths")
        .update({
          title: `${actualDuration}-Day ${topic} Sprint`,
          description: pathStructure.why_this_matters,
          structure: { daily_structure: pathStructure.daily_structure, sections: pathStructure.sections },
          sources_used: sources.slice(0, 12).map(s => ({ id: s.id, title: s.title, type: s.type })),
          sub_topics: pathStructure.sub_topics,
          final_deliverable: pathStructure.final_deliverable,
          duration_days: actualDuration,
          current_day: 1,
          started_at: new Date().toISOString(),
          status: "active",
        })
        .eq("id", pathId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (pathError) {
        console.error("Failed to update learning path:", pathError);
        throw new Error("Failed to update learning path");
      }
      learningPath = data;
    } else {
      // Create new path
      const { data, error: pathError } = await supabase
        .from("learning_paths")
        .insert({
          user_id: user.id,
          title: `${actualDuration}-Day ${topic} Sprint`,
          description: pathStructure.why_this_matters,
          topic_name: topic,
          duration_days: actualDuration,
          structure: { daily_structure: pathStructure.daily_structure, sections: pathStructure.sections },
          sources_used: sources.slice(0, 12).map(s => ({ id: s.id, title: s.title, type: s.type })),
          sub_topics: pathStructure.sub_topics,
          final_deliverable: pathStructure.final_deliverable,
          status: "active",
          current_day: 1,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (pathError) {
        console.error("Failed to create learning path:", pathError);
        throw new Error("Failed to save learning path");
      }
      learningPath = data;
    }

    // Create daily progress entries
    const dailyEntries = pathStructure.daily_structure.map((day: DailyTask) => ({
      path_id: learningPath.id,
      user_id: user.id,
      day_number: day.day,
      learning_task: day.learning_task,
      learning_source_ref: day.learning_source_ref,
      application_task: day.application_task,
      is_rest_day: day.is_rest_day,
    }));

    const { error: progressError } = await supabase
      .from("path_daily_progress")
      .insert(dailyEntries);

    if (progressError) {
      console.error("Failed to create daily progress:", progressError);
      // Continue anyway, path was created
    }

    console.log(`Created ${durationDays}-day learning path: ${learningPath.id}`);

    return new Response(JSON.stringify({
      success: true,
      path: learningPath,
      sub_topics: pathStructure.sub_topics,
      final_deliverable: pathStructure.final_deliverable,
      sources_count: sources.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("learning-path-generator error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
