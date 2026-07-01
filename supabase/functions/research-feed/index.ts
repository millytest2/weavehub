// Research Feed — generates identity-grounded reading recommendations
// PLUS surfaces relevant existing insights/documents/observations from user's own library
// so the user re-encounters their own captured wisdom alongside new external sources.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

    const { focus, topic } = await req.json().catch(() => ({ focus: null, topic: null }));

    // Pull identity + skill stack + user's own observations (library)
    const [identityRes, skillRes, obsRes] = await Promise.all([
      supabase.from("identity_seeds").select("year_note, weekly_focus, core_values").eq("user_id", user.id).maybeSingle(),
      supabase.from("skill_stack").select("archetype, description").eq("user_id", user.id),
      supabase.from("observations").select("id, content, observation_type, source, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
    ]);

    const identity = identityRes.data;
    const skills = (skillRes.data || []).map((s: any) => `${s.archetype}: ${s.description || ""}`).join("\n");

    // Simple keyword match against user's library
    const matchTerms: string[] = [];
    if (topic) matchTerms.push(topic.toLowerCase());
    if (focus && focus !== "All") matchTerms.push(focus.toLowerCase());
    // pillar synonyms
    const synMap: Record<string, string[]> = {
      money: ["money","income","sales","deal","revenue","business","upath"],
      body: ["body","gym","workout","lift","training","sleep","food"],
      charisma: ["charisma","social","speaking","presence","confidence","women","date"],
      mind: ["mind","focus","reading","learning","think","attention"],
      upath: ["upath","career","clarity","overthink"],
      relationship: ["relationship","arley","partner","love","attachment"],
      friendship: ["friend","friendship","community"],
      content: ["content","write","post","tweet","video"],
    };
    const focusKey = (focus || "").toLowerCase();
    const expanded = new Set<string>(matchTerms);
    if (synMap[focusKey]) synMap[focusKey].forEach((t) => expanded.add(t));
    const terms = [...expanded].filter(Boolean);

    const scoreItem = (text: string) => {
      if (!terms.length) return 1;
      const lower = text.toLowerCase();
      return terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    };

    const fromLibrary: any[] = [];
    (obsRes.data || []).forEach((o: any) => {
      const s = scoreItem(o.content || "");
      if (s > 0) fromLibrary.push({ kind: "observation", id: o.id, title: (o.content || "").split("\n")[0].slice(0, 80), snippet: (o.content || "").slice(0, 220), source: o.source, created_at: o.created_at, score: s });
    });
    fromLibrary.sort((a, b) => b.score - a.score || (b.created_at > a.created_at ? 1 : -1));
    const yourLibrary = fromLibrary.slice(0, 6);

    const librarySummary = yourLibrary.length
      ? yourLibrary.map((x, i) => `${i + 1}. [${x.kind}] ${x.title} — ${x.snippet}`).join("\n")
      : "(no matching items in library yet)";

    const system = `You are a research librarian for a specific person. Recommend 6 high-signal external readings (essays, articles, Substack posts, book chapters, papers, YouTube talks, podcast episodes, newsletters) that directly help them move on their CURRENT goals${topic ? ` and the specific topic: "${topic}"` : ""}. Not generic self-help. Bias toward: durable essays (Paul Graham, Naval, David Perell, Julian Shapiro, Dan Koe, Nat Eliason, Sasha Chapin, Ava Huang, Visakan Veerasamy), Substack originals (Every, Not Boring, The Generalist, Lenny's, Ali Abdaal, Tim Ferriss), specific research papers, Huberman Lab episodes, canonical books. For Substack items set type to \"substack\" and put the direct substack.com URL in search_url when known. Consider what they've already captured (below) — don't recommend things they already know; go one layer deeper or adjacent. Return STRICT JSON only.

Schema:
{
  "readings": [
    {
      "title": "string",
      "author": "string",
      "type": "essay|article|paper|book|talk|podcast",
      "pillar": "one of the user's pillars",
      "why": "one sentence — why THIS person needs it right now (reference their actual goal or a captured note if relevant)",
      "takeaway": "one sentence — the core idea",
      "search_url": "https://www.google.com/search?q=<url-encoded title + author>"
    }
  ]
}`;

    const userMsg = `IDENTITY:
Year: ${identity?.year_note || "(none)"}

Current focus / July dream:
${identity?.weekly_focus || "(none)"}

Values: ${identity?.core_values || "(none)"}

Skill stack:
${skills || "(none)"}

${topic ? `SPECIFIC TOPIC REQUEST: ${topic}\n` : ""}${focus && focus !== "All" ? `PILLAR FOCUS: ${focus}\n` : "Cover a mix of pillars.\n"}
WHAT THEY'VE ALREADY CAPTURED (most relevant from their library):
${librarySummary}

Return 6 real, findable readings. No fabricated titles.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gateway error:", resp.status, errText);
      return new Response(JSON.stringify({ error: "AI temporarily unavailable", status: resp.status, from_library: yourLibrary, readings: [] }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { readings: [] }; }

    const readings = (parsed.readings || []).map((r: any) => ({
      ...r,
      search_url: r.search_url || `https://www.google.com/search?q=${encodeURIComponent(`${r.title || ""} ${r.author || ""}`)}`,
    }));

    return new Response(JSON.stringify({ readings, from_library: yourLibrary }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("research-feed error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to load research" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
