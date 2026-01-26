import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, RefreshCw, Link2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WeaveVisualization } from "@/components/ui/weave-visualization";

interface EmergingContent {
  type: "connection" | "pattern" | "thread";
  title: string;
  content: string;
  connectedItems?: { title: string; type: string }[];
  timestamp: number;
}

interface WhatsEmergingProps {
  userId: string;
}

const CACHE_KEY = "weave_emerging_v2";
const CACHE_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export const WhatsEmerging = ({ userId }: WhatsEmergingProps) => {
  const [emerging, setEmerging] = useState<EmergingContent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Create stable cache key based on userId
  const cacheKey = useMemo(() => `${CACHE_KEY}_${userId}`, [userId]);

  useEffect(() => {
    loadEmerging();
  }, [userId, cacheKey]);

  const loadEmerging = async () => {
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          setEmerging(parsed);
          setIsVisible(true);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }
    }

    // Fetch fresh data
    await generateEmerging();
  };

  const generateEmerging = async () => {
    setIsLoading(true);
    
    try {
      // Fetch user's data in parallel - focusing on finding real connections
      const [insightsRes, actionsRes, experimentsRes, identityRes, topicsRes] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, source, topic_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("action_history")
          .select("action_text, pillar, why_it_mattered, action_date")
          .eq("user_id", userId)
          .order("action_date", { ascending: false })
          .limit(20),
        supabase
          .from("experiments")
          .select("title, hypothesis, status, identity_shift_target")
          .eq("user_id", userId)
          .limit(8),
        supabase
          .from("identity_seeds")
          .select("content, core_values, year_note, weekly_focus")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("topics")
          .select("id, name")
          .eq("user_id", userId)
      ]);

      const insights = insightsRes.data || [];
      const actions = actionsRes.data || [];
      const experiments = experimentsRes.data || [];
      const identity = identityRes.data;
      const topicsMap = new Map(topicsRes.data?.map(t => [t.id, t.name]) || []);

      const totalContent = insights.length + actions.length + experiments.length;

      if (totalContent < 3) {
        setIsLoading(false);
        return; // Not enough data for meaningful emergence
      }

      let content: EmergingContent | null = null;

      // Strategy 1: Find topic-based connections between insights
      const topicGroups = new Map<string, typeof insights>();
      for (const insight of insights) {
        if (insight.topic_id) {
          const topicName = topicsMap.get(insight.topic_id);
          if (topicName) {
            if (!topicGroups.has(topicName)) {
              topicGroups.set(topicName, []);
            }
            topicGroups.get(topicName)!.push(insight);
          }
        }
      }

      // Find a topic with 3+ insights - that's a thread forming
      for (const [topic, topicInsights] of topicGroups) {
        if (topicInsights.length >= 3) {
          content = {
            type: "thread",
            title: `${topic} thread forming`,
            content: `${topicInsights.length} ideas weaving together around ${topic.toLowerCase()}`,
            connectedItems: topicInsights.slice(0, 3).map(i => ({ 
              title: i.title.length > 40 ? i.title.substring(0, 40) + "..." : i.title, 
              type: "insight" 
            })),
            timestamp: Date.now()
          };
          break;
        }
      }

      // Strategy 2: Find keyword connections between recent insights
      if (!content && insights.length >= 4) {
        const recentFour = insights.slice(0, 4);
        const wordFrequency = new Map<string, { count: number; sources: string[] }>();
        
        for (const insight of recentFour) {
          const text = `${insight.title} ${insight.content || ""}`.toLowerCase();
          const words = text.split(/\s+/).filter(w => w.length > 5);
          const uniqueWords = [...new Set(words)];
          
          for (const word of uniqueWords) {
            if (!wordFrequency.has(word)) {
              wordFrequency.set(word, { count: 0, sources: [] });
            }
            const entry = wordFrequency.get(word)!;
            entry.count++;
            if (!entry.sources.includes(insight.title)) {
              entry.sources.push(insight.title);
            }
          }
        }

        // Find words appearing in 2+ insights
        for (const [word, data] of wordFrequency) {
          if (data.count >= 2 && data.sources.length >= 2) {
            content = {
              type: "connection",
              title: `"${word}" appearing across your captures`,
              content: `This thread connects ${data.sources.length} recent insights`,
              connectedItems: data.sources.slice(0, 2).map(s => ({ 
                title: s.length > 35 ? s.substring(0, 35) + "..." : s, 
                type: "insight" 
              })),
              timestamp: Date.now()
            };
            break;
          }
        }
      }

      // Strategy 3: Connect experiment to actions
      if (!content && experiments.length > 0 && actions.length >= 3) {
        const activeExp = experiments.find(e => e.status === "active");
        if (activeExp) {
          const relatedActions = actions.filter(a => 
            a.action_text?.toLowerCase().includes(activeExp.title.toLowerCase().split(" ")[0])
          );
          if (relatedActions.length >= 1) {
            content = {
              type: "pattern",
              title: "Experiment in motion",
              content: `"${activeExp.title}" + ${relatedActions.length} aligned action${relatedActions.length > 1 ? 's' : ''}`,
              connectedItems: [
                { title: activeExp.title, type: "experiment" },
                ...relatedActions.slice(0, 2).map(a => ({ 
                  title: a.action_text?.substring(0, 30) || "Action", 
                  type: "action" 
                }))
              ],
              timestamp: Date.now()
            };
          }
        }
      }

      // Strategy 4: Identity + Actions alignment
      if (!content && identity && actions.length >= 3) {
        const identityWords = (identity.content || "").toLowerCase().split(/\s+/).filter(w => w.length > 5);
        const actionMatches = actions.filter(a => {
          const actionText = (a.action_text || "").toLowerCase();
          return identityWords.some(w => actionText.includes(w));
        });
        
        if (actionMatches.length >= 2) {
          content = {
            type: "pattern",
            title: "Actions aligning with identity",
            content: `${actionMatches.length} recent actions reflect who you're becoming`,
            timestamp: Date.now()
          };
        }
      }

      if (content) {
        localStorage.setItem(cacheKey, JSON.stringify(content));
        setEmerging(content);
        setIsVisible(true);
      }
    } catch (error) {
      console.error("Error generating emerging content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleRefresh = () => {
    localStorage.removeItem(cacheKey);
    generateEmerging();
  };

  if (!isVisible || isLoading || !emerging) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 via-accent/5 to-background border border-primary/10 p-4 mb-4"
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-start gap-4">
          {/* Visual weave */}
          <div className="flex-shrink-0 w-[60px] h-[60px]">
            <WeaveVisualization score={50} size="sm" animated={true} showLabel={false} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 mb-1">
              {emerging.type === "connection" && <Link2 className="h-3 w-3 text-primary" />}
              {emerging.type === "thread" && <ArrowRight className="h-3 w-3 text-primary" />}
              {emerging.type === "pattern" && <Sparkles className="h-3 w-3 text-primary" />}
              <p className="text-[10px] uppercase tracking-wider text-primary font-medium">
                {emerging.type === "connection" && "Connection found"}
                {emerging.type === "pattern" && "Pattern emerging"}
                {emerging.type === "thread" && "Thread forming"}
              </p>
            </div>
            
            <p className="text-sm font-medium text-foreground leading-snug mb-1">
              {emerging.title}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {emerging.content}
            </p>
            
            {/* Connected items preview */}
            {emerging.connectedItems && emerging.connectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {emerging.connectedItems.map((item, i) => (
                  <span 
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground"
                  >
                    {item.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Subtle refresh option */}
        <button
          onClick={handleRefresh}
          className="absolute bottom-3 right-3 p-1.5 rounded-lg text-muted-foreground/30 hover:text-muted-foreground/60 transition-all"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
