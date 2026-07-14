import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Category = "Play" | "Wander" | "Connect" | "Create" | "Body" | "Depth";
type Difficulty = "easy" | "medium" | "hard";
type Vibe = "Fun" | "Meaningful" | "Wild" | "Cozy";

interface SideQuest {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  vibe: Vibe;
  duration: string;
  proof: string;
  why: string;
  value_hook: string; // which value / life domain / through-line thread this pulls on
}

const CATEGORIES: Category[] = ["Play", "Wander", "Connect", "Create", "Body", "Depth"];
const VIBES: Vibe[] = ["Fun", "Meaningful", "Wild", "Cozy"];

// Local fallback library — playful, value-forward, novel
function getFallbackQuest(category: Category, difficulty: Difficulty, vibe: Vibe): SideQuest {
  const lib: Record<Category, Record<Difficulty, SideQuest[]>> = {
    Play: {
      easy: [{
        title: "Do something a 10-year-old you would love",
        description: "Skate a parking lot. Build a paper airplane armada. Climb a tree. 30 minutes. No adult reason required.",
        category: "Play", difficulty: "easy", vibe: "Fun", duration: "30 min",
        proof: "What you did. How your face felt after.",
        why: "Play is data about who you were before the optimizing started.",
        value_hook: "curiosity / childlike aliveness"
      }],
      medium: [{
        title: "Say yes to the next weird invite",
        description: "Next social invite that lands — say yes, even if it's outside your normal. One condition: no scrolling once you're there.",
        category: "Play", difficulty: "medium", vibe: "Fun", duration: "1 day",
        proof: "What the invite was. One moment you wouldn't have had otherwise.",
        why: "Novelty compounds. So does declining it.",
        value_hook: "spontaneity / new experiences"
      }],
      hard: [{
        title: "Design a one-day adventure and run it solo",
        description: "Pick a nearby town or trail you've never been to. Plan the day like a mini expedition — breakfast spot, one physical thing, one strange thing, one meal alone. Go this weekend.",
        category: "Play", difficulty: "hard", vibe: "Wild", duration: "1 day",
        proof: "The route. One photo. One thing that surprised you.",
        why: "You lead your own life or you consume someone else's.",
        value_hook: "agency / adventure"
      }],
    },
    Wander: {
      easy: [{
        title: "30 minutes outside, no phone, no destination",
        description: "Walk out the door. No music, no podcast, no map. Walk wherever your feet go. Come back when you're done.",
        category: "Wander", difficulty: "easy", vibe: "Cozy", duration: "30 min",
        proof: "Where you ended up. One thing you noticed.",
        why: "You hear yourself again.",
        value_hook: "solitude / presence"
      }],
      medium: [{
        title: "Half-day with zero input",
        description: "5 hours awake with no podcasts, no scrolling, no shows, no music with words. Cook, walk, sit, write. Notice what surfaces.",
        category: "Wander", difficulty: "medium", vibe: "Meaningful", duration: "5 hours",
        proof: "One paragraph of what came up when nothing was talking at you.",
        why: "Your real thoughts need a quiet room.",
        value_hook: "clarity / deep thinking"
      }],
      hard: [{
        title: "Solo overnight somewhere new",
        description: "Book one night somewhere within 2 hours you've never been. Cheap is fine. Go alone. No agenda except breakfast the next morning.",
        category: "Wander", difficulty: "hard", vibe: "Wild", duration: "2 days",
        proof: "Where. One thing you learned about yourself away from routine.",
        why: "You find out what you actually want when the room changes.",
        value_hook: "autonomy / self-trust"
      }],
    },
    Connect: {
      easy: [{
        title: "Send one voice note that would matter",
        description: "Someone you've been meaning to check on. 90 seconds. Say the actual thing. Send it before you re-record.",
        category: "Connect", difficulty: "easy", vibe: "Meaningful", duration: "10 min",
        proof: "Who. How it felt to hit send.",
        why: "Warmth un-sent is warmth that decays.",
        value_hook: "relationships / real contact"
      }],
      medium: [{
        title: "Ask one person the question you're avoiding",
        description: "The conversation you keep drafting in your head. Have it. In person or on a real call. Once, not perfect.",
        category: "Connect", difficulty: "medium", vibe: "Meaningful", duration: "1 hour",
        proof: "Who. The question. What you actually heard.",
        why: "Avoidance compounds. So does courage.",
        value_hook: "honesty / brave conversations"
      }],
      hard: [{
        title: "Host something small this week",
        description: "3 people, your place or a park, one thing you cook or bring. Text tonight. Do it within 7 days.",
        category: "Connect", difficulty: "hard", vibe: "Cozy", duration: "1 week",
        proof: "Who came. One thing someone said that stuck.",
        why: "You stop waiting to be invited into your own life.",
        value_hook: "community / hosting energy"
      }],
    },
    Create: {
      easy: [{
        title: "Make something ugly on purpose",
        description: "10 minutes. Draw, write, build, cook — anything. Goal: maximum ugly. No improving it. Save it.",
        category: "Create", difficulty: "easy", vibe: "Fun", duration: "10 min",
        proof: "Photo of the ugly thing.",
        why: "You can't ship if you can't be bad.",
        value_hook: "output / range"
      }],
      medium: [{
        title: "Ship a 3-minute thing publicly",
        description: "Voice note, note, video, sketch. 3 minutes of your actual thinking on a thing you care about. Post it today.",
        category: "Create", difficulty: "medium", vibe: "Meaningful", duration: "1 hour",
        proof: "Link. One line of what you learned from posting it.",
        why: "Reps in public > drafts in private.",
        value_hook: "voice / building in public"
      }],
      hard: [{
        title: "Cross-pollinate two of your interests into one artifact",
        description: "Pick two things you love that don't usually touch. Make one thing that fuses them (essay, tool, mixtape, prototype). 7 days.",
        category: "Create", difficulty: "hard", vibe: "Wild", duration: "1 week",
        proof: "The thing. Which two worlds you crossed.",
        why: "The polymath edge is the seam, not the specialty.",
        value_hook: "polymath through-line"
      }],
    },
    Body: {
      easy: [{
        title: "Take the long way for one day",
        description: "Stairs not elevator. Park far. Walk the long block. Pick the harder physical option every time today.",
        category: "Body", difficulty: "easy", vibe: "Cozy", duration: "1 day",
        proof: "Three moments you chose the harder way.",
        why: "Friction is fuel.",
        value_hook: "discipline / body-first"
      }],
      medium: [{
        title: "New body input, three days",
        description: "Something your body doesn't already know: yoga class, boxing, cold plunge, rucking. 3 sessions in 3 days.",
        category: "Body", difficulty: "medium", vibe: "Wild", duration: "3 days",
        proof: "What. Energy 1-10 each day.",
        why: "Your body needs new evidence, not more reps of old evidence.",
        value_hook: "physical range / vitality"
      }],
      hard: [{
        title: "Book the physical thing you keep flinching from",
        description: "The class, the trip, the sparring, the trail. Pay for it today. Show up within 7 days.",
        category: "Body", difficulty: "hard", vibe: "Wild", duration: "1 week",
        proof: "Receipt. What it felt like after.",
        why: "Your body is a proof engine your mind can't argue with.",
        value_hook: "courage / physical edge"
      }],
    },
    Depth: {
      easy: [{
        title: "Write the thought you've been avoiding",
        description: "10 minutes, paper or screen. The thing you've been not-thinking. Write it raw. No one reads it.",
        category: "Depth", difficulty: "easy", vibe: "Meaningful", duration: "10 min",
        proof: "You wrote it. One sentence summary, just for you.",
        why: "What you avoid runs you.",
        value_hook: "self-honesty / depth"
      }],
      medium: [{
        title: "Name your loop out loud",
        description: "Sit 20 minutes. Find the thought-loop you ran most this week. Name it in one sentence. Say it out loud.",
        category: "Depth", difficulty: "medium", vibe: "Meaningful", duration: "20 min",
        proof: "The sentence. Where you noticed it running today.",
        why: "Named patterns lose half their power.",
        value_hook: "critical thinking / pattern awareness"
      }],
      hard: [{
        title: "Test one belief in real life for 3 days",
        description: "Pick a story you tell yourself ('I can't…', 'People always…'). Design 3 days of small actions that test it. Track results.",
        category: "Depth", difficulty: "hard", vibe: "Meaningful", duration: "3 days",
        proof: "The belief. The 3 tests. What actually happened.",
        why: "Beliefs survive on untested air.",
        value_hook: "epistemic honesty / testing reality"
      }],
    },
  };

  const pool = lib[category][difficulty];
  const q = pool[Math.floor(Math.random() * pool.length)];
  return { ...q, vibe };
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

function clean(text: string): string {
  return stripEmojis(String(text || ''));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const category: Category = CATEGORIES.includes(body.category) ? body.category : "Play";
    const difficulty: Difficulty = ["easy","medium","hard"].includes(body.difficulty) ? body.difficulty : "easy";
    const vibe: Vibe = VIBES.includes(body.vibe) ? body.vibe : "Fun";
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.slice(0, 20) : [];

    // Value-aligned context: identity + values + landscape + through-line
    const { data: seed } = await supabase
      .from("identity_seeds")
      .select("content, year_note, weekly_focus, core_values, life_domains, through_line")
      .eq("user_id", user.id)
      .maybeSingle();

    const identity = [
      seed?.content && `Current reality: ${String(seed.content).slice(0, 400)}`,
      seed?.through_line && `Through-line (the narrow focus that ties it all): ${String(seed.through_line).slice(0, 300)}`,
      seed?.core_values && `Values: ${String(seed.core_values).slice(0, 250)}`,
      seed?.life_domains && `Life landscape (things loved / neglected): ${String(seed.life_domains).slice(0, 400)}`,
      seed?.weekly_focus && `This week: ${String(seed.weekly_focus).slice(0, 200)}`,
      seed?.year_note && `2026: ${String(seed.year_note).slice(0, 200)}`,
    ].filter(Boolean).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const q = getFallbackQuest(category, difficulty, vibe);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const durationGuide = {
      easy: "10-60 min, completable today",
      medium: "1-3 hours OR 1-3 days",
      hard: "2-7 days",
    }[difficulty];

    const categoryGuide: Record<Category, string> = {
      Play: "Playful, light, childlike aliveness. Something a 10-year-old you would smile at.",
      Wander: "Time outside, solo, no input streams. Novelty of place.",
      Connect: "Warm human contact. Specific person, specific ask, real presence.",
      Create: "Making something. Output > input. Ship, don't polish.",
      Body: "Body-first. Movement, friction, new physical input.",
      Depth: "Inner work made concrete. Naming, writing, testing a belief.",
    };

    const vibeGuide: Record<Vibe, string> = {
      Fun: "Light, playful, borderline silly. Ends in a smile.",
      Meaningful: "Something you'll remember. Slight weight. Real.",
      Wild: "A little scary in the good way. Novelty + edge.",
      Cozy: "Low-key, warm, human. No performance required.",
    };

    const prompt = `Generate ONE side quest to break Miles out of the loop and pull him toward the life he actually wants.

CATEGORY: ${category} — ${categoryGuide[category]}
VIBE: ${vibe} — ${vibeGuide[vibe]}
DIFFICULTY: ${difficulty} — ${durationGuide}

USER (weight this heavily — the quest must feel like it was designed FOR him, hooking a real value or life domain he's named):
${identity || "(no identity captured — generate generically novel quest)"}

RECENTLY SHOWN — do NOT repeat these titles or near-variants:
${exclude.length ? exclude.map(t => `- ${t}`).join("\n") : "(none)"}

RULES:
- The quest must break the productivity/scroll loop and pull him toward something he'd actually enjoy or grow from — not another task.
- Ground it in a specific value or life domain from his profile. Name that hook in "value_hook" (short phrase like "curiosity / novelty" or "polymath through-line" or "solo depth").
- One concrete, specific quest. Novel. Slightly weird or delightful is good.
- Title: 4-9 words, action-led, no fluff.
- Description: 2-3 short sentences. Vivid. Specific enough to do today.
- Proof: what literally counts as "done" — observable.
- Why: ONE sentence, max 12 words, hits an identity truth (not therapy-speak).
- value_hook: 2-6 words naming which value / domain / thread this pulls on.
- BANNED words: unlock, journey, embrace, lean into, sit with, inner child, authentic self, safe space, honor your.
- No emojis. No exclamation marks. No "you got this."
- Tone: a sharp friend who knows him, not a coach or therapist.

Return ONLY JSON:
{
  "title": "...",
  "description": "...",
  "duration": "${difficulty === 'easy' ? '30 min' : difficulty === 'medium' ? '1 day' : '3 days'}",
  "proof": "...",
  "why": "...",
  "value_hook": "..."
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You generate novel, value-aligned side quests that break the productivity loop. No emojis. No therapy-speak. Return only JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      const q = getFallbackQuest(category, difficulty, vibe);
      return new Response(JSON.stringify({ quest: q, source: "fallback", reason: aiRes.status === 429 ? "rate_limit" : "credits" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!aiRes.ok) {
      const q = getFallbackQuest(category, difficulty, vibe);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content;
    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch { /* fallback below */ }

    if (!parsed?.title || !parsed?.description) {
      const q = getFallbackQuest(category, difficulty, vibe);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quest: SideQuest = {
      title: clean(parsed.title),
      description: clean(parsed.description),
      category,
      difficulty,
      vibe,
      duration: clean(parsed.duration || (difficulty === "easy" ? "30 min" : difficulty === "medium" ? "1 day" : "3 days")),
      proof: clean(parsed.proof || "Note what happened."),
      why: clean(parsed.why || ""),
      value_hook: clean(parsed.value_hook || ""),
    };

    return new Response(JSON.stringify({ quest, source: "ai" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("side-quest-generator error", err);
    const q = getFallbackQuest("Play", "easy", "Fun");
    return new Response(JSON.stringify({ quest: q, source: "fallback", error: String(err?.message || err) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
