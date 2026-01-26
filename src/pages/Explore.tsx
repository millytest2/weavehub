import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Search, 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  Loader2,
  Sparkles,
  Link2,
  Target,
  Layers
} from "lucide-react";

interface ContentItem {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  preview: string;
  topic?: string;
  topicColor?: string;
  created_at: string;
}

interface TopicCluster {
  name: string;
  color: string;
  items: ContentItem[];
  connections: string[]; // Connected topic names
  identityAligned: boolean;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [clusters, setClusters] = useState<TopicCluster[]>([]);
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [itemDetail, setItemDetail] = useState<any>(null);
  const [identityKeywords, setIdentityKeywords] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchClusters();
  }, [user, navigate]);

  const fetchClusters = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch all content types and identity
      const [insightsResult, documentsResult, experimentsResult, topicsResult, identityResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, topic_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("documents")
          .select("id, title, summary, topic_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("experiments")
          .select("id, title, description, hypothesis, topic_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("topics")
          .select("id, name, color")
          .eq("user_id", user.id),
        supabase
          .from("identity_seeds")
          .select("content, core_values, year_note")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      const topics = new Map(topicsResult.data?.map(t => [t.id, { name: t.name, color: t.color || "#3B82F6" }]) || []);
      
      // Extract identity keywords for alignment detection
      if (identityResult.data) {
        const idText = `${identityResult.data.content || ""} ${identityResult.data.core_values || ""} ${identityResult.data.year_note || ""}`;
        const keywords = idText.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 4)
          .slice(0, 20);
        setIdentityKeywords(keywords);
      }
      
      // Convert to ContentItems
      const allItems: ContentItem[] = [
        ...(insightsResult.data || []).map(i => ({
          id: i.id,
          type: "insight" as const,
          title: i.title,
          preview: i.content?.substring(0, 120) || "",
          topic: i.topic_id ? topics.get(i.topic_id)?.name : undefined,
          topicColor: i.topic_id ? topics.get(i.topic_id)?.color : undefined,
          created_at: i.created_at
        })),
        ...(documentsResult.data || []).map(d => ({
          id: d.id,
          type: "document" as const,
          title: d.title,
          preview: d.summary?.substring(0, 120) || "",
          topic: d.topic_id ? topics.get(d.topic_id)?.name : undefined,
          topicColor: d.topic_id ? topics.get(d.topic_id)?.color : undefined,
          created_at: d.created_at
        })),
        ...(experimentsResult.data || []).map(e => ({
          id: e.id,
          type: "experiment" as const,
          title: e.title,
          preview: e.hypothesis || e.description?.substring(0, 120) || "",
          topic: (e as any).topic_id ? topics.get((e as any).topic_id)?.name : undefined,
          topicColor: (e as any).topic_id ? topics.get((e as any).topic_id)?.color : undefined,
          created_at: e.created_at
        }))
      ];

      // Build clusters with connection detection
      const topicClusters = new Map<string, { color: string; items: ContentItem[] }>();
      const unclustered: ContentItem[] = [];

      for (const item of allItems) {
        if (item.topic) {
          if (!topicClusters.has(item.topic)) {
            topicClusters.set(item.topic, { color: item.topicColor || "#3B82F6", items: [] });
          }
          topicClusters.get(item.topic)!.items.push(item);
        } else {
          unclustered.push(item);
        }
      }

      // Detect connections between topics (shared keywords)
      const topicKeywords = new Map<string, Set<string>>();
      for (const [topic, data] of topicClusters) {
        const words = new Set<string>();
        for (const item of data.items) {
          const text = `${item.title} ${item.preview}`.toLowerCase();
          text.split(/\s+/).filter(w => w.length > 5).forEach(w => words.add(w));
        }
        topicKeywords.set(topic, words);
      }

      // Find connections and identity alignment
      const clusterArray: TopicCluster[] = Array.from(topicClusters.entries())
        .map(([name, data]) => {
          const myWords = topicKeywords.get(name) || new Set();
          const connections: string[] = [];
          
          for (const [otherTopic, otherWords] of topicKeywords) {
            if (otherTopic !== name) {
              const shared = [...myWords].filter(w => otherWords.has(w));
              if (shared.length >= 3) {
                connections.push(otherTopic);
              }
            }
          }

          // Check identity alignment
          const topicText = data.items.map(i => `${i.title} ${i.preview}`).join(" ").toLowerCase();
          const alignmentScore = identityKeywords.filter(kw => topicText.includes(kw)).length;
          
          return {
            name,
            color: data.color,
            items: data.items,
            connections,
            identityAligned: alignmentScore >= 2
          };
        })
        .sort((a, b) => b.items.length - a.items.length);

      // Add unclustered
      if (unclustered.length > 0) {
        clusterArray.push({ 
          name: "Uncategorized", 
          color: "#6B7280", 
          items: unclustered, 
          connections: [],
          identityAligned: false
        });
      }

      setClusters(clusterArray);
    } catch (error) {
      console.error("Error fetching clusters:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!user || !query.trim()) return;
    
    setSearching(true);
    setAiAnswer(null);
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("retrieval-engine", {
        body: { action: "surface", query: query.trim(), limit: 15 }
      });

      if (error) throw error;

      if (data?.items && data.items.length > 0) {
        setSearchResults(data.items);
        if (data?.synthesis) {
          setAiAnswer(data.synthesis);
        }
      } else {
        throw new Error("No AI results");
      }

    } catch (error) {
      console.error("Search error:", error);
      
      // Fallback to simple text search
      try {
        const searchTerm = `%${query.trim().toLowerCase()}%`;
        
        const [insightsResult, documentsResult] = await Promise.all([
          supabase
            .from("insights")
            .select("id, title, content, created_at")
            .eq("user_id", user.id)
            .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
            .limit(20),
          supabase
            .from("documents")
            .select("id, title, summary, created_at")
            .eq("user_id", user.id)
            .or(`title.ilike.${searchTerm},summary.ilike.${searchTerm}`)
            .limit(10)
        ]);

        const results: ContentItem[] = [
          ...(insightsResult.data || []).map(i => ({
            id: i.id,
            type: "insight" as const,
            title: i.title,
            preview: i.content?.substring(0, 120) || "",
            created_at: i.created_at
          })),
          ...(documentsResult.data || []).map(d => ({
            id: d.id,
            type: "document" as const,
            title: d.title,
            preview: d.summary?.substring(0, 120) || "",
            created_at: d.created_at
          }))
        ];

        setSearchResults(results);
      } catch (fallbackError) {
        toast.error("Search failed");
      }
    } finally {
      setSearching(false);
    }
  }, [user, query]);

  const handleItemClick = async (item: ContentItem) => {
    setSelectedItem(item);
    
    try {
      let detail = null;
      
      if (item.type === "insight") {
        const { data } = await supabase
          .from("insights")
          .select("*")
          .eq("id", item.id)
          .single();
        detail = data;
      } else if (item.type === "document") {
        const { data } = await supabase
          .from("documents")
          .select("*")
          .eq("id", item.id)
          .single();
        detail = data;
      } else if (item.type === "experiment") {
        const { data } = await supabase
          .from("experiments")
          .select("*")
          .eq("id", item.id)
          .single();
        detail = data;
      }
      
      setItemDetail(detail);
    } catch (error) {
      console.error("Error fetching detail:", error);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case "insight": return <Lightbulb className="h-3.5 w-3.5" />;
      case "document": return <FileText className="h-3.5 w-3.5" />;
      case "experiment": return <FlaskConical className="h-3.5 w-3.5" />;
      default: return <Lightbulb className="h-3.5 w-3.5" />;
    }
  };

  // Count total items and connections
  const stats = useMemo(() => {
    const totalItems = clusters.reduce((sum, c) => sum + c.items.length, 0);
    const connectedTopics = clusters.filter(c => c.connections.length > 0).length;
    const alignedTopics = clusters.filter(c => c.identityAligned).length;
    return { totalItems, connectedTopics, alignedTopics };
  }, [clusters]);

  return (
    <MainLayout>
      <div className="space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">Explore</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.totalItems} items across {clusters.length} topics
            {stats.connectedTopics > 0 && ` • ${stats.connectedTopics} connected`}
            {stats.alignedTopics > 0 && ` • ${stats.alignedTopics} identity-aligned`}
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your knowledge..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 h-10"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !query.trim()} size="default">
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

        {/* Search Results */}
        {(searchResults.length > 0 || aiAnswer) && (
          <div className="space-y-3">
            {aiAnswer && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-primary mb-1">From your knowledge</p>
                    <p className="text-sm leading-relaxed">{aiAnswer}</p>
                  </div>
                </div>
              </div>
            )}
            
            {searchResults.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{searchResults.length} results</p>
                <div className="grid gap-2">
                  {searchResults.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 bg-muted">
                        {getItemIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate">{item.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.preview}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Topic Clusters */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No content yet. Start capturing!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clusters.filter(c => c.name !== "Uncategorized").map((cluster) => (
              <div key={cluster.name} className="rounded-xl border border-border/50 overflow-hidden">
                {/* Cluster Header */}
                <div 
                  className="flex items-center gap-3 px-3 py-2.5 bg-muted/20"
                  style={{ borderLeft: `3px solid ${cluster.color}` }}
                >
                  <div 
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <span className="text-sm font-medium flex-1">{cluster.name}</span>
                  <span className="text-xs text-muted-foreground">{cluster.items.length}</span>
                  
                  {/* Indicators */}
                  <div className="flex items-center gap-1.5">
                  {cluster.identityAligned && (
                      <span title="Identity-aligned">
                        <Target className="h-3 w-3 text-primary" />
                      </span>
                    )}
                    {cluster.connections.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        <span>{cluster.connections.length}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Connection hints */}
                {cluster.connections.length > 0 && (
                  <div className="px-3 py-1.5 bg-muted/10 border-t border-border/30">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      <span>Connects to: {cluster.connections.slice(0, 3).join(", ")}</span>
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="p-2 grid gap-1.5 grid-cols-1 sm:grid-cols-2">
                  {cluster.items.slice(0, 6).map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="h-5 w-5 rounded flex items-center justify-center shrink-0 bg-muted/50">
                        {getItemIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-medium truncate">{item.title}</h4>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{item.preview}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {cluster.items.length > 6 && (
                  <div className="px-3 pb-2">
                    <p className="text-[10px] text-muted-foreground">
                      +{cluster.items.length - 6} more
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Uncategorized at bottom */}
            {clusters.find(c => c.name === "Uncategorized") && (
              <div className="rounded-xl border border-border/30 overflow-hidden opacity-60">
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/10">
                  <span className="text-xs text-muted-foreground">Uncategorized</span>
                  <span className="text-xs text-muted-foreground/60">
                    {clusters.find(c => c.name === "Uncategorized")!.items.length}
                  </span>
                </div>
                <div className="p-2 grid gap-1 grid-cols-2">
                  {clusters.find(c => c.name === "Uncategorized")!.items.slice(0, 4).map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/20 cursor-pointer"
                      onClick={() => handleItemClick(item)}
                    >
                      {getItemIcon(item.type)}
                      <span className="text-[10px] truncate">{item.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => { setSelectedItem(null); setItemDetail(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-muted">
                {getItemIcon(selectedItem?.type || '')}
              </div>
              <div>
                <DialogTitle className="text-base">{selectedItem?.title}</DialogTitle>
                <Badge variant="outline" className="text-[10px] h-4 mt-1">
                  {selectedItem?.type}
                </Badge>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {itemDetail ? (
              <>
                {selectedItem?.type === "insight" && itemDetail.content && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {itemDetail.content}
                  </p>
                )}
                
                {selectedItem?.type === "document" && (
                  <>
                    {itemDetail.summary && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                        <p className="text-sm">{itemDetail.summary}</p>
                      </div>
                    )}
                    {itemDetail.extracted_content && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Content</p>
                        <div className="max-h-60 overflow-y-auto bg-muted/30 rounded-lg p-3">
                          <pre className="text-xs whitespace-pre-wrap font-sans">
                            {itemDetail.extracted_content.substring(0, 2000)}
                            {itemDetail.extracted_content.length > 2000 && "..."}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {selectedItem?.type === "experiment" && (
                  <>
                    {itemDetail.hypothesis && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Hypothesis</p>
                        <p className="text-sm">{itemDetail.hypothesis}</p>
                      </div>
                    )}
                    {itemDetail.description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-sm">{itemDetail.description}</p>
                      </div>
                    )}
                    {itemDetail.identity_shift_target && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Identity Shift</p>
                        <p className="text-sm italic">{itemDetail.identity_shift_target}</p>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Explore;
