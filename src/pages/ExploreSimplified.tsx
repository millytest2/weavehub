import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Search, 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  Loader2,
  Sparkles,
  Clock,
  ArrowRight,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentItem {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  content: string;
  source?: string;
  created_at: string;
}

const ExploreSimplified = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ContentItem[]>([]);
  const [aiSynthesis, setAiSynthesis] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [stats, setStats] = useState({ insights: 0, documents: 0, experiments: 0 });
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    loadInitialData();
  }, [user, navigate]);

  const loadInitialData = async () => {
    if (!user) return;

    // Load stats
    const [insightsCount, docsCount, expCount] = await Promise.all([
      supabase.from("insights").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("experiments").select("id", { count: "exact", head: true }).eq("user_id", user.id)
    ]);

    setStats({
      insights: insightsCount.count || 0,
      documents: docsCount.count || 0,
      experiments: expCount.count || 0
    });

    // Load recent searches from localStorage
    const stored = localStorage.getItem(`explore_recent_${user.id}`);
    if (stored) {
      setRecentSearches(JSON.parse(stored).slice(0, 5));
    }

    // Generate suggested queries based on user's topics and identity
    const [topicsResult, identityResult] = await Promise.all([
      supabase.from("topics").select("name").eq("user_id", user.id).limit(5),
      supabase.from("identity_seeds").select("weekly_focus, year_note").eq("user_id", user.id).maybeSingle()
    ]);

    const suggestions: string[] = [];
    if (identityResult.data?.weekly_focus) {
      const focus = identityResult.data.weekly_focus.split(" ").slice(0, 3).join(" ");
      suggestions.push(`What did I capture about ${focus.toLowerCase()}?`);
    }
    if (topicsResult.data) {
      topicsResult.data.slice(0, 3).forEach(t => {
        suggestions.push(`My notes on ${t.name.toLowerCase()}`);
      });
    }
    if (identityResult.data?.year_note) {
      suggestions.push("What relates to my 2026 goals?");
    }
    
    setSuggestedQueries(suggestions.slice(0, 4));
  };

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!user || !q.trim()) return;
    
    setSearching(true);
    setResults([]);
    setAiSynthesis(null);

    try {
      // Try semantic search via retrieval engine
      const { data, error } = await supabase.functions.invoke("retrieval-engine", {
        body: { action: "surface", query: q.trim(), limit: 15 }
      });

      if (!error && data?.items?.length > 0) {
        setResults(data.items);
        if (data.synthesis) {
          setAiSynthesis(data.synthesis);
        }
      } else {
        // Fallback to simple text search
        await fallbackSearch(q);
      }

      // Save to recent searches
      const newRecent = [q, ...recentSearches.filter(r => r !== q)].slice(0, 5);
      setRecentSearches(newRecent);
      localStorage.setItem(`explore_recent_${user.id}`, JSON.stringify(newRecent));

    } catch (error) {
      console.error("Search error:", error);
      await fallbackSearch(q);
    } finally {
      setSearching(false);
    }
  }, [user, query, recentSearches]);

  const fallbackSearch = async (q: string) => {
    if (!user) return;
    
    const searchTerm = `%${q.toLowerCase()}%`;
    
    const [insightsResult, documentsResult, experimentsResult] = await Promise.all([
      supabase
        .from("insights")
        .select("id, title, content, source, created_at")
        .eq("user_id", user.id)
        .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, title, summary, created_at")
        .eq("user_id", user.id)
        .or(`title.ilike.${searchTerm},summary.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("experiments")
        .select("id, title, description, hypothesis, created_at")
        .eq("user_id", user.id)
        .or(`title.ilike.${searchTerm},description.ilike.${searchTerm},hypothesis.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(5)
    ]);

    const combined: ContentItem[] = [
      ...(insightsResult.data || []).map(i => ({
        id: i.id,
        type: "insight" as const,
        title: i.title,
        content: i.content || "",
        source: i.source,
        created_at: i.created_at
      })),
      ...(documentsResult.data || []).map(d => ({
        id: d.id,
        type: "document" as const,
        title: d.title,
        content: d.summary || "",
        created_at: d.created_at
      })),
      ...(experimentsResult.data || []).map(e => ({
        id: e.id,
        type: "experiment" as const,
        title: e.title,
        content: e.hypothesis || e.description || "",
        created_at: e.created_at
      }))
    ];

    setResults(combined);
  };

  const handleItemClick = async (item: ContentItem) => {
    setSelectedItem(item);
    
    // Update access tracking for spaced repetition
    if (item.type === "insight") {
      await supabase.rpc("update_item_access", { 
        table_name: "insights", 
        item_id: item.id 
      });
    } else if (item.type === "document") {
      await supabase.rpc("update_item_access", { 
        table_name: "documents", 
        item_id: item.id 
      });
    }
  };

  const clearRecentSearches = () => {
    if (!user) return;
    setRecentSearches([]);
    localStorage.removeItem(`explore_recent_${user.id}`);
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case "insight": return <Lightbulb className="h-4 w-4 text-amber-500" />;
      case "document": return <FileText className="h-4 w-4 text-blue-500" />;
      case "experiment": return <FlaskConical className="h-4 w-4 text-purple-500" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const formatSource = (source?: string) => {
    if (!source) return null;
    if (source.includes("youtube")) return "YouTube";
    if (source.includes("twitter") || source.includes("x.com")) return "X";
    if (source.includes("instagram")) return "Instagram";
    if (source === "voice") return "Voice note";
    if (source === "manual") return "Manual";
    return source.split(":")[0];
  };

  const totalItems = stats.insights + stats.documents + stats.experiments;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-display font-semibold">What did you capture?</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} pieces of wisdom waiting
          </p>
        </div>

        {/* Search Input - Primary Focus */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search your mind... e.g., 'What did I save about content?'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-14 pl-12 pr-24 text-base rounded-2xl border-2 focus-visible:ring-2"
            autoFocus
          />
          <Button
            onClick={() => handleSearch()}
            disabled={searching || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 rounded-xl"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Search
              </>
            )}
          </Button>
        </div>

        {/* Results Area */}
        {aiSynthesis && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-primary mb-1">From your captures</p>
                <p className="text-sm leading-relaxed">{aiSynthesis}</p>
              </div>
            </div>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{results.length} results</p>
            </div>
            <div className="space-y-2">
              {results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {getItemIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm line-clamp-1">{item.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {item.content?.substring(0, 150)}
                      </p>
                      {item.source && (
                        <span className="inline-block mt-1.5 text-[10px] text-muted-foreground/70">
                          {formatSource(item.source)}
                        </span>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State - Suggestions */}
        {results.length === 0 && !searching && (
          <div className="space-y-6 pt-4">
            {/* Suggested Queries */}
            {suggestedQueries.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Try asking
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQueries.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(q);
                        handleSearch(q);
                      }}
                      className="px-3 py-2 text-sm rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Recent
                  </p>
                  <button
                    onClick={clearRecentSearches}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((search, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(search);
                        handleSearch(search);
                      }}
                      className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{search}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              <Card className="p-3 text-center">
                <Lightbulb className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-semibold">{stats.insights}</p>
                <p className="text-[10px] text-muted-foreground">Insights</p>
              </Card>
              <Card className="p-3 text-center">
                <FileText className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                <p className="text-lg font-semibold">{stats.documents}</p>
                <p className="text-[10px] text-muted-foreground">Documents</p>
              </Card>
              <Card className="p-3 text-center">
                <FlaskConical className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                <p className="text-lg font-semibold">{stats.experiments}</p>
                <p className="text-[10px] text-muted-foreground">Experiments</p>
              </Card>
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {selectedItem && getItemIcon(selectedItem.type)}
                <DialogTitle className="text-lg">{selectedItem?.title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {selectedItem?.content}
              </p>
              {selectedItem?.source && (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Source: {formatSource(selectedItem.source)}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default ExploreSimplified;
