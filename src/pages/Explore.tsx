import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Search, 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  Loader2,
  Clock,
  ArrowRight,
  Eye,
  EyeOff,
  Compass,
  Target,
  Layers
} from "lucide-react";

interface ContentItem {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  content: string;
  source?: string;
  created_at: string;
  last_accessed?: string;
  access_count?: number;
}

interface IdentityContext {
  yearNote?: string;
  weeklyFocus?: string;
  coreValues?: string;
  content?: string;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ContentItem[]>([]);
  const [aiSynthesis, setAiSynthesis] = useState<string | null>(null);
  const [citedSources, setCitedSources] = useState<string[]>([]);
  const [connectionToIdentity, setConnectionToIdentity] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [stats, setStats] = useState({ insights: 0, documents: 0, experiments: 0, forgotten: 0 });
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);
  const [forgottenGems, setForgottenGems] = useState<ContentItem[]>([]);
  const [showForgotten, setShowForgotten] = useState(false);
  const [identityContext, setIdentityContext] = useState<IdentityContext | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    loadInitialData();
  }, [user, navigate]);

  const loadInitialData = async () => {
    if (!user) return;

    // Load stats and forgotten gems in parallel
    const [insightsCount, docsCount, expCount, forgottenInsights, topicsResult, identityResult] = await Promise.all([
      supabase.from("insights").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("experiments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      // Find insights not accessed in 30+ days
      supabase
        .from("insights")
        .select("id, title, content, source, created_at, last_accessed, access_count")
        .eq("user_id", user.id)
        .or(`last_accessed.is.null,last_accessed.lt.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("topics").select("name").eq("user_id", user.id).limit(5),
      supabase.from("identity_seeds").select("weekly_focus, year_note, core_values, content").eq("user_id", user.id).maybeSingle()
    ]);

    setStats({
      insights: insightsCount.count || 0,
      documents: docsCount.count || 0,
      experiments: expCount.count || 0,
      forgotten: forgottenInsights.data?.length || 0
    });

    // Store identity context for showing connections
    if (identityResult.data) {
      setIdentityContext({
        yearNote: identityResult.data.year_note,
        weeklyFocus: identityResult.data.weekly_focus,
        coreValues: identityResult.data.core_values,
        content: identityResult.data.content
      });
    }

    // Set forgotten gems
    if (forgottenInsights.data) {
      setForgottenGems(forgottenInsights.data.map(i => ({
        id: i.id,
        type: "insight" as const,
        title: i.title,
        content: i.content || "",
        source: i.source,
        created_at: i.created_at,
        last_accessed: i.last_accessed,
        access_count: i.access_count
      })));
    }

    // Load recent searches from localStorage
    const stored = localStorage.getItem(`explore_recent_${user.id}`);
    if (stored) {
      setRecentSearches(JSON.parse(stored).slice(0, 5));
    }

    // Generate suggested queries based on user's data
    const suggestions: string[] = [];
    
    if (identityResult.data?.weekly_focus) {
      const focus = identityResult.data.weekly_focus.split(" ").slice(0, 3).join(" ");
      suggestions.push(`What did I save about ${focus.toLowerCase()}?`);
    }
    
    if (topicsResult.data) {
      topicsResult.data.slice(0, 2).forEach(t => {
        suggestions.push(`My thoughts on ${t.name.toLowerCase()}`);
      });
    }
    
    if (identityResult.data?.year_note) {
      suggestions.push("What connects to my 2026 vision?");
    }

    if (identityResult.data?.core_values) {
      suggestions.push("What did I capture about my values?");
    }
    
    setSuggestedQueries(suggestions.slice(0, 4));
  };

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!user || !q.trim()) return;
    
    setSearching(true);
    setResults([]);
    setAiSynthesis(null);
    setCitedSources([]);
    setConnectionToIdentity(null);

    try {
      // Try semantic search via retrieval engine
      const { data, error } = await supabase.functions.invoke("retrieval-engine", {
        body: { action: "surface", query: q.trim(), limit: 15, includeCitations: true }
      });

      if (!error && data?.items?.length > 0) {
        setResults(data.items);
        if (data.synthesis) {
          setAiSynthesis(data.synthesis);
        }
        if (data.citations) {
          setCitedSources(data.citations);
        }
        
        // Generate connection to identity/2026/values
        if (identityContext) {
          const connection = generateIdentityConnection(q, identityContext);
          if (connection) {
            setConnectionToIdentity(connection);
          }
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
  }, [user, query, recentSearches, identityContext]);

  const generateIdentityConnection = (searchQuery: string, context: IdentityContext): string | null => {
    const q = searchQuery.toLowerCase();
    const connections: string[] = [];
    
    // Check values connection
    if (context.coreValues) {
      const values = context.coreValues.split(',').map(v => v.trim().toLowerCase());
      const matchedValue = values.find(v => q.includes(v) || v.includes(q.split(' ')[0]));
      if (matchedValue) {
        connections.push(`This connects to your value of "${matchedValue}"`);
      }
    }
    
    // Check 2026/year note connection
    if (context.yearNote) {
      const yearWords = context.yearNote.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedWord = yearWords.find(w => q.includes(w));
      if (matchedWord) {
        connections.push(`This relates to your 2026 direction`);
      }
    }
    
    // Check weekly focus connection
    if (context.weeklyFocus) {
      const focusWords = context.weeklyFocus.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matchedFocus = focusWords.find(w => q.includes(w));
      if (matchedFocus) {
        connections.push(`Aligned with your current focus`);
      }
    }
    
    // Check identity content
    if (context.content) {
      const identityWords = context.content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedIdentity = identityWords.find(w => q.includes(w));
      if (matchedIdentity && connections.length === 0) {
        connections.push(`Part of who you're becoming`);
      }
    }
    
    return connections.length > 0 ? connections[0] : null;
  };

  const fallbackSearch = async (q: string) => {
    if (!user) return;
    
    const searchTerm = `%${q.toLowerCase()}%`;
    
    const [insightsResult, documentsResult, experimentsResult] = await Promise.all([
      supabase
        .from("insights")
        .select("id, title, content, source, created_at, last_accessed, access_count")
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
        created_at: i.created_at,
        last_accessed: i.last_accessed,
        access_count: i.access_count
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
    
    // Generate connection even for fallback
    if (identityContext && combined.length > 0) {
      const connection = generateIdentityConnection(q, identityContext);
      if (connection) {
        setConnectionToIdentity(connection);
      }
    }
  };

  const handleItemClick = async (item: ContentItem) => {
    setSelectedItem(item);
    
    // Update access tracking for spaced repetition
    if (item.type === "insight") {
      await supabase.rpc("update_item_access", { 
        table_name: "insights", 
        item_id: item.id 
      });
      // Remove from forgotten gems if present
      setForgottenGems(prev => prev.filter(g => g.id !== item.id));
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

  const getDaysSinceAccess = (lastAccessed?: string) => {
    if (!lastAccessed) return null;
    const days = Math.floor((Date.now() - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const totalItems = stats.insights + stats.documents + stats.experiments;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header with identity context */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-display font-semibold">What did you capture?</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} pieces of wisdom
          </p>
          {identityContext?.yearNote && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-xs">
              <Target className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">2026:</span>
              <span className="text-foreground font-medium truncate max-w-[200px]">
                {identityContext.yearNote.split(' ').slice(0, 6).join(' ')}...
              </span>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search your mind..."
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
              "Search"
            )}
          </Button>
        </div>

        {/* Identity Connection Banner */}
        {connectionToIdentity && results.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <Compass className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm text-foreground">{connectionToIdentity}</p>
          </div>
        )}

        {/* AI Synthesis with Citations */}
        {aiSynthesis && (
          <Card className="p-5 bg-gradient-to-br from-muted/30 to-muted/10 border-border/50">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-primary uppercase tracking-wide">From your captures</p>
              </div>
              <p className="text-sm leading-relaxed">{aiSynthesis}</p>
              {citedSources.length > 0 && (
                <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/30">
                  Sources: {citedSources.slice(0, 3).join(" • ")}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{results.length} results</p>
            <div className="space-y-2">
              {results.map((item) => {
                const daysSince = getDaysSinceAccess(item.last_accessed);
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left p-4 rounded-xl bg-card hover:bg-muted/50 transition-colors border border-border/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {getItemIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm line-clamp-1">{item.title}</h3>
                          {daysSince && daysSince > 30 && (
                            <Badge variant="outline" className="text-[9px] h-4 shrink-0 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                              <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                              {daysSince}d
                            </Badge>
                          )}
                        </div>
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
                );
              })}
            </div>
          </div>
        )}

        {/* Forgotten Gems Section */}
        {showForgotten && forgottenGems.length > 0 && results.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-medium">Wisdom waiting to be remembered</p>
            </div>
            <p className="text-xs text-muted-foreground">
              These insights haven't been accessed in 30+ days. Sometimes what we need most is what we've forgotten.
            </p>
            <div className="space-y-2">
              {forgottenGems.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors border border-amber-200/50 dark:border-amber-800/30"
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm line-clamp-1">{item.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {item.content?.substring(0, 120)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State - Suggestions */}
        {results.length === 0 && !searching && !showForgotten && (
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
                      className="px-4 py-2.5 text-sm rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
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
                      className="flex items-center gap-2 w-full p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{search}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Access to Forgotten */}
            {stats.forgotten > 0 && (
              <button
                onClick={() => setShowForgotten(true)}
                className="w-full p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 text-left hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <EyeOff className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Rediscover what you've forgotten</p>
                    <p className="text-xs text-muted-foreground">{stats.forgotten} insights waiting</p>
                  </div>
                </div>
              </button>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Card className="p-4 text-center">
                <Lightbulb className="h-5 w-5 text-amber-500 mx-auto mb-1.5" />
                <p className="text-lg font-semibold">{stats.insights}</p>
                <p className="text-[10px] text-muted-foreground">Insights</p>
              </Card>
              <Card className="p-4 text-center">
                <FileText className="h-5 w-5 text-blue-500 mx-auto mb-1.5" />
                <p className="text-lg font-semibold">{stats.documents}</p>
                <p className="text-[10px] text-muted-foreground">Documents</p>
              </Card>
              <Card className="p-4 text-center">
                <FlaskConical className="h-5 w-5 text-purple-500 mx-auto mb-1.5" />
                <p className="text-lg font-semibold">{stats.experiments}</p>
                <p className="text-[10px] text-muted-foreground">Experiments</p>
              </Card>
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
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
              {selectedItem?.access_count !== undefined && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Accessed {selectedItem.access_count + 1} times
                </p>
              )}
              {/* Show connection to identity in detail view */}
              {identityContext?.yearNote && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Compass className="h-3 w-3 text-primary" />
                    Your direction: {identityContext.yearNote.split(' ').slice(0, 8).join(' ')}...
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Explore;
