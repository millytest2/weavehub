import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompactContext {
  identity_seed: string | null;
  topics: any[];
  experiments: {
    in_progress: any[];
    recent_completed: any[];
    planning: any[];
  };
  key_insights: any[];
  key_documents: any[];
  recent_actions: any[];
}

export async function fetchUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CompactContext> {
  // Fetch all user context in parallel - optimized for speed
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [identitySeed, insights, documents, experiments, dailyTasks] = await Promise.all([
    supabase.from("identity_seeds").select("content").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("title, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("documents").select("title, summary").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("experiments").select("title, description, status, identity_shift_target, steps").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("daily_tasks").select("pillar, completed, task_date, one_thing").eq("user_id", userId).gte("task_date", sevenDaysAgo.toISOString().split("T")[0]).order("task_date", { ascending: false }).limit(10),
  ]);

  // Process experiments into categories
  const allExperiments = experiments.data || [];
  const inProgress = allExperiments.filter((e: any) => e.status === "in_progress");
  const planning = allExperiments.filter((e: any) => e.status === "planning");

  // Filter to key insights
  const keyInsights = (insights.data || []).filter((i: any) => i.content && i.content.length > 50);

  return {
    identity_seed: identitySeed.data?.content || null,
    topics: [],
    experiments: {
      in_progress: inProgress,
      recent_completed: [],
      planning: planning,
    },
    key_insights: keyInsights,
    key_documents: documents.data || [],
    recent_actions: dailyTasks.data || [],
  };
}

export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // 1. INSIGHTS (highest emotional/behavioral signal)
  if (context.key_insights.length > 0) {
    formatted += `🔥 INSIGHTS:\n${context.key_insights.map((i: any) => `- ${i.title}: ${i.content.substring(0, 200)}`).join('\n')}\n\n`;
  }

  // 2. ACTIVE EXPERIMENTS (strongest identity signal)
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    formatted += `⚡ EXPERIMENTS:\n${allExperiments.map((e: any) => `- ${e.title} (${e.status}): ${e.description.substring(0, 150)}${e.identity_shift_target ? `\n  → ${e.identity_shift_target}` : ''}`).join('\n')}\n\n`;
  }

  // 3. IDENTITY SEED (long-term compass)
  if (context.identity_seed) {
    formatted += `🧭 IDENTITY:\n${context.identity_seed.substring(0, 400)}\n\n`;
  }

  // 4. RECENT ACTIONS (momentum tracker)
  if (context.recent_actions.length > 0) {
    const pillarCounts: { [key: string]: number } = {};
    context.recent_actions.forEach((a: any) => {
      if (a.pillar && a.completed) {
        pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      }
    });
    formatted += `📊 ACTIONS:\n${Object.entries(pillarCounts).map(([pillar, count]) => `- ${pillar}: ${count} completed`).join('\n')}\n\n`;
  }

  // 5. DOCUMENTS (knowledge context - lower priority)
  if (context.key_documents.length > 0) {
    formatted += `📚 DOCS:\n${context.key_documents.map((d: any) => `- ${d.title}${d.summary ? `: ${d.summary.substring(0, 100)}` : ''}`).join('\n')}\n\n`;
  }

  return formatted.trim();
}
