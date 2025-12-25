import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// User archetypes for adaptive suggestions
type UserArchetype = "creator" | "professional" | "student" | "builder" | "general";

function detectArchetype(text: string): { archetype: UserArchetype; valueFocus: string } {
  const lower = text.toLowerCase();
  const signals = {
    creator: ['content', 'youtube', 'twitter', 'instagram', 'tiktok', 'podcast', 'creator', 'audience', 'followers', 'document', 'story', 'publish', 'post'].filter(s => lower.includes(s)).length,
    builder: ['build', 'ship', 'code', 'product', 'startup', 'launch', 'app', 'saas', 'revenue', 'customers', 'users', 'deploy'].filter(s => lower.includes(s)).length,
    professional: ['career', 'job', 'promotion', 'manager', 'leadership', 'corporate', 'interview', 'salary', 'team'].filter(s => lower.includes(s)).length,
    student: ['learn', 'study', 'course', 'degree', 'university', 'college', 'exam', 'research'].filter(s => lower.includes(s)).length,
  };
  
  const sorted = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] >= 2) {
    const archetype = sorted[0][0] as UserArchetype;
    const valueFocusMap: Record<UserArchetype, string> = {
      creator: 'Content fuel - skills that generate documentable stories and shareable transformations',
      builder: 'Shipping velocity - skills that result in deployed features, launched products, acquired users',
      professional: 'Career momentum - skills that expand network, increase visibility, position for advancement',
      student: 'Accelerated mastery - skills that compress learning curves and create portfolio-worthy projects',
      general: 'Tangible life shifts - skills that create visible behavior changes and capability gains',
    };
    return { archetype, valueFocus: valueFocusMap[archetype] };
  }
  return { archetype: 'general', valueFocus: 'Tangible life shifts - skills that create visible behavior changes and capability gains' };
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

    // Fetch user's saved content + existing topics + experiments
    const [insightsResult, documentsResult, identityResult, topicsResult, experimentsResult, pathsResult] = await Promise.all([
      supabase
        .from("insights")
        .select("title, content, source, topic_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("documents")
        .select("title, summary, extracted_content, topic_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("identity_seeds")
        .select("content, core_values, weekly_focus, current_phase")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("topics")
        .select("id, name, description")
        .eq("user_id", user.id),
      supabase
        .from("experiments")
        .select("title, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("learning_paths")
        .select("title, topic_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const identity = identityResult.data;
    const existingTopics = topicsResult.data || [];
    const experiments = experimentsResult.data || [];
    const paths = pathsResult.data || [];

    if (insights.length < 3 && documents.length < 2) {
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "Save at least 5 pieces of content first to get topic suggestions"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build full context for archetype detection
    const allContent = [
      identity?.content || '',
      identity?.core_values || '',
      ...insights.map(i => `${i.title} ${i.content || ''}`),
      ...documents.map(d => `${d.title} ${d.summary || ''} ${d.extracted_content?.substring(0, 500) || ''}`),
    ].join(' ');
    
    const { archetype, valueFocus } = detectArchetype(allContent);
    console.log(`Detected archetype: ${archetype}`);

    // Build context from user's content
    const insightContext = insights
      .slice(0, 20)
      .map(i => `- ${i.title}: ${i.content?.substring(0, 150) || ''}`)
      .join('\n');

    const documentContext = documents
      .slice(0, 10)
      .map(d => `- ${d.title}: ${d.summary?.substring(0, 100) || d.extracted_content?.substring(0, 100) || ''}`)
      .join('\n');

    // Build "already done" context to avoid repetition
    const alreadyDone = [
      ...existingTopics.map(t => t.name),
      ...experiments.map(e => e.title),
      ...paths.map(p => p.title || p.topic_name),
    ].filter(Boolean);

    const avoidContext = alreadyDone.length > 0 
      ? `\nALREADY EXPLORED (suggest DIFFERENT topics):\n${alreadyDone.slice(0, 15).map(t => `- ${t}`).join('\n')}`
      : '';

    const identityContext = identity?.content 
      ? `IDENTITY: ${identity.content.substring(0, 400)}
${identity.core_values ? `VALUES: ${identity.core_values}` : ''}
${identity.weekly_focus ? `CURRENT FOCUS: ${identity.weekly_focus}` : ''}` 
      : '';

    const systemPrompt = `You surface IDENTITY-ALIGNED learning paths from user's saved content. Not generic topics - paths that push THEM toward THEIR ideal self.

${identityContext}

USER ARCHETYPE: ${archetype.toUpperCase()}
VALUE FOCUS: ${valueFocus}

THEIR SAVED INSIGHTS:
${insightContext}

THEIR SAVED DOCUMENTS:
${documentContext}
${avoidContext}

WEAVE MISSION: Replace ChatGPT/Claude by being DEEPLY PERSONAL. Every suggestion should feel like "holy shit, that's exactly what I need right now" - not generic self-help.

TASK: Identify 2-3 learning paths that:
1. DIRECTLY support their stated identity, values, or weekly focus
2. Appear MULTIPLE TIMES in their saved content (they clearly care about this)
3. Would produce TANGIBLE OUTPUT aligned with their archetype (${archetype})
4. Push them toward their IDEAL SELF, not just skill acquisition
5. Are DIFFERENT from what they've already explored

CRITICAL ALIGNMENT CHECK:
- Does this topic connect to WHO THEY'RE BECOMING?
- Would mastering this help them LIVE their values?
- Can they DOCUMENT the learning journey as content (if creator)?
- Does it address a HURDLE they're facing?

THE TEST: Would this path make them think "this is exactly the next step in my transformation" - not just "this seems useful"?

BAD (generic, could apply to anyone):
- "Communication Skills"
- "Time Management"
- "Personal Branding"

GOOD (specific to THEIR story):
- "Cold Outreach for ${identity?.weekly_focus || 'your project'}" (if they're building something)
- "Documenting Your Build Journey" (if they're a creator struggling to post)
- "High-Stakes Presence" (if they have content about presence/social)
- Whatever SPECIFIC skill emerges from THEIR saved content + identity`;

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
          { role: "user", content: `Based on my saved content and identity, what 2-3 specific learning paths would push me toward my ideal self? Remember: suggest paths that feel made for ME, not generic topics.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_topics",
              description: "Return 2-3 identity-aligned learning path suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: { 
                      type: "object",
                      properties: {
                        topic: { type: "string", description: "Specific, identity-aligned topic name (not generic)" },
                        whyForYou: { type: "string", description: "One sentence explaining why THIS topic for THIS person's transformation" },
                        sourceCount: { type: "number", description: "How many sources in their content relate to this (must be 5+)" },
                        archetypeValue: { type: "string", description: "What tangible output they'd create while learning (based on archetype)" }
                      },
                      required: ["topic", "whyForYou", "sourceCount", "archetypeValue"]
                    },
                    minItems: 1,
                    maxItems: 3
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
      
      // Normalize response - handle both old and new formats
      suggestions = suggestions.map((s: any) => {
        if (typeof s === 'string') {
          return { 
            topic: s, 
            whyForYou: 'Based on your saved content',
            sourceCount: 5, 
            archetypeValue: 'Tangible output from learning'
          };
        }
        return { 
          topic: s.topic, 
          whyForYou: s.whyForYou || s.contentPotential || 'Aligned with your transformation',
          sourceCount: s.sourceCount || 5,
          archetypeValue: s.archetypeValue || s.contentPotential || 'Tangible output'
        };
      });
      
      console.log(`Path suggester: Found ${suggestions.length} identity-aligned topics for user (archetype: ${archetype})`);
      
      // Return full data for UI with backwards compatibility
      return new Response(JSON.stringify({ 
        suggestions: suggestions.map((s: any) => s.topic),
        suggestionsWithDetails: suggestions,
        archetype,
        valueFocus,
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
