// Use generic type to avoid version conflicts across functions
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Agent-specific context weight presets
export type AgentType = "navigator" | "experiment" | "path" | "next-rep" | "decision-mirror" | "return-to-self" | "default";

export interface ContextWeights {
  identity: number;
  insights: number;
  documents: number;
  experiments: number;
  actions: number;
}

// Context-dependent weights for different agent outputs
export const AGENT_WEIGHTS: Record<AgentType, ContextWeights> = {
  // Navigator: balanced for daily actions
  navigator: { identity: 0.40, insights: 0.30, documents: 0.10, experiments: 0.15, actions: 0.05 },
  
  // Experiment Generator: heavy on documents and identity for friction-based experiments
  experiment: { identity: 0.40, insights: 0.15, documents: 0.35, experiments: 0.05, actions: 0.05 },
  
  // Path Generator: heavy on documents and insights for building learning paths
  path: { identity: 0.25, insights: 0.25, documents: 0.40, experiments: 0.05, actions: 0.05 },
  
  // Next-Rep: identity-heavy for drift moments
  "next-rep": { identity: 0.50, insights: 0.25, documents: 0.05, experiments: 0.15, actions: 0.05 },
  
  // Decision Mirror: identity and insights for reflection
  "decision-mirror": { identity: 0.45, insights: 0.35, documents: 0.05, experiments: 0.10, actions: 0.05 },
  
  // Return to Self: pure identity grounding
  "return-to-self": { identity: 0.60, insights: 0.25, documents: 0.05, experiments: 0.05, actions: 0.05 },
  
  // Default fallback
  default: { identity: 0.40, insights: 0.30, documents: 0.10, experiments: 0.15, actions: 0.05 },
};

export interface CompactContext {
  identity_seed: string | null;
  core_values: string | null;
  current_phase: string | null;
  weekly_focus: string | null;
  experiments: {
    in_progress: any[];
    planning: any[];
  };
  past_experiments: any[];  // All experiments in last 60 days for de-duplication
  past_paths: any[];  // All learning paths in last 60 days for de-duplication
  key_insights: any[];
  key_documents: any[];
  recent_actions: any[];
  completed_actions: any[];
  pillar_history: string[];
  topics: any[];
  connections: any[];
  active_projects: string[];  // Extracted active projects/builds from user's data
  last_project_focus: string | null;  // Last project that received attention
  // NEW: Deep personal extraction
  current_hurdles: string[];  // Specific friction points holding them back
  aspirational_figures: string[];  // People they look up to from their content
  story_arc: string | null;  // The narrative of their transformation
  recurring_themes: string[];  // Themes that keep showing up across their data
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

// Generate actual vector embedding using AI
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY || !text) {
    console.log("No API key or text for embedding generation");
    return null;
  }
  
  try {
    // Use AI to generate semantic representation for vector search
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
            content: `You are an embedding generator. Convert the text into a semantic fingerprint.
Extract the 15 most important concepts, themes, and meanings. 
Return ONLY a JSON array of 15 floats between -1 and 1 representing semantic dimensions:
[identity, growth, action, emotion, skill, health, connection, creativity, stability, learning, presence, content, admin, challenge, insight]
Each dimension should be scored based on how relevant it is to the text.` 
          },
          { role: "user", content: text.substring(0, 3000) }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Failed to generate embedding:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse the JSON array
    const match = content.match(/\[[\d\s,.\-]+\]/);
    if (match) {
      const embedding = JSON.parse(match[0]);
      if (Array.isArray(embedding) && embedding.length >= 10) {
        console.log("Generated semantic embedding:", embedding.slice(0, 5));
        return embedding;
      }
    }
    
    console.log("Could not parse embedding from response");
    return null;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Extract semantic keywords for fallback text search
async function extractSemanticKeywords(text: string): Promise<string[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY || !text) return [];
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { 
            role: "system", 
            content: "Extract 8-12 key semantic concepts from this text. Return only comma-separated keywords/phrases, nothing else." 
          },
          { role: "user", content: text.substring(0, 2000) }
        ],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const keywords = data.choices?.[0]?.message?.content || "";
    return keywords.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
  } catch {
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
  
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [identitySeed, insights, documents, experiments, pastExperiments, learningPaths, dailyTasks, actionHistory, topics, connections] = await Promise.all([
    supabase.from("identity_seeds").select("content, current_phase, last_pillar_used, weekly_focus, core_values").eq("user_id", userId).maybeSingle(),
    supabase.from("insights").select("id, title, content, source, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    supabase.from("documents").select("id, title, summary, extracted_content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("experiments").select("id, title, description, status, identity_shift_target, hypothesis").eq("user_id", userId).in("status", ["in_progress", "planning"]).order("created_at", { ascending: false }).limit(5),
    // Fetch ALL past experiments to avoid regenerating similar ones
    supabase.from("experiments").select("title, description, identity_shift_target").eq("user_id", userId).gte("created_at", sixtyDaysAgo.toISOString()).order("created_at", { ascending: false }).limit(20),
    // Fetch ALL learning paths to avoid regenerating similar ones
    supabase.from("learning_paths").select("title, description").eq("user_id", userId).gte("created_at", sixtyDaysAgo.toISOString()).order("created_at", { ascending: false }).limit(20),
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
  
  // Extract active projects from topics, experiments, and recent actions
  // Projects are things the user is actively building/working on
  const projectKeywords = ['upath', 'weave', 'app', 'build', 'ship', 'launch', 'project', 'product', 'startup', 'business', 'site', 'platform'];
  const topicNames = (topics.data || []).map((t: any) => t.name);
  const experimentTitles = allExperiments.map((e: any) => e.title);
  const recentActionTexts = (actionHistory.data || []).slice(0, 10).map((a: any) => a.action_text || '');
  
  // Combine all text to find project mentions
  const allText = [
    identitySeed.data?.content || '',
    identitySeed.data?.weekly_focus || '',
    ...topicNames,
    ...experimentTitles,
    ...recentActionTexts
  ].join(' ').toLowerCase();
  
  // Extended text including insights and documents for deeper extraction
  const extendedText = [
    allText,
    ...keyInsights.map((i: any) => `${i.title} ${i.content}`),
    ...(documents.data || []).map((d: any) => `${d.title} ${d.summary || ''} ${d.extracted_content || ''}`),
  ].join(' ');
  
  // Extract unique project names (capitalized words that appear in context)
  const activeProjects: string[] = [];
  const commonProjects = ['UPath', 'Weave', 'LinkedIn', 'Twitter', 'YouTube', 'Instagram'];
  
  for (const proj of commonProjects) {
    if (allText.includes(proj.toLowerCase())) {
      activeProjects.push(proj);
    }
  }
  
  // Also extract from topics as potential projects
  for (const topic of topicNames) {
    if (topic && !activeProjects.some(p => p.toLowerCase() === topic.toLowerCase())) {
      // Check if it looks like a project (short name, capitalized, or contains project keywords)
      const topicLower = topic.toLowerCase();
      if (projectKeywords.some(k => topicLower.includes(k)) || topic.length < 15) {
        activeProjects.push(topic);
      }
    }
  }
  
  // Determine last project focused on from recent actions
  let lastProjectFocus: string | null = null;
  for (const action of recentActionTexts) {
    const actionLower = action.toLowerCase();
    for (const proj of activeProjects) {
      if (actionLower.includes(proj.toLowerCase())) {
        lastProjectFocus = proj;
        break;
      }
    }
    if (lastProjectFocus) break;
  }

  // ==== NEW: Extract current hurdles from all text ====
  const hurdlePatterns = [
    { pattern: /(?:struggle|struggling|hard|difficult|can't|cannot|fear|afraid|scared|anxious|worry|worried|stuck|block|blocking|holding.?back|avoid|avoiding|procrastinat|resist|hesitat)/gi, type: 'friction' },
    { pattern: /(?:posting|content|share|sharing|put.*out|public|visibility|showing up|social media|cross.?platform)/gi, type: 'content' },
    { pattern: /(?:what.*think|judgment|judging|authentic|real|honest|vulnerability|vulnerable|caring.*opinion|others.*think)/gi, type: 'authenticity' },
    { pattern: /(?:consistent|consistency|daily|every day|regularly|habit|routine|discipline)/gi, type: 'consistency' },
    { pattern: /(?:perfecti|edit.*forever|never.*good|not.*ready|overthink|over.?think|too.*much.*time)/gi, type: 'perfectionism' },
    { pattern: /(?:connect|reach.*out|network|community|isolat|alone|lonely)/gi, type: 'connection' },
  ];
  
  const currentHurdles: string[] = [];
  const extendedLower = extendedText.toLowerCase();
  
  // Extract specific hurdle phrases
  const hurdlePhrases: string[] = [];
  if (extendedLower.includes('post') && (extendedLower.includes('consistent') || extendedLower.includes('daily') || extendedLower.includes('every day'))) {
    hurdlePhrases.push('posting content consistently');
  }
  if (extendedLower.includes('what') && extendedLower.includes('think') || extendedLower.includes('caring what')) {
    hurdlePhrases.push('caring what others think');
  }
  if (extendedLower.includes('authentic') || extendedLower.includes('real') && extendedLower.includes('self')) {
    hurdlePhrases.push('showing up authentically');
  }
  if (extendedLower.includes('document') || extendedLower.includes('story') && extendedLower.includes('tell')) {
    hurdlePhrases.push('documenting and telling my story');
  }
  if (extendedLower.includes('perfect') || extendedLower.includes('edit') && extendedLower.includes('too')) {
    hurdlePhrases.push('perfectionism and over-editing');
  }
  if (extendedLower.includes('cross') && extendedLower.includes('platform')) {
    hurdlePhrases.push('posting across multiple platforms');
  }
  if (extendedLower.includes('let') && extendedLower.includes('go')) {
    hurdlePhrases.push('letting go of control');
  }
  if (extendedLower.includes('reach') && extendedLower.includes('out') || extendedLower.includes('connect')) {
    hurdlePhrases.push('reaching out and connecting');
  }
  
  // Add unique hurdles
  hurdlePhrases.forEach(h => {
    if (!currentHurdles.includes(h)) currentHurdles.push(h);
  });

  // ==== NEW: Extract aspirational figures from content ====
  const aspirationalFigures: string[] = [];
  const namePatterns = [
    /(?:like\s+|from\s+|learned.*from\s+|inspired.*by\s+|watch.*|follow.*|said\s+by\s+|by\s+|admire\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  ];
  
  // Common creator/entrepreneur names to look for
  const knownFigures = [
    'Ali Abdaal', 'MrBeast', 'Gary Vee', 'Gary Vaynerchuk', 'Naval', 'Naval Ravikant',
    'Tim Ferriss', 'Jocko', 'Jocko Willink', 'David Goggins', 'Huberman', 'Andrew Huberman',
    'Casey Neistat', 'Logan Paul', 'Mr Beast', 'Hormozi', 'Alex Hormozi', 'Lex Fridman',
    'Joe Rogan', 'Elon', 'Elon Musk', 'Sam Altman', 'Paul Graham', 'Naval', 'Marcus Aurelius',
    'Ryan Holiday', 'Sahil Bloom', 'Dickie Bush', 'Nicolas Cole', 'Dan Koe', 'Justin Welsh',
    'Pieter Levels', 'Levels', 'Marc Lou', 'Tony Robbins', 'Jordan Peterson',
    'Codie Sanchez', 'Chris Williamson', 'Hamza', 'Iman Gadzhi'
  ];
  
  for (const figure of knownFigures) {
    if (extendedText.toLowerCase().includes(figure.toLowerCase())) {
      if (!aspirationalFigures.includes(figure)) {
        aspirationalFigures.push(figure);
      }
    }
  }

  // ==== NEW: Build story arc from identity and context ====
  let storyArc: string | null = null;
  const identity = identitySeed.data?.content || '';
  const weeklyFocus = identitySeed.data?.weekly_focus || '';
  const coreValues = identitySeed.data?.core_values || '';
  
  if (identity || weeklyFocus) {
    // Extract key transformation elements
    const fromPatterns = identity.match(/(?:from|was|used to be|before)[^.]*(?:\.|$)/gi) || [];
    const toPatterns = identity.match(/(?:becoming|want to be|moving toward|working on|building|creating)[^.]*(?:\.|$)/gi) || [];
    
    if (fromPatterns.length > 0 || toPatterns.length > 0) {
      const from = fromPatterns[0]?.trim() || 'where I was';
      const to = toPatterns[0]?.trim() || weeklyFocus || 'who I am becoming';
      storyArc = `${from} → ${to}`;
    } else if (weeklyFocus) {
      storyArc = `Currently focused on: ${weeklyFocus}`;
    }
  }

  // ==== NEW: Extract recurring themes ====
  const themeKeywords: Record<string, number> = {};
  const themeWords = extendedText.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !['about', 'their', 'there', 'these', 'those', 'which', 'would', 'could', 'should', 'being', 'having'].includes(w));
  
  themeWords.forEach(word => {
    themeKeywords[word] = (themeKeywords[word] || 0) + 1;
  });
  
  const recurringThemes = Object.entries(themeKeywords)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return {
    identity_seed: identitySeed.data?.content || null,
    core_values: identitySeed.data?.core_values || null,
    current_phase: identitySeed.data?.current_phase || "baseline",
    weekly_focus: identitySeed.data?.weekly_focus || null,
    experiments: {
      in_progress: allExperiments.filter((e: any) => e.status === "in_progress"),
      planning: allExperiments.filter((e: any) => e.status === "planning"),
    },
    past_experiments: pastExperiments.data || [],
    past_paths: learningPaths.data || [],
    key_insights: keyInsights,
    key_documents: documents.data || [],
    recent_actions: dailyTasks.data || [],
    completed_actions: actionHistory.data || [],
    pillar_history: pillarHistory,
    topics: topics.data || [],
    connections: connections.data || [],
    active_projects: activeProjects.slice(0, 8),
    last_project_focus: lastProjectFocus,
    // NEW: Deep personal extraction
    current_hurdles: currentHurdles.slice(0, 5),
    aspirational_figures: aspirationalFigures.slice(0, 5),
    story_arc: storyArc,
    recurring_themes: recurringThemes,
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

  // Generate semantic keywords from identity seed using fallback keyword extraction
  const semanticKeywords = await extractSemanticKeywords(baseContext.identity_seed);
  
  if (!semanticKeywords || semanticKeywords.length === 0) {
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
      // We have embeddings - try vector search
      console.log("Embeddings exist - attempting vector-based semantic search");
      
      // Generate query embedding from identity
      const queryEmbedding = await generateEmbedding(baseContext.identity_seed);
      
      if (queryEmbedding) {
        // Use RPC for vector search
        const { data: vectorInsights } = await supabase.rpc('search_insights_semantic', {
          user_uuid: userId,
          query_embedding: `[${queryEmbedding.join(',')}]`,
          match_count: 10,
          similarity_threshold: 0.3
        });
        
        const { data: vectorDocs } = await supabase.rpc('search_documents_semantic', {
          user_uuid: userId,
          query_embedding: `[${queryEmbedding.join(',')}]`,
          match_count: 5,
          similarity_threshold: 0.3
        });
        
        if (vectorInsights?.length > 0 || vectorDocs?.length > 0) {
          console.log(`Vector search found: ${vectorInsights?.length || 0} insights, ${vectorDocs?.length || 0} documents`);
          return {
            ...baseContext,
            semantic_insights: vectorInsights || [],
            semantic_documents: vectorDocs || [],
          };
        }
      }
    }

    // Fallback: Text-based semantic search using keywords
    const primaryKeyword = semanticKeywords[0] || '';
    
    // Search insights by content relevance
    const { data: semanticInsights } = await supabase
      .from("insights")
      .select("id, title, content, source, created_at, relevance_score")
      .eq("user_id", userId)
      .or(`title.ilike.%${primaryKeyword}%,content.ilike.%${primaryKeyword}%`)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(10);

    // Search documents by relevance
    const { data: semanticDocs } = await supabase
      .from("documents")
      .select("id, title, summary, created_at, relevance_score")
      .eq("user_id", userId)
      .or(`title.ilike.%${primaryKeyword}%,summary.ilike.%${primaryKeyword}%`)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(5);

    console.log(`Keyword search found: ${semanticInsights?.length || 0} insights, ${semanticDocs?.length || 0} documents`);

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

// Detect integration patterns - ONE practice showing up across contexts
function detectIntegrationPatterns(context: CompactContext): string {
  const patterns: string[] = [];
  
  // Combine all text sources to find recurring themes
  const allText = [
    context.identity_seed || '',
    context.weekly_focus || '',
    context.core_values || '',
    ...context.key_insights.map((i: any) => `${i.title} ${i.content}`),
    ...context.completed_actions.map((a: any) => a.action_text || ''),
    ...(context.experiments.in_progress || []).map((e: any) => `${e.title} ${e.description || ''}`),
  ].join(' ').toLowerCase();
  
  // Core practice detection - the ONE thing they're practicing everywhere
  const practiceSignals = [
    { pattern: /stay(ing)? (with|present|grounded|expanded)/gi, practice: "staying present with discomfort" },
    { pattern: /trust(ing)? (yourself|the process|your)/gi, practice: "building self-trust" },
    { pattern: /let(ting)? go|release|surrender/gi, practice: "letting go of control" },
    { pattern: /consistent|consistency|show(ing)? up/gi, practice: "consistent action over perfection" },
    { pattern: /express(ion)?|create|build|ship/gi, practice: "expression over consumption" },
    { pattern: /presence|breath|ground/gi, practice: "nervous system regulation" },
    { pattern: /connect|reach out|relationship/gi, practice: "authentic connection" },
  ];
  
  for (const signal of practiceSignals) {
    const matches = allText.match(signal.pattern);
    if (matches && matches.length >= 2) {
      patterns.push(signal.practice);
    }
  }
  
  // Context detection - where the practice shows up
  const contexts: string[] = [];
  const contextSignals = [
    { keywords: ['gym', 'workout', 'body', 'weight', 'physical', 'fitness', 'lift'], context: 'body' },
    { keywords: ['upath', 'weave', 'build', 'ship', 'product', 'startup', 'code'], context: 'creation' },
    { keywords: ['content', 'twitter', 'linkedin', 'post', 'write', 'youtube', 'tiktok'], context: 'content' },
    { keywords: ['relationship', 'friend', 'social', 'connection', 'reach out'], context: 'relationships' },
    { keywords: ['money', 'income', 'mrr', 'revenue', 'financial'], context: 'financial' },
    { keywords: ['learn', 'read', 'study', 'curiosity', 'skill'], context: 'learning' },
    { keywords: ['bartend', 'job', 'work', 'career'], context: 'work' },
    { keywords: ['la', 'move', 'santa barbara', 'location'], context: 'life transition' },
  ];
  
  for (const signal of contextSignals) {
    if (signal.keywords.some(k => allText.includes(k))) {
      contexts.push(signal.context);
    }
  }
  
  if (patterns.length > 0 && contexts.length > 1) {
    return `\nINTEGRATION DETECTED:\nYou're practicing "${patterns[0]}" across ${contexts.slice(0, 4).join(', ')}. These aren't separate areas to manage—they're ONE practice in different contexts.\n`;
  }
  
  return '';
}

// IDENTITY-FIRST context formatter
// Priority: Identity Seed (40%) > Insights (30%) > Experiments (20%) > Documents (5%) > Phase (5%)
export function formatContextForAI(context: CompactContext): string {
  let formatted = "";

  // PRIORITY 1: IDENTITY SEED (40%) - THE CORE DRIVER
  if (context.identity_seed) {
    formatted += `IDENTITY (PRIMARY DRIVER):\n${context.identity_seed}\n\n`;
  }
  
  // Core values - what they stand for
  if (context.core_values) {
    formatted += `CORE VALUES:\n${context.core_values}\n\n`;
  }

  // Current reality - user's situation in natural language
  if (context.weekly_focus) {
    formatted += `CURRENT REALITY:\n${context.weekly_focus}\n\n`;
  }
  
  // Integration pattern detection - reflect the ONE practice across contexts
  const integrationPattern = detectIntegrationPatterns(context);
  if (integrationPattern) {
    formatted += integrationPattern;
  }

  // PRIORITY 2: KEY INSIGHTS (30%) - behavioral/emotional signals with FULL content
  if (context.key_insights.length > 0) {
    const insightText = context.key_insights.slice(0, 6).map((i: any) => {
      const source = i.source ? ` [${i.source}]` : '';
      // 400 chars to capture actual concepts, techniques, and frameworks
      return `- ${i.title}${source}: ${i.content.substring(0, 400)}`;
    }).join('\n');
    formatted += `INSIGHTS (your captured knowledge):\n${insightText}\n\n`;
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

  // PRIORITY 4: DOCUMENTS - include actual extracted content, not just titles
  if (context.key_documents.length > 0) {
    const docText = context.key_documents.slice(0, 4).map((d: any) => {
      // Use extracted content if available (actual learnings), otherwise summary
      const content = d.extracted_content 
        ? d.extracted_content.substring(0, 500) 
        : (d.summary || '').substring(0, 150);
      return `- ${d.title}: ${content}`;
    }).join('\n');
    formatted += `FROM YOUR DOCUMENTS:\n${docText}\n\n`;
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
  
  // PROJECT BALANCING - weave between all active projects, don't over-index on one
  if (context.active_projects && context.active_projects.length > 0) {
    formatted += `\nACTIVE PROJECTS/BUILDS: ${context.active_projects.join(', ')}\n`;
    if (context.last_project_focus) {
      // Tell AI to rotate to a different project
      const otherProjects = context.active_projects.filter(p => p.toLowerCase() !== context.last_project_focus?.toLowerCase());
      if (otherProjects.length > 0) {
        formatted += `LAST FOCUS WAS: ${context.last_project_focus} - ROTATE TO: ${otherProjects.join(' or ')}\n`;
      }
    }
    formatted += `BALANCE RULE: Weave between ALL projects, don't push one repeatedly. User has multiple builds - touch different ones.\n`;
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

// Build a standardized context pack for agents (token-capped)
export interface ContextPack {
  identity: string | null;
  current_reality: string | null;
  core_values: string | null;
  date_context: string;
  insights: Array<{ title: string; content: string; source?: string }>;
  experiments: Array<{ title: string; status: string; identity_shift?: string }>;
  documents: Array<{ title: string; summary?: string }>;
  completed_actions: string[];
  pillar_history: string[];
}

export function buildContextPack(
  context: CompactContext,
  options: { maxInsights?: number; maxDocs?: number; maxActions?: number } = {}
): ContextPack {
  const { maxInsights = 8, maxDocs = 5, maxActions = 15 } = options;
  
  // Get current date context
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const dateContext = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()} (${timeOfDay})`;

  return {
    identity: context.identity_seed,
    current_reality: context.weekly_focus,
    core_values: null, // Would need to be fetched separately if needed
    date_context: dateContext,
    insights: context.key_insights.slice(0, maxInsights).map((i: any) => ({
      title: i.title,
      content: i.content?.substring(0, 300) || '',
      source: i.source
    })),
    experiments: [...context.experiments.in_progress, ...context.experiments.planning].slice(0, 5).map((e: any) => ({
      title: e.title,
      status: e.status,
      identity_shift: e.identity_shift_target?.substring(0, 100)
    })),
    documents: context.key_documents.slice(0, maxDocs).map((d: any) => ({
      title: d.title,
      summary: d.summary?.substring(0, 150) || d.extracted_content?.substring(0, 150)
    })),
    completed_actions: (context.completed_actions || []).slice(0, maxActions).map((a: any) => a.action_text).filter(Boolean),
    pillar_history: context.pillar_history.slice(0, 5)
  };
}

// Format context pack for AI prompt (token-efficient)
export function formatContextPack(pack: ContextPack): string {
  let formatted = `TODAY: ${pack.date_context}\n\n`;

  if (pack.identity) {
    formatted += `IDENTITY:\n${pack.identity}\n\n`;
  }

  if (pack.current_reality) {
    formatted += `CURRENT REALITY:\n${pack.current_reality}\n\n`;
  }

  if (pack.core_values) {
    formatted += `CORE VALUES: ${pack.core_values}\n\n`;
  }

  if (pack.insights.length > 0) {
    const insightText = pack.insights.map(i => `- ${i.title}: ${i.content}`).join('\n');
    formatted += `INSIGHTS:\n${insightText}\n\n`;
  }

  if (pack.experiments.length > 0) {
    const expText = pack.experiments.map(e => `- ${e.title} (${e.status})${e.identity_shift ? `: ${e.identity_shift}` : ''}`).join('\n');
    formatted += `EXPERIMENTS:\n${expText}\n\n`;
  }

  if (pack.documents.length > 0) {
    const docText = pack.documents.map(d => `- ${d.title}${d.summary ? `: ${d.summary}` : ''}`).join('\n');
    formatted += `DOCUMENTS:\n${docText}\n\n`;
  }

  if (pack.completed_actions.length > 0) {
    formatted += `ALREADY DONE (DO NOT REPEAT):\n${pack.completed_actions.join('\n')}\n\n`;
  }

  if (pack.pillar_history.length > 0) {
    formatted += `RECENT PILLARS: ${pack.pillar_history.join(' > ')}\n`;
  }

  return formatted.trim();
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

// Agent-specific weighted context formatter
// Uses different weights for different agent outputs
export function formatWeightedContextForAgent(
  context: CompactContext,
  agentType: AgentType,
  options: { maxTokens?: number; includeDocContent?: boolean } = {}
): string {
  const weights = AGENT_WEIGHTS[agentType] || AGENT_WEIGHTS.default;
  const { maxTokens = 6000, includeDocContent = false } = options;
  
  let formatted = "";
  let tokenEstimate = 0;
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  // Calculate proportional limits based on weights
  const totalWeight = weights.identity + weights.insights + weights.documents + weights.experiments + weights.actions;
  const identityLimit = Math.floor((weights.identity / totalWeight) * maxTokens);
  const insightsLimit = Math.floor((weights.insights / totalWeight) * maxTokens);
  const docsLimit = Math.floor((weights.documents / totalWeight) * maxTokens);
  const experimentsLimit = Math.floor((weights.experiments / totalWeight) * maxTokens);
  const actionsLimit = Math.floor((weights.actions / totalWeight) * maxTokens);

  // IDENTITY SECTION (weighted)
  if (context.identity_seed && tokenEstimate < identityLimit) {
    const identityText = `IDENTITY (weight: ${Math.round(weights.identity * 100)}%):\n${context.identity_seed}\n\n`;
    formatted += identityText;
    tokenEstimate += estimateTokens(identityText);
    
    if (context.core_values) {
      const valuesText = `CORE VALUES: ${context.core_values}\n\n`;
      formatted += valuesText;
      tokenEstimate += estimateTokens(valuesText);
    }
  }

  if (context.weekly_focus) {
    const realityText = `CURRENT REALITY:\n${context.weekly_focus}\n\n`;
    formatted += realityText;
    tokenEstimate += estimateTokens(realityText);
  }

  // DOCUMENTS SECTION (weighted - higher for experiment/path agents)
  if (context.key_documents.length > 0 && weights.documents > 0.2) {
    // For document-heavy agents, include more document content
    const docsToInclude = weights.documents >= 0.35 ? 6 : 4;
    const contentLength = includeDocContent ? 600 : 200;
    
    const docText = context.key_documents.slice(0, docsToInclude).map((d: any) => {
      const content = d.extracted_content 
        ? d.extracted_content.substring(0, contentLength) 
        : (d.summary || '').substring(0, contentLength);
      return `- ${d.title}: ${content}`;
    }).join('\n');
    
    const docSection = `FROM YOUR DOCUMENTS (weight: ${Math.round(weights.documents * 100)}%):\n${docText}\n\n`;
    if (estimateTokens(docSection) < docsLimit) {
      formatted += docSection;
      tokenEstimate += estimateTokens(docSection);
    }
  }

  // INSIGHTS SECTION (weighted)
  if (context.key_insights.length > 0) {
    const insightsToInclude = weights.insights >= 0.30 ? 8 : 5;
    const contentLength = weights.insights >= 0.30 ? 400 : 200;
    
    const insightText = context.key_insights.slice(0, insightsToInclude).map((i: any) => {
      const source = i.source ? ` [${i.source}]` : '';
      return `- ${i.title}${source}: ${i.content.substring(0, contentLength)}`;
    }).join('\n');
    
    const insightSection = `INSIGHTS (weight: ${Math.round(weights.insights * 100)}%):\n${insightText}\n\n`;
    if (estimateTokens(insightSection) < insightsLimit) {
      formatted += insightSection;
      tokenEstimate += estimateTokens(insightSection);
    }
  }

  // EXPERIMENTS SECTION (weighted)
  const allExperiments = [...context.experiments.in_progress, ...context.experiments.planning];
  if (allExperiments.length > 0) {
    const expText = allExperiments.slice(0, 5).map((e: any) => {
      const shift = e.identity_shift_target ? `: ${e.identity_shift_target.substring(0, 100)}` : '';
      const hypothesis = e.hypothesis ? ` | Hypothesis: ${e.hypothesis.substring(0, 80)}` : '';
      return `- ${e.title} (${e.status})${shift}${hypothesis}`;
    }).join('\n');
    
    const expSection = `EXPERIMENTS (weight: ${Math.round(weights.experiments * 100)}%):\n${expText}\n\n`;
    if (estimateTokens(expSection) < experimentsLimit) {
      formatted += expSection;
      tokenEstimate += estimateTokens(expSection);
    }
  }

  // ==== NEW: CURRENT HURDLES (critical for experiment design) ====
  if (context.current_hurdles && context.current_hurdles.length > 0) {
    formatted += `\nCURRENT HURDLES (friction points to push through):\n${context.current_hurdles.map(h => `- ${h}`).join('\n')}\n`;
  }

  // ==== NEW: ASPIRATIONAL FIGURES ====
  if (context.aspirational_figures && context.aspirational_figures.length > 0) {
    formatted += `\nASPIRATIONAL FIGURES (people this user looks up to):\n${context.aspirational_figures.join(', ')}\n`;
  }

  // ==== NEW: STORY ARC ====
  if (context.story_arc) {
    formatted += `\nSTORY ARC (the transformation they're living):\n${context.story_arc}\n`;
  }

  // ==== NEW: RECURRING THEMES ====
  if (context.recurring_themes && context.recurring_themes.length > 0) {
    formatted += `\nRECURRING THEMES: ${context.recurring_themes.slice(0, 8).join(', ')}\n`;
  }

  // Topics for context
  if (context.topics.length > 0) {
    formatted += `\nTOPICS: ${context.topics.map((t: any) => t.name).join(', ')}\n`;
  }

  // Phase context
  if (context.current_phase) {
    formatted += `PHASE: ${context.current_phase}\n`;
  }

  // Pillar history
  if (context.pillar_history.length > 0) {
    formatted += `RECENT PILLARS: ${context.pillar_history.slice(0, 5).join(' > ')}\n`;
  }

  // Recent completed actions
  const completedActions = context.recent_actions.filter((a: any) => a.completed);
  if (completedActions.length > 0) {
    formatted += `RECENT WINS: ${completedActions.slice(0, 3).map((a: any) => a.one_thing).join('; ')}\n`;
  }

  // Completed actions to avoid (limited by actions weight)
  if (context.completed_actions && context.completed_actions.length > 0 && weights.actions > 0) {
    const actionsToShow = Math.min(15, Math.floor(weights.actions * 100));
    const doneActions = context.completed_actions.slice(0, actionsToShow).map((a: any) => a.action_text).filter(Boolean);
    if (doneActions.length > 0) {
      formatted += `\nALREADY DONE (DO NOT REPEAT):\n${doneActions.join('\n')}\n`;
    }
  }

  // Past experiments to avoid regenerating similar ones (for experiment/path agents)
  if ((agentType === 'experiment' || agentType === 'path') && context.past_experiments && context.past_experiments.length > 0) {
    const pastExpTitles = context.past_experiments.slice(0, 15).map((e: any) => 
      `- ${e.title}${e.identity_shift_target ? ` (${e.identity_shift_target.substring(0, 50)})` : ''}`
    ).join('\n');
    formatted += `\nALREADY CREATED EXPERIMENTS (DO NOT RECREATE SIMILAR):\n${pastExpTitles}\n`;
  }

  // Past learning paths to avoid regenerating similar ones
  if (agentType === 'path' && context.past_paths && context.past_paths.length > 0) {
    const pastPathTitles = context.past_paths.slice(0, 10).map((p: any) => `- ${p.title}`).join('\n');
    formatted += `\nALREADY CREATED PATHS (DO NOT RECREATE SIMILAR):\n${pastPathTitles}\n`;
  }

  return formatted.trim();
}
