import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReturnToSelfOutput {
  // Body first - always
  bodyFirst: string;
  // Their own words back (from insights/documents)
  yourWords: string;
  yourWordsSource: string;
  // Direct naming of the pattern (no softness)
  whatIsHappening: string;
  // Their identity reflected back
  whoYouAre: string;
  // One move from their playbook
  oneMove: string;
  // A truth they captured
  truthYouKnow: string;
  // Metadata
  isSpiral: boolean;
  emotionalState: string | null;
  logId: string | null;
}

// Physical grounding options - simple, immediate
const BODY_FIRST_OPTIONS = [
  "Feet on ground. Feel them.",
  "Three breaths. Slow.",
  "Cold water on your face.",
  "Stand up. Stretch.",
  "Hands on something solid.",
  "Look around the room. Name 5 things.",
  "Shake your hands. 10 seconds.",
  "Roll your shoulders back.",
  "Unclench your jaw.",
  "One deep breath. Hold. Release.",
];

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

    // Parse request
    let emotionalState: string | null = null;
    try {
      const body = await req.json();
      emotionalState = body.emotionalState || null;
    } catch {
      // No body
    }

    console.log("Return to self - state:", emotionalState);

    // Spiral states get more direct approach
    const SPIRAL_STATES = ["anxious", "comparing", "people-pleasing", "shrinking", "spending", "waiting"];
    const isSpiral = emotionalState ? SPIRAL_STATES.includes(emotionalState) : false;

    // Direct pattern naming - no softness, no therapy
    const PATTERN_NAMING: Record<string, string> = {
      // Spirals
      anxious: "Your mind is running scenarios. It's trying to protect you from things that aren't happening.",
      comparing: "You're looking sideways. Their path isn't yours. Different lane, different timeline.",
      "people-pleasing": "You're abandoning yourself to manage how others feel about you.",
      shrinking: "You're making yourself smaller to avoid being seen. Smaller doesn't mean safer.",
      spending: "You're trying to purchase a feeling. The receipt won't fix it.",
      waiting: "You're waiting for conditions instead of creating them.",
      // Off-center
      scattered: "Too many tabs open. Pick one.",
      drifting: "You've lost sight of what you're doing here.",
      stuck: "You're overthinking the start. Movement comes before clarity.",
      disconnected: "You've drifted from who you said you are.",
      overloaded: "Too much input, not enough output.",
    };

    // Fetch user data
    const [identitySeedResult, insightsResult, documentsResult] = await Promise.all([
      supabase
        .from("identity_seeds")
        .select("content, core_values, year_note")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("insights")
        .select("id, title, content")
        .eq("user_id", user.id)
        .order("relevance_score", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, title, summary")
        .eq("user_id", user.id)
        .order("relevance_score", { ascending: false })
        .limit(10)
    ]);

    const identitySeed = identitySeedResult.data;
    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];

    // Build pool of user's own words
    const yourMindPool = [
      ...insights.map(i => ({ source: i.title, content: i.content })),
      ...documents.filter(d => d.summary).map(d => ({ source: d.title, content: d.summary! }))
    ];

    // Pick a random item from their mind
    const randomMindItem = yourMindPool.length > 0 
      ? yourMindPool[Math.floor(Math.random() * Math.min(8, yourMindPool.length))]
      : null;

    // Pick body first action (weighted towards simpler ones for spirals)
    const bodyFirstIndex = isSpiral 
      ? Math.floor(Math.random() * 5) // Simpler ones for spirals
      : Math.floor(Math.random() * BODY_FIRST_OPTIONS.length);
    const bodyFirst = BODY_FIRST_OPTIONS[bodyFirstIndex];

    const identity = identitySeed?.content || "";
    const values = identitySeed?.core_values || "";
    const yearNote = identitySeed?.year_note || "";

    // What is happening - direct pattern naming
    const whatIsHappening = emotionalState && PATTERN_NAMING[emotionalState] 
      ? PATTERN_NAMING[emotionalState]
      : "You're off-center. That's all.";

    // Generate the reflection using AI - but it MUST pull from their actual words
    const systemPrompt = `You are a MIRROR, not an advisor. You reflect back what the user already knows.
You have access to their identity, their saved insights, and their stated direction.
Your job: select and surface THEIR words, not generate new advice.

CRITICAL RULES:
- NO therapy language ("I know it's hard", "Give yourself grace", "Be kind to yourself")
- NO motivational fluff ("You've got this", "Believe in yourself")
- NO AI assistant energy ("I think you should", "Have you considered")
- NO questions that require external answers
- ONLY reflect what they already said/saved
- Be DIRECT, not soft
- Short sentences. Concrete.

USER'S IDENTITY (their words): ${identity || "Not yet defined"}
USER'S VALUES: ${values || "Not yet defined"}  
USER'S YEAR DIRECTION: ${yearNote || "Not yet defined"}
FROM THEIR SAVED CONTENT: "${randomMindItem?.content?.substring(0, 400) || "No content yet"}"
CURRENT STATE: ${emotionalState || "off-center"}
${isSpiral ? "THIS IS A SPIRAL - be more direct, less gentle" : ""}

Return these fields:
- oneMove: ONE concrete action (2-5 min) that comes from their identity or saved content. Not generic. Specific to what they've said matters to them. Written as a direct statement, not a suggestion.
- truthYouKnow: ONE sentence that reflects back something they already captured or believe. Quote or paraphrase their own words. End with their source if possible.`;

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
          { role: "user", content: "Reflect back to me what I already know." }
        ],
        tools: [{
          type: "function",
          function: {
            name: "reflect_back",
            description: "Mirror user's own wisdom back to them",
            parameters: {
              type: "object",
              properties: {
                oneMove: { type: "string", description: "One concrete action from their playbook" },
                truthYouKnow: { type: "string", description: "A truth they already captured" }
              },
              required: ["oneMove", "truthYouKnow"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "reflect_back" } }
      }),
    });

    let oneMove = "Move your body for 5 minutes.";
    let truthYouKnow = "You already know what to do.";

    if (response.ok) {
      try {
        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          oneMove = parsed.oneMove || oneMove;
          truthYouKnow = parsed.truthYouKnow || truthYouKnow;
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    }

    // Log this session
    let logId: string | null = null;
    try {
      const { data: logData } = await supabase
        .from("grounding_log")
        .insert({
          user_id: user.id,
          emotional_state: emotionalState,
          matched_source_type: randomMindItem ? 'insight' : null,
          matched_source_title: randomMindItem?.source || null,
          gentle_rep: oneMove,
          reminder: truthYouKnow
        })
        .select("id")
        .single();
      
      logId = logData?.id || null;
    } catch (logError) {
      console.error("Failed to log:", logError);
    }

    const output: ReturnToSelfOutput = {
      bodyFirst,
      yourWords: randomMindItem?.content?.substring(0, 200) || "",
      yourWordsSource: randomMindItem?.source || "",
      whatIsHappening,
      whoYouAre: identity.substring(0, 250),
      oneMove,
      truthYouKnow,
      isSpiral,
      emotionalState,
      logId
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Return to self error:", error);
    return new Response(JSON.stringify({ 
      bodyFirst: "Three breaths. Slow.",
      yourWords: "",
      yourWordsSource: "",
      whatIsHappening: "You're off-center. That's all.",
      whoYouAre: "",
      oneMove: "Move your body for 5 minutes.",
      truthYouKnow: "You already know what to do.",
      isSpiral: false,
      emotionalState: null,
      logId: null
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
