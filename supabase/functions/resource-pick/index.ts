// Fresh resource picker — returns 1 recent (last ~month) high-signal read
// per dashboard item. Uses Firecrawl search for recency, then Lovable AI
// to pick + explain the best match. Falls back to AI-only if Firecrawl fails.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Pick = { title: string; author: string; url: string; why: string; type: string; published?: string };

async function firecrawlSearch(query: string, tbs = "qdr:m", limit = 6): Promise<any[]> {
  if (!FIRECRAWL_KEY) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, tbs }),
    });
    if (!res.ok) {
      console.error("firecrawl", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    // v2 returns { data: { web: [...] } } typically, or { data: [...] }
    const web = data?.data?.web || data?.data || data?.web || [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.error("firecrawl err", e);
    return [];
  }
}

function buildQuery(text: string, pillar?: string): { q: string; kind: string }[] {
  const base = text.slice(0, 180);
  const p = (pillar || "").toLowerCase();
  const focus =
    p === "health" ? "sleep training recovery"
    : p === "stability" ? "focus career deep work"
    : p === "content" ? "writing audience creators"
    : p === "skill" ? "learning AI craft"
    : p === "presence" ? "solitude reflection play"
    : p === "connection" ? "friendship relationships"
    : "";
  const cleaned = base.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).slice(0, 12).join(" ");
  return [
    { q: `${cleaned} ${focus} essay 2025`, kind: "essay" },
    { q: `${cleaned} ${focus} substack`, kind: "substack" },
    { q: `${cleaned} ${focus} podcast episode 2025`, kind: "podcast" },
    { q: `${cleaned} ${focus} youtube`, kind: "video" },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");
    const { text, pillar } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 1. Fan out 2 quick Firecrawl searches in parallel for recency
    const queries = buildQuery(text, pillar);
    const [essay, sub, pod, vid] = await Promise.all([
      firecrawlSearch(queries[0].q, "qdr:m", 5),
      firecrawlSearch(`${queries[1].q} site:substack.com`, "qdr:m", 4),
      firecrawlSearch(queries[2].q, "qdr:m", 4),
      firecrawlSearch(`${queries[3].q} site:youtube.com`, "qdr:m", 4),
    ]);

    const candidates = [
      ...essay.map((x: any) => ({ ...x, _type: "essay" })),
      ...sub.map((x: any) => ({ ...x, _type: "substack" })),
      ...pod.map((x: any) => ({ ...x, _type: "podcast" })),
      ...vid.map((x: any) => ({ ...x, _type: "video" })),
    ]
      .filter((x) => x?.url && x?.title)
      .slice(0, 20);

    // 2. If we got candidates, ask AI to pick the best one; otherwise ask AI for a recent recommendation cold.
    const system = `You pick ONE fresh, high-signal read/watch/listen for a specific person's current focus.
Rules:
- Prefer 2025 material; NEVER pick anything older than 2023.
- Prefer named creators over aggregators (no listicles, no Medium clones, no low-signal SEO farms).
- Substack, YouTube, personal blogs, Podcast episodes are all fine.
- The "why" must be one crisp sentence, direct, no fluff, tied to what this person is doing right now.
Return STRICT JSON only: {"title","author","url","why","type","published"} where type is one of essay|substack|podcast|video|paper.`;

    const candidateBlock = candidates.length
      ? candidates
          .map((c: any, i: number) => `${i + 1}. [${c._type}] ${c.title} — ${c.url}\n   ${(c.description || c.snippet || "").slice(0, 200)}`)
          .join("\n")
      : "(no fresh search results — recommend from your knowledge but only real, still-live URLs from 2024-2025)";

    const userMsg = `THIS PERSON'S CURRENT ITEM:
${text}
Pillar: ${pillar || "general"}

FRESH CANDIDATES FROM WEB SEARCH (last month):
${candidateBlock}

Pick the ONE best match. If none of the candidates truly fit, return a real, recent (2024-2025) alternative you know exists — never fabricate URLs.`;

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
      const errText = await resp.text();
      console.error("gateway", resp.status, errText);
      // Fallback: return top candidate raw
      const top = candidates[0];
      if (top) {
        return new Response(JSON.stringify({
          title: top.title, author: top.author || new URL(top.url).hostname.replace("www.", ""),
          url: top.url, why: "Fresh from this week's web.", type: top._type, published: top.published_date || null,
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "ai unavailable" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let pick: Pick;
    try { pick = JSON.parse(raw); } catch {
      const top = candidates[0];
      pick = top
        ? { title: top.title, author: top.author || new URL(top.url).hostname.replace("www.", ""), url: top.url, why: "Recent, matches your focus.", type: top._type }
        : { title: "", author: "", url: "", why: "", type: "essay" };
    }

    return new Response(JSON.stringify(pick), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("resource-pick", err);
    return new Response(JSON.stringify({ error: err.message || "failed" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
