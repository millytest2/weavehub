import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, X, Check } from "lucide-react";

interface PatternData {
  pattern: string;
  count: number;
  lastSeen: string;
  resonatedCount: number;
  totalLogs: number;
}

export function PatternMirror() {
  const { user } = useAuth();
  const [patterns, setPatterns] = useState<PatternData[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      detectPatterns();
    }
  }, [user]);

  const detectPatterns = async () => {
    if (!user) return;

    try {
      // Get grounding logs from last 14 days
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const { data: logs } = await supabase
        .from("grounding_log")
        .select("emotional_state, created_at, resonated")
        .eq("user_id", user.id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .order("created_at", { ascending: false });

      if (!logs || logs.length === 0) {
        setLoading(false);
        return;
      }

      // Count occurrences and resonance of each emotional state
      const stateCounts: Record<string, { count: number; lastSeen: string; resonatedCount: number }> = {};
      
      for (const log of logs) {
        if (log.emotional_state) {
          if (!stateCounts[log.emotional_state]) {
            stateCounts[log.emotional_state] = { count: 0, lastSeen: log.created_at, resonatedCount: 0 };
          }
          stateCounts[log.emotional_state].count++;
          if (log.resonated) {
            stateCounts[log.emotional_state].resonatedCount++;
          }
        }
      }

      // Find patterns (states that occurred 2+ times)
      const detectedPatterns: PatternData[] = [];
      
      for (const [state, data] of Object.entries(stateCounts)) {
        if (data.count >= 2) {
          detectedPatterns.push({
            pattern: state,
            count: data.count,
            lastSeen: data.lastSeen,
            resonatedCount: data.resonatedCount,
            totalLogs: logs.length,
          });
        }
      }

      // Sort by count descending
      detectedPatterns.sort((a, b) => b.count - a.count);
      setPatterns(detectedPatterns.slice(0, 3));
    } catch (error) {
      console.error("Error detecting patterns:", error);
    } finally {
      setLoading(false);
    }
  };

  // Check if already dismissed today - use stable hash
  const dismissKey = useMemo(() => {
    if (!user) return null;
    const today = new Date().toISOString().split('T')[0];
    return `pattern_mirror_${user.id}_${today}`;
  }, [user]);

  useEffect(() => {
    if (dismissKey) {
      const wasDismissed = localStorage.getItem(dismissKey) === 'true';
      setDismissed(wasDismissed);
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    if (dismissKey) {
      localStorage.setItem(dismissKey, 'true');
    }
    setDismissed(true);
  };

  // Format pattern name for display
  const formatPattern = (pattern: string) => {
    return pattern.replace(/-/g, ' ');
  };

  // Calculate what percentage of logs resulted in resonance
  const getResonanceRate = (pattern: PatternData) => {
    if (pattern.count === 0) return 0;
    return Math.round((pattern.resonatedCount / pattern.count) * 100);
  };

  if (loading || dismissed || patterns.length === 0) {
    return null;
  }

  const topPattern = patterns[0];

  return (
    <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/30">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Main pattern indicator */}
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground capitalize">{formatPattern(topPattern.pattern)}</span>
            {" "}logged {topPattern.count}× in 2 weeks
          </span>
          
          {/* Resonance indicator if any */}
          {topPattern.resonatedCount > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <Check className="h-3 w-3" />
              {getResonanceRate(topPattern)}% helped
            </span>
          )}
          
          {/* Other patterns hint */}
          {patterns.length > 1 && (
            <span className="text-muted-foreground/60">
              +{patterns.slice(1).map(p => formatPattern(p.pattern)).join(", ")}
            </span>
          )}
        </div>
      </div>
      
      <button
        onClick={handleDismiss}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
