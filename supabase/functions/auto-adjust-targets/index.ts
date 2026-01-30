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
  todayCount: number;
  completionRate: number;
  trend: "up" | "down" | "stable";
  isPushing: boolean;
}

// Dynamic bounds
const TARGET_BOUNDS = { min: 1, max: 12 };

// Responsive thresholds
const THRESHOLDS = {
  exceeding: 1.2,   // 120%+ of target
  crushing: 0.85,   // 85%+ of target
  onTrack: 0.6,     // 60-85% is healthy  
  struggling: 0.4,  // Under 40%
  stalled: 0.25,    // Under 25%
};

// Day-level push detection
const DAILY_PUSH_COUNT = 3; // 3+ actions in one pillar = "pushing"

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

    // Get identity seed for alignment
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("year_note, content, core_values, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get last 2 weeks of action history (faster response)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const { data: recentActions } = await supabase
      .from("action_history")
      .select("pillar, action_date, action_text")
      .eq("user_id", user.id)
      .gte("action_date", twoWeeksAgo.toISOString().split('T')[0]);

    // Pillar normalization map
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
    
    // Track completions: today, this week (minus today), last week
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const todayCounts: Record<string, number> = {};
    const thisWeekCounts: Record<string, number> = {};
    const lastWeekCounts: Record<string, number> = {};
    pillars.forEach(p => {
      todayCounts[p] = 0;
      thisWeekCounts[p] = 0;
      lastWeekCounts[p] = 0;
    });

    (recentActions || []).forEach(a => {
      const p = (a.pillar || '').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      if (!pillars.includes(normalizedPillar)) return;
      
      const actionDate = a.action_date;
      if (actionDate === today) {
        todayCounts[normalizedPillar]++;
        thisWeekCounts[normalizedPillar]++;
      } else if (actionDate >= startOfThisWeek.toISOString().split('T')[0]) {
        thisWeekCounts[normalizedPillar]++;
      } else if (actionDate >= startOfLastWeek.toISOString().split('T')[0]) {
        lastWeekCounts[normalizedPillar]++;
      }
    });

    // Build target map
    const targetMap: Record<string, number> = {};
    (currentTargets || []).forEach(t => {
      targetMap[t.pillar] = t.weekly_target;
    });

    // Calculate day of week (1-7, Mon=1)
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const daysLeftInWeek = 7 - dayOfWeek + 1;
    const daysElapsed = dayOfWeek;

    const adjustments: { pillar: string; oldTarget: number; newTarget: number; reason: string }[] = [];
    const pillarStats: PillarStats[] = [];

    pillars.forEach(pillar => {
      const currentTarget = targetMap[pillar] || 3;
      const thisWeekCompleted = thisWeekCounts[pillar];
      const lastWeekCompleted = lastWeekCounts[pillar];
      const todayCompleted = todayCounts[pillar];
      
      // Pro-rated completion rate (what % are they at relative to week progress)
      const expectedByNow = (currentTarget / 7) * daysElapsed;
      const paceRate = expectedByNow > 0 ? thisWeekCompleted / expectedByNow : 1;
      
      // Overall week completion rate
      const weekCompletionRate = currentTarget > 0 ? thisWeekCompleted / currentTarget : 0;
      
      // Trend: compare to last week
      const lastWeekPace = lastWeekCompleted / 7 * daysElapsed;
      const trend: "up" | "down" | "stable" = 
        thisWeekCompleted > lastWeekPace + 1 ? "up" : 
        thisWeekCompleted < lastWeekPace - 1 ? "down" : "stable";

      // Is user "pushing" today in this pillar?
      const isPushing = todayCompleted >= DAILY_PUSH_COUNT;

      pillarStats.push({
        pillar,
        target: currentTarget,
        completed: thisWeekCompleted,
        todayCount: todayCompleted,
        completionRate: Math.round(weekCompletionRate * 100),
        trend,
        isPushing,
      });

      let newTarget = currentTarget;
      let reason = "";

      // === RESPONSIVE ADJUSTMENT LOGIC ===

      // 1. PUSHING TODAY: If they hit 3+ in one pillar today and are already at/above target
      if (isPushing && thisWeekCompleted >= currentTarget) {
        newTarget = Math.min(currentTarget + 1, TARGET_BOUNDS.max);
        reason = `Pushing today (${todayCompleted} actions) and already at target → ${newTarget}`;
      }
      // 2. ALREADY EXCEEDED: Week target hit with days to spare
      else if (weekCompletionRate >= 1.0 && daysLeftInWeek >= 2) {
        newTarget = Math.min(currentTarget + 2, TARGET_BOUNDS.max);
        reason = `Hit ${thisWeekCompleted}/${currentTarget} with ${daysLeftInWeek} days left → raising to ${newTarget}`;
      }
      // 3. ON PACE TO EXCEED: 120%+ pace rate
      else if (paceRate >= THRESHOLDS.exceeding && thisWeekCompleted >= currentTarget * 0.7) {
        newTarget = Math.min(currentTarget + 1, TARGET_BOUNDS.max);
        reason = `Ahead of pace (${Math.round(paceRate * 100)}%) → raising to ${newTarget}`;
      }
      // 4. CRUSHING IT: 85%+ completion with upward or stable trend
      else if (weekCompletionRate >= THRESHOLDS.crushing && trend !== "down" && daysElapsed >= 4) {
        newTarget = Math.min(currentTarget + 1, TARGET_BOUNDS.max);
        reason = `${Math.round(weekCompletionRate * 100)}% with ${trend} trend → ${newTarget}`;
      }
      // 5. STALLED: Under 25% by mid-week
      else if (weekCompletionRate < THRESHOLDS.stalled && daysElapsed >= 4 && currentTarget > TARGET_BOUNDS.min) {
        newTarget = Math.max(currentTarget - 2, TARGET_BOUNDS.min);
        reason = `Only ${thisWeekCompleted}/${currentTarget} by day ${daysElapsed} → ${newTarget} for momentum`;
      }
      // 6. STRUGGLING: Under 40% and trending down
      else if (weekCompletionRate < THRESHOLDS.struggling && trend === "down" && currentTarget > TARGET_BOUNDS.min) {
        newTarget = Math.max(currentTarget - 1, TARGET_BOUNDS.min);
        reason = `${Math.round(weekCompletionRate * 100)}% & trending down → ${newTarget}`;
      }
      // 7. LOW BUT CLIMBING: Don't penalize if they're improving
      else if (weekCompletionRate < THRESHOLDS.onTrack && trend === "up") {
        // Keep target - they're building momentum
        reason = "";
      }

      if (newTarget !== currentTarget && reason) {
        adjustments.push({ pillar, oldTarget: currentTarget, newTarget, reason });
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

    // Find dominant pillars for summary
    const pillarActionCounts: Record<string, number> = {};
    pillars.forEach(p => pillarActionCounts[p] = thisWeekCounts[p]);
    
    const dominantPillar = Object.entries(pillarActionCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    const pushingPillars = pillarStats.filter(p => p.isPushing).map(p => p.pillar);

    // Extract Misogi-aligned pillars
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

    // Generate summary
    let summary = "";
    if (adjustments.length === 0) {
      if (pushingPillars.length > 0) {
        summary = `Pushing hard on ${pushingPillars.join(", ")} today. Targets well-calibrated.`;
      } else if (dominantPillar && dominantPillar[1] > 0) {
        summary = `Leading with ${dominantPillar[0]} (${dominantPillar[1]} this week). Targets match your rhythm.`;
      } else {
        summary = "Targets calibrated. Keep moving.";
      }
    } else {
      const increases = adjustments.filter(a => a.newTarget > a.oldTarget);
      const decreases = adjustments.filter(a => a.newTarget < a.oldTarget);
      
      if (increases.length > 0) {
        const names = increases.map(a => a.pillar).join(", ");
        summary = `Raised ${names} targets - you're crushing it.`;
      }
      if (decreases.length > 0) {
        const names = decreases.map(a => a.pillar).join(", ");
        summary += (summary ? " " : "") + `Lowered ${names} for sustainable momentum.`;
      }
    }

    return new Response(JSON.stringify({
      adjustments,
      pillarStats,
      summary,
      totalAdjustments: adjustments.length,
      misogiAligned,
      dayOfWeek,
      daysLeftInWeek,
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
