// Use generic type to avoid version conflicts across functions
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface CompactContext {
  identity_seed: string | null;
  current_phase: string | null;
  weekly_focus: string | null;
  experiments: {
    in_progress: any[];
    planning: any[];
  };
  key_insights: any[];
  key_documents: any[];
  recent_actions: any[];
  completed_actions: any[];
  pillar_history: string[];
  topics: any[];
  connections: any[];
}

export interface DocumentContext {
  identity_seed: string | null;
  weekly_focus: string | null;
  topics: any[];
  recent_insights: any[];
  active_experiments: any[];
}

export interface SemanticContext extends CompactContext {
  semantic_insights: any[];
  semantic_documents: any[];
}

// Generate embedding using Lovable AI Gateway
async function generateEmbedding(text: string): Promise<number[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY || !text) {
    console.log("No API key or text for embedding generation");
    return [];
  }
  
  try {
    // Use Gemini to generate a semantic understanding, then use it for search
    // Since direct embedding API may not be available, we'll use a workaround
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "Extract 5-10 key semantic concepts from this text. Return only comma-separated keywords/phrases, nothing else." 
          },
          { role: "user", content: text.substring(0, 2000) }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Failed to generate semantic keywords:", response.status);
      return [];
    }

    const data = await response.json();
    const keywords = data.choices?.[0]?.message?.content || "";
    console.log("Semantic keywords extracted:", keywords.substring(0, 100));
    
    // Return keywords as a searchable string (will be used for text matching)
    return keywords.split(',').map((k: string) => k.trim().toLowerCase());
  } catch (error) {
    console.error("Embedding generation error:", error);
    return [];
  }
}

export async function fetchUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CompactContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Parallel fetch - minimal data for speed
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [identitySeed, insights, documents, experiments, dailyTasks, actionHistory, topics, connections] = await Promise.all([
    supabase.from("identity_seeds").select("content, current_phase, last_pillar_used, weekly_focus").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("id, title, content, source, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    supabase.from("documents").select("id, title, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("experiments").select("id, title, description, status, identity_shift_target, hypothesis").eq("user_id", userId).in("status", ["in_progress", "planning"]).order("created_at", { ascending: false }).limit(5),
    supabase.from("daily_tasks").select("pillar, completed, one_thing, why_matters, task_date").eq("user_id", userId).gte("task_date", sevenDaysAgo.toISOString().split("T")[0]).order("task_date", { ascending: false }).limit(10),
    // Fetch completed action history to avoid repetition
    supabase.from("action_history").select("action_text, pillar, action_date").eq("user_id", userId).gte("action_date", thirtyDaysAgo.toISOString().split("T")[0]).order("action_date", { ascending: false }).limit(30),
    supabase.from("topics").select("id, name, description").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("connections").select("source_type, source_id, target_type, target_id, note").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const pillarHistory = (dailyTasks.data || [])
    .map((t: any) => t.pillar)
    .filter(Boolean);

  // Filter high-quality insights (longer content = more signal)
  const keyInsights = (insights.data || [])
    .filter((i: any) => i.content && i.content.length > 30)
    .slice(0, 10);

  const allExperiments = experiments.data || [];

  return {
    identity_seed: identitySeed.data?.content || null,
    current_phase: identitySeed.data?.current_phase || "baseline",
    weekly_focus: identitySeed.data?.weekly_focus || null,
    experiments: {
      in_progress: allExperiments.filter((e: any) => e.status === "in_progress"),
      planning: allExperiments.filter((e: any) => e.status === "planning"),
    },
    key_insights: keyInsights,
    key_documents: documents.data || [],
    recent_actions: dailyTasks.data || [],
    completed_actions: actionHistory.data || [],
    pillar_history: pillarHistory,
    topics: topics.data || [],
    connections: connections.data || [],
  };
}

// Fetch context with semantic relevance (for scale: 100K+ items)
export async function fetchSemanticContext(
  supabase: SupabaseClient,
  userId: string
): Promise<SemanticContext> {
  // First get base context
  const baseContext = await fetchUserContext(supabase, userId);
  
  // If no identity seed, fall back to chronological
  if (!baseContext.identity_seed) {
    console.log("No identity seed - using chronological context");
    return { ...baseContext, semantic_insights: [], semantic_documents: [] };
  }

  // Generate semantic keywords from identity seed
  const semanticKeywords = await generateEmbedding(baseContext.identity_seed);
  
  if (semanticKeywords.length === 0) {
    console.log("No semantic keywords - using chronological context");
    return { ...baseContext, semantic_insights: [], semantic_documents: [] };
  }

  // Try to use vector search if embeddings exist
  try {
    // Check if we have any embedded insights
    const { data: embeddedCheck } = await supabase
      .from("insights")
      .select("id")
      .eq("user_id", userId)
      .not("embedding", "is", null)
      .limit(1);

    if (embeddedCheck && embeddedCheck.length > 0) {
      // We have embeddings - but we can't generate query embedding without proper API
      // Fall back to keyword-based relevance search
      console.log("Embeddings exist but using keyword search for now");
    }

    // Text-based semantic search using keywords
    const keywordPattern = semanticKeywords.slice(0, 5).join('|');
    
    // Search insights by content relevance
    const { data: semanticInsights } = await supabase
      .from("insights")
      .select("id, title, content, source, created_at, relevance_score")
      .eq("user_id", userId)
      .or(`title.ilike.%${semanticKeywords[0]}%,content.ilike.%${semanticKeywords[0]}%`)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(10);

    // Search documents by relevance
    const { data: semanticDocs } = await supabase
      .from("documents")
      .select("id, title, summary, created_at, relevance_score")
      .eq("user_id", userId)
      .or(`title.ilike.%${semanticKeywords[0]}%,summary.ilike.%${semanticKeywords[0]}%`)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(5);

    console.log(`Semantic search found: ${semanticInsights?.length || 0} insights, ${semanticDocs?.length || 0} documents`);

    return {
      ...baseContext,
      semantic_insights: semanticInsights || [],
      semantic_documents: semanticDocs || [],
    };
  } catch (error) {
    console.error("Semantic search error:", error);
    return { ...baseContext, semantic_insights: [], semantic_documents: [] };
  }
}

// Lighter context fetch for document processing
export async function fetchDocumentContext(
  supabase: SupabaseClient,
  userId: string
): Promise<DocumentContext> {
  const [identitySeed, topics, insights, experiments] = await Promise.all([
    supabase.from("identity_seeds").select("content, weekly_focus").eq("user_id", userId).maybeSingle(),
    supabase.from("topics").select("id, name, description").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("insights").select("id, title, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("experiments").select("id, title, identity_shift_target").eq("user_id", userId).eq("status", "in_progress").limit(3),
  ]);

  return {
    identity_seed: identitySeed.data?.content || null,
    weekly_focus: identitySeed.data?.weekly_focus || null,
    topics: topics.data || [],
    recent_insights: (insights.data || []).filter((i: any) => i.content?.length > 30),
    active_experiments: experiments.data || [],
  };
}

// IDENTITY-FIRST context formatter
// Priority: Identity Seed (40%) > Insights (30%) > Experiments (20%) > Documents (5%) > Phase (5%)
export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // PRIORITY 1: IDENTITY SEED (40%) - THE CORE DRIVER
  if (context.identity_seed) {
    formatted += `IDENTITY (PRIMARY DRIVER):\n${context.identity_seed}\n\n`;
  }

  // Current reality - user's situation in natural language
  if (context.weekly_focus) {
    formatted += `CURRENT REALITY:\n${context.weekly_focus}\n\n`;
  }

  // PRIORITY 2: KEY INSIGHTS (30%) - behavioral/emotional signals
  if (context.key_insights.length > 0) {
    const insightText = context.key_insights.slice(0, 8).map((i: any) => {
      const source = i.source ? ` [${i.source}]` : '';
      return `- ${i.title}${source}: ${i.content.substring(0, 150)}`;
    }).join('\n');
    formatted += `INSIGHTS:\n${insightText}\n\n`;
  }

  // PRIORITY 3: EXPERIMENTS (20%) - active identity shifts
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    const expText = allExperiments.map((e: any) => {
      const shift = e.identity_shift_target ? `: ${e.identity_shift_target.substring(0, 80)}` : '';
      return `- ${e.title} (${e.status})${shift}`;
    }).join('\n');
    formatted += `EXPERIMENTS:\n${expText}\n\n`;
  }

  // PRIORITY 4: DOCUMENTS (5%) - reference only
  if (context.key_documents.length > 0) {
    const docText = context.key_documents.slice(0, 5).map((d: any) => {
      const summary = d.summary ? `: ${d.summary.substring(0, 80)}` : '';
      return `- ${d.title}${summary}`;
    }).join('\n');
    formatted += `DOCUMENTS:\n${docText}\n\n`;
  }

  // Topics for context
  if (context.topics.length > 0) {
    formatted += `TOPICS: ${context.topics.map((t: any) => t.name).join(', ')}\n`;
  }

  // CONTEXT ONLY: Phase (5%) - constraint info, not command
  if (context.current_phase) {
    formatted += `PHASE: ${context.current_phase} (context only, not command)\n`;
  }

  // Pillar rotation context
  if (context.pillar_history.length > 0) {
    formatted += `RECENT PILLARS: ${context.pillar_history.slice(0, 5).join(' > ')}\n`;
  }

  // Recent completed actions for momentum
  const completedActions = context.recent_actions.filter((a: any) => a.completed);
  if (completedActions.length > 0) {
    formatted += `RECENT WINS: ${completedActions.slice(0, 3).map((a: any) => a.one_thing).join('; ')}\n`;
  }

  // CRITICAL: Actions already done in last 30 days - DO NOT REPEAT
  if (context.completed_actions && context.completed_actions.length > 0) {
    const doneActions = context.completed_actions.slice(0, 15).map((a: any) => a.action_text).filter(Boolean);
    if (doneActions.length > 0) {
      formatted += `\nALREADY DONE (DO NOT REPEAT THESE):\n${doneActions.join('\n')}\n`;
    }
  }

  return formatted.trim();
}

// Format context with semantic results included
export function formatSemanticContextForAI(context: SemanticContext): string {
  let formatted = formatContextForAI(context);
  
  // Add semantically relevant insights (may be older but highly relevant)
  if (context.semantic_insights && context.semantic_insights.length > 0) {
    const semanticText = context.semantic_insights
      .slice(0, 5)
      .map((i: any) => `- ${i.title}: ${i.content?.substring(0, 120) || ''}`)
      .join('\n');
    formatted += `\n\nRELEVANT FROM HISTORY (semantically matched):\n${semanticText}`;
  }
  
  // Add semantically relevant documents
  if (context.semantic_documents && context.semantic_documents.length > 0) {
    const docText = context.semantic_documents
      .slice(0, 3)
      .map((d: any) => `- ${d.title}: ${d.summary?.substring(0, 80) || ''}`)
      .join('\n');
    formatted += `\n\nRELEVANT DOCUMENTS:\n${docText}`;
  }
  
  return formatted;
}

// Format context specifically for document intelligence
export function formatDocumentContext(context: DocumentContext): string {
  let formatted = "";

  if (context.identity_seed) {
    formatted += `USER'S IDENTITY & DIRECTION:\n${context.identity_seed}\n\n`;
  }

  if (context.weekly_focus) {
    formatted += `CURRENT REALITY:\n${context.weekly_focus}\n\n`;
  }

  if (context.active_experiments.length > 0) {
    const expText = context.active_experiments.map((e: any) => 
      `- ${e.title}${e.identity_shift_target ? `: ${e.identity_shift_target}` : ''}`
    ).join('\n');
    formatted += `ACTIVE EXPERIMENTS:\n${expText}\n\n`;
  }

  if (context.topics.length > 0) {
    const topicText = context.topics.map((t: any) => 
      `- ${t.name}${t.description ? `: ${t.description}` : ''}`
    ).join('\n');
    formatted += `LEARNING AREAS:\n${topicText}\n\n`;
  }

  if (context.recent_insights.length > 0) {
    const insightText = context.recent_insights.slice(0, 5).map((i: any) => 
      `- ${i.title}: ${i.content.substring(0, 100)}`
    ).join('\n');
    formatted += `RECENT INSIGHTS:\n${insightText}\n`;
  }

  return formatted.trim();
}
