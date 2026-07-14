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
    const { text, pillar, exclude } = await req.json();
    const excludeList: string[] = Array.isArray(exclude) ? exclude.filter((u) => typeof u === "string") : [];
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

    const BLOCKLIST = [
      "medium.com", "linkedin.com/pulse", "quora.com", "reddit.com",
      "pinterest.", "wikihow.com", "geeksforgeeks", "indeed.com",
      "hubspot.com/blog", "forbes.com/sites/", "entrepreneur.com",
      "businessinsider.com", "inc.com", "fastcompany.com/9",
    ];

    const seen = new Set<string>();
    const candidates = [
      ...essay.map((x: any) => ({ ...x, _type: "essay" })),
      ...sub.map((x: any) => ({ ...x, _type: "substack" })),
      ...pod.map((x: any) => ({ ...x, _type: "podcast" })),
      ...vid.map((x: any) => ({ ...x, _type: "video" })),
    ]
      .filter((x) => x?.url && x?.title)
      .filter((x) => !excludeList.some((u) => x.url === u || x.url?.includes(u)))
      .filter((x) => !BLOCKLIST.some((b) => x.url.toLowerCase().includes(b)))
      .filter((x) => {
        try {
          const host = new URL(x.url).hostname.replace(/^www\./, "");
          if (seen.has(host + (x.title || "").slice(0, 40))) return false;
          seen.add(host + (x.title || "").slice(0, 40));
          return true;
        } catch { return false; }
      })
      .slice(0, 15);

    // If no fresh web candidates survived filtering, bail cleanly rather than
    // ask the model to invent a URL (it will, and it will be wrong).
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "no fresh candidates" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const system = `You pick the best-fit resource for a SPECIFIC person's SPECIFIC item, from a numbered list of REAL web results.
HARD RULES:
- You MUST return the index of one of the numbered candidates. Do NOT invent URLs. Do NOT reference anything outside the list.
- Prefer named authors, essays, personal blogs, real Substack posts, real podcast episodes, real videos.
- Reject listicles, SEO farms, and generic "top 10" pages by picking a different index instead.
- The "why" is ONE crisp sentence tying the pick to BOTH the specific item AND something from their identity/recent captures. No fluff. No therapy-speak. No emojis.
Return STRICT JSON only: {"index": number, "why": string}`;

    const candidateBlock = candidates
      .map((c: any, i: number) => `${i + 1}. [${c._type}] ${c.title} — ${c.url}\n   ${(c.description || c.snippet || "").slice(0, 220)}`)
      .join("\n");

    const userMsg = `THIS PERSON'S SPECIFIC ITEM RIGHT NOW:
${text}
Pillar: ${pillar || "general"}

WHO THEY ARE (weave this in):
Year: ${identityYear || "(none)"}
Current focus: ${identityFocus || "(none)"}
Recent captures: ${recentCaptures || "(none)"}

CANDIDATES (pick ONE index):
${candidateBlock}`;

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

    const pickFrom = (c: any, why: string): Pick => {
      let author = c.author || "";
      try { author = author || new URL(c.url).hostname.replace(/^www\./, ""); } catch {}
      return {
        title: c.title, author, url: c.url, why, type: c._type,
        published: c.published_date || c.date || undefined,
      };
    };

    if (!resp.ok) {
      console.error("gateway", resp.status, await resp.text());
      return new Response(JSON.stringify(pickFrom(candidates[0], "Fresh from this week's web.")), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}

    const idx = Number(parsed.index) - 1;
    const chosen = candidates[idx] || candidates[0];
    const why = (typeof parsed.why === "string" && parsed.why.trim())
      ? parsed.why.trim().slice(0, 240)
      : "Recent, matches your focus.";

    return new Response(JSON.stringify(pickFrom(chosen, why)), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("resource-pick", err);
    return new Response(JSON.stringify({ error: err.message || "failed" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
