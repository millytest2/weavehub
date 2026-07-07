// Fresh resource picker — returns 1 recent (last ~month) high-signal read
// per dashboard item, WOVEN with the user's identity + recent captures so
// each pick actually connects to who they are and what they're working on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Pick = { title: string; author: string; url: string; why: string; type: string; published?: string };

async function firecrawlSearch(query: string, tbs = "qdr:m", limit = 5): Promise<any[]> {
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
    const web = data?.data?.web || data?.data || data?.web || [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.error("firecrawl err", e);
    return [];
  }
}

function keywordsFrom(text: string): string {
  return (text || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 10)
    .join(" ");
}

function buildQueries(text: string, pillar: string | undefined, identityFocus: string): { q: string; kind: string }[] {
  const base = keywordsFrom(text);
  const p = (pillar || "").toLowerCase();
  const focus =
    p === "health" || p === "body" ? "training recovery sleep"
    : p === "stability" ? "focus career deep work"
    : p === "content" ? "writing audience creators"
    : p === "skill" || p === "learning" ? "learning craft mastery"
    : p === "presence" ? "solitude reflection play hobby"
    : p === "connection" || p === "friendship" ? "friendship community"
    : p === "money" ? "sales revenue business"
    : p === "charisma" ? "presence speaking social"
    : p === "mind" ? "focus attention thinking"
    : "";
  const identityBits = keywordsFrom(identityFocus).split(" ").slice(0, 4).join(" ");
  return [
    { q: `${base} ${focus} ${identityBits} essay 2025`, kind: "essay" },
    { q: `${base} ${focus} substack 2025 site:substack.com`, kind: "substack" },
    { q: `${base} ${focus} podcast episode 2025`, kind: "podcast" },
    { q: `${base} ${focus} 2025 site:youtube.com`, kind: "video" },
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

    // Pull lightweight user context so picks weave with identity + recent captures
    let identityFocus = "";
    let identityYear = "";
    let recentCaptures = "";
    try {
      const authHeader = req.headers.get("Authorization") || "";
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [idRes, obsRes] = await Promise.all([
          supabase.from("identity_seeds").select("year_note, weekly_focus, core_values").eq("user_id", user.id).maybeSingle(),
          supabase.from("observations").select("content, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
        ]);
        identityFocus = idRes.data?.weekly_focus || "";
        identityYear = idRes.data?.year_note || "";
        recentCaptures = (obsRes.data || [])
          .map((o: any) => (o.content || "").split("\n")[0].slice(0, 140))
          .filter(Boolean)
          .slice(0, 8)
          .join(" | ");
      }
    } catch (e) {
      console.error("context fetch", e);
    }

    // Fan out Firecrawl searches in parallel for recency
    const queries = buildQueries(text, pillar, identityFocus);
    const [essay, sub, pod, vid] = await Promise.all([
      firecrawlSearch(queries[0].q, "qdr:m", 5),
      firecrawlSearch(queries[1].q, "qdr:m", 4),
      firecrawlSearch(queries[2].q, "qdr:m", 4),
      firecrawlSearch(queries[3].q, "qdr:m", 4),
    ]);

    const candidates = [
      ...essay.map((x: any) => ({ ...x, _type: "essay" })),
      ...sub.map((x: any) => ({ ...x, _type: "substack" })),
      ...pod.map((x: any) => ({ ...x, _type: "podcast" })),
      ...vid.map((x: any) => ({ ...x, _type: "video" })),
    ]
      .filter((x) => x?.url && x?.title)
      .slice(0, 20);

    const system = `You pick ONE fresh, high-signal read/watch/listen for a specific person's SPECIFIC current item.
Non-negotiables:
- The pick must directly connect to THIS item (not just the pillar). If nothing fits tightly, prefer a real 2024-2025 alternative you know exists over a loose match.
- Prefer 2025 material; NEVER older than 2023.
- Named creators only (no listicles, SEO farms, aggregators, Medium clones).
- Substack, YouTube, personal blogs, real podcast episodes, arXiv papers are all fine.
- The "why" is ONE crisp sentence tying the pick to BOTH the specific item AND something from their identity/recent captures. No fluff. No therapy-speak. No emojis.
Return STRICT JSON only: {"title","author","url","why","type","published"} where type is one of essay|substack|podcast|video|paper.`;

    const candidateBlock = candidates.length
      ? candidates
          .map((c: any, i: number) => `${i + 1}. [${c._type}] ${c.title} — ${c.url}\n   ${(c.description || c.snippet || "").slice(0, 200)}`)
          .join("\n")
      : "(no fresh search results — recommend a real, still-live 2024-2025 URL from your knowledge)";

    const userMsg = `THIS PERSON'S SPECIFIC ITEM RIGHT NOW:
${text}
Pillar: ${pillar || "general"}

WHO THEY ARE (weave this in):
Year: ${identityYear || "(none)"}
Current focus: ${identityFocus || "(none)"}
Recent captures: ${recentCaptures || "(none)"}

FRESH CANDIDATES FROM WEB SEARCH (last month):
${candidateBlock}

Pick the ONE best match that ties the item to who they are. If none fit tightly, return a real 2024-2025 alternative you know exists — never fabricate URLs.`;

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
