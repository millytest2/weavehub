import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WeaveVisualization } from "@/components/ui/weave-visualization";

interface EmergingContent {
  type: "connection" | "pattern" | "reflection" | "prompt";
  title: string;
  content: string;
  source?: string;
  timestamp: number;
}

interface WhatsEmergingProps {
  userId: string;
}

const CACHE_KEY = "weave_emerging";
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

// Prompts for new users or when no patterns found - philosophical, not onboarding-y
const NEW_USER_PROMPTS = [
  {
    title: "What keeps returning to your mind?",
    content: "The thoughts that won't leave you alone often point to what matters most."
  },
  {
    title: "What would you do if you trusted yourself?",
    content: "Most hesitation isn't about not knowing—it's about not trusting what you already know."
  },
  {
    title: "What's the thread running through everything?",
    content: "Your interests, frustrations, and ideas often share a hidden pattern."
  },
  {
    title: "What are you becoming?",
    content: "Not who you should be. Who you're already in the process of becoming."
  },
  {
    title: "What would you capture if you knew it mattered?",
    content: "The fleeting thought you almost dismissed might be the one that connects everything."
  },
];

export const WhatsEmerging = ({ userId }: WhatsEmergingProps) => {
  const [emerging, setEmerging] = useState<EmergingContent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    loadEmerging();
  }, [userId]);

  const loadEmerging = async () => {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          setEmerging(parsed);
          setHasData(parsed.type !== "prompt");
          setIsVisible(true);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    // Fetch fresh data
    await generateEmerging();
  };

  const generateEmerging = async () => {
    setIsLoading(true);
    
    try {
      // Fetch user's data in parallel
      const [insightsRes, actionsRes, experimentsRes, identityRes] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, source, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("action_history")
          .select("action_text, pillar, why_it_mattered, action_date")
          .eq("user_id", userId)
          .order("action_date", { ascending: false })
          .limit(15),
        supabase
          .from("experiments")
          .select("title, hypothesis, status")
          .eq("user_id", userId)
          .limit(5),
        supabase
          .from("identity_seeds")
          .select("content, core_values")
          .eq("user_id", userId)
          .maybeSingle()
      ]);

      const insights = insightsRes.data || [];
      const actions = actionsRes.data || [];
      const experiments = experimentsRes.data || [];
      const identity = identityRes.data;

      const totalContent = insights.length + actions.length + experiments.length;
      setHasData(totalContent > 0);

      let content: EmergingContent;

      if (totalContent === 0) {
        // New user - show a thought-provoking prompt
        const prompt = NEW_USER_PROMPTS[Math.floor(Math.random() * NEW_USER_PROMPTS.length)];
        content = {
          type: "prompt",
          title: prompt.title,
          content: prompt.content,
          timestamp: Date.now()
        };
      } else if (insights.length >= 2) {
        // Find a connection between recent insights
        const recentInsight = insights[0];
        const relatedInsight = insights.find((ins, i) => {
          if (i === 0) return false;
          // Look for word overlap
          const words1 = recentInsight.title.toLowerCase().split(/\s+/);
          const words2 = ins.title.toLowerCase().split(/\s+/);
          const overlap = words1.filter(w => w.length > 4 && words2.includes(w));
          return overlap.length > 0;
        });

        if (relatedInsight) {
          content = {
            type: "connection",
            title: "A thread is forming",
            content: `"${recentInsight.title}" connects to "${relatedInsight.title}"`,
            source: recentInsight.source || undefined,
            timestamp: Date.now()
          };
        } else {
          // Show a recent insight as a reflection
          content = {
            type: "reflection",
            title: "From your mind",
            content: recentInsight.title,
            source: recentInsight.source || undefined,
            timestamp: Date.now()
          };
        }
      } else if (actions.length >= 3) {
        // Find pattern in actions
        const pillarCounts: Record<string, number> = {};
        actions.forEach(a => {
          if (a.pillar) {
            pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
          }
        });
        const dominantPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];
        
        if (dominantPillar && dominantPillar[1] >= 2) {
          content = {
            type: "pattern",
            title: `${dominantPillar[0]} momentum`,
            content: `You've taken ${dominantPillar[1]} actions here recently. Something's building.`,
            timestamp: Date.now()
          };
        } else {
          const recentAction = actions[0];
          content = {
            type: "reflection",
            title: "You showed up",
            content: recentAction.action_text || "Recent action completed",
            timestamp: Date.now()
          };
        }
      } else if (identity) {
        // Reflect identity back
        content = {
          type: "reflection",
          title: "Who you're becoming",
          content: identity.content.substring(0, 150) + (identity.content.length > 150 ? "..." : ""),
          timestamp: Date.now()
        };
      } else {
        // Fallback to prompt
        const prompt = NEW_USER_PROMPTS[Math.floor(Math.random() * NEW_USER_PROMPTS.length)];
        content = {
          type: "prompt",
          title: prompt.title,
          content: prompt.content,
          timestamp: Date.now()
        };
      }

      // Cache it
      localStorage.setItem(CACHE_KEY, JSON.stringify(content));
      setEmerging(content);
      setIsVisible(true);
    } catch (error) {
      console.error("Error generating emerging content:", error);
      // Show a prompt as fallback
      const prompt = NEW_USER_PROMPTS[0];
      setEmerging({
        type: "prompt",
        title: prompt.title,
        content: prompt.content,
        timestamp: Date.now()
      });
      setIsVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleRefresh = () => {
    localStorage.removeItem(CACHE_KEY);
    generateEmerging();
  };

  if (!isVisible || isLoading) return null;

  return (
    <AnimatePresence>
      {emerging && (
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
            {/* Visual weave for users with data, sparkle for new users */}
            <div className="flex-shrink-0">
              {hasData ? (
                <WeaveVisualization score={Math.min(80, 30 + Math.random() * 30)} size="sm" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-6">
              <p className="text-[10px] uppercase tracking-wider text-primary font-medium mb-1">
                {emerging.type === "connection" && "What's weaving"}
                {emerging.type === "pattern" && "Pattern emerging"}
                {emerging.type === "reflection" && "Mirror"}
                {emerging.type === "prompt" && "Reflection"}
              </p>
              <p className="text-sm font-medium text-foreground leading-snug mb-1">
                {emerging.title}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {emerging.content}
              </p>
              {emerging.source && (
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  via {emerging.source}
                </p>
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
      )}
    </AnimatePresence>
  );
};
