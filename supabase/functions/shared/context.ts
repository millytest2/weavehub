import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompactContext {
  identity_seed: string | null;
  current_phase: string | null;
  experiments: {
    in_progress: any[];
    planning: any[];
  };
  key_insights: any[];
  key_documents: any[];
  recent_actions: any[];
  pillar_history: string[];
}

export async function fetchUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CompactContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Parallel fetch - minimal data for speed
  const [identitySeed, insights, documents, experiments, dailyTasks] = await Promise.all([
    supabase.from("identity_seeds").select("content, current_phase, last_pillar_used").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("title, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("documents").select("title, summary").eq("user_id", userId).order("created_at", { ascending: false }).limit(4),
    supabase.from("experiments").select("title, description, status, identity_shift_target").eq("user_id", userId).in("status", ["in_progress", "planning"]).order("created_at", { ascending: false }).limit(3),
    supabase.from("daily_tasks").select("pillar, completed, one_thing").eq("user_id", userId).gte("task_date", sevenDaysAgo.toISOString().split("T")[0]).order("task_date", { ascending: false }).limit(7),
  ]);

  // Extract pillar history for rotation
  const pillarHistory = (dailyTasks.data || [])
    .map((t: any) => t.pillar)
    .filter(Boolean);

  // Filter to meaningful insights only
  const keyInsights = (insights.data || []).filter((i: any) => i.content && i.content.length > 30);

  const allExperiments = experiments.data || [];

  return {
    identity_seed: identitySeed.data?.content || null,
    current_phase: identitySeed.data?.current_phase || "baseline",
    experiments: {
      in_progress: allExperiments.filter((e: any) => e.status === "in_progress"),
      planning: allExperiments.filter((e: any) => e.status === "planning"),
    },
    key_insights: keyInsights,
    key_documents: documents.data || [],
    recent_actions: dailyTasks.data || [],
    pillar_history: pillarHistory,
  };
}

// NEW: Weighted context formatter with proper priorities
export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // WEIGHT 1: INSIGHTS (30%) - emotional/behavioral signals, highest priority
  if (context.key_insights.length > 0) {
    formatted += `🔥 INSIGHTS (weight: HIGH):\n${context.key_insights.slice(0, 5).map((i: any) => `- ${i.title}: ${i.content.substring(0, 150)}`).join('\n')}\n\n`;
  }

  // WEIGHT 2: EXPERIMENTS (30%) - identity shift signals
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    formatted += `⚡ EXPERIMENTS (weight: HIGH):\n${allExperiments.map((e: any) => `- ${e.title} (${e.status}): ${e.description?.substring(0, 100) || 'No description'}${e.identity_shift_target ? `\n  Identity: ${e.identity_shift_target.substring(0, 80)}` : ''}`).join('\n')}\n\n`;
  }

  // WEIGHT 3: IDENTITY SEED (20%) - long-term compass, NOT daily command
  if (context.identity_seed) {
    formatted += `🧭 IDENTITY (weight: COMPASS ONLY - not daily priority):\n${context.identity_seed.substring(0, 300)}\n\n`;
  }

  // WEIGHT 4: RECENT ACTIONS (10%) - momentum signals
  if (context.recent_actions.length > 0) {
    const completed = context.recent_actions.filter((a: any) => a.completed);
    const pillarCounts: { [key: string]: number } = {};
    completed.forEach((a: any) => {
      if (a.pillar) {
        pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      }
    });
    if (Object.keys(pillarCounts).length > 0) {
      formatted += `📊 MOMENTUM (weight: LOW):\n${Object.entries(pillarCounts).map(([pillar, count]) => `- ${pillar}: ${count} done`).join(', ')}\n\n`;
    }
  }

  // WEIGHT 5: DOCUMENTS (10%) - knowledge context, lowest priority
  if (context.key_documents.length > 0) {
    formatted += `📚 DOCS (weight: LOW - reference only):\n${context.key_documents.slice(0, 3).map((d: any) => `- ${d.title}${d.summary ? `: ${d.summary.substring(0, 60)}` : ''}`).join('\n')}\n\n`;
  }

  // Add pillar rotation context
  if (context.pillar_history.length > 0) {
    const recentPillars = context.pillar_history.slice(0, 5);
    formatted += `🔄 RECENT PILLARS (for rotation): ${recentPillars.join(' → ')}\n`;
  }

  return formatted.trim();
}
