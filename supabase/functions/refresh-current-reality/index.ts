// Refresh Current Reality — rewrites the user's Identity → Current Reality field
// by weaving their latest 14 days of captures (observations, insights, experiments,
// weekly intentions) into the existing snapshot. Preserves voice; prior version is
// auto-tracked by a database trigger into `previous_reality`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Missing LOVABLE_API_KEY" });

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const currentReality: string = body?.current_reality || "";

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [seedRes, obsRes, insRes, expRes, weekRes] = await Promise.all([
      supabase.from("identity_seeds").select("weekly_focus, year_note, core_values, content").eq("user_id", user.id).maybeSingle(),
      supabase.from("observations").select("content, observation_type, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(60),
      supabase.from("insights").select("content, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
      supabase.from("experiments").select("hypothesis, status, success_looks_like, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(15),
      supabase.from("weekly_intentions").select("intention, category, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    ]);

    const existing = currentReality || seedRes.data?.weekly_focus || "";
    const yearNote = seedRes.data?.year_note || "";
    const coreValues = seedRes.data?.core_values || "";

    const obsBlock = (obsRes.data || []).map((o: any) => `- [${o.observation_type || "note"}] ${o.content}`).join("\n");
    const insBlock = (insRes.data || []).map((i: any) => `- ${i.content}`).join("\n");
    const expBlock = (expRes.data || []).map((e: any) => `- (${e.status}) ${e.hypothesis}`).join("\n");
    const weekBlock = (weekRes.data || []).map((w: any) => `- [${w.category || "focus"}] ${w.intention}`).join("\n");

    if (!obsBlock && !insBlock && !expBlock && !weekBlock) {
      return json({ current_reality: existing, unchanged: true });
    }

    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });

    const prompt = `You are updating Miles's "Current Reality" field in his identity system.
Preserve his voice exactly — direct, behavioral, grounded. No therapy-speak, no emojis, no AI fluff.
Keep the same shape/structure as the existing snapshot (short header line for the month, then tight bullets/lanes). Do NOT rewrite from scratch — carry forward what is still true, revise what has clearly shifted based on the recent signals, and add anything genuinely new.

Header line MUST reflect the current month: ${month}.
Return ONLY the new Current Reality text. No preamble, no markdown fences, no commentary.

=== EXISTING CURRENT REALITY ===
${existing || "(empty — write a first version)"}

=== YEAR DIRECTION ===
${yearNote}

=== CORE VALUES ===
${coreValues}

=== LAST 14 DAYS — WEEKLY INTENTIONS ===
${weekBlock || "(none)"}

=== LAST 14 DAYS — EXPERIMENTS ===
${expBlock || "(none)"}

=== LAST 14 DAYS — INSIGHTS ===
${insBlock || "(none)"}

=== LAST 14 DAYS — OBSERVATIONS ===
${obsBlock || "(none)"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You mirror the user's voice. You never add labels, emojis, or therapy-speak. Return plain text only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" });
      if (aiRes.status === 429) return json({ error: "Rate limited — try again in a moment" });
      return json({ error: "AI unavailable" });
    }

    const aiData = await aiRes.json();
    const next = aiData?.choices?.[0]?.message?.content?.trim() || "";
    if (!next) return json({ current_reality: existing, unchanged: true });

    return json({ current_reality: next });
  } catch (e: any) {
    console.error("refresh-current-reality error", e);
    return json({ error: e?.message || "unknown error" });
  }
});
