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
  // Fetch all user context in parallel
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [identitySeed, insights, documents, topics, experiments, dailyTasks] = await Promise.all([
    supabase.from("identity_seeds").select("content").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("documents").select("title, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("topics").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("experiments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("daily_tasks").select("*").eq("user_id", userId).gte("task_date", thirtyDaysAgo.toISOString().split("T")[0]).order("task_date", { ascending: false }),
  ]);

  // Process experiments into categories
  const allExperiments = experiments.data || [];
  const inProgress = allExperiments.filter((e: any) => e.status === "in_progress");
  const completed = allExperiments.filter((e: any) => e.status === "completed").slice(0, 2);
  const planning = allExperiments.filter((e: any) => e.status === "planning").slice(0, 2);

  // Filter to key insights (non-trivial, recent)
  const keyInsights = (insights.data || [])
    .filter((i: any) => i.content && i.content.length > 50)
    .slice(0, 10);

  // Recent actions from last 7 days with reflections
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActions = (dailyTasks.data || [])
    .filter((t: any) => new Date(t.task_date) >= sevenDaysAgo)
    .slice(0, 7);

  return {
    identity_seed: identitySeed.data?.content || null,
    topics: topics.data || [],
    experiments: {
      in_progress: inProgress,
      recent_completed: completed,
      planning: planning,
    },
    key_insights: keyInsights,
    key_documents: (documents.data || []).slice(0, 5),
    recent_actions: recentActions,
  };
}

export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // 1. INSIGHTS (highest emotional/behavioral signal)
  if (context.key_insights.length > 0) {
    formatted += `🔥 RECENT INSIGHTS (emotional/behavioral patterns):\n${context.key_insights.map((i: any) => `- ${i.title}: ${i.content}`).join('\n')}\n\n`;
  }

  // 2. ACTIVE EXPERIMENTS (strongest identity signal)
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    formatted += `⚡ ACTIVE EXPERIMENTS (identity-in-action):\n${allExperiments.map((e: any) => `- ${e.title} (${e.status}): ${e.description || 'No description'}\n  Steps: ${e.steps || 'None defined'}`).join('\n')}\n\n`;
  }

  // 3. IDENTITY SEED (long-term compass)
  if (context.identity_seed) {
    formatted += `🧭 IDENTITY SEED (long-term direction, not daily command):\n${context.identity_seed}\n\n`;
  }

  // 4. RECENT ACTIONS (momentum tracker)
  if (context.recent_actions.length > 0) {
    formatted += `📊 RECENT ACTIONS (momentum patterns):\n${context.recent_actions.map((a: any) => `- [${a.task_date}] ${a.one_thing || a.title} ${a.completed ? '✓' : '⏳'}${a.reflection ? ' | ' + a.reflection.substring(0, 80) : ''}`).join('\n')}\n\n`;
  }

  // 5. DOCUMENTS (knowledge context - lower priority)
  if (context.key_documents.length > 0) {
    formatted += `📚 DOCUMENTS (knowledge inputs):\n${context.key_documents.map((d: any) => `- ${d.title}: ${d.summary || 'No summary'}`).join('\n')}\n\n`;
  }

  // 6. TOPICS (organizational context)
  if (context.topics.length > 0) {
    formatted += `🗂️ TOPICS:\n${context.topics.map((t: any) => `- ${t.name}: ${t.description || 'No description'}`).join('\n')}\n\n`;
  }

  return formatted.trim();
}
