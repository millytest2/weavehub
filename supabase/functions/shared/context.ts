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
  return `
IDENTITY SEED (North Star):
${context.identity_seed || "Not set"}

TOPICS/PATHS (all active):
${context.topics.map((t: any) => `• ${t.name}${t.description ? ': ' + t.description : ''}`).join("\n") || "None"}

EXPERIMENTS:
In Progress: ${context.experiments.in_progress.map((e: any) => `• ${e.title} (${e.status})`).join("\n") || "None"}
Recent Completed: ${context.experiments.recent_completed.map((e: any) => `• ${e.title}`).join("\n") || "None"}
Planning: ${context.experiments.planning.map((e: any) => `• ${e.title}`).join("\n") || "None"}

KEY INSIGHTS (last 10 non-trivial):
${context.key_insights.map((i: any) => `• ${i.title}: ${i.content.substring(0, 150)}...`).join("\n") || "None"}

KEY DOCUMENTS (title + summary only):
${context.key_documents.map((d: any) => `• ${d.title}${d.summary ? ': ' + d.summary.substring(0, 100) : ''}`).join("\n") || "None"}

RECENT ACTIONS (last 7 days):
${context.recent_actions.map((r: any) => `• [${r.task_date}] ${r.one_thing || r.title}${r.reflection ? ' | Reflection: ' + r.reflection.substring(0, 100) : ''}${r.completed ? ' ✓' : ''}`).join("\n") || "None yet"}
`.trim();
}
