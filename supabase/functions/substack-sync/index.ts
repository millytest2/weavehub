// Feed sync — connect any Substack or RSS/Atom URL and pull recent posts.
// Actions: list | add | sync | remove
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (compatible; WeaveBot/1.0; +https://weavehub.lovable.app)";

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function attr(tagStr: string, name: string): string | null {
  const m = tagStr.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, "i"));
  return m ? m[1] : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeInputUrl(u: string): string {
  let url = u.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

function looksLikeFeed(text: string, contentType: string | null): boolean {
  if (contentType && /(xml|rss|atom)/i.test(contentType)) return true;
  const head = text.slice(0, 2000);
  return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || /<\?xml/i.test(head);
}

async function tryFetch(url: string): Promise<{ text: string; url: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    const ct = res.headers.get("content-type");
    if (looksLikeFeed(text, ct)) return { text, url: res.url || url };
    // HTML — try to discover an <link rel="alternate" type="application/rss+xml" href="...">
    const linkMatches = [...text.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)];
    for (const m of linkMatches) {
      const t = m[0];
      const type = attr(t, "type") || "";
      if (/rss|atom|xml/i.test(type)) {
        let href = attr(t, "href");
        if (!href) continue;
        if (href.startsWith("//")) href = "https:" + href;
        else if (href.startsWith("/")) {
          const u = new URL(res.url || url);
          href = `${u.origin}${href}`;
        } else if (!/^https?:/i.test(href)) {
          const u = new URL(res.url || url);
          href = `${u.origin}/${href.replace(/^\/+/, "")}`;
        }
        const discovered = await fetch(href, { headers: { "User-Agent": UA }, redirect: "follow" });
        if (discovered.ok) {
          const dtext = await discovered.text();
          if (looksLikeFeed(dtext, discovered.headers.get("content-type"))) return { text: dtext, url: discovered.url || href };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function discoverFeed(inputUrl: string): Promise<{ text: string; url: string }> {
  const base = normalizeInputUrl(inputUrl).replace(/\/(feed|rss|atom)(\.xml)?\/?$/i, "");
  const u = new URL(base);
  const hosts = new Set<string>([u.host]);
  if (!u.host.startsWith("www.")) hosts.add("www." + u.host);
  else hosts.add(u.host.replace(/^www\./, ""));

  const paths = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/rss/", "/index.xml", "/blog/rss.xml"];
  const candidates: string[] = [];
  // If they already passed a specific feed-looking URL, try it verbatim first
  if (/\.(xml)$|\/(feed|rss|atom)(\/)?$/i.test(inputUrl)) candidates.push(normalizeInputUrl(inputUrl));
  for (const h of hosts) {
    for (const p of paths) candidates.push(`${u.protocol}//${h}${p}`);
    candidates.push(`${u.protocol}//${h}`); // homepage for discovery
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const got = await tryFetch(c);
    if (got) return got;
  }
  throw new Error("No RSS/Atom feed found at that URL");
}

function parseFeed(xml: string): { channelTitle: string | null; items: any[] } {
  const isAtom = /<feed[\s>][^]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml) || /<feed[\s>]/i.test(xml.slice(0, 500));
  if (isAtom) {
    const channelTitle = tag(xml.split("<entry")[0], "title");
    const entryBlocks = xml.split(/<entry[\s>]/i).slice(1).map((b) => "<entry " + b.split("</entry>")[0] + "</entry>");
    const items = entryBlocks.slice(0, 25).map((e) => {
      const title = tag(e, "title");
      const id = tag(e, "id");
      const summary = tag(e, "summary") || tag(e, "content") || "";
      const updated = tag(e, "updated") || tag(e, "published");
      const authorBlock = e.match(/<author[\s>]([\s\S]*?)<\/author>/i)?.[1] || "";
      const author = tag(authorBlock, "name");
      // link: <link href="..." rel="alternate" /> or with text content
      const linkTag = e.match(/<link[^>]*rel=["']?alternate["']?[^>]*>/i)?.[0] || e.match(/<link[^>]*>/i)?.[0] || "";
      const link = linkTag ? attr(linkTag, "href") : null;
      return { title, guid: id || link, link, pub: updated, desc: summary, content: summary, author };
    });
    return { channelTitle, items };
  }
  // RSS
  const channelTitle = tag(xml.split("<item")[0], "title");
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1).map((b) => "<item " + b.split("</item>")[0] + "</item>");
  const items = itemBlocks.slice(0, 25).map((i) => ({
    title: tag(i, "title"),
    link: tag(i, "link"),
    guid: tag(i, "guid") || tag(i, "link"),
    pub: tag(i, "pubDate") || tag(i, "dc:date"),
    desc: tag(i, "description") || "",
    content: tag(i, "content:encoded") || tag(i, "description") || "",
    author: tag(i, "dc:creator") || tag(i, "author"),
  }));
  return { channelTitle, items };
}

async function fetchAndStore(supabase: any, userId: string, source: any) {
  const { text: xml, url: resolvedFeedUrl } = await discoverFeed(source.url);
  const { channelTitle, items } = parseFeed(xml);

  const rows: any[] = [];
  for (const it of items) {
    if (!it.link || !it.title || !it.guid) continue;
    rows.push({
      user_id: userId,
      source_id: source.id,
      guid: String(it.guid).slice(0, 500),
      title: stripHtml(it.title).slice(0, 300),
      author: it.author ? stripHtml(it.author).slice(0, 200) : (channelTitle ? stripHtml(channelTitle).slice(0, 200) : null),
      link: it.link,
      summary: stripHtml(it.desc).slice(0, 600),
      content: stripHtml(it.content).slice(0, 4000),
      published_at: it.pub ? new Date(it.pub).toISOString() : null,
    });
  }

  if (rows.length) {
    await supabase.from("substack_posts").upsert(rows, { onConflict: "source_id,guid", ignoreDuplicates: true });
  }

  await supabase.from("substack_sources").update({
    name: channelTitle ? stripHtml(channelTitle).slice(0, 200) : source.name,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    post_count: rows.length,
  }).eq("id", source.id);

  return { count: rows.length, name: channelTitle, feed_url: resolvedFeedUrl };
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
      const url = normalizeInputUrl(body.url || "");
      if (!url) throw new Error("URL required");
      // Verify a feed exists BEFORE inserting, so we don't create broken sources
      let discovered: { text: string; url: string };
      try {
        discovered = await discoverFeed(url);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "No feed found at that URL. Try the Substack homepage, e.g. sashachapin.substack.com" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { data: existing } = await supabase.from("substack_sources").select("*").eq("user_id", user.id).eq("url", url).maybeSingle();
      let source = existing;
      if (!source) {
        const { data: inserted, error } = await supabase.from("substack_sources").insert({ user_id: user.id, url, name: url.replace(/^https?:\/\//, "") }).select().single();
        if (error) throw error;
        source = inserted;
      }
      try {
        const { channelTitle, items } = parseFeed(discovered.text);
        const rows: any[] = [];
        for (const it of items) {
          if (!it.link || !it.title || !it.guid) continue;
          rows.push({
            user_id: user.id,
            source_id: source.id,
            guid: String(it.guid).slice(0, 500),
            title: stripHtml(it.title).slice(0, 300),
            author: it.author ? stripHtml(it.author).slice(0, 200) : (channelTitle ? stripHtml(channelTitle).slice(0, 200) : null),
            link: it.link,
            summary: stripHtml(it.desc).slice(0, 600),
            content: stripHtml(it.content).slice(0, 4000),
            published_at: it.pub ? new Date(it.pub).toISOString() : null,
          });
        }
        if (rows.length) {
          await supabase.from("substack_posts").upsert(rows, { onConflict: "source_id,guid", ignoreDuplicates: true });
        }
        await supabase.from("substack_sources").update({
          name: channelTitle ? stripHtml(channelTitle).slice(0, 200) : source.name,
          last_synced_at: new Date().toISOString(),
          last_error: null,
          post_count: rows.length,
        }).eq("id", source.id);
        return new Response(JSON.stringify({ ok: true, source, count: rows.length, name: channelTitle, feed_url: discovered.url }), { headers: { ...CORS, "Content-Type": "application/json" } });
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
