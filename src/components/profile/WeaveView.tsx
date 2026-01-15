import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link2, TrendingUp, Repeat, Brain, Target, Lightbulb, Beaker, AlertTriangle, Calendar, Zap, Wand2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WeaveVisualization } from "@/components/ui/weave-visualization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseFunctionInvokeError } from "@/lib/edgeFunctionError";

interface WeaveNode {
  id: string;
  type: "insight" | "action" | "experiment" | "identity" | "warning";
  title: string;
  date: string;
  pillar?: string;
  topic?: string;
  connection?: string;
}

interface WeavePattern {
  theme: string;
  description: string;
  strength: number;
  nodes: WeaveNode[];
  patternType: "connection" | "focus" | "imbalance" | "recurring" | "experiment-insight";
}

interface WeaveViewProps {
  insights: Array<{
    id: string;
    title: string;
    content: string;
    topic_id: string | null;
    created_at: string;
    topics: { name: string; color: string | null } | null;
  }>;
  actions: Array<{
    id: string;
    action_text: string;
    pillar: string | null;
    action_date: string;
  }>;
  experiments: Array<{
    id: string;
    title: string;
    status: string;
    identity_shift_target: string | null;
  }>;
  identitySeed: string;
}

const ALL_PILLARS = ["Business", "Body", "Mind", "Relationships", "Content", "Play"];

interface WeaveSynthesis {
  synthesis: string;
  coreThemes: string[];
  emergingDirection: string;
  hiddenConnections: string[];
  whatYourMindIsSaying: string;
  stats?: {
    insightsCount: number;
    documentsCount: number;
    experimentsCount: number;
    actionsCount: number;
    observationsCount: number;
    topicsCount: number;
  };
}

export function WeaveView({ insights, actions, experiments, identitySeed }: WeaveViewProps) {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [synthesis, setSynthesis] = useState<WeaveSynthesis | null>(null);
  const [showConnectionsDialog, setShowConnectionsDialog] = useState(false);

  const handleSynthesizeMind = async () => {
    setIsSynthesizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('weave-synthesis', {});
      
      if (error) {
        const parsed = parseFunctionInvokeError(error);
        toast.error(parsed.message || "Failed to synthesize");
        return;
      }
      
      if (data.error) {
        toast.error(data.error);
        return;
      }
      
      setSynthesis(data);
      setShowSynthesis(true);
    } catch (err) {
      console.error("Synthesis error:", err);
      toast.error("Failed to synthesize. Try again.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Extract identity keywords for pattern matching
  const identityKeywords = useMemo(() => {
    if (!identitySeed) return [];
    return identitySeed
      .toLowerCase()
      .split(/[\s,.\n]+/)
      .filter(w => w.length > 3)
      .slice(0, 30);
  }, [identitySeed]);

  // Find weave patterns - connections between different types
  const patterns = useMemo(() => {
    const foundPatterns: WeavePattern[] = [];
    
    // Pattern 1: Topics appearing across insights and actions (Learning → Doing)
    const topicActionMap = new Map<string, { insights: typeof insights; actions: typeof actions }>();
    
    insights.forEach(insight => {
      const topic = insight.topics?.name?.toLowerCase() || "";
      if (topic) {
        if (!topicActionMap.has(topic)) {
          topicActionMap.set(topic, { insights: [], actions: [] });
        }
        topicActionMap.get(topic)!.insights.push(insight);
      }
    });
    
    actions.forEach(action => {
      const actionWords = action.action_text.toLowerCase();
      topicActionMap.forEach((data, topic) => {
        if (actionWords.includes(topic) || topic.split(" ").some(w => w.length > 3 && actionWords.includes(w))) {
          data.actions.push(action);
        }
      });
    });
    
    // Create patterns from topics that span both insights and actions
    topicActionMap.forEach((data, topic) => {
      if (data.insights.length > 0 && data.actions.length > 0) {
        foundPatterns.push({
          theme: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Loop`,
          description: `${data.insights.length} insights → ${data.actions.length} actions taken`,
          strength: Math.min(100, (data.insights.length + data.actions.length) * 12),
          patternType: "connection",
          nodes: [
            ...data.insights.slice(0, 2).map(i => ({
              id: i.id,
              type: "insight" as const,
              title: i.title,
              date: i.created_at,
              topic: i.topics?.name
            })),
            ...data.actions.slice(0, 2).map(a => ({
              id: a.id,
              type: "action" as const,
              title: a.action_text,
              date: a.action_date,
              pillar: a.pillar || undefined
            }))
          ]
        });
      }
    });
    
    // Pattern 2: Experiment ↔ Insight connections
    experiments.forEach(exp => {
      const expWords = (exp.title + " " + (exp.identity_shift_target || "")).toLowerCase();
      
      // Find insights that relate to this experiment
      const relatedInsights = insights.filter(insight => {
        const insightWords = (insight.title + " " + insight.content).toLowerCase();
        const topicName = insight.topics?.name?.toLowerCase() || "";
        
        // Check for keyword overlap
        const expKeywords = expWords.split(/\s+/).filter(w => w.length > 3);
        return expKeywords.some(kw => insightWords.includes(kw) || topicName.includes(kw));
      });
      
      if (relatedInsights.length >= 2) {
        foundPatterns.push({
          theme: "Experiment Fuel",
          description: `"${exp.title}" is backed by ${relatedInsights.length} insights`,
          strength: Math.min(100, relatedInsights.length * 20 + 30),
          patternType: "experiment-insight",
          nodes: [
            {
              id: exp.id,
              type: "experiment" as const,
              title: exp.title,
              date: new Date().toISOString()
            },
            ...relatedInsights.slice(0, 3).map(i => ({
              id: i.id,
              type: "insight" as const,
              title: i.title,
              date: i.created_at
            }))
          ]
        });
      }
    });
    
    // Pattern 3: Identity alignment in experiments
    experiments.forEach(exp => {
      const expWords = (exp.title + " " + (exp.identity_shift_target || "")).toLowerCase();
      const matchedKeywords = identityKeywords.filter(kw => expWords.includes(kw));
      
      if (matchedKeywords.length >= 2) {
        foundPatterns.push({
          theme: "Identity Alignment",
          description: `"${exp.title}" reflects: ${matchedKeywords.slice(0, 3).join(", ")}`,
          strength: Math.min(100, matchedKeywords.length * 25),
          patternType: "connection",
          nodes: [{
            id: exp.id,
            type: "experiment",
            title: exp.title,
            date: new Date().toISOString(),
            connection: matchedKeywords.slice(0, 3).join(", ")
          }]
        });
      }
    });
    
    // Pattern 4: Pillar focus (dominant pillar)
    const pillarCounts: Record<string, number> = {};
    actions.forEach(a => {
      if (a.pillar) {
        pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      }
    });
    
    const sortedPillars = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1]);
    const dominantPillar = sortedPillars[0];
    
    if (dominantPillar && dominantPillar[1] >= 3) {
      foundPatterns.push({
        theme: `${dominantPillar[0]} Momentum`,
        description: `${dominantPillar[1]} actions this week—building traction`,
        strength: Math.min(100, dominantPillar[1] * 18),
        patternType: "focus",
        nodes: actions
          .filter(a => a.pillar === dominantPillar[0])
          .slice(0, 3)
          .map(a => ({
            id: a.id,
            type: "action" as const,
            title: a.action_text,
            date: a.action_date,
            pillar: a.pillar || undefined
          }))
      });
    }
    
    // Pattern 5: Pillar Imbalance Detection
    const activePillars = Object.keys(pillarCounts);
    const missingPillars = ALL_PILLARS.filter(p => !activePillars.includes(p));
    const totalActions = actions.length;
    
    // Only show imbalance if user has meaningful action history
    if (totalActions >= 5 && missingPillars.length >= 2) {
      foundPatterns.push({
        theme: "Pillar Gap",
        description: `${missingPillars.slice(0, 3).join(", ")} need attention`,
        strength: Math.min(80, missingPillars.length * 15),
        patternType: "imbalance",
        nodes: missingPillars.slice(0, 3).map((pillar, idx) => ({
          id: `missing-${pillar}`,
          type: "warning" as const,
          title: pillar,
          date: new Date().toISOString()
        }))
      });
    }
    
    // Pattern 6: Recurring Weekly Themes (topics appearing in multiple weeks)
    const weeklyTopics = new Map<string, Set<string>>();
    
    insights.forEach(insight => {
      const topic = insight.topics?.name;
      if (!topic) return;
      
      const weekKey = getWeekKey(new Date(insight.created_at));
      if (!weeklyTopics.has(topic)) {
        weeklyTopics.set(topic, new Set());
      }
      weeklyTopics.get(topic)!.add(weekKey);
    });
    
    // Find topics that appear in 2+ weeks
    const recurringTopics = Array.from(weeklyTopics.entries())
      .filter(([_, weeks]) => weeks.size >= 2)
      .sort((a, b) => b[1].size - a[1].size);
    
    if (recurringTopics.length > 0) {
      const [topTopic, weeks] = recurringTopics[0];
      const topicInsights = insights.filter(i => i.topics?.name === topTopic);
      
      foundPatterns.push({
        theme: "Recurring Theme",
        description: `"${topTopic}" spans ${weeks.size} weeks—a core thread`,
        strength: Math.min(100, weeks.size * 25 + topicInsights.length * 5),
        patternType: "recurring",
        nodes: topicInsights.slice(0, 3).map(i => ({
          id: i.id,
          type: "insight" as const,
          title: i.title,
          date: i.created_at,
          topic: i.topics?.name
        }))
      });
    }
    
    // Pattern 7: Action variety within dominant pillar
    if (dominantPillar && dominantPillar[1] >= 4) {
      const pillarActions = actions.filter(a => a.pillar === dominantPillar[0]);
      const uniqueActionTypes = new Set(pillarActions.map(a => 
        a.action_text.toLowerCase().split(" ").slice(0, 2).join(" ")
      ));
      
      if (uniqueActionTypes.size >= 3) {
        foundPatterns.push({
          theme: "Deep Practice",
          description: `${uniqueActionTypes.size} different approaches in ${dominantPillar[0]}`,
          strength: Math.min(90, uniqueActionTypes.size * 20),
          patternType: "focus",
          nodes: pillarActions.slice(0, 4).map(a => ({
            id: a.id,
            type: "action" as const,
            title: a.action_text,
            date: a.action_date,
            pillar: a.pillar || undefined
          }))
        });
      }
    }
    
    // Deduplicate similar patterns (keep highest strength)
    const deduped: WeavePattern[] = [];
    const seenThemes = new Set<string>();
    
    foundPatterns
      .sort((a, b) => b.strength - a.strength)
      .forEach(p => {
        const key = p.theme.toLowerCase().replace(/\s+/g, "");
        if (!seenThemes.has(key)) {
          seenThemes.add(key);
          deduped.push(p);
        }
      });
    
    return deduped.slice(0, 6);
  }, [insights, actions, experiments, identityKeywords]);

  // Calculate overall weave score
  const weaveScore = useMemo(() => {
    if (patterns.length === 0) return 0;
    
    // Weight by pattern type
    const weightedSum = patterns.reduce((sum, p) => {
      const typeWeight = p.patternType === "imbalance" ? 0.5 : 1;
      return sum + (p.strength * typeWeight);
    }, 0);
    
    const avgStrength = weightedSum / patterns.length;
    const diversityBonus = Math.min(25, patterns.length * 8);
    const connectionBonus = patterns.filter(p => 
      p.patternType === "connection" || p.patternType === "experiment-insight"
    ).length * 5;
    
    return Math.min(100, Math.round(avgStrength * 0.6 + diversityBonus + connectionBonus));
  }, [patterns]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "insight": return <Lightbulb className="h-3 w-3" />;
      case "action": return <Target className="h-3 w-3" />;
      case "experiment": return <Beaker className="h-3 w-3" />;
      case "warning": return <AlertTriangle className="h-3 w-3" />;
      default: return <Brain className="h-3 w-3" />;
    }
  };

  const getPatternIcon = (patternType: string) => {
    switch (patternType) {
      case "connection": return <Link2 className="h-3.5 w-3.5" />;
      case "focus": return <Target className="h-3.5 w-3.5" />;
      case "imbalance": return <AlertTriangle className="h-3.5 w-3.5" />;
      case "recurring": return <Calendar className="h-3.5 w-3.5" />;
      case "experiment-insight": return <Zap className="h-3.5 w-3.5" />;
      default: return <Repeat className="h-3.5 w-3.5" />;
    }
  };

  if (patterns.length === 0) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="relative w-16 h-16 mx-auto">
          <motion.div 
            className="absolute inset-0 rounded-full border-2 border-dashed border-muted-foreground/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-3 rounded-full bg-muted/30 flex items-center justify-center">
            <Link2 className="h-5 w-5 text-muted-foreground/40" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">No patterns woven yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Capture insights, complete actions, and run experiments.<br/>
            Weave will find the connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Weave Visualization - Interactive */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border border-primary/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Your Weave
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {weaveScore < 30 && "Keep capturing thoughts and taking action. Connections will emerge."}
              {weaveScore >= 30 && weaveScore < 60 && "Patterns are forming between what you learn and do."}
              {weaveScore >= 60 && weaveScore < 80 && "Strong threads connecting your insights to your actions."}
              {weaveScore >= 80 && "Deeply woven. You're living your identity."}
            </p>
          </div>
          <WeaveVisualization 
            score={weaveScore} 
            size="md" 
            interactive={patterns.length > 0}
            onClick={() => patterns.length > 0 && setShowConnectionsDialog(true)}
          />
        </div>
      </div>

      {/* Connections Dialog */}
      <Dialog open={showConnectionsDialog} onOpenChange={setShowConnectionsDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[360px] max-h-[80vh] overflow-y-auto mx-auto p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary shrink-0" />
              What's Connected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            {patterns.slice(0, 5).map((pattern, idx) => (
              <div 
                key={idx}
                className={`p-2.5 rounded-lg border ${
                  pattern.patternType === "imbalance" 
                    ? "bg-destructive/5 border-destructive/20" 
                    : "bg-muted/30 border-border/40"
                }`}
              >
                <div className="flex items-start gap-2 mb-1">
                  <span className={`shrink-0 mt-0.5 ${pattern.patternType === "imbalance" ? "text-destructive" : "text-primary"}`}>
                    {getPatternIcon(pattern.patternType)}
                  </span>
                  <p className="text-sm font-medium leading-tight line-clamp-2">{pattern.theme}</p>
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5 ml-5 line-clamp-2">{pattern.description}</p>
                
                {/* Show actual nodes - compact */}
                <div className="space-y-0.5 ml-5">
                  {pattern.nodes.slice(0, 3).map((node) => (
                    <div 
                      key={node.id}
                      className="flex items-center gap-1.5 text-[11px] min-w-0"
                    >
                      <span className={`shrink-0 ${
                        node.type === "insight" ? "text-amber-500" :
                        node.type === "action" ? "text-emerald-500" :
                        node.type === "experiment" ? "text-blue-500" :
                        "text-muted-foreground"
                      }`}>
                        {getNodeIcon(node.type)}
                      </span>
                      <span className="text-foreground/70 truncate">{node.title.length > 35 ? node.title.slice(0, 35) + '…' : node.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {patterns.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No connections found yet. Keep building!
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* Dynamic Insight based on patterns */}
      <div className="p-3 rounded-lg border border-dashed border-primary/20 bg-primary/5">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Weave insight:</span>{" "}
            {generateInsight(patterns)}
          </p>
        </div>
      </div>

      {/* Synthesize My Mind Button */}
      <Button
        onClick={handleSynthesizeMind}
        disabled={isSynthesizing}
        variant="outline"
        className="w-full gap-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50 text-foreground"
      >
        {isSynthesizing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Weaving your mind...
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            Synthesize My Mind
          </>
        )}
      </Button>

      {/* Synthesis Dialog */}
      <Dialog open={showSynthesis} onOpenChange={setShowSynthesis}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Your Mind, Woven
            </DialogTitle>
          </DialogHeader>
          
          {synthesis && (
            <div className="space-y-5 pt-2">
              {/* Stats */}
              {synthesis.stats && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-muted/50">{synthesis.stats.insightsCount} insights</span>
                  <span className="px-2 py-1 rounded-full bg-muted/50">{synthesis.stats.documentsCount} docs</span>
                  <span className="px-2 py-1 rounded-full bg-muted/50">{synthesis.stats.experimentsCount} experiments</span>
                  <span className="px-2 py-1 rounded-full bg-muted/50">{synthesis.stats.actionsCount} actions</span>
                  {(synthesis.stats as any).learningPathsCount > 0 && (
                    <span className="px-2 py-1 rounded-full bg-muted/50">{(synthesis.stats as any).learningPathsCount} paths</span>
                  )}
                  <span className="px-2 py-1 rounded-full bg-muted/50">{synthesis.stats.observationsCount} observations</span>
                </div>
              )}

              {/* What Your Mind Is Saying */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">If your mind could speak</p>
                <p className="text-lg font-medium text-foreground italic">"{synthesis.whatYourMindIsSaying}"</p>
              </div>

              {/* Core Themes */}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Core Themes</p>
                <div className="flex flex-wrap gap-2">
                  {synthesis.coreThemes.map((theme, idx) => (
                    <span key={idx} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {theme}
                    </span>
                  ))}
                </div>
              </div>

              {/* Emerging Direction */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                <ArrowRight className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Direction</p>
                  <p className="text-sm text-foreground">{synthesis.emergingDirection}</p>
                </div>
              </div>

              {/* Synthesis */}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">The Weave</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{synthesis.synthesis}</p>
              </div>

              {/* Hidden Connections */}
              {synthesis.hiddenConnections.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Hidden Connections</p>
                  <div className="space-y-2">
                    {synthesis.hiddenConnections.map((connection, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Link2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                        <span className="text-muted-foreground">{connection}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: Get week key for grouping
function getWeekKey(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber}`;
}

// Helper: Generate contextual insight
function generateInsight(patterns: WeavePattern[]): string {
  const hasImbalance = patterns.some(p => p.patternType === "imbalance");
  const hasExperimentInsight = patterns.some(p => p.patternType === "experiment-insight");
  const hasRecurring = patterns.some(p => p.patternType === "recurring");
  const connectionCount = patterns.filter(p => p.patternType === "connection").length;
  
  if (hasImbalance && patterns.length <= 2) {
    return "Some pillars are quiet. Small actions there could unlock new patterns.";
  }
  
  if (hasExperimentInsight && hasRecurring) {
    return "Your experiments are connected to recurring themes. This is compound growth.";
  }
  
  if (hasRecurring && connectionCount >= 2) {
    return "Core themes are emerging across weeks. You're building real depth.";
  }
  
  if (connectionCount >= 2) {
    return "Multiple loops are active: learning → doing → learning. The system is working.";
  }
  
  if (patterns.length === 1) {
    return "One pattern is emerging. Keep building on it—more connections will form.";
  }
  
  if (patterns.length >= 4) {
    return "Rich pattern density. Your actions, insights, and experiments are weaving together.";
  }
  
  return "Patterns are forming. Each action and insight strengthens the weave.";
}