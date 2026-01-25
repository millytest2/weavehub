import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Search, 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  Loader2,
  Sparkles,
  Network
} from "lucide-react";

interface ContentItem {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  preview: string;
  topic?: string;
  created_at: string;
}

interface Cluster {
  theme: string;
  items: ContentItem[];
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"clusters" | "search">("clusters");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [itemDetail, setItemDetail] = useState<any>(null);

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
      // Fetch all content types
      const [insightsResult, documentsResult, experimentsResult, topicsResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, topic_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("documents")
          .select("id, title, summary, topic_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("experiments")
          .select("id, title, description, hypothesis, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("topics")
          .select("id, name")
          .eq("user_id", user.id)
      ]);

      const topics = new Map(topicsResult.data?.map(t => [t.id, t.name]) || []);
      
      // Convert to ContentItems
      const allItems: ContentItem[] = [
        ...(insightsResult.data || []).map(i => ({
          id: i.id,
          type: "insight" as const,
          title: i.title,
          preview: i.content?.substring(0, 150) || "",
          topic: i.topic_id ? topics.get(i.topic_id) : undefined,
          created_at: i.created_at
        })),
        ...(documentsResult.data || []).map(d => ({
          id: d.id,
          type: "document" as const,
          title: d.title,
          preview: d.summary?.substring(0, 150) || "",
          topic: d.topic_id ? topics.get(d.topic_id) : undefined,
          created_at: d.created_at
        })),
        ...(experimentsResult.data || []).map(e => ({
          id: e.id,
          type: "experiment" as const,
          title: e.title,
          preview: e.hypothesis || e.description?.substring(0, 150) || "",
          created_at: e.created_at
        }))
      ];

      // Group by topic for clusters
      const topicClusters = new Map<string, ContentItem[]>();
      const unclustered: ContentItem[] = [];

      for (const item of allItems) {
        if (item.topic) {
          if (!topicClusters.has(item.topic)) {
            topicClusters.set(item.topic, []);
          }
          topicClusters.get(item.topic)!.push(item);
        } else {
          unclustered.push(item);
        }
      }

      // Convert to cluster array
      const clusterArray: Cluster[] = Array.from(topicClusters.entries())
        .map(([theme, items]) => ({ theme, items }))
        .sort((a, b) => b.items.length - a.items.length);

      // Add unclustered if any
      if (unclustered.length > 0) {
        clusterArray.push({ theme: "Uncategorized", items: unclustered });
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
    setView("search");
    setAiAnswer(null);
    setSearchResults([]);

    try {
      // Call the retrieval engine to surface relevant content
      const { data, error } = await supabase.functions.invoke("retrieval-engine", {
        body: { action: "surface", query: query.trim() }
      });

      if (error) throw error;

      if (data?.items) {
        setSearchResults(data.items);
      }

      if (data?.synthesis) {
        setAiAnswer(data.synthesis);
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
            preview: i.content?.substring(0, 150) || "",
            created_at: i.created_at
          })),
          ...(documentsResult.data || []).map(d => ({
            id: d.id,
            type: "document" as const,
            title: d.title,
            preview: d.summary?.substring(0, 150) || "",
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
      case "insight": return <Lightbulb className="h-4 w-4" />;
      case "document": return <FileText className="h-4 w-4" />;
      case "experiment": return <FlaskConical className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "insight": return "bg-yellow-500/10 text-yellow-600";
      case "document": return "bg-blue-500/10 text-blue-600";
      case "experiment": return "bg-purple-500/10 text-purple-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl mx-auto">
        {/* Header - more compact */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Explore</h1>
            <p className="text-xs text-muted-foreground">
              Search and discover patterns in your knowledge
            </p>
          </div>
        </div>

        {/* Search Bar - cleaner */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ask about your knowledge..."
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
                Ask
              </>
            )}
          </Button>
        </div>

        {/* View Toggle - simplified */}
        <Tabs value={view} onValueChange={(v) => setView(v as "clusters" | "search")} className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="clusters" className="text-xs h-7 px-3">
              <Network className="h-3 w-3 mr-1" />
              Topics
            </TabsTrigger>
            <TabsTrigger value="search" className="text-xs h-7 px-3">
              <Search className="h-3 w-3 mr-1" />
              Results
            </TabsTrigger>
          </TabsList>

          {/* Clusters View */}
          <TabsContent value="clusters" className="mt-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : clusters.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No content yet. Start capturing insights!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {clusters.map((cluster) => (
                  <div key={cluster.theme}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{cluster.theme}</span>
                      <span className="text-xs text-muted-foreground">
                        ({cluster.items.length})
                      </span>
                    </div>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                      {cluster.items.slice(0, 4).map((item) => (
                        <div
                          key={`${item.type}-${item.id}`}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border/50"
                          onClick={() => handleItemClick(item)}
                        >
                          <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${getTypeColor(item.type)}`}>
                            {getItemIcon(item.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium truncate">{item.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {item.preview}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {cluster.items.length > 4 && (
                      <p className="text-xs text-muted-foreground mt-1.5 ml-1">
                        +{cluster.items.length - 4} more
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Search Results View */}
          <TabsContent value="search" className="mt-3">
            {aiAnswer && (
              <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-primary mb-1">From your knowledge</p>
                    <p className="text-sm leading-relaxed">{aiAnswer}</p>
                  </div>
                </div>
              </div>
            )}

            {searching ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {query ? "No results found." : "Enter a question to search."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={`h-7 w-7 rounded flex items-center justify-center shrink-0 ${getTypeColor(item.type)}`}>
                      {getItemIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">{item.title}</h3>
                        <Badge variant="outline" className="text-[10px] h-4">
                          {item.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {item.preview}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => { setSelectedItem(null); setItemDetail(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${getTypeColor(selectedItem?.type || '')}`}>
                {getItemIcon(selectedItem?.type || '')}
              </div>
              <DialogTitle>{selectedItem?.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {itemDetail ? (
              <>
                {/* Insight */}
                {selectedItem?.type === "insight" && itemDetail.content && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {itemDetail.content}
                  </p>
                )}
                
                {/* Document */}
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
                
                {/* Experiment */}
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
                        <p className="text-sm text-muted-foreground">{itemDetail.description}</p>
                      </div>
                    )}
                    {itemDetail.results && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Results</p>
                        <p className="text-sm">{itemDetail.results}</p>
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
