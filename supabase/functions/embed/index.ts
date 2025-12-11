import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { type, id, content, auto_classify = true } = await req.json();
    
    if (!type || !id || !content) {
      return new Response(JSON.stringify({ error: "Missing type, id, or content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Embedding ${type} ${id}, content length: ${content.length}, auto_classify: ${auto_classify}`);

    // Extract semantic tags and classification
    const classificationPrompt = auto_classify 
      ? `Analyze this content and return JSON with:
{
  "tags": ["5-10 key semantic tags"],
  "themes": ["2-4 main themes"],
  "pillars": ["relevant from: Stability, Skill, Content, Health, Presence, Admin, Dating, Learning"],
  "identity_alignment": 0.0-1.0 (how actionable for personal growth),
  "action_potential": 0.0-1.0 (how immediately actionable)
}

Content:
${content.substring(0, 3000)}`
      : `Extract 5-10 key semantic tags from this content. Return JSON: {"tags": ["tag1", "tag2", ...]}

Content:
${content.substring(0, 3000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { 
            role: "system", 
            content: "You are a content analyzer. Return only valid JSON, no markdown code blocks." 
          },
          { role: "user", content: classificationPrompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Embedding AI error:", response.status);
      return new Response(JSON.stringify({ success: false, error: "AI error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    
    let classification;
    try {
      classification = JSON.parse(cleaned);
    } catch {
      classification = { tags: cleaned.split(',').map((t: string) => t.trim()) };
    }

    console.log(`Classification: ${JSON.stringify(classification)}`);

    // Calculate relevance score
    const identityAlignment = classification.identity_alignment || 0.5;
    const actionPotential = classification.action_potential || 0.5;
    const relevanceScore = Math.min(1.0, 
      0.4 * identityAlignment + 
      0.3 * actionPotential + 
      0.2 * Math.min(1, content.length / 5000) + 
      0.1
    );

    // Update the appropriate table
    const table = type === 'insight' ? 'insights' : 'documents';
    const { error: updateError } = await supabase
      .from(table)
      .update({ 
        relevance_score: relevanceScore,
        last_accessed: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ success: false, error: updateError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // If auto_classify is enabled, try to match to a topic
    if (auto_classify && classification.themes?.length > 0) {
      const { data: topics } = await supabase
        .from('topics')
        .select('id, name, description')
        .eq('user_id', user.id);

      if (topics && topics.length > 0) {
        // Find best matching topic based on themes
        const themesLower = classification.themes.map((t: string) => t.toLowerCase());
        let bestMatch = null;
        let bestScore = 0;

        for (const topic of topics) {
          const topicWords = `${topic.name} ${topic.description || ''}`.toLowerCase().split(/\s+/);
          const matchScore = themesLower.filter((theme: string) => 
            topicWords.some((word: string) => theme.includes(word) || word.includes(theme))
          ).length;
          
          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = topic;
          }
        }

        if (bestMatch && bestScore > 0) {
          await supabase
            .from(table)
            .update({ topic_id: bestMatch.id })
            .eq('id', id)
            .eq('user_id', user.id)
            .is('topic_id', null); // Only update if no topic assigned

          console.log(`Auto-assigned topic: ${bestMatch.name}`);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      classification,
      relevance_score: relevanceScore,
      message: `Processed ${type} ${id}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Embed error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});