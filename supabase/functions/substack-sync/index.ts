// Substack sync — connect a Substack URL and pull recent posts via its RSS feed.
// Actions: list | add | sync | remove
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUrl(u: string): string {
  let url = u.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "").replace(/\/feed$/, "");
}

async function fetchAndStore(supabase: any, userId: string, source: any) {
  const feedUrl = source.url + "/feed";
  const res = await fetch(feedUrl, { headers: { "User-Agent": "WeaveBot/1.0" } });
  if (!res.ok) throw new Error(`Feed fetch failed (${res.status})`);
  const xml = await res.text();

  const channelName = tag(xml.split("<item")[0], "title") || source.name;
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1).map((b) => "<item " + b.split("</item>")[0] + "</item>");

  const rows: any[] = [];
  for (const item of itemBlocks.slice(0, 20)) {
    const link = tag(item, "link");
    const title = tag(item, "title");
    const guid = tag(item, "guid") || link;
    if (!link || !title || !guid) continue;
    const pub = tag(item, "pubDate");
    const desc = tag(item, "description") || "";
    const content = tag(item, "content:encoded") || desc;
    const author = tag(item, "dc:creator") || tag(item, "author") || channelName;
    rows.push({
      user_id: userId,
      source_id: source.id,
      guid,
      title: stripHtml(title).slice(0, 300),
      author: author ? stripHtml(author).slice(0, 200) : null,
      link,
      summary: stripHtml(desc).slice(0, 600),
      content: stripHtml(content).slice(0, 4000),
      published_at: pub ? new Date(pub).toISOString() : null,
    });
  }

  if (rows.length) {
    await supabase.from("substack_posts").upsert(rows, { onConflict: "source_id,guid", ignoreDuplicates: true });
  }

  await supabase.from("substack_sources").update({
    name: channelName,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    post_count: rows.length,
  }).eq("id", source.id);

  return { count: rows.length, name: channelName };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
      const { data } = await supabase.from("substack_sources").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      return new Response(JSON.stringify({ sources: data || [] }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (action === "add") {
      const url = normalizeUrl(body.url || "");
      if (!url) throw new Error("URL required");
      const { data: existing } = await supabase.from("substack_sources").select("*").eq("user_id", user.id).eq("url", url).maybeSingle();
      let source = existing;
      if (!source) {
        const { data: inserted, error } = await supabase.from("substack_sources").insert({ user_id: user.id, url, name: url.replace(/^https?:\/\//, "") }).select().single();
        if (error) throw error;
        source = inserted;
      }
      try {
        const result = await fetchAndStore(supabase, user.id, source);
        return new Response(JSON.stringify({ ok: true, source, ...result }), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch (e: any) {
        await supabase.from("substack_sources").update({ last_error: e.message }).eq("id", source.id);
        throw e;
      }
    }

    if (action === "sync") {
      const { data: sources } = await supabase.from("substack_sources").select("*").eq("user_id", user.id);
      const results: any[] = [];
      for (const s of sources || []) {
        try { results.push({ url: s.url, ...(await fetchAndStore(supabase, user.id, s)) }); }
        catch (e: any) {
          await supabase.from("substack_sources").update({ last_error: e.message }).eq("id", s.id);
          results.push({ url: s.url, error: e.message });
        }
      }
      return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (action === "remove") {
      await supabase.from("substack_sources").delete().eq("id", body.id).eq("user_id", user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    throw new Error("Unknown action");
  } catch (err: any) {
    console.error("substack-sync error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
