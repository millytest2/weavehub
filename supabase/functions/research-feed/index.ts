// Research Feed — generates identity-grounded reading recommendations
// across the user's active goals/pillars. Returns article/essay/book suggestions
// with search URLs so Miles can jump straight to reading.

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

    const { focus } = await req.json().catch(() => ({ focus: null }));

    // Pull identity + skill stack for grounding
    const [identityRes, skillRes] = await Promise.all([
      supabase.from("identity_seeds").select("year_note, weekly_focus, core_values").eq("user_id", user.id).maybeSingle(),
      supabase.from("skill_stack").select("archetype, description").eq("user_id", user.id),
    ]);

    const identity = identityRes.data;
    const skills = (skillRes.data || []).map((s: any) => `${s.archetype}: ${s.description || ""}`).join("\n");

    const system = `You are a research librarian for a specific person. Recommend 6 high-signal readings (essays, articles, book chapters, papers, talks) that directly help them move on their CURRENT goals. Not generic self-help. Bias toward: durable essays (Paul Graham, Naval, David Perell, Julian Shapiro, Koe, Nat Eliason, Andrew Huberman research, HBR, Farnam Street, Substack originals), specific research papers when relevant, and canonical books. Return STRICT JSON only.

Schema:
{
  "readings": [
    {
      "title": "string",
      "author": "string",
      "type": "essay|article|paper|book|talk|podcast",
      "pillar": "one of the user's pillars (e.g. Money, Body, Charisma, UPath, Content, Sales, Relationship, Mind)",
      "why": "one sentence — why THIS person needs it right now (reference their actual goal)",
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

${focus ? `SPECIFIC FOCUS FOR THIS BATCH: ${focus}` : "Cover a mix of pillars — at least one for money/sales, one for body/discipline, one for relationships/charisma, one for mind/critical thinking."}

Return 6 readings. Real, findable pieces. No fabricated titles.`;

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
      return new Response(JSON.stringify({ error: "AI temporarily unavailable", status: resp.status }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { readings: [] }; }

    // Ensure search_url exists for every reading
    const readings = (parsed.readings || []).map((r: any) => ({
      ...r,
      search_url: r.search_url || `https://www.google.com/search?q=${encodeURIComponent(`${r.title || ""} ${r.author || ""}`)}`,
    }));

    return new Response(JSON.stringify({ readings }), {
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
