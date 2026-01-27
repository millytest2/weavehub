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
}

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

    // Get last 2 weeks of action history
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const { data: recentActions } = await supabase
      .from("action_history")
      .select("pillar, action_date, action_text, why_it_mattered")
      .eq("user_id", user.id)
      .gte("action_date", twoWeeksAgo.toISOString().split('T')[0]);

    // Calculate completion stats per pillar
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
    const weeklyCompletions: Record<string, number[]> = {};
    pillars.forEach(p => weeklyCompletions[p] = [0, 0]); // [lastWeek, thisWeek]

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    (recentActions || []).forEach(a => {
      const p = (a.pillar || '').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      if (pillars.includes(normalizedPillar)) {
        const actionDate = new Date(a.action_date);
        if (actionDate >= oneWeekAgo) {
          weeklyCompletions[normalizedPillar][1]++;
        } else {
          weeklyCompletions[normalizedPillar][0]++;
        }
      }
    });

    // Build target map
    const targetMap: Record<string, number> = {};
    (currentTargets || []).forEach(t => {
      targetMap[t.pillar] = t.weekly_target;
    });

    // Calculate adjustments
    const adjustments: { pillar: string; oldTarget: number; newTarget: number; reason: string }[] = [];
    const pillarStats: PillarStats[] = [];

    pillars.forEach(pillar => {
      const currentTarget = targetMap[pillar] || 3;
      const thisWeekCompleted = weeklyCompletions[pillar][1];
      const lastWeekCompleted = weeklyCompletions[pillar][0];
      const avgCompleted = (thisWeekCompleted + lastWeekCompleted) / 2;
      const completionRate = currentTarget > 0 ? avgCompleted / currentTarget : 0;

      pillarStats.push({
        pillar,
        target: currentTarget,
        completed: thisWeekCompleted,
        completionRate: Math.round(completionRate * 100),
      });

      let newTarget = currentTarget;
      let reason = "";

      // Crushing it - hitting 90%+ consistently
      if (completionRate >= 0.9 && avgCompleted >= currentTarget) {
        newTarget = Math.min(currentTarget + 1, 10);
        reason = `Crushing it! Hit ${Math.round(completionRate * 100)}% - raising the bar`;
      } 
      // Struggling - under 50% completion
      else if (completionRate < 0.5 && currentTarget > 2) {
        newTarget = Math.max(currentTarget - 1, 1);
        reason = `${Math.round(completionRate * 100)}% completion - adjusting to sustainable`;
      }
      // Slight struggle - under 70% for 2 weeks
      else if (completionRate < 0.7 && lastWeekCompleted < currentTarget * 0.7 && currentTarget > 2) {
        newTarget = Math.max(currentTarget - 1, 1);
        reason = `Consistent below target - reducing for momentum`;
      }

      if (newTarget !== currentTarget) {
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
    (recentActions || []).forEach(a => {
      const p = (a.pillar || 'general').toLowerCase();
      const normalizedPillar = pillarMap[p] || p;
      pillarActionCounts[normalizedPillar] = (pillarActionCounts[normalizedPillar] || 0) + 1;
    });
    
    const dominantPillar = Object.entries(pillarActionCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    // Check alignment with 2026 direction
    const yearNote = identityData?.year_note?.toLowerCase() || '';
    const misogiKeywords: Record<string, string[]> = {
      'business': ['income', 'revenue', 'money', '$', 'job', 'career', 'business'],
      'content': ['post', 'content', 'video', 'audience', 'creator', 'brand'],
      'body': ['weight', 'gym', 'health', 'fitness', 'run', 'body'],
      'mind': ['learn', 'skill', 'study', 'growth', 'develop'],
      'relationship': ['connect', 'community', 'relationship', 'social'],
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
          ? `Dominated ${pillar} (${count} actions) - directly moving your 2026 Misogi. Targets calibrated.`
          : `Dominated ${pillar} this week. Consider: does this serve your 2026 direction?`;
      } else {
        summary = "Your targets are well-calibrated for your current pace. Keep going!";
      }
    } else {
      const increases = adjustments.filter(a => a.newTarget > a.oldTarget);
      const decreases = adjustments.filter(a => a.newTarget < a.oldTarget);
      
      if (increases.length > 0 && decreases.length === 0) {
        const aligned = increases.some(a => misogiAligned.includes(a.pillar.toLowerCase()));
        summary = aligned
          ? `Crushing it on ${increases.map(a => a.pillar).join(", ")} - raising the bar. This connects to your 2026 vision.`
          : `You're crushing ${increases.map(a => a.pillar).join(", ")}! Raised the bar.`;
      } else if (decreases.length > 0 && increases.length === 0) {
        summary = `Adjusted ${decreases.map(a => a.pillar).join(", ")} for sustainable momentum.`;
      } else {
        summary = `Rebalanced: ${increases.map(a => `↑${a.pillar}`).join(", ")}, ${decreases.map(a => `↓${a.pillar}`).join(", ")}`;
      }
    }

    return new Response(JSON.stringify({
      adjustments,
      pillarStats,
      summary,
      totalAdjustments: adjustments.length
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
