import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Identity-aligned buckets for replacement loops
const BUCKETS = [
  "Presence",    // Nervous system, grounding, breath
  "Learning",    // Curiosity, growth, skill
  "Creator",     // Build, write, express
  "Body",        // Movement, energy, physical
  "Charisma",    // Social confidence, connection
  "Healing",     // Emotional processing, rest
  "Fun",         // Play, joy, lightness
  "Focus"        // Deep work, shipping
];

interface NextRepOutput {
  bucket: string;
  rep: string;
  why: string;
  time: string;
}

function getFallbackRep(): NextRepOutput {
  const fallbacks: NextRepOutput[] = [
    { bucket: "Presence", rep: "5 minutes of slow breathing. In for 4, out for 8.", why: "Reset your nervous system.", time: "5 min" },
    { bucket: "Body", rep: "20 pushups or a 10 minute walk.", why: "Physical energy shifts mental state.", time: "10 min" },
    { bucket: "Creator", rep: "Write one raw thought and post it.", why: "Expression over perfection.", time: "15 min" },
    { bucket: "Learning", rep: "Read one chapter of something you're curious about.", why: "Feed the curiosity.", time: "20 min" },
    { bucket: "Focus", rep: "Set a 25 minute timer and ship one small thing.", why: "Progress creates momentum.", time: "25 min" },
    { bucket: "Fun", rep: "Do something playful for 10 minutes.", why: "Joy is productive.", time: "10 min" },
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
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

    // Fetch user context for identity-aligned suggestions
    const userContext = await fetchUserContext(supabase, user.id);
    const contextPrompt = formatContextForAI(userContext);

    // Choose bucket based on recent activity (avoid repetition)
    const recentPillars = userContext.pillar_history.slice(0, 3);
    const availableBuckets = BUCKETS.filter(b => !recentPillars.includes(b));
    const bucket = availableBuckets.length > 0 
      ? availableBuckets[Math.floor(Math.random() * availableBuckets.length)]
      : BUCKETS[Math.floor(Math.random() * BUCKETS.length)];

    console.log(`Next Rep: ${bucket} bucket`);

    const systemPrompt = `You are a replacement loop breaker. The user feels off—bored, numb, tired, angry, lost, or drifting. Give them ONE immediate action that's MORE APPEALING than scrolling, Netflix, or numbing out.

${contextPrompt}

BUCKET: ${bucket}

BUCKET MEANINGS:
- Presence: Nervous system reset - breathing, cold exposure, grounding
- Learning: Following genuine curiosity - not homework, actual interest
- Creator: Make something visible - write, build, ship
- Body: Move and feel alive - workout, walk, stretch
- Charisma: Social energy - reach out to a specific person, practice confidence
- Healing: Process emotions - journal, rest, decompress
- Fun: Pure enjoyment - games, music, something playful
- Focus: Ship one small thing - visible progress, momentum

RULES:
- ONE action only
- 5-30 minutes max
- Can start RIGHT NOW (no setup, no driving somewhere)
- Must be MORE FUN than the numbing behavior
- Make it sound exciting, not like a chore
- Reference their actual identity/goals when possible
- No emojis
- No guilt trips
- Frame it as an upgrade, not a should

THE KEY: This must feel like something they WANT to do, not have to do. Make it sound appealing.`;


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
          { role: "user", content: `I'm drifting. Give me ONE ${bucket} rep.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_next_rep",
              description: "Return one immediate identity-aligned action",
              parameters: {
                type: "object",
                properties: {
                  bucket: { type: "string", enum: BUCKETS },
                  rep: { type: "string", description: "One clear action, can start immediately, 5-30 min" },
                  why: { type: "string", description: "One sentence, why this matters right now" },
                  time: { type: "string", description: "Time estimate like '10 min'" }
                },
                required: ["bucket", "rep", "why", "time"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_next_rep" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify(getFallbackRep()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(getFallbackRep()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify(getFallbackRep()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let result: NextRepOutput;
    try {
      result = JSON.parse(toolCall.function.arguments);
      if (!result.bucket || !result.rep || !result.why || !result.time) {
        throw new Error("Invalid response structure");
      }
    } catch {
      return new Response(JSON.stringify(getFallbackRep()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Next Rep error:", error);
    return new Response(JSON.stringify(getFallbackRep()), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
