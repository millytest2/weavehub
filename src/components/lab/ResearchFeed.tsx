import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, ExternalLink, Loader2, RefreshCw, Bookmark, Check, Search, Library } from "lucide-react";
import { toast } from "sonner";

interface Reading {
  title: string;
  author: string;
  type: string;
  pillar: string;
  why: string;
  takeaway: string;
  search_url: string;
}

interface LibraryItem {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  source?: string;
  created_at: string;
}

const PILLAR_COLORS: Record<string, string> = {
  Money: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  UPath: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Sales: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Content: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Body: "bg-green-500/15 text-green-600 dark:text-green-400",
  Charisma: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Relationship: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Friendship: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Mind: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

const FOCUS_CHIPS = ["All", "Money", "Body", "Charisma", "Mind", "UPath", "Relationship"];

export function ResearchFeed() {
  const { user } = useAuth();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [activeFocus, setActiveFocus] = useState("All");
  const [topic, setTopic] = useState("");

  useEffect(() => {
    if (user && readings.length === 0) loadReadings("All", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadReadings = async (focus: string, topicOverride?: string) => {
    if (!user) return;
    setLoading(true);
    setActiveFocus(focus);
    try {
      const { data, error } = await supabase.functions.invoke("research-feed", {
        body: {
          focus: focus === "All" ? null : focus,
          topic: (topicOverride ?? topic).trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error && !data?.readings?.length) {
        toast.error(data.error);
      }
      setReadings(data?.readings || []);
      setLibrary(data?.from_library || []);
    } catch (err: any) {
      toast.error(err.message || "Couldn't load research");
    } finally {
      setLoading(false);
    }
  };

  const saveAsCapture = async (r: Reading) => {
    if (!user) return;
    try {
      await supabase.from("observations").insert({
        user_id: user.id,
        observation_type: "reference",
        content: `${r.title} — ${r.author}\n\nWhy: ${r.why}\nTakeaway: ${r.takeaway}\n\n${r.search_url}`,
        source: "research",
      });
      setSaved((prev) => new Set(prev).add(r.title));
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground/50">Reading tuned to your goals</p>
          <p className="text-[11px] text-muted-foreground/30 mt-0.5">External sources + your own captured library</p>
        </div>
        <button
          onClick={() => loadReadings(activeFocus)}
          disabled={loading}
          className="text-sm text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Topic search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadReadings(activeFocus)}
            placeholder="Specific topic (e.g. cold outreach, sleep, attachment)"
            className="h-9 pl-9 text-sm bg-background/50"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => loadReadings(activeFocus)}
          disabled={loading}
          className="h-9"
        >
          Search
        </Button>
      </div>

      {/* Focus chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FOCUS_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => loadReadings(chip)}
            disabled={loading}
            className={`shrink-0 text-[11px] h-7 px-2.5 rounded-full border transition-colors ${
              activeFocus === chip
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {loading && readings.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/40">Pulling research + scanning your library...</p>
        </div>
      )}

      {/* External readings */}
      {readings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3 w-3 text-muted-foreground/50" />
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">New sources</p>
          </div>
          {readings.map((r, i) => (
            <div key={i} className="rounded-xl border border-border/25 p-4 space-y-2.5 hover:border-border/50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] h-4 px-1.5 ${PILLAR_COLORS[r.pillar] || "bg-muted text-muted-foreground"}`}
                    >
                      {r.pillar}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">{r.type}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug">{r.title}</p>
                  <p className="text-[12px] text-muted-foreground/50 mt-0.5">{r.author}</p>
                </div>
              </div>

              <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
                <span className="text-muted-foreground/40">Why: </span>{r.why}
              </p>
              <p className="text-[12px] text-muted-foreground/50 italic leading-relaxed">
                {r.takeaway}
              </p>

              <div className="flex items-center gap-3 pt-1">
                <a
                  href={r.search_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
                <button
                  onClick={() => saveAsCapture(r)}
                  disabled={saved.has(r.title)}
                  className="text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {saved.has(r.title) ? (
                    <><Check className="h-3 w-3" /> Saved</>
                  ) : (
                    <><Bookmark className="h-3 w-3" /> Save</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
