import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";

interface PatternData {
  pattern: string;
  count: number;
  lastSeen: string;
  observation: string;
}

// Direct, non-therapy observations - just reflecting what the data shows
const PATTERN_OBSERVATIONS: Record<string, string[]> = {
  anxious: [
    "You've logged anxiety {count} times in the past two weeks.",
    "Anxiety has been showing up. Not good or bad—just noticing.",
    "The data shows anxiety recurring. That's the pattern right now.",
  ],
  comparing: [
    "You've been in comparison mode {count} times recently.",
    "Looking sideways has been a theme lately.",
    "Comparison keeps appearing in your logs.",
  ],
  "people-pleasing": [
    "People-pleasing has come up {count} times.",
    "You've been losing yourself to others' expectations.",
    "The pattern: accommodating at your own cost.",
  ],
  shrinking: [
    "Playing small has been logged {count} times.",
    "You keep noticing yourself shrinking.",
    "The data shows a pattern of making yourself smaller.",
  ],
  spending: [
    "Spending to fill a void has appeared {count} times.",
    "You've been reaching for purchases lately.",
    "Buying to feel something—that's been the pattern.",
  ],
  waiting: [
    "Waiting mode has shown up {count} times.",
    "You've been noticing yourself in 'wait' mode.",
    "The pattern: expecting conditions instead of creating them.",
  ],
  scattered: [
    "Scattered has been logged {count} times recently.",
    "Too many directions at once—that's what the data shows.",
  ],
  stuck: [
    "Stuck has appeared {count} times in your logs.",
    "Overthinking the start—that's been the theme.",
  ],
  overloaded: [
    "Overload has shown up {count} times.",
    "Too much input, not enough output—that's the pattern.",
  ],
};

// Multi-pattern observations
const MULTI_PATTERN_OBSERVATIONS = [
  "You've been cycling through a few states: {patterns}. Just noticing.",
  "The data shows movement between {patterns}. No judgment.",
  "Patterns this period: {patterns}.",
];

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
        .select("emotional_state, created_at")
        .eq("user_id", user.id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .order("created_at", { ascending: false });

      if (!logs || logs.length === 0) {
        setLoading(false);
        return;
      }

      // Count occurrences of each emotional state
      const stateCounts: Record<string, { count: number; lastSeen: string }> = {};
      
      for (const log of logs) {
        if (log.emotional_state) {
          if (!stateCounts[log.emotional_state]) {
            stateCounts[log.emotional_state] = { count: 0, lastSeen: log.created_at };
          }
          stateCounts[log.emotional_state].count++;
        }
      }

      // Find patterns (states that occurred 2+ times)
      const detectedPatterns: PatternData[] = [];
      
      for (const [state, data] of Object.entries(stateCounts)) {
        if (data.count >= 2) {
          const observations = PATTERN_OBSERVATIONS[state];
          if (observations) {
            const observation = observations[Math.floor(Math.random() * observations.length)]
              .replace("{count}", data.count.toString());
            
            detectedPatterns.push({
              pattern: state,
              count: data.count,
              lastSeen: data.lastSeen,
              observation,
            });
          }
        }
      }

      // Sort by count descending
      detectedPatterns.sort((a, b) => b.count - a.count);
      
      setPatterns(detectedPatterns.slice(0, 3)); // Max 3 patterns
    } catch (error) {
      console.error("Error detecting patterns:", error);
    } finally {
      setLoading(false);
    }
  };

  // Check if already dismissed today
  useEffect(() => {
    if (user) {
      const dismissKey = `pattern_mirror_dismissed_${user.id}`;
      const lastDismissed = localStorage.getItem(dismissKey);
      const today = new Date().toISOString().split('T')[0];
      
      if (lastDismissed === today) {
        setDismissed(true);
      }
    }
  }, [user]);

  const handleDismiss = () => {
    if (user) {
      const dismissKey = `pattern_mirror_dismissed_${user.id}`;
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(dismissKey, today);
    }
    setDismissed(true);
  };

  if (loading || dismissed || patterns.length === 0) {
    return null;
  }

  // Generate the display message
  let displayMessage: string;
  
  if (patterns.length === 1) {
    displayMessage = patterns[0].observation;
  } else {
    // Multiple patterns
    const patternNames = patterns.map(p => p.pattern.replace("-", " ")).join(", ");
    const template = MULTI_PATTERN_OBSERVATIONS[Math.floor(Math.random() * MULTI_PATTERN_OBSERVATIONS.length)];
    displayMessage = template.replace("{patterns}", patternNames);
  }

  return (
    <Card className="border-muted bg-muted/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Pattern Noticed
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              {displayMessage}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
