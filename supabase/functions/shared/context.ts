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
    supabase.from("insights").select("title, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("documents").select("title, summary").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("experiments").select("title, description, status, identity_shift_target").eq("user_id", userId).in("status", ["in_progress", "planning"]).order("created_at", { ascending: false }).limit(3),
    supabase.from("daily_tasks").select("pillar, completed, one_thing").eq("user_id", userId).gte("task_date", sevenDaysAgo.toISOString().split("T")[0]).order("task_date", { ascending: false }).limit(7),
  ]);

  const pillarHistory = (dailyTasks.data || [])
    .map((t: any) => t.pillar)
    .filter(Boolean);

  const keyInsights = (insights.data || []).filter((i: any) => i.content && i.content.length > 20);

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

// IDENTITY-FIRST context formatter
// Priority: Identity Seed > Insights > Experiments > Documents > Baseline
export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // PRIORITY 1: IDENTITY SEED (40%) - THE CORE DRIVER
  if (context.identity_seed) {
    formatted += `IDENTITY (PRIMARY DRIVER):\n${context.identity_seed}\n\n`;
  }

  // PRIORITY 2: KEY INSIGHTS (30%) - behavioral/emotional signals
  if (context.key_insights.length > 0) {
    formatted += `INSIGHTS:\n${context.key_insights.slice(0, 6).map((i: any) => `- ${i.title}: ${i.content.substring(0, 120)}`).join('\n')}\n\n`;
  }

  // PRIORITY 3: EXPERIMENTS (20%) - active identity shifts
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    formatted += `EXPERIMENTS:\n${allExperiments.map((e: any) => `- ${e.title} (${e.status})${e.identity_shift_target ? `: ${e.identity_shift_target.substring(0, 60)}` : ''}`).join('\n')}\n\n`;
  }

  // PRIORITY 4: DOCUMENTS (5%) - reference only
  if (context.key_documents.length > 0) {
    formatted += `DOCS:\n${context.key_documents.slice(0, 3).map((d: any) => `- ${d.title}`).join('\n')}\n\n`;
  }

  // CONTEXT ONLY: Baseline phase (5%) - constraint info, not command
  if (context.current_phase) {
    formatted += `PHASE: ${context.current_phase} (context only, not command)\n`;
  }

  // Pillar rotation context
  if (context.pillar_history.length > 0) {
    formatted += `RECENT PILLARS: ${context.pillar_history.slice(0, 5).join(' > ')}\n`;
  }

  return formatted.trim();
}
