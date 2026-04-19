import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BigMoveOutput {
  headline: string;       // The ONE thing — short, punchy
  the_move: string;       // Concrete next 30-90min action
  why_this: string;       // Why this is the highest-leverage move toward Misogi/2026
  vision_link: string;    // The piece of their vision/identity this directly serves
  time: string;
  consistency: string;    // Encouraging line about streak / showing up
}

function fallback(): BigMoveOutput {
  return {
    headline: "Move on the ONE thing",
    the_move: "Open the most important project file and make one visible piece of progress in the next 45 minutes.",
    why_this: "Big visions get built by repeated visible moves on the same lever. Pick the lever and pull it once today.",
    vision_link: "Your 2026 self is the person who showed up on this thing daily.",
    time: "45 min",
    consistency: "One rep today. That's it. Compound over weeks.",
  };
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
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(fallback()), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull identity + recent action history to understand the ONE thing
    const userContext = await fetchUserContext(supabase, user.id);
    const contextPrompt = formatContextForAI(userContext);

    // Pull identity seed for vision/misogi
    const { data: seed } = await supabase
      .from("identity_seeds")
      .select("content, year_note, weekly_focus, current_phase, core_values")
      .eq("user_id", user.id)
      .maybeSingle();

    // Recent thread milestone (current month focus)
    const now = new Date();
    const { data: milestone } = await supabase
      .from("thread_milestones")
      .select("title, description, capability_focus")
      .eq("user_id", user.id)
      .eq("year", now.getFullYear())
      .eq("month_number", now.getMonth() + 1)
      .maybeSingle();

    // Last 7 days of completed actions to detect consistency on the big thing
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: recent } = await supabase
      .from("action_history")
      .select("action_text, pillar, action_date")
      .eq("user_id", user.id)
      .gte("action_date", sevenDaysAgo)
      .order("action_date", { ascending: false })
      .limit(30);

    const systemPrompt = `You are the user's Big Move coach. Your job: cut through all the experiments, side quests, and tactical reps and tell them the ONE highest-leverage move they can make RIGHT NOW that compounds toward their 2026 vision and Misogi/big bet.

Anti-patterns you ignore:
- Generic productivity tips
- Random self-care reps (that's what Next Rep is for)
- Side experiments unrelated to the core thing

What you optimize for:
- Direct linkage to their stated vision / identity / current monthly capability
- Visible, shippable progress in 30-90 min
- Reinforcing the ONE thing they should be obsessively consistent on

Output STRICT JSON with these fields:
{
  "headline": "<6-8 word punchy framing of THE ONE THING right now>",
  "the_move": "<the concrete 30-90min action, specific and visible>",
  "why_this": "<2 sentences linking this move to their vision and why now>",
  "vision_link": "<the exact piece of their identity/2026/Misogi this serves>",
  "time": "<e.g. '45 min'>",
  "consistency": "<1 line about showing up — reference their recent streak or absence on this lever>"
}`;

    const userPrompt = `${contextPrompt}

IDENTITY SEED:
${seed?.content || "(not set)"}
YEAR NOTE / 2026 VISION: ${seed?.year_note || "(not set)"}
WEEKLY FOCUS: ${seed?.weekly_focus || "(not set)"}
CURRENT PHASE: ${seed?.current_phase || "(not set)"}
CORE VALUES: ${seed?.core_values || "(not set)"}

THIS MONTH'S MILESTONE (Thread):
${milestone ? `${milestone.title} — ${milestone.description || ''} (capability: ${milestone.capability_focus || 'n/a'})` : "(no current milestone)"}

LAST 7 DAYS OF COMPLETED ACTIONS:
${(recent || []).map(r => `- [${r.pillar || '?'}] ${r.action_text}`).join('\n') || '(none)'}

Now output the Big Move JSON. Be ruthless about the ONE thing. No vague advice.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      console.error('big-move AI error', response.status, await response.text());
      return new Response(JSON.stringify(fallback()), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const raw = result.choices?.[0]?.message?.content || "{}";
    let parsed: BigMoveOutput;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = fallback();
    }

    // Defensive defaults
    const out: BigMoveOutput = {
      headline: parsed.headline || fallback().headline,
      the_move: parsed.the_move || fallback().the_move,
      why_this: parsed.why_this || fallback().why_this,
      vision_link: parsed.vision_link || fallback().vision_link,
      time: parsed.time || "45 min",
      consistency: parsed.consistency || fallback().consistency,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('big-move error:', error);
    return new Response(JSON.stringify(fallback()), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
