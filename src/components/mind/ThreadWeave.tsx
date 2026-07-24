import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MindSynthesis } from "@/components/explore/MindSynthesis";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

interface Strand {
  kind: "identity" | "value" | "landscape" | "capture" | "journal" | "action" | "read" | "intention" | "insight" | "experiment" | "document";
  label: string;
  body: string;
  when?: string;
  href?: string;
}

interface ThreadWeaveProps {
  insightCount: number;
}

// Module cache
let cachedStrands: Strand[] | null = null;
let cachedThroughLine: string | null = null;
let cachedIdentity: { current_reality?: string; direction_2026?: string; life_landscape?: string; core_values?: string } | null = null;
let cachedReads: any[] | null = null;

const kindColor: Record<Strand["kind"], string> = {
  identity: "bg-primary/70",
  value: "bg-fuchsia-500/60",
  landscape: "bg-teal-500/60",
  capture: "bg-blue-500/60",
  journal: "bg-amber-500/60",
  action: "bg-emerald-500/60",
  read: "bg-violet-500/60",
  intention: "bg-rose-500/60",
  insight: "bg-indigo-500/60",
  experiment: "bg-orange-500/60",
  document: "bg-slate-500/60",
};

export const ThreadWeave = ({ insightCount }: ThreadWeaveProps) => {
  const { user } = useAuth();
  const [strands, setStrands] = useState<Strand[]>(cachedStrands || []);
  const [throughLine, setThroughLine] = useState<string | null>(cachedThroughLine);
  const [identity, setIdentity] = useState(cachedIdentity);
  const [loading, setLoading] = useState(!cachedStrands);

  useEffect(() => {
    if (!user || cachedStrands) return;
    (async () => {
      const [idRes, obsRes, insRes, closesRes, actionsRes, wkRes, expRes, docsRes] = await Promise.all([
        supabase.from("identity_seeds")
          .select("through_line, weekly_focus, year_note, core_values, life_landscape")
          .eq("user_id", user.id).maybeSingle(),
        supabase.from("observations").select("content, created_at, source, observation_type")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
        supabase.from("insights").select("title, content, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(4),
        supabase.from("daily_closes").select("journal_entry, patterns_noticed, close_date")
          .eq("user_id", user.id).order("close_date", { ascending: false }).limit(3),
        supabase.from("action_history").select("action_text, pillar, action_date")
          .eq("user_id", user.id).order("action_date", { ascending: false }).limit(4),
        supabase.from("weekly_intentions").select("text, pillar, completed, updated_at")
          .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(4),
        supabase.from("experiments").select("title, hypothesis, status, started_at")
          .eq("user_id", user.id).order("started_at", { ascending: false, nullsFirst: false }).limit(3),
        supabase.from("documents").select("title, summary, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      ]);

      const idData: any = idRes.data || {};
      const tl = idData.through_line || idData.weekly_focus || null;
      cachedThroughLine = tl;
      setThroughLine(tl);

      const idObj = {
        current_reality: idData.weekly_focus,
        direction_2026: idData.year_note,
        life_landscape: idData.life_landscape,
        core_values: idData.core_values,
      };
      cachedIdentity = idObj;
      setIdentity(idObj);

      const s: Strand[] = [];

      if (idData.year_note) s.push({ kind: "identity", label: "2026 direction", body: String(idData.year_note).slice(0, 200) });
      if (idData.life_landscape) s.push({ kind: "landscape", label: "life landscape", body: String(idData.life_landscape).slice(0, 200) });
      if (idData.core_values) s.push({ kind: "value", label: "core values", body: String(idData.core_values).slice(0, 200) });

      (wkRes.data || []).slice(0, 3).forEach((w: any) => {
        s.push({ kind: "intention", label: `${w.pillar || "this week"}${w.completed ? " · done" : ""}`, body: w.text, when: w.updated_at });
      });
      (expRes.data || []).slice(0, 2).forEach((e: any) => {
        s.push({ kind: "experiment", label: `experiment · ${e.status || "idea"}`, body: e.title + (e.hypothesis ? ` — ${e.hypothesis}` : ""), when: e.started_at });
      });
      (insRes.data || []).slice(0, 3).forEach((i: any) => {
        s.push({ kind: "insight", label: "insight", body: (i.title || i.content || "").slice(0, 180), when: i.created_at });
      });
      (obsRes.data || []).slice(0, 4).forEach((o: any) => {
        const body = (o.content || "").split("\n")[0].slice(0, 160);
        if (body) s.push({ kind: "capture", label: o.source || o.observation_type || "capture", body, when: o.created_at });
      });
      (closesRes.data || []).slice(0, 2).forEach((c: any) => {
        const body = ((c.patterns_noticed || c.journal_entry) || "").slice(0, 180);
        if (body) s.push({ kind: "journal", label: "evening close", body, when: c.close_date });
      });
      (actionsRes.data || []).slice(0, 3).forEach((a: any) => {
        s.push({ kind: "action", label: a.pillar || "action", body: a.action_text, when: a.action_date });
      });
      (docsRes.data || []).slice(0, 2).forEach((d: any) => {
        if (d.title) s.push({ kind: "document", label: "document", body: `${d.title}${d.summary ? ` — ${String(d.summary).slice(0, 140)}` : ""}`, when: d.created_at });
      });

      // Chronological weave: newer strands closer to top after identity anchors
      const anchors = s.filter((x) => !x.when);
      const timed = s.filter((x) => x.when).sort((a, b) => (b.when! > a.when! ? 1 : -1));
      const woven = [...anchors, ...timed];

      cachedStrands = woven;
      setStrands(woven);
      setLoading(false);

      // Also pull a few reads to weave in
      supabase.functions
        .invoke("research-feed", { body: { focus: null, topic: null } })
        .then(({ data }) => {
          const reads = (data?.readings || []).slice(0, 2);
          cachedReads = reads;
          const readStrands: Strand[] = reads.map((r: any) => ({
            kind: "read" as const,
            label: `read · ${r.type || "essay"}`,
            body: `${r.title}${r.author ? ` — ${r.author}` : ""}${r.why ? `. ${r.why}` : ""}`,
            href: r.search_url,
          }));
          const combined = [...anchors, ...readStrands, ...timed];
          cachedStrands = combined;
          setStrands(combined);
        })
        .catch(() => {});
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      {/* The Through-line spine */}
      <div className="relative rounded-2xl border border-border/30 bg-gradient-to-b from-background to-muted/20 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
            <Compass className="h-3 w-3" />
            <span>The Through-line</span>
          </div>
          <p className="mt-2 font-display text-lg leading-snug text-foreground/90">
            {throughLine || "Set a through-line in Identity — it becomes the spine every strand weaves around."}
          </p>
          {identity?.current_reality && (
            <p className="mt-2 text-[12px] text-muted-foreground/60 leading-relaxed italic">
              {identity.current_reality}
            </p>
          )}
        </div>

        {/* Woven strands */}
        <div className="relative px-5 pb-5">
          <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-border/40 to-transparent" />

          {loading && strands.length === 0 && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground/50 pl-8 py-4">
              <Loader2 className="h-3 w-3 animate-spin" /> Weaving your strands…
            </div>
          )}

          <ul className="space-y-3">
            {!loading && strands.length === 0 && (
              <li className="text-[12px] text-muted-foreground/50 pl-8">
                Capture, journal, or set a weekly intention — strands begin to weave here.
              </li>
            )}
            {strands.map((s, i) => {
              const content = (
                <div className="relative pl-8 group">
                  <span
                    className={`absolute left-[19px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background ${kindColor[s.kind]}`}
                  />
                  <span className={`absolute left-[35px] top-3 h-px w-3 ${kindColor[s.kind]} opacity-60`} />
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/50">
                      <span>{s.kind}</span>
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
                      {s.href && <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40" />}
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
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
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

        <div className="border-t border-border/25 px-5 py-3 flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> {strands.length} strands woven
          </span>
          <Link to="/research" className="hover:text-foreground">More reads →</Link>
        </div>
      </div>

      {/* Voice of the mind — the actual synopsis across everything */}
      <MindSynthesis insightCount={insightCount} />
    </div>
  );
};
