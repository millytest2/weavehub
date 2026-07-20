import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Loader2, ListTodo } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MindSynthesis } from "@/components/explore/MindSynthesis";
import { getWeek, getYear } from "date-fns";

interface Reading {
  title: string;
  author: string;
  type: string;
  pillar: string;
  why: string;
  search_url: string;
}

interface ThreadWeaveProps {
  insightCount: number;
}

// Simple module cache so re-visiting the tab doesn't re-fetch.
let cachedReads: Reading[] | null = null;
let cachedRhythm: { pillar: string; count: number; done: number }[] | null = null;

export const ThreadWeave = ({ insightCount }: ThreadWeaveProps) => {
  const { user } = useAuth();
  const [reads, setReads] = useState<Reading[]>(cachedReads || []);
  const [readsLoading, setReadsLoading] = useState(!cachedReads);
  const [rhythm, setRhythm] = useState(cachedRhythm || []);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  return (
    <div className="space-y-6">
      {/* Voice of the mind — full synthesis */}
      <MindSynthesis insightCount={insightCount} />

      {/* Rhythm this week — where the weight actually is */}
      {rhythm.length > 0 && (
        <Card className="p-4 rounded-2xl space-y-3">
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
        </Card>
      )}

      {/* Reads weaving in — top 3 from research feed, aligned to identity */}
      <Card className="p-4 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Reads weaving in</span>
          <span className="text-[11px] text-muted-foreground/40 ml-auto">tuned to this week</span>
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
        {!readsLoading && reads.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50">
            No reads yet. Open the Research tab to pull a set.
          </p>
        )}
      </Card>
    </div>
  );
};
