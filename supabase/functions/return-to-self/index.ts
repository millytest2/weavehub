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

    // Parse timezone from request
    let timezone = 'UTC';
    try {
      const body = await req.json();
      timezone = body.timezone || 'UTC';
    } catch {
      // No body or invalid JSON
    }

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

    // Fetch identity seed
    const { data: identitySeed } = await supabase
      .from("identity_seeds")
      .select("content, core_values, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch recent insights (top 5 by relevance)
    const { data: insights } = await supabase
      .from("insights")
      .select("id, title, content, relevance_score")
      .eq("user_id", user.id)
      .order("relevance_score", { ascending: false })
      .limit(10);

    // Pick a random relevant insight
    const randomInsight = insights && insights.length > 0 
      ? insights[Math.floor(Math.random() * Math.min(5, insights.length))]
      : null;

    const identity = identitySeed?.content || "You are becoming someone who takes aligned action.";
    const values = identitySeed?.core_values || "Growth, Presence, Creation";
    const currentReality = identitySeed?.weekly_focus || "You are here. That is enough.";

    // Time-appropriate grounding
    const timeContext = {
      morning: "Morning energy - can suggest slightly more active grounding (movement, cold exposure, journaling)",
      afternoon: "Afternoon - balance, re-centering (short walk, breathing, quick reset)",
      evening: "Evening wind-down - gentler activities (reflection, gratitude, light reading)",
      night: "Night - pure calm (breathing, stillness, preparing for rest)"
    };

    // Generate a gentle identity-aligned rep
    const systemPrompt = `You surface what the user already knows. The user is drifting (bored, anxious, lonely, overthinking, or wanting to numb out). 
Based on their saved identity and values, bring them back to themselves with one gentle micro-action.

TIME: ${timeOfDay}
${timeContext[timeOfDay as keyof typeof timeContext]}

USER IDENTITY: ${identity}
USER VALUES: ${values}
CURRENT REALITY: ${currentReality}
${randomInsight ? `RELEVANT INSIGHT: "${randomInsight.title}" - ${randomInsight.content.substring(0, 300)}` : ""}

Return a JSON object with exactly these fields:
- gentleRep: A single 2-5 minute action appropriate for ${timeOfDay}. Reference their actual identity/values. Something that reconnects them to who they're becoming.
- reminder: One sentence (under 15 words) that reminds them what they're doing with their life. Pull from their identity. Be specific.

Rules:
- Match energy to ${timeOfDay} (${timeOfDay === 'night' ? 'very calm, wind-down only' : timeOfDay === 'evening' ? 'gentle' : timeOfDay === 'afternoon' ? 'balanced' : 'can be slightly more active'})
- No emojis
- No emotional language ("You've got this", "I believe in you")
- No therapeutic framing ("I know it's hard", "Give yourself grace")
- No motivational fluff
- Reference their actual identity/values from what they've saved
- Keep it concrete and immediate`;

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
