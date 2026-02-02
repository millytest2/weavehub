import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  ArrowRight,
  Eye,
  Compass,
  RefreshCw,
  Sparkles,
  Target,
  Brain,
  Layers,
  TrendingUp,
  Clock,
  BookOpen
} from "lucide-react";
import { WeaveLoader } from "@/components/ui/weave-loader";

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

interface ThemeCluster {
  theme: string;
  count: number;
  examples: string[];
}

interface KnowledgeMap {
  totalInsights: number;
  totalDocuments: number;
  topThemes: ThemeCluster[];
  forgottenGems: ContentItem[];
  recentlyAccessed: ContentItem[];
  sourceBreakdown: { source: string; count: number }[];
  synthesis: string | null;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isWeaving, setIsWeaving] = useState(false);
  const [knowledgeMap, setKnowledgeMap] = useState<KnowledgeMap | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [identityContext, setIdentityContext] = useState<IdentityContext | null>(null);
  const [currentInsight, setCurrentInsight] = useState<{
    insight: ContentItem;
    connection: string;
    application: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "weave">("map");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    loadKnowledgeMap();
  }, [user, navigate]);

  const loadKnowledgeMap = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch all data in parallel
      const [
        insightsResult,
        docsResult,
        identityResult,
        forgottenResult,
        recentlyAccessedResult
      ] = await Promise.all([
        // All insights with source info
        supabase
          .from("insights")
          .select("id, title, content, source, created_at, last_accessed, access_count")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        // All documents
        supabase
          .from("documents")
          .select("id, title, summary, created_at, last_accessed, access_count")
          .eq("user_id", user.id),
        // Identity
        supabase
          .from("identity_seeds")
          .select("weekly_focus, year_note, core_values, content")
          .eq("user_id", user.id)
          .maybeSingle(),
        // Forgotten gems (not accessed in 30+ days, high relevance)
        supabase
          .from("insights")
          .select("id, title, content, source, created_at, access_count")
          .eq("user_id", user.id)
          .lt("last_accessed", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order("access_count", { ascending: true })
          .limit(5),
        // Recently accessed
        supabase
          .from("insights")
          .select("id, title, content, source, last_accessed, access_count")
          .eq("user_id", user.id)
          .not("last_accessed", "is", null)
          .order("last_accessed", { ascending: false })
          .limit(5)
      ]);

      const insights = insightsResult.data || [];
      const documents = docsResult.data || [];
      
      // Build source breakdown
      const sourceMap: Record<string, number> = {};
      insights.forEach(i => {
        let source = "Manual";
        if (i.source?.includes("youtube")) source = "YouTube";
        else if (i.source?.includes("instagram")) source = "Instagram";
        else if (i.source?.includes("twitter") || i.source?.includes("x.com")) source = "X/Twitter";
        else if (i.source?.includes("document") || i.source?.includes("pdf")) source = "Documents";
        else if (i.source?.includes("article")) source = "Articles";
        else if (i.source === "voice") source = "Voice Notes";
        else if (i.source?.includes("paste")) source = "Quick Paste";
        
        sourceMap[source] = (sourceMap[source] || 0) + 1;
      });
      
      const sourceBreakdown = Object.entries(sourceMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // Extract themes from insight titles and content
      const themeMap: Record<string, { count: number; examples: string[] }> = {};
      const themeKeywords = [
        "identity", "content", "authenticity", "posting", "consistency", 
        "fear", "confidence", "building", "shipping", "health", "presence",
        "connection", "networking", "learning", "skill", "creator", "business",
        "mindset", "habits", "discipline", "focus", "clarity", "alignment"
      ];
      
      insights.forEach(i => {
        const text = `${i.title} ${i.content || ""}`.toLowerCase();
        themeKeywords.forEach(theme => {
          if (text.includes(theme)) {
            if (!themeMap[theme]) {
              themeMap[theme] = { count: 0, examples: [] };
            }
            themeMap[theme].count++;
            if (themeMap[theme].examples.length < 2) {
              themeMap[theme].examples.push(i.title);
            }
          }
        });
      });
      
      const topThemes = Object.entries(themeMap)
        .map(([theme, data]) => ({ theme, ...data }))
        .filter(t => t.count >= 3)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Forgotten gems
      const forgottenGems = (forgottenResult.data || []).map(i => ({
        id: i.id,
        type: "insight" as const,
        title: i.title,
        content: i.content || "",
        source: i.source,
        created_at: i.created_at,
        access_count: i.access_count
      }));

      // Recently accessed
      const recentlyAccessed = (recentlyAccessedResult.data || []).map(i => ({
        id: i.id,
        type: "insight" as const,
        title: i.title,
        content: i.content || "",
        source: i.source,
        created_at: "",
        last_accessed: i.last_accessed,
        access_count: i.access_count
      }));

      // Set identity context
      if (identityResult.data) {
        setIdentityContext({
          yearNote: identityResult.data.year_note,
          weeklyFocus: identityResult.data.weekly_focus,
          coreValues: identityResult.data.core_values,
          content: identityResult.data.content
        });
      }

      // Generate synthesis if we have enough data
      let synthesis: string | null = null;
      if (insights.length >= 10 && topThemes.length >= 3) {
        synthesis = `Your knowledge base centers on ${topThemes.slice(0, 3).map(t => t.theme).join(", ")}. You've captured ${insights.length} insights primarily from ${sourceBreakdown[0]?.source || "various sources"}.`;
      }

      setKnowledgeMap({
        totalInsights: insights.length,
        totalDocuments: documents.length,
        topThemes,
        forgottenGems,
        recentlyAccessed,
        sourceBreakdown,
        synthesis
      });
    } catch (error) {
      console.error("Knowledge map error:", error);
      toast.error("Failed to load knowledge map");
    } finally {
      setIsLoading(false);
    }
  };

  // Weave one insight with identity connection
  const handleWeave = async () => {
    if (!user) return;
    
    setIsWeaving(true);
    setCurrentInsight(null);

    try {
      const { data, error } = await supabase.functions.invoke("weave-synthesis", {
        body: { 
          action: "surface_one",
          includeSynthesis: true
        }
      });

      if (!error && data?.insight) {
        setCurrentInsight({
          insight: {
            id: data.insight.id,
            type: "insight",
            title: data.insight.title,
            content: data.insight.content,
            source: data.insight.source,
            created_at: data.insight.created_at,
            access_count: data.insight.access_count
          },
          connection: data.connection || "Part of your captured wisdom",
          application: data.application || "How might this inform a decision today?"
        });

        // Update access tracking
        await supabase.rpc("update_item_access", { 
          table_name: "insights", 
          item_id: data.insight.id 
        });
      } else {
        toast.error("Couldn't weave - try again");
      }
    } catch (error) {
      console.error("Weave error:", error);
      toast.error("Failed to weave");
    } finally {
      setIsWeaving(false);
    }
  };

  const handleItemClick = async (item: ContentItem) => {
    setSelectedItem(item);
    
    if (item.type === "insight") {
      await supabase.rpc("update_item_access", { 
        table_name: "insights", 
        item_id: item.id 
      });
    }
  };

  const formatSource = (source?: string) => {
    if (!source) return null;
    if (source.includes("youtube")) return "YouTube";
    if (source.includes("twitter") || source.includes("x.com")) return "X";
    if (source.includes("instagram")) return "Instagram";
    if (source === "voice") return "Voice";
    if (source === "manual") return "Manual";
    if (source.includes("paste")) return "Paste";
    return source.split(":")[0];
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <WeaveLoader size="lg" text="Mapping your knowledge..." />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-display font-semibold">Your Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            {knowledgeMap?.totalInsights || 0} insights + {knowledgeMap?.totalDocuments || 0} documents
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1 bg-muted/50 rounded-2xl">
          <button
            onClick={() => setActiveTab("map")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "map" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Map
          </button>
          <button
            onClick={() => setActiveTab("weave")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "weave" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Weave
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "map" ? (
            <motion.div
              key="map"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Identity Direction */}
              {identityContext?.yearNote && (
                <Card className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-primary font-medium mb-1">2026 Direction</p>
                      <p className="text-sm leading-relaxed">
                        {identityContext.yearNote.split(' ').slice(0, 20).join(' ')}
                        {identityContext.yearNote.split(' ').length > 20 && "..."}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Theme Clusters */}
              {knowledgeMap?.topThemes && knowledgeMap.topThemes.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      What you've been learning
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {knowledgeMap.topThemes.map((theme) => (
                      <div
                        key={theme.theme}
                        className="px-3 py-2 rounded-xl bg-muted/60 border border-border/30"
                      >
                        <span className="text-sm font-medium capitalize">{theme.theme}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">
                          ({theme.count})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Breakdown */}
              {knowledgeMap?.sourceBreakdown && knowledgeMap.sourceBreakdown.length > 0 && (
                <Card className="p-4 rounded-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Where your knowledge comes from
                    </span>
                  </div>
                  <div className="space-y-2">
                    {knowledgeMap.sourceBreakdown.slice(0, 4).map((source) => (
                      <div key={source.source} className="flex items-center justify-between">
                        <span className="text-sm">{source.source}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-primary/30 rounded-full" style={{ 
                            width: `${Math.min(100, (source.count / knowledgeMap.totalInsights) * 200)}px` 
                          }} />
                          <span className="text-xs text-muted-foreground w-8">{source.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Forgotten Gems */}
              {knowledgeMap?.forgottenGems && knowledgeMap.forgottenGems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Forgotten gems (30+ days)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {knowledgeMap.forgottenGems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="w-full text-left p-3 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 transition-colors border border-amber-500/20"
                      >
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="text-sm font-medium line-clamp-1">{item.title}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Woven */}
              {knowledgeMap?.recentlyAccessed && knowledgeMap.recentlyAccessed.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recently accessed
                    </span>
                  </div>
                  <div className="space-y-2">
                    {knowledgeMap.recentlyAccessed.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="w-full text-left p-3 rounded-xl bg-card hover:bg-muted/50 transition-colors border border-border/30"
                      >
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-medium line-clamp-1">{item.title}</span>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">
                            {item.access_count}x
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Synthesis */}
              {knowledgeMap?.synthesis && (
                <Card className="p-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Pattern</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {knowledgeMap.synthesis}
                  </p>
                </Card>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="weave"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Weave Card */}
              <Card className="p-6 rounded-3xl bg-gradient-to-br from-card via-card to-muted/20">
                {isWeaving ? (
                  <div className="py-12 flex flex-col items-center justify-center">
                    <WeaveLoader size="lg" text="Weaving your wisdom..." />
                  </div>
                ) : currentInsight ? (
                  <div className="space-y-5">
                    {/* Connection badge */}
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">{currentInsight.connection}</span>
                    </div>
                    
                    {/* The insight */}
                    <div className="space-y-2">
                      <h2 className="text-lg font-display font-semibold leading-snug">
                        {currentInsight.insight.title}
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {currentInsight.insight.content.substring(0, 250)}
                        {currentInsight.insight.content.length > 250 && "..."}
                      </p>
                    </div>

                    {/* How to apply */}
                    <div className="p-4 rounded-2xl bg-muted/50 border border-border/30">
                      <p className="text-xs text-muted-foreground mb-1">Reflection</p>
                      <p className="text-sm font-medium">{currentInsight.application}</p>
                    </div>

                    {/* Source */}
                    {currentInsight.insight.source && (
                      <p className="text-[10px] text-muted-foreground/60">
                        From: {formatSource(currentInsight.insight.source)}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={handleWeave}
                        variant="outline"
                        className="flex-1 rounded-2xl h-11"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Another
                      </Button>
                      <Button
                        onClick={() => handleItemClick(currentInsight.insight)}
                        className="flex-1 rounded-2xl h-11"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Full insight
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center space-y-5">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-display font-semibold">Weave your wisdom</h2>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Surface one insight and see how it connects to your 2026 direction.
                      </p>
                    </div>
                    <Button
                      onClick={handleWeave}
                      size="lg"
                      className="rounded-2xl h-12 px-8"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Weave Something
                    </Button>
                  </div>
                )}
              </Card>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center rounded-xl">
                  <Lightbulb className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                  <p className="text-lg font-semibold">{knowledgeMap?.totalInsights || 0}</p>
                  <p className="text-[9px] text-muted-foreground">Insights</p>
                </Card>
                <Card className="p-3 text-center rounded-xl">
                  <FileText className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                  <p className="text-lg font-semibold">{knowledgeMap?.totalDocuments || 0}</p>
                  <p className="text-[9px] text-muted-foreground">Documents</p>
                </Card>
                <Card className="p-3 text-center rounded-xl">
                  <Brain className="h-4 w-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-semibold">{knowledgeMap?.topThemes?.length || 0}</p>
                  <p className="text-[9px] text-muted-foreground">Themes</p>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-display">{selectedItem?.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {selectedItem?.content}
              </p>
              {selectedItem?.source && (
                <p className="text-xs text-muted-foreground pt-2 border-t border-border/30">
                  Source: {formatSource(selectedItem.source)}
                </p>
              )}
              {selectedItem?.access_count !== undefined && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Accessed {selectedItem.access_count + 1} times
                </p>
              )}
              {identityContext?.yearNote && (
                <div className="pt-3 border-t border-border/30">
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
