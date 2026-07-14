// Reflection Mirror — a RAG-style mirror that refuses to generate answers.
// Three modes:
//   silence:    return the user's own past captures that already touch the question
//   disagree:   return captures that contradict or complicate the stated direction
//   provenance: for a given claim, show which captures back it and which don't
//
// The AI is used ONLY to select and briefly frame — never to invent new "insight."
// Goal: force critical thinking. Protect against AI cognitive offloading.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Mode = "silence" | "disagree" | "provenance";

type Capture = {
  id: string;
  content: string;
  created_at: string;
  source: "observation" | "insight" | "identity" | "document";
};

function keywords(text: string): string[] {
  const stop = new Set(["the","and","for","that","with","this","you","are","was","have","from","but","not","will","would","could","should","about","what","when","where","which","your","really","just","like","them","they","been","into","also","then","than","some","more","most","much","only","over","because","being","does","doing","done"]);
  return Array.from(new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
  )).slice(0, 12);
}

async function loadCaptures(supabase: any, userId: string, terms: string[]): Promise<Capture[]> {
  const orFilter = terms.length
    ? terms.map((t) => `content.ilike.%${t.replace(/[%,]/g, "")}%`).join(",")
    : null;

  const [obsRes, insRes, docsRes, idRes] = await Promise.all([
    (orFilter
      ? supabase.from("observations").select("id, content, created_at").eq("user_id", userId).or(orFilter).order("created_at", { ascending: false }).limit(30)
      : supabase.from("observations").select("id, content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)),
    (orFilter
      ? supabase.from("insights").select("id, content, created_at").eq("user_id", userId).or(orFilter).order("created_at", { ascending: false }).limit(20)
      : supabase.from("insights").select("id, content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20)),
    supabase.from("documents").select("id, title, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("identity_seeds").select("year_note, weekly_focus, core_values, current_reality, through_line, content").eq("user_id", userId).maybeSingle(),
  ]);

  const out: Capture[] = [];
  for (const o of obsRes.data || []) out.push({ id: o.id, content: (o.content || "").slice(0, 400), created_at: o.created_at, source: "observation" });
  for (const i of insRes.data || []) out.push({ id: i.id, content: (i.content || "").slice(0, 400), created_at: i.created_at, source: "insight" });
  for (const d of docsRes.data || []) out.push({ id: d.id, content: `${d.title || "Document"} — ${(d.summary || "").slice(0, 300)}`, created_at: d.created_at, source: "document" });
  if (idRes.data) {
    const seed = idRes.data;
    const bits = [
      seed.current_reality && `Current reality: ${seed.current_reality}`,
      seed.through_line && `Through-line: ${seed.through_line}`,
      seed.weekly_focus && `Weekly focus: ${seed.weekly_focus}`,
      seed.year_note && `Year note: ${seed.year_note}`,
      seed.core_values && `Values: ${seed.core_values}`,
      seed.content && `Identity: ${seed.content}`,
    ].filter(Boolean).slice(0, 6);
    bits.forEach((b, i) => out.push({ id: `identity-${i}`, content: b as string, created_at: new Date().toISOString(), source: "identity" }));
  }
  return out.slice(0, 60);
}

function fallback(mode: Mode, captures: Capture[]) {
  if (!captures.length) {
    return { mode, echoes: [], frame: "You haven't captured enough yet for the mirror to reflect. Write more, then come back." };
  }
  const echoes = captures.slice(0, 5).map((c) => ({
    id: c.id, source: c.source, content: c.content, created_at: c.created_at, note: "",
  }));
  const frame =
    mode === "silence" ? "Your own past words. Sit with them before you write anything new."
    : mode === "disagree" ? "Places where your captures push back on your current direction."
    : "Your captures — some back the claim, some don't. You decide.";
  return { mode, echoes, frame };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");
    const { mode, input } = await req.json() as { mode: Mode; input: string };
    if (!mode || !input || typeof input !== "string" || input.length > 2000) {
      return new Response(JSON.stringify({ error: "mode and input (<=2000 chars) required" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!["silence", "disagree", "provenance"].includes(mode)) {
      return new Response(JSON.stringify({ error: "invalid mode" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

    const terms = keywords(input);
    const captures = await loadCaptures(supabase, user.id, terms);

    if (captures.length < 2) {
      return new Response(JSON.stringify(fallback(mode, captures)), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const numbered = captures.map((c, i) =>
      `${i + 1}. [${c.source}] (${c.created_at.slice(0,10)}) ${c.content.replace(/\s+/g, " ")}`
    ).join("\n");

    const system =
      mode === "silence"
        ? `You are a Silence Mirror. RULES:
- You do NOT answer the user's question.
- You do NOT generate new insight, advice, or synthesis.
- You SELECT 3-5 of the user's own past captures that already touch this question.
- For each selection, add a ONE-line "why this echoes" — pointing at THEIR words, not adding new ones.
- The frame is one sentence telling them to sit with their own material before writing anything new.
Return STRICT JSON: {"frame": string, "picks": [{"index": number, "note": string}]}`
        : mode === "disagree"
        ? `You are a Disagree Mirror. RULES:
- You do NOT agree or affirm. You do NOT propose a new direction.
- You SELECT 3-5 captures that CONTRADICT, COMPLICATE, or ADD FRICTION to the user's stated direction.
- For each, add a ONE-line "how it pushes back" — quoting or paraphrasing THEIR words.
- If nothing genuinely contradicts, say so honestly and pick the closest tensions.
- Frame: one sentence naming the productive tension. No advice.
Return STRICT JSON: {"frame": string, "picks": [{"index": number, "note": string}]}`
        : `You are a Provenance Mirror. The user pastes a claim, plan, or AI suggestion.
RULES:
- You do NOT evaluate the claim. You do NOT add outside knowledge.
- You SELECT 3-6 captures and label each: "backs" (their captures support it), "against" (their captures contradict it), or "missing" (their captures don't speak to this — flag the gap).
- Add a ONE-line note per pick tying it to a specific part of the claim.
- Frame: one sentence naming what THEIR corpus actually supports vs where they're relying on external voice.
Return STRICT JSON: {"frame": string, "picks": [{"index": number, "stance": "backs"|"against"|"missing", "note": string}]}`;

    const userMsg = `USER INPUT:
${input}

USER'S CAPTURES (numbered — you may only reference these by index):
${numbered}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      console.error("gateway", resp.status, await resp.text());
      return new Response(JSON.stringify(fallback(mode, captures)), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return new Response(JSON.stringify(fallback(mode, captures)), { headers: { ...CORS, "Content-Type": "application/json" } }); }

    const picks = Array.isArray(parsed.picks) ? parsed.picks : [];
    const echoes = picks
      .map((p: any) => {
        const idx = Number(p.index) - 1;
        const cap = captures[idx];
        if (!cap) return null;
        return {
          id: cap.id,
          source: cap.source,
          content: cap.content,
          created_at: cap.created_at,
          note: String(p.note || "").slice(0, 200),
          stance: p.stance || null,
        };
      })
      .filter(Boolean)
      .slice(0, 6);

    if (!echoes.length) {
      return new Response(JSON.stringify(fallback(mode, captures)), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      mode,
      frame: String(parsed.frame || "").slice(0, 240) || fallback(mode, captures).frame,
      echoes,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("reflection-mirror", err);
    return new Response(JSON.stringify({ error: err.message || "failed" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
