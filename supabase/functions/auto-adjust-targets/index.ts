import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PillarStats {
  pillar: string;
  target: number;
  completed: number;
  completionRate: number;
  trend: "up" | "down" | "stable";
}

// Min/max bounds for targets
const TARGET_BOUNDS = {
  min: 1,
  max: 12,
};

// Thresholds for adjustment
const THRESHOLDS = {
  crushing: 0.85, // Raise target if hitting 85%+
  dominating: 1.0, // Hit or exceeded target
  struggling: 0.6, // Lower target if under 60%
  severe: 0.4, // Significant reduction if under 40%
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Auto-adjusting pillar targets for user: ${user.id}`);

    // Get current targets
    const { data: currentTargets } = await supabase
      .from("weekly_pillar_targets")
      .select("*")
      .eq("user_id", user.id);

    // Get identity seed for 2026 direction alignment
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("year_note, content, core_values, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get last 3 weeks of action history for better trend analysis
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    
    const { data: recentActions } = await supabase
      .from("action_history")
      .select("pillar, action_date, action_text")
      .eq("user_id", user.id)
      .gte("action_date", threeWeeksAgo.toISOString().split('T')[0]);

    // Calculate completion stats per pillar with weekly breakdown
    const pillarMap: Record<string, string> = {
      'connection': 'relationship',
      'skill': 'mind',
      'learning': 'mind',
      'presence': 'mind',
      'stability': 'business',
      'admin': 'business',
      'health': 'body',
    };

    const pillars = ['business', 'body', 'content', 'relationship', 'mind', 'play'];
    
    // Weekly completions: [3 weeks ago, 2 weeks ago, last week, this week]
    const weeklyCompletions: Record<string, number[]> = {};
    pillars.forEach(p => weeklyCompletions[p] = [0, 0, 0, 0]);

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    (recentActions || []).forEach(a => {
      const p = (a.pillar || '').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      if (pillars.includes(normalizedPillar)) {
        const actionDate = new Date(a.action_date);
        if (actionDate >= oneWeekAgo) {
          weeklyCompletions[normalizedPillar][3]++; // This week
        } else if (actionDate >= twoWeeksAgo) {
          weeklyCompletions[normalizedPillar][2]++; // Last week
        } else {
          weeklyCompletions[normalizedPillar][1]++; // 2 weeks ago
        }
      }
    });

    // Build target map
    const targetMap: Record<string, number> = {};
    (currentTargets || []).forEach(t => {
      targetMap[t.pillar] = t.weekly_target;
    });

    // Calculate adjustments with improved logic
    const adjustments: { pillar: string; oldTarget: number; newTarget: number; reason: string }[] = [];
    const pillarStats: PillarStats[] = [];

    pillars.forEach(pillar => {
      const currentTarget = targetMap[pillar] || 3;
      const thisWeekCompleted = weeklyCompletions[pillar][3];
      const lastWeekCompleted = weeklyCompletions[pillar][2];
      const twoWeeksCompleted = weeklyCompletions[pillar][1];
      
      // Calculate weighted average (recent weeks matter more)
      const weightedAvg = (thisWeekCompleted * 3 + lastWeekCompleted * 2 + twoWeeksCompleted * 1) / 6;
      const completionRate = currentTarget > 0 ? weightedAvg / currentTarget : 0;
      
      // Trend analysis
      const recentTrend = thisWeekCompleted - lastWeekCompleted;
      const trend: "up" | "down" | "stable" = recentTrend > 1 ? "up" : recentTrend < -1 ? "down" : "stable";

      pillarStats.push({
        pillar,
        target: currentTarget,
        completed: thisWeekCompleted,
        completionRate: Math.round(completionRate * 100),
        trend,
      });

      let newTarget = currentTarget;
      let reason = "";

      // DOMINATING: Hitting or exceeding target consistently (2+ weeks at 100%+)
      if (thisWeekCompleted >= currentTarget && lastWeekCompleted >= currentTarget * 0.85) {
        newTarget = Math.min(currentTarget + 2, TARGET_BOUNDS.max);
        reason = `Dominating! ${thisWeekCompleted}/${currentTarget} this week, ${lastWeekCompleted} last week → raising to ${newTarget}`;
      }
      // CRUSHING IT: 85%+ completion with upward trend
      else if (completionRate >= THRESHOLDS.crushing && trend !== "down") {
        newTarget = Math.min(currentTarget + 1, TARGET_BOUNDS.max);
        reason = `Crushing it at ${Math.round(completionRate * 100)}% → raising to ${newTarget}`;
      }
      // SEVERE STRUGGLE: Under 40% for multiple weeks
      else if (completionRate < THRESHOLDS.severe && currentTarget > TARGET_BOUNDS.min) {
        newTarget = Math.max(currentTarget - 2, TARGET_BOUNDS.min);
        reason = `${Math.round(completionRate * 100)}% completion → reducing to ${newTarget} for momentum`;
      }
      // STRUGGLING: Under 60% completion consistently
      else if (completionRate < THRESHOLDS.struggling && currentTarget > TARGET_BOUNDS.min && trend !== "up") {
        newTarget = Math.max(currentTarget - 1, TARGET_BOUNDS.min);
        reason = `${Math.round(completionRate * 100)}% completion → adjusting to ${newTarget}`;
      }
      // PLATEAU at low completion but trending up - encourage the momentum
      else if (completionRate < THRESHOLDS.struggling && trend === "up" && thisWeekCompleted > lastWeekCompleted + 1) {
        // Don't adjust - they're improving
        reason = "";
      }

      if (newTarget !== currentTarget && reason) {
        adjustments.push({
          pillar,
          oldTarget: currentTarget,
          newTarget,
          reason
        });
      }
    });

    // Apply adjustments
    for (const adj of adjustments) {
      const existing = currentTargets?.find(t => t.pillar === adj.pillar);
      if (existing) {
        await supabase
          .from("weekly_pillar_targets")
          .update({ 
            weekly_target: adj.newTarget,
            notes: adj.reason,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("weekly_pillar_targets")
          .insert({
            user_id: user.id,
            pillar: adj.pillar,
            weekly_target: adj.newTarget,
            priority: 3,
            notes: adj.reason
          });
      }
    }

    // Analyze what dominated this week and how it connects to 2026 Misogi
    const pillarActionCounts: Record<string, number> = {};
    (recentActions || []).filter(a => new Date(a.action_date) >= oneWeekAgo).forEach(a => {
      const p = (a.pillar || 'general').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      pillarActionCounts[normalizedPillar] = (pillarActionCounts[normalizedPillar] || 0) + 1;
    });
    
    const dominantPillar = Object.entries(pillarActionCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    // Check alignment with 2026 direction
    const yearNote = identityData?.year_note?.toLowerCase() || '';
    const misogiKeywords: Record<string, string[]> = {
      'business': ['income', 'revenue', 'money', '$', 'job', 'career', 'business', 'work'],
      'content': ['post', 'content', 'video', 'audience', 'creator', 'brand', 'write', 'create'],
      'body': ['weight', 'gym', 'health', 'fitness', 'run', 'body', 'train', 'strength'],
      'mind': ['learn', 'skill', 'study', 'growth', 'develop', 'read', 'practice'],
      'relationship': ['connect', 'community', 'relationship', 'social', 'network', 'people'],
      'play': ['fun', 'hobby', 'enjoy', 'play', 'relax', 'adventure'],
    };
    
    const misogiAligned = Object.entries(misogiKeywords)
      .filter(([_, keywords]) => keywords.some(kw => yearNote.includes(kw)))
      .map(([pillar]) => pillar);

    // Generate smarter summary
    let summary = "";
    if (adjustments.length === 0) {
      if (dominantPillar) {
        const [pillar, count] = dominantPillar;
        const aligned = misogiAligned.includes(pillar);
        summary = aligned 
          ? `Dominated ${pillar} (${count} actions) - directly moving your 2026 Misogi. Targets well-calibrated.`
          : `Strong in ${pillar} (${count} actions). Your targets match your current pace.`;
      } else {
        summary = "Targets are well-calibrated for your current rhythm.";
      }
    } else {
      const increases = adjustments.filter(a => a.newTarget > a.oldTarget);
      const decreases = adjustments.filter(a => a.newTarget < a.oldTarget);
      
      if (increases.length > 0 && decreases.length === 0) {
        const aligned = increases.some(a => misogiAligned.includes(a.pillar.toLowerCase()));
        const pillarNames = increases.map(a => a.pillar).join(", ");
        const increaseAmounts = increases.map(a => `${a.pillar}: ${a.oldTarget}→${a.newTarget}`).join(", ");
        summary = aligned
          ? `You're dominating ${pillarNames}! Raised targets (${increaseAmounts}) - this connects to your 2026 vision.`
          : `Crushing ${pillarNames}! Raised: ${increaseAmounts}`;
      } else if (decreases.length > 0 && increases.length === 0) {
        const decreaseInfo = decreases.map(a => `${a.pillar}: ${a.oldTarget}→${a.newTarget}`).join(", ");
        summary = `Adjusted for sustainable momentum: ${decreaseInfo}. Small consistent steps beat burnout.`;
      } else {
        const upStr = increases.map(a => `↑${a.pillar}`).join(", ");
        const downStr = decreases.map(a => `↓${a.pillar}`).join(", ");
        summary = `Rebalanced targets: ${upStr}${upStr && downStr ? ", " : ""}${downStr}`;
      }
    }

    // Add dominant pillar insight
    if (dominantPillar && dominantPillar[1] >= 5) {
      const [pillar, count] = dominantPillar;
      summary += ` (${pillar} led with ${count} actions)`;
    }

    return new Response(JSON.stringify({
      adjustments,
      pillarStats,
      summary,
      totalAdjustments: adjustments.length,
      misogiAligned,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in auto-adjust-targets:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});