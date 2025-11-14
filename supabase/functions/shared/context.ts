import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UserContext {
  identitySeed: string | null;
  insights: any[];
  documents: any[];
  topics: any[];
  experiments: any[];
  dailyReflections: any[];
}

export async function fetchUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserContext> {
  // Fetch all user context in parallel
  const [identitySeed, insights, documents, topics, experiments, dailyTasks] = await Promise.all([
    supabase.from("identity_seeds").select("content").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("topics").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("experiments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("daily_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
  ]);

  return {
    identitySeed: identitySeed.data?.content || null,
    insights: insights.data || [],
    documents: documents.data || [],
    topics: topics.data || [],
    experiments: experiments.data || [],
    dailyReflections: dailyTasks.data || [],
  };
}

export function formatContextForAI(context: UserContext): string {
  const activeExperiments = context.experiments.filter((e: any) => e.status === "in_progress");
  const recentReflections = context.dailyReflections
    .filter((d: any) => d.reflection)
    .slice(0, 2);

  return `
IDENTITY SEED (North Star):
${context.identitySeed || "Not set"}

CURRENT STATE:
- Active Paths: ${context.topics.map((t: any) => t.name).join(", ") || "None"}
- Active Experiments: ${activeExperiments.map((e: any) => e.title).join(", ") || "None"}

RECENT INSIGHTS (patterns, thoughts, notes):
${context.insights.slice(0, 5).map((i: any) => `• ${i.title}: ${i.content.substring(0, 150)}...`).join("\n") || "None"}

RECENT DOCUMENTS:
${context.documents.slice(0, 3).map((d: any) => `• ${d.title}${d.summary ? ': ' + d.summary.substring(0, 100) : ''}`).join("\n") || "None"}

RECENT REFLECTIONS:
${recentReflections.map((r: any) => `• ${r.reflection.substring(0, 150)}...`).join("\n") || "None yet"}
`.trim();
}
