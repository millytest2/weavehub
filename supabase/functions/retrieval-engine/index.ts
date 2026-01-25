import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContentItem {
  id: string;
  type: 'insight' | 'document';
  title: string;
  content: string;
  topic_id: string | null;
  created_at: string;
  relevance_score: number;
  access_count: number;
  last_accessed: string | null;
}

interface ClassificationResult {
  topic_id: string | null;
  topic_name: string | null;
  themes: string[];
  pillars: string[];
  identity_alignment: number;
  action_potential: number;
}

interface ClusterResult {
  cluster_id: string;
  theme: string;
  items: string[];
  relevance: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { action, item_id, item_type, query, limit = 10 } = await req.json();
    console.log(`Retrieval Engine: action=${action}, user=${user.id}`);

    switch (action) {
      case 'classify':
        return await classifyContent(supabase, user.id, item_id, item_type, LOVABLE_API_KEY, corsHeaders);
      
      case 'cluster':
        return await clusterContent(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'rank':
        return await rankContent(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'surface':
        return await surfaceRelevant(supabase, user.id, query, limit, LOVABLE_API_KEY, corsHeaders);
      
      case 'resurface':
        return await resurfaceForgotten(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
  } catch (error) {
    console.error("Retrieval Engine error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// Classify a single piece of content
async function classifyContent(
  supabase: any, 
  userId: string, 
  itemId: string, 
  itemType: 'insight' | 'document',
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  // Fetch the item
  const table = itemType === 'insight' ? 'insights' : 'documents';
  const contentField = itemType === 'insight' ? 'content' : 'extracted_content';
  
  const { data: item, error: fetchError } = await supabase
    .from(table)
    .select(`id, title, ${contentField}, topic_id`)
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !item) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Fetch user's topics and identity
  const [topicsResult, identityResult] = await Promise.all([
    supabase.from('topics').select('id, name, description').eq('user_id', userId),
    supabase.from('identity_seeds').select('content, core_values').eq('user_id', userId).maybeSingle()
  ]);

  const topics = topicsResult.data || [];
  const identity = identityResult.data;
  const content = item[contentField] || item.title;

  // Use AI to classify
  const classification = await aiClassify(
    content,
    topics,
    identity,
    apiKey
  );

  // Update the item with classification
  const updateData: any = {
    relevance_score: calculateRelevanceScore(classification, item)
  };

  if (classification.topic_id && !item.topic_id) {
    updateData.topic_id = classification.topic_id;
  }

  await supabase
    .from(table)
    .update(updateData)
    .eq('id', itemId)
    .eq('user_id', userId);

  console.log(`Classified ${itemType} ${itemId}: topic=${classification.topic_name}, alignment=${classification.identity_alignment}`);

  return new Response(JSON.stringify({ 
    success: true, 
    classification 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Cluster all user content into semantic groups
async function clusterContent(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  // Fetch recent insights and documents
  const [insightsResult, documentsResult] = await Promise.all([
    supabase
      .from('insights')
      .select('id, title, content, topic_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('documents')
      .select('id, title, summary, extracted_content, topic_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  const insights = insightsResult.data || [];
  const documents = documentsResult.data || [];

  // Prepare content summaries for clustering
  const contentItems = [
    ...insights.map((i: any) => ({
      id: i.id,
      type: 'insight' as const,
      text: `${i.title}: ${i.content?.substring(0, 300) || ''}`
    })),
    ...documents.map((d: any) => ({
      id: d.id,
      type: 'document' as const,
      text: `${d.title}: ${d.summary || d.extracted_content?.substring(0, 300) || ''}`
    }))
  ];

  if (contentItems.length < 3) {
    return new Response(JSON.stringify({ 
      success: true, 
      clusters: [],
      message: "Not enough content to cluster"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Use AI to identify clusters
  const clusters = await aiCluster(contentItems, apiKey);

  console.log(`Found ${clusters.length} clusters for user ${userId}`);

  return new Response(JSON.stringify({ 
    success: true, 
    clusters,
    total_items: contentItems.length
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Recalculate relevance rankings for all content
async function rankContent(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  // Fetch identity for alignment scoring
  const { data: identity } = await supabase
    .from('identity_seeds')
    .select('content, core_values, current_phase')
    .eq('user_id', userId)
    .maybeSingle();

  // Fetch recent experiments for context
  const { data: experiments } = await supabase
    .from('experiments')
    .select('title, hypothesis, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(3);

  // Update insights relevance
  const { data: insights } = await supabase
    .from('insights')
    .select('id, title, content, created_at, last_accessed, access_count, relevance_score')
    .eq('user_id', userId);

  let updatedCount = 0;
  for (const insight of (insights || [])) {
    const newScore = calculateDynamicRelevance(
      insight,
      identity,
      experiments || []
    );
    
    if (Math.abs(newScore - (insight.relevance_score || 0)) > 0.05) {
      await supabase
        .from('insights')
        .update({ relevance_score: newScore })
        .eq('id', insight.id);
      updatedCount++;
    }
  }

  // Update documents relevance
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, summary, created_at, last_accessed, access_count, relevance_score')
    .eq('user_id', userId);

  for (const doc of (documents || [])) {
    const newScore = calculateDynamicRelevance(
      { ...doc, content: doc.summary },
      identity,
      experiments || []
    );
    
    if (Math.abs(newScore - (doc.relevance_score || 0)) > 0.05) {
      await supabase
        .from('documents')
        .update({ relevance_score: newScore })
        .eq('id', doc.id);
      updatedCount++;
    }
  }

  console.log(`Ranked content for user ${userId}: ${updatedCount} items updated`);

  return new Response(JSON.stringify({ 
    success: true, 
    updated: updatedCount,
    total_insights: insights?.length || 0,
    total_documents: documents?.length || 0
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Surface content relevant to a specific query/context
async function surfaceRelevant(
  supabase: any,
  userId: string,
  query: string,
  limit: number,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  if (!query || query.trim().length < 3) {
    return new Response(JSON.stringify({ error: "Query too short" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Fetch all content
  const [insightsResult, documentsResult] = await Promise.all([
    supabase
      .from('insights')
      .select('id, title, content, source, created_at, relevance_score, topic_id')
      .eq('user_id', userId)
      .order('relevance_score', { ascending: false })
      .limit(50),
    supabase
      .from('documents')
      .select('id, title, summary, extracted_content, created_at, relevance_score, topic_id')
      .eq('user_id', userId)
      .order('relevance_score', { ascending: false })
      .limit(25)
  ]);

  const insights = insightsResult.data || [];
  const documents = documentsResult.data || [];

  // Use AI to find most relevant items and generate synthesis
  const { items: relevant, synthesis } = await aiSurfaceRelevant(
    query,
    insights,
    documents,
    limit,
    apiKey
  );

  console.log(`Surfaced ${relevant.length} items for query: "${query.substring(0, 50)}..."`);

  return new Response(JSON.stringify({ 
    success: true, 
    items: relevant,  // Changed from 'results' to 'items' to match frontend
    synthesis,        // Add AI synthesis
    query
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Find forgotten but valuable content to resurface
async function resurfaceForgotten(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  // Find high-value items that haven't been accessed recently
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [insightsResult, documentsResult] = await Promise.all([
    supabase
      .from('insights')
      .select('id, title, content, created_at, last_accessed, access_count, relevance_score')
      .eq('user_id', userId)
      .lt('last_accessed', thirtyDaysAgo.toISOString())
      .gt('relevance_score', 0.5)
      .order('relevance_score', { ascending: false })
      .limit(10),
    supabase
      .from('documents')
      .select('id, title, summary, created_at, last_accessed, access_count, relevance_score')
      .eq('user_id', userId)
      .lt('last_accessed', thirtyDaysAgo.toISOString())
      .gt('relevance_score', 0.5)
      .order('relevance_score', { ascending: false })
      .limit(5)
  ]);

  const forgotten = [
    ...(insightsResult.data || []).map((i: any) => ({ ...i, type: 'insight' })),
    ...(documentsResult.data || []).map((d: any) => ({ ...d, type: 'document' }))
  ].sort((a: any, b: any) => (b.relevance_score || 0) - (a.relevance_score || 0)).slice(0, 5);

  console.log(`Found ${forgotten.length} forgotten valuable items for user ${userId}`);

  return new Response(JSON.stringify({ 
    success: true, 
    forgotten,
    message: forgotten.length > 0 
      ? "These valuable items haven't been accessed in 30+ days"
      : "No forgotten valuable content found"
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// AI Classification
async function aiClassify(
  content: string,
  topics: Array<{ id: string; name: string; description: string | null }>,
  identity: { content: string; core_values: string | null } | null,
  apiKey: string
): Promise<ClassificationResult> {
  const topicList = topics.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n');
  const identityContext = identity 
    ? `Identity: ${identity.content}\nValues: ${identity.core_values || 'Not specified'}`
    : 'No identity defined';

  const prompt = `Classify this content and return JSON only.

CONTENT:
${content.substring(0, 2000)}

AVAILABLE TOPICS:
${topicList || 'No topics defined'}

USER CONTEXT:
${identityContext}

Return JSON with:
{
  "topic_name": "best matching topic name from list or null",
  "themes": ["2-4 key themes"],
  "pillars": ["relevant life pillars: Stability, Skill, Content, Health, Presence, Admin, Dating, Learning"],
  "identity_alignment": 0.0-1.0 score of how aligned this is with user's identity,
  "action_potential": 0.0-1.0 score of how actionable this content is
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a content classifier. Return only valid JSON, no markdown." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Classification AI error:", response.status);
      return defaultClassification();
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    // Match topic name to ID
    const matchedTopic = topics.find(t => 
      t.name.toLowerCase() === result.topic_name?.toLowerCase()
    );

    return {
      topic_id: matchedTopic?.id || null,
      topic_name: result.topic_name || null,
      themes: result.themes || [],
      pillars: result.pillars || [],
      identity_alignment: Math.min(1, Math.max(0, result.identity_alignment || 0.5)),
      action_potential: Math.min(1, Math.max(0, result.action_potential || 0.5))
    };
  } catch (error) {
    console.error("Classification error:", error);
    return defaultClassification();
  }
}

function defaultClassification(): ClassificationResult {
  return {
    topic_id: null,
    topic_name: null,
    themes: [],
    pillars: [],
    identity_alignment: 0.5,
    action_potential: 0.5
  };
}

// AI Clustering
async function aiCluster(
  items: Array<{ id: string; type: string; text: string }>,
  apiKey: string
): Promise<ClusterResult[]> {
  const itemList = items.slice(0, 50).map((item, i) => 
    `[${i}] ${item.type}: ${item.text.substring(0, 150)}`
  ).join('\n');

  const prompt = `Group these content items into 3-6 semantic clusters. Return JSON only.

ITEMS:
${itemList}

Return JSON array:
[
  {
    "cluster_id": "unique_id",
    "theme": "cluster theme name (2-4 words)",
    "item_indices": [0, 3, 7],
    "relevance": 0.0-1.0 score of cluster importance
  }
]

Group by semantic meaning, not surface keywords. Each item can be in max 1 cluster.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a semantic clustering engine. Return only valid JSON array." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Clustering AI error:", response.status);
      return [];
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const clusters = JSON.parse(cleaned);

    return clusters.map((c: any) => ({
      cluster_id: c.cluster_id,
      theme: c.theme,
      items: (c.item_indices || []).map((i: number) => items[i]?.id).filter(Boolean),
      relevance: c.relevance || 0.5
    }));
  } catch (error) {
    console.error("Clustering error:", error);
    return [];
  }
}

// AI Surface Relevant - returns items AND a synthesis
async function aiSurfaceRelevant(
  query: string,
  insights: any[],
  documents: any[],
  limit: number,
  apiKey: string
): Promise<{ items: any[]; synthesis: string | null }> {
  const allItems = [
    ...insights.map(i => ({
      id: i.id,
      type: 'insight',
      title: i.title,
      preview: i.content?.substring(0, 200) || '',
      score: i.relevance_score,
      created_at: i.created_at
    })),
    ...documents.map(d => ({
      id: d.id,
      type: 'document',
      title: d.title,
      preview: d.summary || d.extracted_content?.substring(0, 200) || '',
      score: d.relevance_score,
      created_at: d.created_at
    }))
  ];

  if (allItems.length === 0) {
    return { items: [], synthesis: null };
  }

  const itemList = allItems.slice(0, 40).map((item, i) => 
    `[${i}] ${item.type} "${item.title}": ${item.preview}`
  ).join('\n\n');

  const prompt = `Find the ${limit} most relevant items for this query and synthesize what you find.

QUERY: ${query}

ITEMS:
${itemList}

Return JSON:
{
  "relevant_indices": [5, 12, 3, ...],
  "synthesis": "A 1-2 sentence direct answer based on the user's own captured knowledge. Reference specific titles when relevant. Be concrete, not generic."
}

Consider semantic meaning, not just keyword matching. The synthesis should sound like you're surfacing what they already know.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a personal knowledge retrieval engine. Return only valid JSON. Your synthesis should reflect the user's own captured wisdom back to them." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Surface AI error:", response.status);
      return { items: allItems.slice(0, limit), synthesis: null };
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    const items = (result.relevant_indices || [])
      .slice(0, limit)
      .map((i: number) => allItems[i])
      .filter(Boolean);

    return { 
      items: items.length > 0 ? items : allItems.slice(0, limit),
      synthesis: result.synthesis || null 
    };
  } catch (error) {
    console.error("Surface error:", error);
    return { items: allItems.slice(0, limit), synthesis: null };
  }
}

// Calculate relevance score
function calculateRelevanceScore(classification: ClassificationResult, item: any): number {
  const alignmentWeight = 0.4;
  const actionWeight = 0.3;
  const recencyWeight = 0.2;
  const accessWeight = 0.1;

  const createdAt = new Date(item.created_at);
  const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - (daysSinceCreation / 60)); // Decay over 60 days

  const accessScore = Math.min(1, (item.access_count || 0) / 10);

  return (
    classification.identity_alignment * alignmentWeight +
    classification.action_potential * actionWeight +
    recencyScore * recencyWeight +
    accessScore * accessWeight
  );
}

// Dynamic relevance calculation
function calculateDynamicRelevance(
  item: any,
  identity: any,
  experiments: any[]
): number {
  const content = item.content || item.summary || item.title;
  const contentLower = content.toLowerCase();
  
  // Base score from existing relevance
  let score = item.relevance_score || 0.5;

  // Identity alignment boost
  if (identity?.content) {
    const identityWords = identity.content.toLowerCase().split(/\s+/);
    const matchCount = identityWords.filter((w: string) => 
      w.length > 4 && contentLower.includes(w)
    ).length;
    score += Math.min(0.2, matchCount * 0.02);
  }

  // Experiment relevance boost
  for (const exp of experiments) {
    if (exp.title && contentLower.includes(exp.title.toLowerCase().split(' ')[0])) {
      score += 0.1;
      break;
    }
  }

  // Recency factor
  const daysSince = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.pow(0.98, daysSince); // 2% decay per day
  score *= (0.5 + 0.5 * recencyFactor);

  // Access frequency boost
  const accessBoost = Math.min(0.15, (item.access_count || 0) * 0.015);
  score += accessBoost;

  return Math.min(1, Math.max(0, score));
}
