import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Lightbulb, 
  FileText, 
  FlaskConical, 
  Loader2,
  ArrowRight,
  Eye,
  Compass,
  RefreshCw,
  Sparkles,
  Target,
  Brain
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

interface WeaveConnection {
  insight: ContentItem;
  connectionToIdentity: string;
  howToApply: string;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isWeaving, setIsWeaving] = useState(false);
  const [currentConnection, setCurrentConnection] = useState<WeaveConnection | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [stats, setStats] = useState({ insights: 0, documents: 0, experiments: 0, totalAccesses: 0 });
  const [identityContext, setIdentityContext] = useState<IdentityContext | null>(null);
  const [recentInsights, setRecentInsights] = useState<ContentItem[]>([]);
  const [synthesisText, setSynthesisText] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    loadInitialData();
  }, [user, navigate]);

  const loadInitialData = async () => {
    if (!user) return;

    const [insightsCount, docsCount, expCount, recentResult, identityResult] = await Promise.all([
      supabase.from("insights").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("experiments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("insights")
        .select("id, title, content, source, created_at, last_accessed, access_count")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("identity_seeds").select("weekly_focus, year_note, core_values, content").eq("user_id", user.id).maybeSingle()
    ]);

    const totalAccesses = recentResult.data?.reduce((sum, i) => sum + (i.access_count || 0), 0) || 0;

    setStats({
      insights: insightsCount.count || 0,
      documents: docsCount.count || 0,
      experiments: expCount.count || 0,
      totalAccesses
    });

    if (identityResult.data) {
      setIdentityContext({
        yearNote: identityResult.data.year_note,
        weeklyFocus: identityResult.data.weekly_focus,
        coreValues: identityResult.data.core_values,
        content: identityResult.data.content
      });
    }

    if (recentResult.data) {
      setRecentInsights(recentResult.data.map(i => ({
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
  };

  // The core weave function - surfaces one insight and shows how it connects
  const handleWeave = async () => {
    if (!user) return;
    
    setIsWeaving(true);
    setCurrentConnection(null);
    setSynthesisText(null);

    try {
      // Use weave-synthesis to get an insight connected to identity
      const { data, error } = await supabase.functions.invoke("weave-synthesis", {
        body: { 
          action: "surface_one",
          includeSynthesis: true
        }
      });

      if (!error && data?.insight) {
        setCurrentConnection({
          insight: {
            id: data.insight.id,
            type: "insight",
            title: data.insight.title,
            content: data.insight.content,
            source: data.insight.source,
            created_at: data.insight.created_at,
            access_count: data.insight.access_count
          },
          connectionToIdentity: data.connection || "Part of your captured wisdom",
          howToApply: data.application || "Reflect on how this connects to today."
        });
        
        if (data.synthesis) {
          setSynthesisText(data.synthesis);
        }

        // Update access tracking
        await supabase.rpc("update_item_access", { 
          table_name: "insights", 
          item_id: data.insight.id 
        });
      } else {
        // Fallback: pick a random insight and generate connection locally
        const { data: randomInsight } = await supabase
          .from("insights")
          .select("id, title, content, source, created_at, access_count")
          .eq("user_id", user.id)
          .limit(50);
        
        if (randomInsight && randomInsight.length > 0) {
          const picked = randomInsight[Math.floor(Math.random() * randomInsight.length)];
          const connection = generateLocalConnection(picked, identityContext);
          
          setCurrentConnection({
            insight: {
              id: picked.id,
              type: "insight",
              title: picked.title,
              content: picked.content || "",
              source: picked.source,
              created_at: picked.created_at,
              access_count: picked.access_count
            },
            connectionToIdentity: connection.connection,
            howToApply: connection.application
          });

          await supabase.rpc("update_item_access", { 
            table_name: "insights", 
            item_id: picked.id 
          });
        } else {
          toast.info("Add some insights first by pasting content on the Dashboard");
        }
      }
    } catch (error) {
      console.error("Weave error:", error);
      toast.error("Failed to weave");
    } finally {
      setIsWeaving(false);
    }
  };

  const generateLocalConnection = (insight: any, context: IdentityContext | null): { connection: string; application: string } => {
    const content = insight.content?.toLowerCase() || "";
    const title = insight.title?.toLowerCase() || "";
    
    // Check for value matches
    if (context?.coreValues) {
      const values = context.coreValues.split(',').map(v => v.trim().toLowerCase());
      const matchedValue = values.find(v => content.includes(v) || title.includes(v));
      if (matchedValue) {
        return {
          connection: `Connects to your value of ${matchedValue}`,
          application: `How might this inform a decision today?`
        };
      }
    }
    
    // Check for 2026 direction match
    if (context?.yearNote) {
      const yearWords = context.yearNote.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedWord = yearWords.find(w => content.includes(w) || title.includes(w));
      if (matchedWord) {
        return {
          connection: `Aligned with your 2026 direction`,
          application: `One small step you could take today based on this.`
        };
      }
    }
    
    // Default
    return {
      connection: "Wisdom you captured",
      application: "What does this remind you of right now?"
    };
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
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header with identity context */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-display font-semibold">Your Weave</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} pieces of wisdom waiting to be woven
          </p>
          {identityContext?.yearNote && (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/10">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Direction:</span>
              <span className="text-xs font-medium truncate max-w-[180px]">
                {identityContext.yearNote.split(' ').slice(0, 5).join(' ')}...
              </span>
            </div>
          )}
        </div>

        {/* Main Weave Action */}
        <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-6 shadow-soft">
          {isWeaving ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <WeaveLoader size="lg" text="Weaving your wisdom..." />
            </div>
          ) : currentConnection ? (
            <div className="space-y-5">
              {/* Connection badge */}
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-primary">{currentConnection.connectionToIdentity}</span>
              </div>
              
              {/* The insight */}
              <div className="space-y-2">
                <h2 className="text-lg font-display font-semibold leading-snug">
                  {currentConnection.insight.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {currentConnection.insight.content.substring(0, 250)}
                  {currentConnection.insight.content.length > 250 && "..."}
                </p>
              </div>

              {/* How to apply */}
              <div className="p-4 rounded-2xl bg-muted/50 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Reflection</p>
                <p className="text-sm font-medium">{currentConnection.howToApply}</p>
              </div>

              {/* Synthesis if available */}
              {synthesisText && (
                <div className="pt-3 border-t border-border/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Pattern</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{synthesisText}</p>
                </div>
              )}

              {/* Source */}
              {currentConnection.insight.source && (
                <p className="text-[10px] text-muted-foreground/60">
                  From: {formatSource(currentConnection.insight.source)}
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
                  onClick={() => handleItemClick(currentConnection.insight)}
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
                  Surface one insight from your {stats.insights} captures and see how it connects to where you're going.
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
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center rounded-2xl">
            <Lightbulb className="h-5 w-5 text-amber-500 mx-auto mb-1.5" />
            <p className="text-xl font-semibold">{stats.insights}</p>
            <p className="text-[10px] text-muted-foreground">Insights</p>
          </Card>
          <Card className="p-4 text-center rounded-2xl">
            <FileText className="h-5 w-5 text-blue-500 mx-auto mb-1.5" />
            <p className="text-xl font-semibold">{stats.documents}</p>
            <p className="text-[10px] text-muted-foreground">Documents</p>
          </Card>
          <Card className="p-4 text-center rounded-2xl">
            <Eye className="h-5 w-5 text-primary mx-auto mb-1.5" />
            <p className="text-xl font-semibold">{stats.totalAccesses}</p>
            <p className="text-[10px] text-muted-foreground">Times woven</p>
          </Card>
        </div>

        {/* Recent Captures */}
        {recentInsights.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Recent captures
            </p>
            <div className="space-y-2">
              {recentInsights.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-4 rounded-2xl bg-card hover:bg-muted/50 transition-colors border border-border/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      {getItemIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm line-clamp-1">{item.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {item.content?.substring(0, 80)}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {selectedItem && getItemIcon(selectedItem.type)}
                <DialogTitle className="text-lg font-display">{selectedItem?.title}</DialogTitle>
              </div>
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
