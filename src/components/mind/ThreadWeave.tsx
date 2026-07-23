import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Loader2, ListTodo, Sparkles, MessageSquare, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MindSynthesis } from "@/components/explore/MindSynthesis";
import { getWeek, getYear, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

interface Reading {
  title: string;
  author: string;
  type: string;
  pillar: string;
  why: string;
  search_url: string;
}

interface Strand {
  kind: "capture" | "journal" | "action" | "read" | "intention";
  label: string;
  body: string;
  when?: string;
  pillar?: string;
  href?: string;
}

interface ThreadWeaveProps {
  insightCount: number;
}

// Module cache
let cachedReads: Reading[] | null = null;
let cachedRhythm: { pillar: string; count: number; done: number }[] | null = null;
let cachedStrands: Strand[] | null = null;
let cachedThroughLine: string | null = null;

const kindColor: Record<Strand["kind"], string> = {
  capture: "bg-blue-500/60",
  journal: "bg-amber-500/60",
  action: "bg-emerald-500/60",
  read: "bg-violet-500/60",
  intention: "bg-rose-500/60",
};

const kindLabel: Record<Strand["kind"], string> = {
  capture: "capture",
  journal: "journal",
  action: "action",
  read: "read",
  intention: "intention",
};

export const ThreadWeave = ({ insightCount }: ThreadWeaveProps) => {
  const { user } = useAuth();
  const [reads, setReads] = useState<Reading[]>(cachedReads || []);
  const [readsLoading, setReadsLoading] = useState(!cachedReads);
  const [rhythm, setRhythm] = useState(cachedRhythm || []);
  const [strands, setStrands] = useState<Strand[]>(cachedStrands || []);
  const [throughLine, setThroughLine] = useState<string | null>(cachedThroughLine);

  useEffect(() => {
    if (!user) return;

    // Reads
    if (!cachedReads) {
      supabase.functions
        .invoke("research-feed", { body: { focus: null, topic: null } })
        .then(({ data }) => {
          const next: Reading[] = (data?.readings || []).slice(0, 3);
          cachedReads = next;
          setReads(next);
        })
        .finally(() => setReadsLoading(false));
    }

    // Weekly rhythm
    if (!cachedRhythm) {
      const wk = getWeek(new Date(), { weekStartsOn: 1 });
      const yr = getYear(new Date());
      supabase
        .from("weekly_intentions")
        .select("pillar, completed")
        .eq("user_id", user.id)
        .eq("week_number", wk)
        .eq("year", yr)
        .then(({ data }) => {
          const map = new Map<string, { count: number; done: number }>();
          (data || []).forEach((r: any) => {
            const p = r.pillar || "Other";
            const cur = map.get(p) || { count: 0, done: 0 };
            cur.count += 1;
            if (r.completed) cur.done += 1;
            map.set(p, cur);
          });
          const arr = Array.from(map.entries())
            .map(([pillar, v]) => ({ pillar, ...v }))
            .sort((a, b) => b.count - a.count);
          cachedRhythm = arr;
          setRhythm(arr);
        });
    }

    // Weave: pull latest strand from each source type so we can visually stitch them.
    if (!cachedStrands) {
      (async () => {
        const [idRes, obsRes, insRes, closesRes, actionsRes, wkRes] = await Promise.all([
          supabase.from("identity_seeds").select("through_line, weekly_focus").eq("user_id", user.id).maybeSingle(),
          supabase.from("observations").select("content, created_at, source, observation_type")
            .eq("user_id", user.id).order("created_at", { ascending: false }).limit(4),
          supabase.from("insights").select("title, content, created_at")
            .eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
          supabase.from("daily_closes").select("journal_entry, patterns_noticed, close_date")
            .eq("user_id", user.id).order("close_date", { ascending: false }).limit(2),
          supabase.from("action_history").select("action_text, pillar, action_date")
            .eq("user_id", user.id).order("action_date", { ascending: false }).limit(3),
          supabase.from("weekly_intentions").select("text, pillar, completed, updated_at")
            .eq("user_id", user.id).eq("completed", false).order("updated_at", { ascending: false }).limit(3),
        ]);

        const tl = idRes.data?.through_line || idRes.data?.weekly_focus || null;
        cachedThroughLine = tl;
        setThroughLine(tl);

        const s: Strand[] = [];

        (obsRes.data || []).slice(0, 2).forEach((o: any) => {
          const body = (o.content || "").split("\n")[0].slice(0, 140);
          if (body) s.push({ kind: "capture", label: o.source || o.observation_type || "capture", body, when: o.created_at });
        });
        (insRes.data || []).slice(0, 1).forEach((i: any) => {
          s.push({ kind: "capture", label: "insight", body: (i.title || i.content || "").slice(0, 140), when: i.created_at });
        });
        (closesRes.data || []).slice(0, 1).forEach((c: any) => {
          const body = ((c.patterns_noticed || c.journal_entry) || "").slice(0, 140);
          if (body) s.push({ kind: "journal", label: "evening close", body, when: c.close_date });
        });
        (actionsRes.data || []).slice(0, 2).forEach((a: any) => {
          s.push({ kind: "action", label: a.pillar || "action", body: a.action_text, when: a.action_date });
        });
        (wkRes.data || []).slice(0, 2).forEach((w: any) => {
          s.push({ kind: "intention", label: w.pillar || "this week", body: w.text, when: w.updated_at });
        });

        cachedStrands = s;
        setStrands(s);
      })();
    }
  }, [user]);

  // Interleave reads into the weave so all 5 strand types show together.
  const woven: Strand[] = (() => {
    const combined = [...strands];
    (reads || []).slice(0, 2).forEach((r) => {
      combined.push({
        kind: "read",
        label: `${r.pillar} · ${r.type}`,
        body: r.title,
        href: r.search_url,
      });
    });
    // Alternate kinds so the tapestry doesn't stack the same color.
    const buckets: Record<string, Strand[]> = {};
    combined.forEach((c) => { (buckets[c.kind] = buckets[c.kind] || []).push(c); });
    const order: Strand["kind"][] = ["intention", "capture", "action", "journal", "read"];
    const out: Strand[] = [];
    let more = true;
    while (more) {
      more = false;
      for (const k of order) {
        const arr = buckets[k];
        if (arr && arr.length) { out.push(arr.shift()!); more = true; }
      }
    }
    return out;
  })();

  return (
    <div className="space-y-6">
      {/* The Weave — visual tapestry stitching every strand together */}
      <div className="relative rounded-2xl border border-border/30 bg-gradient-to-b from-background to-muted/20 overflow-hidden">
        {/* Through-line spine */}
        <div className="px-5 pt-5 pb-3 relative">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
            <Compass className="h-3 w-3" />
            <span>Through-line</span>
          </div>
          <p className="mt-2 font-display text-lg leading-snug text-foreground/90">
            {throughLine || "Set a through-line in Identity — it becomes the spine everything weaves around."}
          </p>
        </div>

        {/* The woven strands */}
        <div className="relative px-5 pb-5">
          {/* connective vertical line */}
          <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-border/40 to-transparent" />

          <ul className="space-y-3">
            {woven.length === 0 && (
              <li className="text-[12px] text-muted-foreground/50 pl-8">
                Capture, journal, or set a weekly intention — strands begin to weave here.
              </li>
            )}
            {woven.map((s, i) => {
              const content = (
                <div className="relative pl-8 group">
                  {/* node */}
                  <span
                    className={`absolute left-[19px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background ${kindColor[s.kind]}`}
                  />
                  {/* horizontal weave line */}
                  <span className={`absolute left-[35px] top-3 h-px w-3 ${kindColor[s.kind]} opacity-60`} />
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/50">
                      <span>{kindLabel[s.kind]}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="text-muted-foreground/40 normal-case tracking-normal">{s.label}</span>
                      {s.when && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-muted-foreground/40 normal-case tracking-normal">
                            {formatDistanceToNow(new Date(s.when), { addSuffix: true })}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[13.5px] leading-snug text-foreground/85 mt-0.5 group-hover:text-foreground transition-colors">
                      {s.body}
                    </p>
                  </div>
                </div>
              );
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="block">
                      {content}
                    </a>
                  ) : (
                    content
                  )}
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* Footer — cross-links into the rest of Weave */}
        <div className="border-t border-border/25 px-5 py-3 flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span>{insightCount} strands so far</span>
          <div className="flex items-center gap-3">
            <Link to="/research" className="hover:text-foreground flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Research
            </Link>
            <Link to="/mind?tab=ask" className="hover:text-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Ask
            </Link>
          </div>
        </div>
      </div>

      {/* Voice of the mind — full synthesis */}
      <MindSynthesis insightCount={insightCount} />

      {/* Rhythm this week */}
      {rhythm.length > 0 && (
        <div className="p-4 rounded-2xl border border-border/25 space-y-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Where this week is pulling</span>
          </div>
          <div className="space-y-2">
            {rhythm.map((r) => {
              const pct = r.count === 0 ? 0 : Math.round((r.done / r.count) * 100);
              return (
                <div key={r.pillar} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-foreground/80">{r.pillar}</span>
                    <span className="text-muted-foreground/50 tabular-nums">
                      {r.done}/{r.count}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                    <motion.div
                      className="h-full bg-primary/50"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reads weaving in — quick surface, full list lives at /research */}
      <div className="p-4 rounded-2xl border border-border/25 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Reads weaving in</span>
          <Link to="/research" className="text-[11px] text-muted-foreground/50 hover:text-primary ml-auto">
            all reads →
          </Link>
        </div>
        {readsLoading && reads.length === 0 && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/50 py-3">
            <Loader2 className="h-3 w-3 animate-spin" /> Pulling recent reads...
          </div>
        )}
        {reads.length > 0 && (
          <div className="space-y-2">
            {reads.map((r, i) => (
              <a
                key={i}
                href={r.search_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-border/25 hover:border-primary/40 p-3 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5">
                      {r.pillar} · {r.type}
                    </p>
                    <p className="text-[14px] font-medium leading-snug group-hover:text-primary transition-colors">
                      {r.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">{r.author}</p>
                    {r.why && (
                      <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">{r.why}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-1" />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
