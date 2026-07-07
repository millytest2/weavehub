import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, ExternalLink, Loader2, RefreshCw, Bookmark, Check, Search, Rss, Plus, X } from "lucide-react";
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

interface SubstackSource {
  id: string;
  url: string;
  name: string | null;
  last_synced_at: string | null;
  post_count: number;
  last_error: string | null;
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

// Module-level cache so switching tabs doesn't refetch. Manual Refresh button re-fetches.
const feedCache: { readings: Reading[]; focus: string; topic: string; ts: number } = {
  readings: [],
  focus: "All",
  topic: "",
  ts: 0,
};

export function ResearchFeed() {
  const { user } = useAuth();
  const [readings, setReadings] = useState<Reading[]>(feedCache.readings);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [activeFocus, setActiveFocus] = useState(feedCache.focus);
  const [topic, setTopic] = useState(feedCache.topic);

  // Substack
  const [sources, setSources] = useState<SubstackSource[]>([]);
  const [showSubstack, setShowSubstack] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSources();
    // Only auto-load on very first visit — never re-fetch on tab switch.
    if (feedCache.readings.length === 0) loadReadings("All", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadSources = async () => {
    const { data } = await supabase.functions.invoke("substack-sync", { body: { action: "list" } });
    setSources(data?.sources || []);
  };

  const addSubstack = async () => {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("substack-sync", { body: { action: "add", url: newUrl } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Connected ${data?.name || "Substack"} — ${data?.count || 0} posts`);
      setNewUrl("");
      loadSources();
      loadReadings(activeFocus);
    } catch (e: any) {
      toast.error(e.message || "Couldn't connect");
    } finally {
      setAdding(false);
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("substack-sync", { body: { action: "sync" } });
      toast.success("Substacks synced");
      loadSources();
      loadReadings(activeFocus);
    } finally { setSyncing(false); }
  };

  const removeSource = async (id: string) => {
    await supabase.functions.invoke("substack-sync", { body: { action: "remove", id } });
    loadSources();
  };

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
      if (data?.error && !data?.readings?.length) toast.error(data.error);
      setReadings(data?.readings || []);
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground/50">Reading tuned to your goals</p>
          <p className="text-[11px] text-muted-foreground/30 mt-0.5">Essays, Substack, papers, talks + podcasts</p>
        </div>
        <button
          onClick={() => loadReadings(activeFocus)}
          disabled={loading}
          className="shrink-0 text-sm text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Topic search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadReadings(activeFocus)}
            placeholder="Specific topic..."
            className="h-9 pl-9 text-sm bg-background/50"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => loadReadings(activeFocus)} disabled={loading} className="h-9 shrink-0">
          Search
        </Button>
      </div>

      {/* Substack panel */}
      <div className="rounded-xl border border-border/25 p-3 space-y-3">
        <button
          onClick={() => setShowSubstack((s) => !s)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Rss className="h-3.5 w-3.5 text-orange-500/70" />
            <span className="text-sm font-medium">Your feeds</span>
            <span className="text-[11px] text-muted-foreground/40">{sources.length}</span>
          </div>
          <span className="text-[11px] text-muted-foreground/50">{showSubstack ? "Hide" : "Manage"}</span>
        </button>

        {showSubstack && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubstack()}
                placeholder="sashachapin.substack.com or any blog URL"
                className="h-9 text-sm bg-background/50 flex-1 min-w-0"
              />
              <Button size="sm" onClick={addSubstack} disabled={adding || !newUrl.trim()} className="h-9 shrink-0">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" />Add</>}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Paste a Substack or any blog with an RSS/Atom feed. We'll auto-discover the feed.
            </p>

            {sources.length > 0 && (
              <div className="space-y-1.5">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/20 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] truncate">{s.name || s.url}</p>
                      <p className="text-[10px] text-muted-foreground/40">
                        {s.post_count} posts · {s.last_synced_at ? `synced ${new Date(s.last_synced_at).toLocaleDateString()}` : "not synced"}
                        {s.last_error && <span className="text-destructive/70"> · {s.last_error}</span>}
                      </p>
                    </div>
                    <button onClick={() => removeSource(s.id)} className="shrink-0 text-muted-foreground/40 hover:text-destructive p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={syncAll}
                  disabled={syncing}
                  className="text-[11px] text-primary/60 hover:text-primary flex items-center gap-1"
                >
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Focus chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
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
          <p className="text-sm text-muted-foreground/40">Pulling research...</p>
        </div>
      )}

      {readings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3 w-3 text-muted-foreground/50" />
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">Reading list</p>
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
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1">
                      {r.type === "substack" && <Rss className="h-2.5 w-2.5 text-orange-500/70" />}
                      {r.type}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug break-words">{r.title}</p>
                  <p className="text-[12px] text-muted-foreground/50 mt-0.5 truncate">{r.author}</p>
                </div>
              </div>

              {r.why && (
                <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
                  <span className="text-muted-foreground/40">Why: </span>{r.why}
                </p>
              )}
              {r.takeaway && (
                <p className="text-[12px] text-muted-foreground/50 italic leading-relaxed">{r.takeaway}</p>
              )}

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
