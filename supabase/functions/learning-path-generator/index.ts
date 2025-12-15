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

interface PathStructure {
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

    const { topic, durationDays = 30, regenerate = false, pathId = null } = await req.json();

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

    console.log(`Generating ${durationDays}-day learning path for topic: ${topic}${regenerate ? ' (regenerating)' : ''}`);

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

      if (pathData?.sources_used && Array.isArray(pathData.sources_used)) {
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
      }

      // Delete old progress entries
      await supabase.from("path_daily_progress").delete().eq("path_id", pathId);
      console.log(`Deleted old progress for path: ${pathId}`);
    }

    // Only search for new sources if not regenerating or no existing sources found
    if (sources.length === 0) {
      const [insightsResult, documentsResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, source")
          .eq("user_id", user.id)
          .or(`title.ilike.%${topic}%,content.ilike.%${topic}%`)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("documents")
          .select("id, title, extracted_content, file_type")
          .eq("user_id", user.id)
          .or(`title.ilike.%${topic}%,extracted_content.ilike.%${topic}%`)
          .order("created_at", { ascending: false })
          .limit(10),
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

    // Fetch identity seed for context
    const { data: identitySeed } = await supabase
      .from("identity_seeds")
      .select("content, core_values")
      .eq("user_id", user.id)
      .maybeSingle();

    const sourcesForPrompt = sources.slice(0, 12).map((s, idx) => 
      `[${idx + 1}] "${s.title}" (${s.type}): ${s.content.substring(0, 400)}`
    ).join("\n\n");

    const systemPrompt = `You are generating a ${durationDays}-day structured learning path. Your job is to break down the user's saved sources into a digestible daily curriculum that combines LEARNING (consuming content) with APPLICATION (testing understanding).

CRITICAL RULES:
1. ONLY reference sources the user has saved - cite them as [1], [2], etc.
2. Each learning task should be 15-30 minutes max
3. Each application task should be 15 minutes max
4. Include REST DAYS every 5th day (Day 5, 10, 15, 20, 25, 30)
5. Progress from basics to advanced
6. Final week (days 26-30) is synthesis and creation
7. Be SPECIFIC about which part of each source to consume
8. Application tasks must TEST understanding (not busy work)

BANNED:
- Generic advice not tied to their sources
- Vague tasks like "reflect on your learnings"
- Suggesting external sources they haven't saved
- Emotional or motivational language

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "sub_topics": ["Sub-topic 1", "Sub-topic 2", "Sub-topic 3", "Sub-topic 4"],
  "why_this_matters": "One sentence connecting to user's identity/projects",
  "final_deliverable": "Specific creation like 'Blog post explaining X' or 'Framework for Y'",
  "daily_structure": [
    { "day": 1, "learning_task": "Watch [1] (first 15 minutes) focusing on...", "learning_source_ref": "[1]", "application_task": "Explain the core concept in 3 sentences", "is_rest_day": false },
    { "day": 2, "learning_task": "...", "learning_source_ref": "[2]", "application_task": "...", "is_rest_day": false },
    { "day": 5, "learning_task": "", "learning_source_ref": "", "application_task": "", "is_rest_day": true },
    ...continue for all ${durationDays} days
  ]
}`;

    const userPrompt = `Generate a ${durationDays}-day learning path for: ${topic}

${identitySeed ? `User's identity: ${identitySeed.content?.substring(0, 300)}` : ""}

User's saved sources about this topic:
${sourcesForPrompt}

Create a structured path that:
1. Extracts 4-5 sub-topics from these sources
2. Orders learning from basics to advanced
3. Each day has ONE learning task + ONE application task
4. Rest days on days 5, 10, 15, 20, 25, 30
5. Final week is synthesis + creating proof of learning

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
          title: `${durationDays}-Day ${topic} Learning Path`,
          description: pathStructure.why_this_matters,
          structure: pathStructure.daily_structure,
          sources_used: sources.slice(0, 12).map(s => ({ id: s.id, title: s.title, type: s.type })),
          sub_topics: pathStructure.sub_topics,
          final_deliverable: pathStructure.final_deliverable,
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
          title: `${durationDays}-Day ${topic} Learning Path`,
          description: pathStructure.why_this_matters,
          topic_name: topic,
          duration_days: durationDays,
          structure: pathStructure.daily_structure,
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
