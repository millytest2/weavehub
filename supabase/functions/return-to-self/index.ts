import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReturnToSelfOutput {
  identity: string;
  values: string;
  currentReality: string;
  relevantInsight: { title: string; content: string } | null;
  gentleRep: string;
  reminder: string;
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

    // Parse timezone and emotional state from request
    let timezone = 'UTC';
    let emotionalState: string | null = null;
    try {
      const body = await req.json();
      timezone = body.timezone || 'UTC';
      emotionalState = body.emotionalState || null;
    } catch {
      // No body or invalid JSON
    }

    console.log("Return to self - emotional state:", emotionalState);

    // Get time context
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    // Map emotional states to search keywords for better insight matching
    const emotionalKeywords: Record<string, string[]> = {
      scattered: ["focus", "clarity", "one thing", "priority", "simplify", "present", "attention"],
      anxious: ["calm", "trust", "fear", "control", "surrender", "breathe", "ground", "safe"],
      overthinking: ["action", "move", "decide", "paralysis", "analysis", "just do", "start", "imperfect"],
      bored: ["purpose", "meaning", "spark", "curiosity", "experiment", "explore", "play"],
      lonely: ["connect", "community", "reach out", "belong", "presence", "show up", "relationship"],
    };

    // Fetch identity seed and recent activity for pattern detection
    const [identitySeedResult, insightsResult, actionsResult] = await Promise.all([
      supabase
        .from("identity_seeds")
        .select("content, core_values, weekly_focus")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("insights")
        .select("id, title, content, relevance_score")
        .eq("user_id", user.id)
        .order("relevance_score", { ascending: false })
        .limit(10),
      supabase
        .from("action_history")
        .select("action_text, pillar")
        .eq("user_id", user.id)
        .order("action_date", { ascending: false })
        .limit(15)
    ]);

    const identitySeed = identitySeedResult.data;
    let insights = insightsResult.data || [];
    const recentActions = actionsResult.data || [];

    // If emotional state provided, try to find insights that match
    let matchedInsight = null;
    if (emotionalState && emotionalKeywords[emotionalState] && insights.length > 0) {
      const keywords = emotionalKeywords[emotionalState];
      
      // Score insights by keyword matches
      const scoredInsights = insights.map(insight => {
        const text = `${insight.title} ${insight.content}`.toLowerCase();
        const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
        return { ...insight, matchScore: matchCount };
      });

      // Sort by match score, then relevance
      scoredInsights.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.relevance_score || 0) - (a.relevance_score || 0);
      });

      // Pick best match if it has any keyword matches
      if (scoredInsights[0]?.matchScore > 0) {
        matchedInsight = scoredInsights[0];
        console.log("Found matching insight:", matchedInsight.title, "score:", matchedInsight.matchScore);
      }
    }

    // Use matched insight or fall back to random relevant one
    const randomInsight = matchedInsight || (insights.length > 0 
      ? insights[Math.floor(Math.random() * Math.min(5, insights.length))]
      : null);

    const identity = identitySeed?.content || "You are becoming someone who takes aligned action.";
    const values = identitySeed?.core_values || "Growth, Presence, Creation";
    const currentReality = identitySeed?.weekly_focus || "You are here. That is enough.";

    // Detect integration pattern - the ONE practice across contexts
    const allText = [identity, values, currentReality, ...recentActions.map(a => a.action_text || '')].join(' ').toLowerCase();
    
    const practicePatterns = [
      { regex: /stay(ing)? (with|present|grounded|expanded)/gi, practice: "staying present with discomfort" },
      { regex: /trust(ing)? (yourself|the process|your)/gi, practice: "building self-trust" },
      { regex: /consistent|consistency|show(ing)? up/gi, practice: "consistent action over perfection" },
      { regex: /express|create|build|ship/gi, practice: "expression over consumption" },
    ];
    
    let corePractice = "";
    for (const p of practicePatterns) {
      if ((allText.match(p.regex) || []).length >= 2) {
        corePractice = p.practice;
        break;
      }
    }

    // Time-appropriate grounding
    const timeContext = {
      morning: "Morning energy - can suggest slightly more active grounding (movement, cold exposure, journaling)",
      afternoon: "Afternoon - balance, re-centering (short walk, breathing, quick reset)",
      evening: "Evening wind-down - gentler activities (reflection, gratitude, light reading)",
      night: "Night - pure calm (breathing, stillness, preparing for rest)"
    };

    // Emotional state context for AI
    const emotionalContext = emotionalState ? {
      scattered: "They're feeling scattered - too many thoughts, no clear direction. Help them focus on ONE thing.",
      anxious: "They're feeling on edge - something feels off. Ground them without being therapeutic.",
      overthinking: "They're stuck in mental loops. Get them to take one concrete action, not think more.",
      bored: "Nothing feels interesting. Reconnect them to purpose or suggest a small experiment.",
      lonely: "They feel disconnected from themselves. Reflect back who they are becoming.",
    }[emotionalState] : "";

    // Generate a gentle identity-aligned rep
    const systemPrompt = `You surface what the user already knows. The user is drifting${emotionalState ? ` (specifically: ${emotionalState})` : ' (bored, anxious, lonely, overthinking, or wanting to numb out)'}. 
Based on their saved identity and values, bring them back to themselves with one gentle micro-action.

CORE PHILOSOPHY:
The user is NOT managing separate life areas. They're living ONE integrated life. Your job is to reflect back who they already are, not prescribe who they should become.
${corePractice ? `\nDETECTED CORE PRACTICE: "${corePractice}" - this is what they're practicing everywhere. Reference it.` : ''}
${emotionalContext ? `\nEMOTIONAL CONTEXT: ${emotionalContext}` : ''}

TIME: ${timeOfDay}
${timeContext[timeOfDay as keyof typeof timeContext]}

USER IDENTITY: ${identity}
USER VALUES: ${values}
CURRENT REALITY: ${currentReality}
${randomInsight ? `RELEVANT INSIGHT FROM THEIR VAULT: "${randomInsight.title}" - ${randomInsight.content.substring(0, 300)}${matchedInsight ? ' (matched to their current state)' : ''}` : ""}

Return a JSON object with exactly these fields:
- gentleRep: A single 2-5 minute action appropriate for ${timeOfDay}. Reference their actual identity/values. Something that reconnects them to who they're becoming.${emotionalState ? ` Address their ${emotionalState} state directly but practically.` : ''} If a core practice was detected, the action should be an expression of that practice.
- reminder: One sentence (under 15 words) that reminds them what they're doing with their life. ${corePractice ? `Connect it to their core practice: "${corePractice}"` : 'Pull from their identity.'} Be specific.

Rules:
- Match energy to ${timeOfDay} (${timeOfDay === 'night' ? 'very calm, wind-down only' : timeOfDay === 'evening' ? 'gentle' : timeOfDay === 'afternoon' ? 'balanced' : 'can be slightly more active'})
- No emojis
- No emotional language ("You've got this", "I believe in you")
- No therapeutic framing ("I know it's hard", "Give yourself grace")
- No motivational fluff
- Reference their actual identity/values from what they've saved
${randomInsight ? '- Reference their own insight back to them if relevant' : ''}
- Keep it concrete and immediate
- Frame as PERMISSION to live what they're already becoming, not another thing to manage`;

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
          { role: "user", content: "Generate the grounding response." }
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_grounding",
            description: "Return a grounding response",
            parameters: {
              type: "object",
              properties: {
                gentleRep: { type: "string", description: "A gentle 2-5 minute identity-aligned action" },
                reminder: { type: "string", description: "One sentence reminder of what they're doing with their life" }
              },
              required: ["gentleRep", "reminder"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "return_grounding" } }
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      // Fallback response
      return new Response(JSON.stringify({
        identity: identity.substring(0, 200),
        values,
        currentReality: currentReality.substring(0, 200),
        relevantInsight: randomInsight ? { title: randomInsight.title, content: randomInsight.content.substring(0, 200) } : null,
        gentleRep: "Take three slow breaths. Feel your feet on the ground. You are here.",
        reminder: "You are becoming who you said you'd become."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    let gentleRep = "Take three slow breaths. Feel your feet on the ground.";
    let reminder = "You are becoming who you said you'd become.";

    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        gentleRep = parsed.gentleRep || gentleRep;
        reminder = parsed.reminder || reminder;
      }
    } catch (e) {
      console.error("Parse error:", e);
    }

    const output: ReturnToSelfOutput = {
      identity: identity.substring(0, 300),
      values,
      currentReality: currentReality.substring(0, 300),
      relevantInsight: randomInsight 
        ? { title: randomInsight.title, content: randomInsight.content.substring(0, 200) } 
        : null,
      gentleRep,
      reminder
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Return to self error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      // Provide fallback even on error
      identity: "You are becoming someone aligned with your values.",
      values: "Growth, Presence, Creation",
      currentReality: "You are here. That is enough.",
      relevantInsight: null,
      gentleRep: "Take three slow breaths. Feel your feet on the ground. You are here.",
      reminder: "You are becoming who you said you'd become."
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
