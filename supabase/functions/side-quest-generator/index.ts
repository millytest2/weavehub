import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Category = "Bold" | "Solo" | "Social" | "Creative" | "Physical" | "Mind";
type Difficulty = "easy" | "medium" | "hard";

interface SideQuest {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  duration: string; // human readable e.g. "30 min", "1 day", "2 days"
  proof: string; // what counts as done
  why: string; // <= 12 words, identity-grounded
}

const CATEGORIES: Category[] = ["Bold", "Solo", "Social", "Creative", "Physical", "Mind"];

// Local fallback library — novel, weird-on-purpose, identity-neutral
function getFallbackQuest(category: Category, difficulty: Difficulty): SideQuest {
  const lib: Record<Category, Record<Difficulty, SideQuest[]>> = {
    Bold: {
      easy: [{
        title: "Wear something one notch louder than usual",
        description: "Pick the boldest thing in your closet you never wear in public. Wear it for one full day of regular errands.",
        category: "Bold", difficulty: "easy", duration: "1 day",
        proof: "Photo of yourself wearing it out, or a moment someone reacted.",
        why: "You stop performing invisibility."
      }],
      medium: [{
        title: "Eat alone at a restaurant with no phone",
        description: "Sit at a table, no headphones, no phone. Order, eat, observe, leave. One full meal.",
        category: "Bold", difficulty: "medium", duration: "1 hour",
        proof: "Note what you noticed about the room, the people, yourself.",
        why: "You learn your own company isn't dangerous."
      }],
      hard: [{
        title: "Speak up the moment you'd usually stay quiet",
        description: "Next 48 hours: every time you feel the urge to nod and stay silent in a conversation, say what you actually think. Track each one.",
        category: "Bold", difficulty: "hard", duration: "2 days",
        proof: "Tally of times you spoke vs swallowed it. Note one that mattered.",
        why: "You stop disappearing in real time."
      }],
    },
    Solo: {
      easy: [{
        title: "30 minutes outside, no phone, no destination",
        description: "Walk out the door. No music, no podcast, no map. Walk wherever your feet go. Come back when you're done.",
        category: "Solo", difficulty: "easy", duration: "30 min",
        proof: "Where you ended up. One thing you noticed.",
        why: "You hear yourself again."
      }],
      medium: [{
        title: "Half-day with zero input",
        description: "5 hours awake with no podcasts, no scrolling, no shows, no music with words. Cook, walk, sit, write. Note what surfaces.",
        category: "Solo", difficulty: "medium", duration: "5 hours",
        proof: "One paragraph of what came up when nothing was talking at you.",
        why: "Your real thoughts need a quiet room."
      }],
      hard: [{
        title: "24 hours offline. Real offline.",
        description: "Phone in a drawer for 24h. No laptop except for emergencies. Plan it for a day off. Notice every reach.",
        category: "Solo", difficulty: "hard", duration: "1 day",
        proof: "Tally of reach-impulses. What you did instead.",
        why: "You find out what you actually want."
      }],
    },
    Social: {
      easy: [{
        title: "Compliment three strangers, specifically",
        description: "Not 'nice shirt.' Specific. 'That color makes your eyes look incredible.' Three strangers, today.",
        category: "Social", difficulty: "easy", duration: "1 day",
        proof: "What you said. What they did.",
        why: "Warmth is a muscle."
      }],
      medium: [{
        title: "Reach out to one person you've been avoiding",
        description: "Not stalking, not weird. The one person you've been meaning to message for months. Send the message today, no overthinking.",
        category: "Social", difficulty: "medium", duration: "10 min",
        proof: "Screenshot of sent message. How you felt before vs after.",
        why: "Avoidance compounds. So does courage."
      }],
      hard: [{
        title: "Have one real conversation today",
        description: "With anyone. Skip the script. Ask one question you actually want the answer to. Listen until they finish. Ask the next one.",
        category: "Social", difficulty: "hard", duration: "1 day",
        proof: "Who. One question you asked. Something you didn't know about them.",
        why: "Most days you talk. You don't connect."
      }],
    },
    Creative: {
      easy: [{
        title: "Make something ugly on purpose",
        description: "10 minutes. Draw, write, build, cook — anything. Goal: maximum ugly. No improving it. Save it.",
        category: "Creative", difficulty: "easy", duration: "10 min",
        proof: "Photo of the ugly thing.",
        why: "You can't ship if you can't be bad."
      }],
      medium: [{
        title: "Make one thing in a medium you don't use",
        description: "If you write, paint. If you film, write a poem. If you code, sing. Spend 1 hour. Show one person.",
        category: "Creative", difficulty: "medium", duration: "1 hour",
        proof: "The thing. Who you showed.",
        why: "Strange rooms grow your hands."
      }],
      hard: [{
        title: "Publish something raw within 24 hours",
        description: "Make a thing — post, video, drawing, voice note — and publish it publicly within 24h of starting. No drafts past one. No editing past one.",
        category: "Creative", difficulty: "hard", duration: "1 day",
        proof: "Link to the published thing.",
        why: "Polish is procrastination in a tuxedo."
      }],
    },
    Physical: {
      easy: [{
        title: "Take the long way for one day",
        description: "Stairs not elevator. Park far. Walk the long block. Pick the harder physical option every time today.",
        category: "Physical", difficulty: "easy", duration: "1 day",
        proof: "Three moments you chose the harder way.",
        why: "Friction is fuel."
      }],
      medium: [{
        title: "Cold water + 20-minute walk before noon, three days",
        description: "Cold shower (last 60 sec) then a 20-min walk outside. Before noon. Three days in a row.",
        category: "Physical", difficulty: "medium", duration: "3 days",
        proof: "Three checks. Energy 1-10 each day.",
        why: "Your morning runs your day."
      }],
      hard: [{
        title: "One physical thing that scares you a little",
        description: "Pick one: a class you've avoided, a hike you've put off, a swim, a sparring session. Book it. Show up. Within 7 days.",
        category: "Physical", difficulty: "hard", duration: "1 week",
        proof: "What you did. What your body felt after.",
        why: "Your body needs new evidence."
      }],
    },
    Mind: {
      easy: [{
        title: "Write the thought you've been avoiding",
        description: "10 minutes, paper or screen. The thing you've been not-thinking. Write it raw. No one reads it.",
        category: "Mind", difficulty: "easy", duration: "10 min",
        proof: "You wrote it. One sentence summary, just for you.",
        why: "What you avoid runs you."
      }],
      medium: [{
        title: "Identify your loop. Name it out loud.",
        description: "Sit 20 minutes. Find the thought-loop you ran most this week. Name it in one sentence. Say it out loud.",
        category: "Mind", difficulty: "medium", duration: "20 min",
        proof: "The sentence. Where you noticed it running today.",
        why: "Named patterns lose half their power."
      }],
      hard: [{
        title: "Three days, one belief tested in real life",
        description: "Pick a story you tell yourself ('I can't…', 'People always…'). Design 3 days of small actions that test it. Track results.",
        category: "Mind", difficulty: "hard", duration: "3 days",
        proof: "The belief. The 3 tests. What actually happened.",
        why: "Beliefs survive on untested air."
      }],
    },
  };

  const pool = lib[category][difficulty];
  return pool[Math.floor(Math.random() * pool.length)];
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

const BANNED = ["unlock", "journey", "embrace", "lean into", "sit with", "honor your", "inner child", "authentic self", "safe space"];
function clean(text: string): string {
  let out = stripEmojis(text);
  // soft scrub — replace if banned phrase present
  for (const b of BANNED) {
    if (out.toLowerCase().includes(b)) {
      // just return as-is; AI is asked not to use them
    }
  }
  return out;
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
    const category: Category = CATEGORIES.includes(body.category) ? body.category : "Bold";
    const difficulty: Difficulty = ["easy","medium","hard"].includes(body.difficulty) ? body.difficulty : "easy";
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.slice(0, 20) : [];

    // Light context — identity seed only (we want novelty, not heavy weighting)
    const { data: seed } = await supabase
      .from("identity_seeds")
      .select("content, year_note, weekly_focus, core_values, life_domains")
      .eq("user_id", user.id)
      .maybeSingle();

    const identity = [
      seed?.content && `Current: ${String(seed.content).slice(0, 300)}`,
      seed?.year_note && `2026: ${String(seed.year_note).slice(0, 200)}`,
      seed?.weekly_focus && `This week: ${String(seed.weekly_focus).slice(0, 150)}`,
      seed?.core_values && `Values: ${String(seed.core_values).slice(0, 150)}`,
    ].filter(Boolean).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const q = getFallbackQuest(category, difficulty);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const durationGuide = {
      easy: "10-60 min, completable today",
      medium: "1-3 hours OR 1-3 days",
      hard: "2-7 days",
    }[difficulty];

    const categoryGuide: Record<Category, string> = {
      Bold: "Anti-shrinking. Visible. Breaks a smallness pattern. Mild social risk.",
      Solo: "Time alone with self. No input streams. Builds tolerance for own company.",
      Social: "Real human contact. Specific, not vague. Names a person or moment.",
      Creative: "Making something. Output > input. Permission to be bad.",
      Physical: "Body-first. Friction, movement, cold, walk, gym, dance.",
      Mind: "Inner work made concrete. Naming, writing, testing a belief.",
    };

    const prompt = `Generate ONE side quest for someone wanting to break out of boredom and dabble in something new.

CATEGORY: ${category} — ${categoryGuide[category]}
DIFFICULTY: ${difficulty} — ${durationGuide}
USER IDENTITY (light context, do not over-fit):
${identity || "(no identity captured — generate generically novel quest)"}

DO NOT REPEAT these recently shown quest titles:
${exclude.length ? exclude.map(t => `- ${t}`).join("\n") : "(none)"}

RULES:
- One specific, concrete quest. Novel. Slightly weird is good.
- Title: 4-9 words, action-led, no fluff.
- Description: 2-3 short sentences. Vivid. Specific.
- Proof: what literally counts as "done" — observable.
- Why: ONE sentence, max 12 words, hits an identity truth (not therapy-speak).
- BANNED words: unlock, journey, embrace, lean into, sit with, inner child, authentic self, safe space, honor your.
- No emojis. No exclamation marks. No "you got this."
- Tone: a sharp friend, not a therapist or coach.

Return ONLY JSON:
{
  "title": "...",
  "description": "...",
  "duration": "${difficulty === 'easy' ? '30 min' : difficulty === 'medium' ? '1 day' : '3 days'}",
  "proof": "...",
  "why": "..."
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
          { role: "system", content: "You generate novel, specific side quests. No emojis. No therapy-speak. Return only JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      const q = getFallbackQuest(category, difficulty);
      return new Response(JSON.stringify({ quest: q, source: "fallback", reason: aiRes.status === 429 ? "rate_limit" : "credits" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!aiRes.ok) {
      const q = getFallbackQuest(category, difficulty);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content;
    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch { /* fallback below */ }

    if (!parsed?.title || !parsed?.description) {
      const q = getFallbackQuest(category, difficulty);
      return new Response(JSON.stringify({ quest: q, source: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quest: SideQuest = {
      title: clean(parsed.title),
      description: clean(parsed.description),
      category,
      difficulty,
      duration: clean(parsed.duration || (difficulty === "easy" ? "30 min" : difficulty === "medium" ? "1 day" : "3 days")),
      proof: clean(parsed.proof || "Note what happened."),
      why: clean(parsed.why || ""),
    };

    return new Response(JSON.stringify({ quest, source: "ai" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("side-quest-generator error", err);
    // Always return 200 with fallback so client never crashes
    const q = getFallbackQuest("Bold", "easy");
    return new Response(JSON.stringify({ quest: q, source: "fallback", error: String(err?.message || err) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
