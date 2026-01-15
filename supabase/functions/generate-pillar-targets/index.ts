import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating smart pillar targets for user: ${user.id}`);

    // Fetch user's identity seed
    const { data: identitySeed, error: seedError } = await supabase
      .from("identity_seeds")
      .select("content, core_values, year_note, weekly_focus, current_phase")
      .eq("user_id", user.id)
      .maybeSingle();

    if (seedError) {
      console.error("Error fetching identity seed:", seedError);
      return new Response(JSON.stringify({ error: "Failed to fetch identity" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!identitySeed || (!identitySeed.content && !identitySeed.year_note && !identitySeed.core_values)) {
      return new Response(JSON.stringify({ 
        error: "No identity data found",
        message: "Please set up your Identity (Current Reality, Values, 2026 Direction) first."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent action history to understand patterns
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 14);
    
    const { data: recentActions } = await supabase
      .from("action_history")
      .select("pillar, action_text, action_date")
      .eq("user_id", user.id)
      .gte("action_date", oneWeekAgo.toISOString().split('T')[0])
      .order("action_date", { ascending: false });

    // Calculate current patterns
    const pillarCounts: Record<string, number> = {};
    const pillars = ['business', 'body', 'content', 'relationship', 'mind', 'play'];
    pillars.forEach(p => pillarCounts[p] = 0);
    
    const pillarMap: Record<string, string> = {
      'connection': 'relationship',
      'skill': 'mind',
      'learning': 'mind',
      'presence': 'mind',
      'stability': 'business',
    };
    
    (recentActions || []).forEach(a => {
      const p = (a.pillar || '').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      if (pillars.includes(normalizedPillar)) {
        pillarCounts[normalizedPillar]++;
      }
    });

    const prompt = `You are a life design coach helping someone set weekly pillar targets based on their identity and goals.

## User's Identity & Direction

**Who They're Becoming:**
${identitySeed.content || "Not specified"}

**Core Values:**
${identitySeed.core_values || "Not specified"}

**2026 Direction / Goals:**
${identitySeed.year_note || "Not specified"}

**Current Reality / Focus:**
${identitySeed.weekly_focus || "Not specified"}

## Their Recent Activity (last 2 weeks)
${Object.entries(pillarCounts).map(([p, c]) => `- ${p}: ${c} actions`).join('\n')}

## The 6 Life Pillars
- business: Work, career, income, professional growth
- body: Exercise, nutrition, sleep, physical health
- content: Creating, writing, building, producing
- relationship: Family, friends, community, connection
- mind: Learning, reading, meditation, mental clarity
- play: Fun, hobbies, rest, recreation

## Your Task
Based on their identity, goals, values, and current patterns, recommend weekly targets for each pillar.

Consider:
1. Their stated goals and priorities (e.g., if they want to "hit $100K revenue", business should be higher priority)
2. Balance is important but priorities differ - some pillars naturally need more attention based on goals
3. Be realistic - total weekly actions should be 15-30 (sustainable)
4. Higher priority pillars = more actions
5. Don't neglect any pillar completely - minimum 1-2 per week even for low priority
6. If they're neglecting something important (e.g., body transformation goal but 0 body actions), flag it

Return ONLY a JSON object with this exact structure:
{
  "targets": {
    "business": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" },
    "body": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" },
    "content": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" },
    "relationship": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" },
    "mind": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" },
    "play": { "weekly_target": <number 1-10>, "priority": <number 1-5>, "reasoning": "<brief 1 sentence>" }
  },
  "summary": "<2-3 sentence overview of the recommended balance and why>",
  "alert": "<optional: if they're dramatically misaligned with their goals, mention it here>"
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Calling AI to generate targets...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a life design coach. Always respond with valid JSON only, no markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response");
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI response:", content);

    // Parse the JSON response
    let parsed;
    try {
      // Clean up potential markdown code blocks
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed.targets) {
      console.error("Invalid response structure:", parsed);
      return new Response(JSON.stringify({ error: "Invalid AI response structure" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Successfully generated targets:", parsed.targets);

    return new Response(JSON.stringify({
      targets: parsed.targets,
      summary: parsed.summary || null,
      alert: parsed.alert || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-pillar-targets:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
