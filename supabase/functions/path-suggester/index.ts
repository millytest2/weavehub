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

    // Fetch user's saved content
    const [insightsResult, documentsResult, identityResult] = await Promise.all([
      supabase
        .from("insights")
        .select("title, content, source")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("documents")
        .select("title, summary, extracted_content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("identity_seeds")
        .select("content, core_values")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const identity = identityResult.data;

    if (insights.length < 3 && documents.length < 2) {
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "Save at least 5 pieces of content first to get topic suggestions"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build context from user's content
    const insightContext = insights
      .slice(0, 20)
      .map(i => `- ${i.title}: ${i.content?.substring(0, 150) || ''}`)
      .join('\n');

    const documentContext = documents
      .slice(0, 10)
      .map(d => `- ${d.title}: ${d.summary?.substring(0, 100) || d.extracted_content?.substring(0, 100) || ''}`)
      .join('\n');

    const identityContext = identity?.content 
      ? `IDENTITY: ${identity.content.substring(0, 300)}` 
      : '';

    const systemPrompt = `You are a mirror that reflects patterns in what the user has saved. You do NOT generate ideas. You surface what they've already captured.

THEIR SAVED INSIGHTS:
${insightContext}

THEIR SAVED DOCUMENTS:
${documentContext}

${identityContext}

WEAVE OBJECTIVE: Help users "do cool shit" - learn by DOING, create CONTENT, push toward IDEAL SELF.

TASK: Look at what they've ACTUALLY saved. Identify 2-3 learning topics that:
1. Appear MULTIPLE TIMES in their saved content (cite the pattern)
2. Have enough depth for a 30-day learning path
3. Connect to skills they could BUILD, not just consume
4. Align with their IDENTITY and VALUES
5. Have high CONTENT FUEL potential (learning this would create shareable content)

TOPIC CLUSTERING RULES:
- Group related content into coherent skill areas
- Look for repeated themes across insights and documents
- Prioritize topics that connect to their active projects
- Topics should lead to TANGIBLE OUTPUTS (shipped code, published content, real skills)

RULES:
- ONLY suggest topics that are CLEARLY present in their data
- Each topic should have 5+ related sources in their content
- Topics should be specific skills or domains, not abstract concepts
- NO generic suggestions - everything must trace back to their saved content
- NO therapy-speak or self-help fluff
- Focus on learnable, applicable skills that produce OUTPUT
- Consider: Would completing this path give them something to POST ABOUT?

BAD EXAMPLES (too generic):
- "Personal Development"
- "Self-Improvement"
- "Mindfulness"
- "Productivity"

GOOD EXAMPLES (specific, learnable, content-worthy):
- "Video Editing" (they saved 8 videos about editing → can post editing tips)
- "Cold Outreach" (they saved content about sales, DMs → can post about results)
- "Public Speaking" (they saved presentation skills → can post speaking clips)
- "System Design" (they saved architecture content → can post technical breakdowns)`;

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
          { role: "user", content: "What 2-3 specific learning topics appear most in my saved content?" }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_topics",
              description: "Return 2-3 learning topic suggestions based on user's saved content",
              parameters: {
                type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: { 
                    type: "object",
                    properties: {
                      topic: { type: "string", description: "The specific, learnable topic name" },
                      sourceCount: { type: "number", description: "How many sources in their content relate to this topic (must be 5+)" },
                      contentPotential: { type: "string", description: "What kind of content they could create while learning this" }
                    },
                    required: ["topic", "sourceCount", "contentPotential"]
                  },
                  minItems: 1,
                  maxItems: 3,
                  description: "2-3 specific topics with source counts and content potential"
                }
              },
                required: ["suggestions"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_topics" } }
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "Failed to analyze content patterns"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "Couldn't find clear patterns in your content yet"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      let suggestions = parsed.suggestions || [];
      
      // Normalize response - handle both string[] and object[] formats
      suggestions = suggestions.map((s: any) => {
        if (typeof s === 'string') {
          return { topic: s, sourceCount: 5, contentPotential: 'Posts and threads about learnings' };
        }
        return { 
          topic: s.topic, 
          sourceCount: s.sourceCount || 5,
          contentPotential: s.contentPotential || 'Posts and threads about learnings'
        };
      });
      
      console.log(`Path suggester: Found ${suggestions.length} topics for user`);
      
      // Return just topic names for backwards compatibility, plus the full data
      return new Response(JSON.stringify({ 
        suggestions: suggestions.map((s: any) => s.topic),
        suggestionsWithCounts: suggestions 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "Failed to parse suggestions"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("Path suggester error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
