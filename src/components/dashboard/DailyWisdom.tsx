import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, RefreshCw, ChevronRight, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyWisdomProps {
  userId: string;
}

interface WisdomItem {
  id: string;
  title: string;
  content: string;
  source: string | null;
  created_at: string;
  access_count: number;
  relevance_reason?: string;
}

export function DailyWisdom({ userId }: DailyWisdomProps) {
  const [wisdom, setWisdom] = useState<WisdomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWisdom, setSelectedWisdom] = useState<WisdomItem | null>(null);
  const [markedSeen, setMarkedSeen] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchWisdom();
  }, [userId]);

  const fetchWisdom = async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      // Get user's current focus areas (identity, experiments, weekly focus)
      const [identityResult, experimentsResult, weeklyFocusResult] = await Promise.all([
        supabase
          .from("identity_seeds")
          .select("content, core_values, weekly_focus, year_note")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("experiments")
          .select("title, hypothesis")
          .eq("user_id", userId)
          .eq("status", "in_progress")
          .limit(2),
        supabase
          .from("weekly_pillar_targets")
          .select("pillar, notes")
          .eq("user_id", userId)
          .order("priority", { ascending: true })
          .limit(3)
      ]);

      // Build context for semantic relevance
      const focusContext = [
        identityResult.data?.weekly_focus,
        identityResult.data?.content?.substring(0, 200),
        experimentsResult.data?.map(e => e.title).join(", "),
        weeklyFocusResult.data?.map(w => w.pillar).join(", ")
      ].filter(Boolean).join(" ");

      // Fetch insights using spaced repetition logic:
      // 1. Low access_count (haven't seen recently)
      // 2. Not accessed in last 3+ days
      // 3. Some randomization for discovery
      const { data: insights } = await supabase
        .from("insights")
        .select("id, title, content, source, created_at, access_count, last_accessed")
        .eq("user_id", userId)
        .order("access_count", { ascending: true }) // Prioritize less-seen
        .limit(50);

      if (!insights || insights.length === 0) {
        setWisdom([]);
        setLoading(false);
        return;
      }

      // Score insights for spaced repetition
      const now = new Date();
      const scoredInsights = insights.map(insight => {
        let score = 0;
        
        // Recency penalty - recent access = lower score
        const lastAccess = insight.last_accessed ? new Date(insight.last_accessed) : new Date(insight.created_at);
        const daysSinceAccess = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.min(daysSinceAccess, 30); // Max 30 points for age
        
        // Low access bonus
        const accessCount = insight.access_count || 0;
        score += Math.max(0, 10 - accessCount); // Bonus for rarely seen
        
        // Context relevance (simple keyword match)
        if (focusContext) {
          const contextWords = focusContext.toLowerCase().split(/\s+/);
          const insightText = `${insight.title} ${insight.content}`.toLowerCase();
          const matches = contextWords.filter(w => w.length > 4 && insightText.includes(w)).length;
          score += matches * 2;
        }
        
        // Add randomization for discovery (10-20%)
        score += Math.random() * 5;
        
        return { ...insight, score };
      });

      // Sort by score and take top 2
      scoredInsights.sort((a, b) => b.score - a.score);
      const topWisdom = scoredInsights.slice(0, 2).map(w => ({
        id: w.id,
        title: w.title,
        content: w.content,
        source: w.source,
        created_at: w.created_at,
        access_count: w.access_count || 0,
        relevance_reason: w.score > 15 ? "Relevant to your current focus" : undefined
      }));

      setWisdom(topWisdom);
    } catch (error) {
      console.error("Error fetching wisdom:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleViewWisdom = async (item: WisdomItem) => {
    setSelectedWisdom(item);
    
    // Track that user has seen this - update access count
    await supabase
      .from("insights")
      .update({ 
        access_count: (item.access_count || 0) + 1,
        last_accessed: new Date().toISOString()
      })
      .eq("id", item.id);
    
    setMarkedSeen(prev => new Set([...prev, item.id]));
  };

  const handleRefresh = () => {
    fetchWisdom(true);
  };

  const formatSource = (source: string | null) => {
    if (!source) return "Your captures";
    if (source.includes("youtube")) return "YouTube";
    if (source.includes("twitter") || source.includes("x.com")) return "X";
    if (source.includes("instagram")) return "Instagram";
    if (source.includes("voice")) return "Voice note";
    if (source === "manual") return "Manual entry";
    return source.split(":")[0] || source;
  };

  if (loading || wisdom.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="p-4 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 border-amber-200/50 dark:border-amber-800/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">Your Mind Said</span>
              <p className="text-[10px] text-muted-foreground">Wisdom you captured</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </Button>
        </div>

        <div className="space-y-2">
          {wisdom.map((item) => (
            <button
              key={item.id}
              onClick={() => handleViewWisdom(item)}
              className={cn(
                "w-full text-left p-3 rounded-lg transition-all",
                "bg-background/60 hover:bg-background/90",
                "border border-border/40 hover:border-border",
                markedSeen.has(item.id) && "opacity-70"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium line-clamp-1 flex items-center gap-1.5">
                    {item.title}
                    {markedSeen.has(item.id) && (
                      <Check className="h-3 w-3 text-success shrink-0" />
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {item.content?.substring(0, 100)}...
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatSource(item.source)}
                    </span>
                    {item.relevance_reason && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
                        <Sparkles className="h-2.5 w-2.5" />
                        Relevant now
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Full Wisdom Dialog */}
      <Dialog open={!!selectedWisdom} onOpenChange={() => setSelectedWisdom(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg pr-6 leading-snug">
              {selectedWisdom?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {selectedWisdom?.content}
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground">
                {formatSource(selectedWisdom?.source || null)}
              </span>
              <span className="text-xs text-muted-foreground">
                Seen {(selectedWisdom?.access_count || 0) + 1}x
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
