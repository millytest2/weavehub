import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  ArrowRight, 
  Target, 
  Clock,
  Sparkles,
  ChevronRight,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Theme colors for clusters
const CLUSTER_COLORS = [
  "hsl(280, 60%, 55%)",  // purple - identity
  "hsl(200, 70%, 50%)",  // blue - building  
  "hsl(340, 60%, 55%)",  // pink - content
  "hsl(35, 80%, 50%)",   // orange - business
  "hsl(140, 50%, 45%)",  // green - health
  "hsl(180, 50%, 45%)",  // teal - presence
  "hsl(220, 60%, 55%)",  // indigo - learning
  "hsl(350, 55%, 55%)",  // red - connection
  "hsl(260, 50%, 50%)",  // violet - mindset
  "hsl(160, 50%, 45%)",  // emerald - growth
];

interface Insight {
  id: string;
  title: string;
  content: string;
  source?: string;
  topic_id?: string;
  created_at: string;
  last_accessed?: string;
}

interface TopicCluster {
  name: string;
  color: string;
  insights: Insight[];
  keywords: string[];
}

interface TopicClusterViewProps {
  insights: Insight[];
  documents: Array<{ id: string; title: string; content: string; topic_id?: string }>;
  experiments: Array<{ id: string; title: string; content: string; topic_id?: string }>;
  topics: Array<{ id: string; name: string; color?: string }>;
  yearNote?: string;
  userId: string;
}

// Simple k-means-like clustering based on keyword extraction
function clusterInsights(insights: Insight[], numClusters: number = 8): TopicCluster[] {
  if (insights.length === 0) return [];
  
  // Extract keywords from each insight
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "must", "shall", "can", "need", "dare", "ought", "used", "this", "that", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
    "when", "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "not", "only", "own", "same", "so",
    "than", "too", "very", "just", "also", "now", "here", "there", "then", "once",
    "your", "about", "into", "through", "during", "before", "after", "above", "below"
  ]);
  
  // Theme definitions for better clustering
  const themeKeywords: Record<string, string[]> = {
    "Sales & Business": ["sales", "client", "deal", "revenue", "business", "money", "income", "customer", "prospect", "close", "pipeline", "meeting", "call", "enterprise", "b2b", "saas"],
    "Content Creation": ["content", "video", "tiktok", "post", "audience", "creator", "social", "media", "viral", "engagement", "youtube", "instagram", "linkedin", "podcast"],
    "Identity & Mindset": ["identity", "belief", "mindset", "fear", "confidence", "self", "ego", "transform", "becoming", "who", "authentic", "truth", "core", "values"],
    "Health & Body": ["health", "fitness", "body", "exercise", "workout", "sleep", "energy", "gym", "nutrition", "running", "strength", "physical"],
    "Learning & Skills": ["learn", "skill", "practice", "study", "knowledge", "understand", "master", "improve", "develop", "growth", "education", "training"],
    "Presence & Calm": ["presence", "awareness", "meditation", "calm", "nervous", "grounding", "peace", "stillness", "breath", "mindful", "anxiety", "stress"],
    "Relationships": ["relationship", "people", "network", "connect", "community", "friend", "family", "social", "love", "trust", "communication"],
    "Productivity": ["productivity", "focus", "time", "priority", "habit", "routine", "discipline", "consistency", "action", "execute", "ship", "build"]
  };
  
  // Score each insight against each theme
  const insightThemeScores = insights.map(insight => {
    const text = `${insight.title} ${insight.content}`.toLowerCase();
    const scores: Record<string, number> = {};
    
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      scores[theme] = keywords.reduce((score, kw) => {
        const regex = new RegExp(`\\b${kw}`, 'gi');
        const matches = text.match(regex);
        return score + (matches ? matches.length : 0);
      }, 0);
    }
    
    // Find best matching theme
    let bestTheme = "Other";
    let bestScore = 0;
    for (const [theme, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestTheme = theme;
      }
    }
    
    return { insight, theme: bestScore > 0 ? bestTheme : "Other", score: bestScore };
  });
  
  // Group by theme
  const clusters: Map<string, Insight[]> = new Map();
  insightThemeScores.forEach(({ insight, theme }) => {
    if (!clusters.has(theme)) {
      clusters.set(theme, []);
    }
    clusters.get(theme)!.push(insight);
  });
  
  // Convert to array and sort by size
  const clusterArray: TopicCluster[] = Array.from(clusters.entries())
    .filter(([name, items]) => items.length >= 2 || name !== "Other") // Keep themes with 2+ items
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, numClusters)
    .map(([name, items], index) => ({
      name,
      color: CLUSTER_COLORS[index % CLUSTER_COLORS.length],
      insights: items,
      keywords: themeKeywords[name] || []
    }));
  
  return clusterArray;
}

// Find forgotten gems (not accessed in 30+ days)
function findForgottenGems(insights: Insight[]): Insight[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return insights.filter(insight => {
    if (!insight.last_accessed) return true;
    return new Date(insight.last_accessed) < thirtyDaysAgo;
  }).slice(0, 5);
}

export const TopicClusterView = ({
  insights,
  documents,
  experiments,
  topics,
  yearNote,
  userId
}: TopicClusterViewProps) => {
  const [selectedCluster, setSelectedCluster] = useState<TopicCluster | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [connectionToMisogi, setConnectionToMisogi] = useState<string>("");
  const [suggestedAction, setSuggestedAction] = useState<string>("");
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  
  // Cluster insights
  const clusters = useMemo(() => clusterInsights(insights, 10), [insights]);
  
  // Find forgotten gems
  const forgottenGems = useMemo(() => findForgottenGems(insights), [insights]);
  
  // Generate connection to Misogi when cluster is selected
  useEffect(() => {
    if (!selectedCluster || !yearNote) {
      setConnectionToMisogi("");
      setSuggestedAction("");
      return;
    }
    
    const generateConnection = async () => {
      setIsLoadingConnection(true);
      
      try {
        // Use weave-synthesis to get connection
        const { data, error } = await supabase.functions.invoke("weave-synthesis", {
          body: {
            action: "cluster_connection",
            clusterName: selectedCluster.name,
            insightTitles: selectedCluster.insights.slice(0, 5).map(i => i.title),
            yearNote
          }
        });
        
        if (!error && data) {
          setConnectionToMisogi(data.connection || `Your ${selectedCluster.name} insights are building toward your 2026 vision.`);
          setSuggestedAction(data.action || `Review one ${selectedCluster.name} insight and apply it today.`);
        } else {
          // Fallback
          setConnectionToMisogi(`These ${selectedCluster.insights.length} insights in ${selectedCluster.name} are part of your growth trajectory.`);
          setSuggestedAction(`Pick one insight from this cluster and experiment with it this week.`);
        }
      } catch (err) {
        setConnectionToMisogi(`These ${selectedCluster.insights.length} insights in ${selectedCluster.name} are part of your growth trajectory.`);
        setSuggestedAction(`Pick one insight from this cluster and experiment with it this week.`);
      } finally {
        setIsLoadingConnection(false);
      }
    };
    
    generateConnection();
  }, [selectedCluster, yearNote]);
  
  const handleInsightClick = async (insight: Insight) => {
    setSelectedInsight(insight);
    
    // Track access
    await supabase.rpc("update_item_access", { 
      table_name: "insights", 
      item_id: insight.id 
    });
  };
  
  const handleCreateExperiment = () => {
    if (!selectedInsight) return;
    toast.success("Opening experiment generator...");
    window.location.href = `/lab?insight=${selectedInsight.id}`;
  };
  
  const handleAddToFocus = async () => {
    if (!selectedInsight) return;
    
    try {
      await supabase
        .from("identity_seeds")
        .update({ weekly_focus: selectedInsight.title })
        .eq("user_id", userId);
      
      toast.success("Added to weekly focus");
    } catch (err) {
      toast.error("Failed to update focus");
    }
  };
  
  // Find related insights for selected insight
  const relatedInsights = useMemo(() => {
    if (!selectedInsight) return [];
    
    // Find insights in same cluster or with similar keywords
    const selectedText = `${selectedInsight.title} ${selectedInsight.content}`.toLowerCase();
    const selectedWords = new Set(selectedText.split(/\s+/).filter(w => w.length > 4));
    
    return insights
      .filter(i => i.id !== selectedInsight.id)
      .map(insight => {
        const text = `${insight.title} ${insight.content}`.toLowerCase();
        const words = text.split(/\s+/).filter(w => w.length > 4);
        const overlap = words.filter(w => selectedWords.has(w)).length;
        return { insight, overlap };
      })
      .filter(({ overlap }) => overlap >= 2)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 4)
      .map(({ insight }) => insight);
  }, [selectedInsight, insights]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[500px]">
      {/* LEFT SIDE - Topic Clusters */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground px-1">
          Your Knowledge ({insights.length} insights)
        </h3>
        
        <div className="grid grid-cols-2 gap-2">
          {clusters.map((cluster, idx) => (
            <motion.button
              key={cluster.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => {
                setSelectedCluster(cluster);
                setSelectedInsight(null);
              }}
              className={`
                p-4 rounded-2xl border text-left transition-all
                ${selectedCluster?.name === cluster.name 
                  ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-border/50 bg-card hover:border-border hover:bg-muted/30'
                }
              `}
            >
              <div 
                className="w-3 h-3 rounded-full mb-2"
                style={{ backgroundColor: cluster.color }}
              />
              <p className="text-sm font-medium line-clamp-1">{cluster.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cluster.insights.length} insights
              </p>
            </motion.button>
          ))}
        </div>
        
        {/* Forgotten Gems - show when no cluster selected */}
        {!selectedCluster && forgottenGems.length > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-medium">Forgotten Gems</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Insights you haven't revisited in 30+ days
            </p>
            <div className="space-y-2">
              {forgottenGems.slice(0, 3).map(gem => (
                <button
                  key={gem.id}
                  onClick={() => handleInsightClick(gem)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-background/50 hover:bg-background transition-colors text-left"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs line-clamp-1">{gem.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* RIGHT SIDE - Detail View */}
      <div className="bg-muted/20 rounded-2xl p-4 border border-border/30">
        <AnimatePresence mode="wait">
          {selectedInsight ? (
            /* Insight Detail View */
            <motion.div
              key="insight-detail"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <button
                onClick={() => setSelectedInsight(null)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                ← Back to {selectedCluster?.name || "list"}
              </button>
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Insight</span>
                </div>
                <h3 className="font-display text-lg font-semibold">{selectedInsight.title}</h3>
              </div>
              
              <p className="text-sm text-muted-foreground leading-relaxed">
                {selectedInsight.content}
              </p>
              
              {selectedInsight.source && (
                <p className="text-xs text-muted-foreground">
                  Source: {selectedInsight.source}
                </p>
              )}
              
              {/* Related Insights */}
              {relatedInsights.length > 0 && (
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Connects to
                  </p>
                  <div className="space-y-1.5">
                    {relatedInsights.map(related => (
                      <button
                        key={related.id}
                        onClick={() => handleInsightClick(related)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-background/50 hover:bg-background transition-colors text-left"
                      >
                        <Lightbulb className="h-3 w-3 text-primary/60 shrink-0" />
                        <span className="text-xs line-clamp-1">{related.title}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex-1 text-xs"
                  onClick={handleCreateExperiment}
                >
                  <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
                  Create Experiment
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex-1 text-xs"
                  onClick={handleAddToFocus}
                >
                  <Target className="h-3.5 w-3.5 mr-1.5" />
                  Weekly Focus
                </Button>
              </div>
            </motion.div>
          ) : selectedCluster ? (
            /* Cluster Detail View */
            <motion.div
              key="cluster-detail"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: selectedCluster.color }}
                />
                <h3 className="font-display text-lg font-semibold">{selectedCluster.name}</h3>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {selectedCluster.insights.length} insights in this topic
              </p>
              
              {/* Connection to Misogi */}
              {yearNote && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-xs text-primary font-medium mb-1 flex items-center gap-1.5">
                    <Target className="h-3 w-3" />
                    How this connects to 2026
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingConnection ? "Finding connection..." : connectionToMisogi}
                  </p>
                </div>
              )}
              
              {/* Suggested Action */}
              {suggestedAction && (
                <div className="p-3 rounded-xl bg-muted/50 border border-border/30">
                  <p className="text-xs text-foreground font-medium mb-1">One action</p>
                  <p className="text-xs text-muted-foreground">{suggestedAction}</p>
                </div>
              )}
              
              {/* Insights List */}
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {selectedCluster.insights.map(insight => (
                  <button
                    key={insight.id}
                    onClick={() => handleInsightClick(insight)}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-background/50 hover:bg-background transition-colors text-left"
                  >
                    <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm line-clamp-1 flex-1">{insight.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            /* Empty State - Forgotten Gems */
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center text-center p-6"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-medium mb-2">Select a topic</h3>
              <p className="text-sm text-muted-foreground">
                Click a topic card to see your insights and how they connect to your 2026 direction.
              </p>
              
              {forgottenGems.length > 0 && (
                <div className="mt-6 w-full text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-medium">Forgotten Gems</p>
                  </div>
                  <div className="space-y-2">
                    {forgottenGems.slice(0, 3).map(gem => (
                      <button
                        key={gem.id}
                        onClick={() => handleInsightClick(gem)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 transition-colors text-left"
                      >
                        <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs line-clamp-1">{gem.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};