import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlignmentScore {
  identity_alignment: number;      // How aligned to who they're becoming
  values_alignment: number;        // How aligned to core values
  current_reality_fit: number;     // How relevant to current situation
  objective_alignment: number;     // How aligned to Weave's purpose (turning saved content into action)
  action_potential: number;        // How actionable this is
  archetype_value: number;         // How well it delivers value based on user archetype (replaces content_fuel)
  ideal_self_push: number;         // How much this pushes toward ideal self
  overall: number;                 // Weighted composite
}

interface WeeklyPattern {
  wins: string[];
  themes: string[];
  pillars_active: string[];
  momentum_score: number;
  identity_shifts: string[];
}

interface UserAlignment {
  identity_summary: string;
  ideal_self: string;
  current_reality: string;
  core_values: string[];
  active_objectives: string[];
  weekly_patterns: WeeklyPattern;
  content_alignment_scores: Record<string, AlignmentScore>;
  experiment_learnings: string[];
  forgotten_gems: string[];
  next_edge: string;
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

    const { action } = await req.json();
    console.log(`Alignment Engine: action=${action}, user=${user.id}`);

    switch (action) {
      case 'full-alignment':
        return await computeFullAlignment(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'weekly-synthesis':
        return await synthesizeWeek(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'score-content':
        return await scoreAllContent(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'extract-learnings':
        return await extractExperimentLearnings(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      case 'find-next-edge':
        return await findNextEdge(supabase, user.id, LOVABLE_API_KEY, corsHeaders);
      
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
  } catch (error) {
    console.error("Alignment Engine error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// Full alignment computation - the master function
async function computeFullAlignment(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  console.log("Computing full alignment for user:", userId);
  
  // Fetch everything in parallel
  const [
    identityResult,
    insightsResult,
    documentsResult,
    experimentsResult,
    actionsResult,
    topicsResult
  ] = await Promise.all([
    supabase.from("identity_seeds")
      .select("content, core_values, weekly_focus, current_phase")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("insights")
      .select("id, title, content, source, created_at, relevance_score, topic_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("documents")
      .select("id, title, summary, extracted_content, created_at, relevance_score, topic_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("experiments")
      .select("id, title, description, status, results, result_summary, identity_shift_target, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("action_history")
      .select("action_text, pillar, why_it_mattered, action_date, completed_at")
      .eq("user_id", userId)
      .order("action_date", { ascending: false })
      .limit(60),
    supabase.from("topics")
      .select("id, name, description")
      .eq("user_id", userId)
  ]);

  const identity = identityResult.data;
  const insights = insightsResult.data || [];
  const documents = documentsResult.data || [];
  const experiments = experimentsResult.data || [];
  const actions = actionsResult.data || [];
  const topics = topicsResult.data || [];

  if (!identity?.content) {
    return new Response(JSON.stringify({ 
      error: "No identity seed found. Complete onboarding first.",
      alignment: null 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Extract ideal self and core values from identity using AI
  const identityAnalysis = await analyzeIdentity(identity, apiKey);
  
  // Synthesize weekly patterns
  const weeklyPatterns = await synthesizeWeeklyPatterns(actions, experiments, apiKey);
  
  // Score all content against identity
  const contentScores = await scoreContentAlignment(
    insights, 
    documents, 
    identityAnalysis, 
    apiKey
  );
  
  // Extract learnings from completed experiments
  const experimentLearnings = extractLearningsFromExperiments(experiments);
  
  // Find forgotten gems (high-value, low-access)
  const forgottenGems = findForgottenGems(insights, documents, contentScores);
  
  // Determine next edge - where to push
  const nextEdge = await determineNextEdge(
    identityAnalysis,
    weeklyPatterns,
    experiments,
    insights,
    apiKey
  );

  // Update relevance scores in database
  await updateContentScores(supabase, userId, contentScores);

  const alignment: UserAlignment = {
    identity_summary: identityAnalysis.summary,
    ideal_self: identityAnalysis.ideal_self,
    current_reality: identity.weekly_focus || "Not specified",
    core_values: identityAnalysis.values,
    active_objectives: identityAnalysis.objectives,
    weekly_patterns: weeklyPatterns,
    content_alignment_scores: contentScores,
    experiment_learnings: experimentLearnings,
    forgotten_gems: forgottenGems,
    next_edge: nextEdge
  };

  console.log(`Alignment computed: ${Object.keys(contentScores).length} items scored, next edge: "${nextEdge.substring(0, 50)}..."`);

  return new Response(JSON.stringify({ 
    success: true, 
    alignment,
    stats: {
      insights_scored: insights.length,
      documents_scored: documents.length,
      experiments_analyzed: experiments.length,
      actions_synthesized: actions.length
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Analyze identity to extract structured components
async function analyzeIdentity(
  identity: { content: string; core_values: string | null; weekly_focus: string | null; current_phase: string | null },
  apiKey: string
): Promise<{
  summary: string;
  ideal_self: string;
  values: string[];
  objectives: string[];
  current_blocks: string[];
}> {
  const prompt = `Analyze this person's identity and extract structured insights.

IDENTITY SEED:
${identity.content}

CORE VALUES (if specified): ${identity.core_values || 'Not specified'}
CURRENT FOCUS: ${identity.weekly_focus || 'Not specified'}
PHASE: ${identity.current_phase || 'baseline'}

Return JSON with:
{
  "summary": "One paragraph capturing who this person is at their core",
  "ideal_self": "Who they are BECOMING - their next-level identity in 1-2 sentences",
  "values": ["top 5 core values driving them"],
  "objectives": ["top 3 active objectives/goals they're working toward"],
  "current_blocks": ["2-3 things currently holding them back or creating friction"]
}

Be specific. Extract the REAL essence, not generic platitudes.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an identity analyst. Extract deep patterns. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Identity analysis failed:", response.status);
      return {
        summary: identity.content.substring(0, 200),
        ideal_self: "Becoming clearer through action",
        values: (identity.core_values || "").split(",").map(v => v.trim()).filter(Boolean).slice(0, 5),
        objectives: [],
        current_blocks: []
      };
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Identity analysis error:", error);
    return {
      summary: identity.content.substring(0, 200),
      ideal_self: "Becoming clearer through action",
      values: [],
      objectives: [],
      current_blocks: []
    };
  }
}

// Synthesize weekly patterns from actions
async function synthesizeWeeklyPatterns(
  actions: any[],
  experiments: any[],
  apiKey: string
): Promise<WeeklyPattern> {
  const last7Days = actions.filter(a => {
    const actionDate = new Date(a.action_date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return actionDate >= weekAgo;
  });

  const activeExperiments = experiments.filter(e => e.status === 'in_progress' || e.status === 'active');

  // Extract pillars touched
  const pillarsActive = [...new Set(last7Days.map(a => a.pillar).filter(Boolean))];

  // Find wins (actions with "why_it_mattered" filled in, or completed ones)
  const wins = last7Days
    .filter(a => a.why_it_mattered)
    .map(a => `${a.action_text}: ${a.why_it_mattered}`)
    .slice(0, 5);

  // Calculate momentum (actions per day this week)
  const uniqueDays = new Set(last7Days.map(a => a.action_date)).size;
  const momentumScore = Math.min(1, uniqueDays / 5); // 5+ days = 100% momentum

  // Extract themes using AI
  let themes: string[] = [];
  let identityShifts: string[] = [];

  if (last7Days.length >= 3) {
    try {
      const actionSummary = last7Days.slice(0, 15).map(a => a.action_text).join('\n');
      const experimentSummary = activeExperiments.map(e => `${e.title}: ${e.identity_shift_target || ''}`).join('\n');

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Extract patterns. Return only JSON." },
            { role: "user", content: `Actions this week:\n${actionSummary}\n\nActive experiments:\n${experimentSummary}\n\nReturn: {"themes": ["2-4 recurring themes"], "identity_shifts": ["1-2 identity shifts happening"]}` }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content.replace(/```json\n?|\n?```/g, '').trim());
        themes = parsed.themes || [];
        identityShifts = parsed.identity_shifts || [];
      }
    } catch (e) {
      console.error("Theme extraction error:", e);
    }
  }

  return {
    wins,
    themes,
    pillars_active: pillarsActive,
    momentum_score: momentumScore,
    identity_shifts: identityShifts
  };
}

// Score content alignment against identity
async function scoreContentAlignment(
  insights: any[],
  documents: any[],
  identity: { summary: string; ideal_self: string; values: string[]; objectives: string[] },
  apiKey: string
): Promise<Record<string, AlignmentScore>> {
  const scores: Record<string, AlignmentScore> = {};
  
  // Prepare content summaries
  const contentItems = [
    ...insights.map(i => ({
      id: `insight:${i.id}`,
      text: `${i.title}: ${(i.content || '').substring(0, 300)}`
    })),
    ...documents.map(d => ({
      id: `document:${d.id}`,
      text: `${d.title}: ${(d.summary || d.extracted_content || '').substring(0, 300)}`
    }))
  ];

  // Score in batches of 20 to avoid token limits
  const batchSize = 20;
  for (let i = 0; i < contentItems.length; i += batchSize) {
    const batch = contentItems.slice(i, i + batchSize);
    
    const itemList = batch.map((item, idx) => `[${idx}] ${item.text}`).join('\n\n');
    
    const prompt = `Score each content item's alignment with this identity. Return JSON.

IDENTITY:
${identity.summary}

IDEAL SELF: ${identity.ideal_self}
VALUES: ${identity.values.join(', ')}
OBJECTIVES: ${identity.objectives.join(', ')}

WEAVE OBJECTIVE: Help users turn saved content into action. Build self-trust by reflecting their own wisdom back to them.

SCORING DIMENSIONS:
- identity_alignment: How aligned to who they ARE currently
- values_alignment: How aligned to their core VALUES
- current_reality_fit: How relevant to their current situation and projects
- objective_alignment: How aligned to Weave's purpose (action from saved content, building self-trust)
- action_potential: How directly actionable this content is
- archetype_value: How well this delivers value based on user type (creators=content fuel, builders=shipping velocity, professionals=career momentum, students=accelerated mastery, general=tangible life shifts)
- ideal_self_push: How much this content pushes toward their IDEAL SELF

CONTENT ITEMS:
${itemList}

Return array of scores for each item index:
[
  {
    "index": 0,
    "identity_alignment": 0.0-1.0,
    "values_alignment": 0.0-1.0,
    "current_reality_fit": 0.0-1.0,
    "objective_alignment": 0.0-1.0,
    "action_potential": 0.0-1.0,
    "archetype_value": 0.0-1.0,
    "ideal_self_push": 0.0-1.0
  }
]`;

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
            { role: "system", content: "You are an alignment scorer. Return only valid JSON array." },
            { role: "user", content: prompt }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content.replace(/```json\n?|\n?```/g, '').trim());
        
        for (const score of parsed) {
          const item = batch[score.index];
          if (item) {
            // Weighted composite favoring ideal self push and archetype value
            const overall = (
              score.identity_alignment * 0.15 +
              score.values_alignment * 0.15 +
              score.current_reality_fit * 0.10 +
              score.objective_alignment * 0.15 +
              score.action_potential * 0.15 +
              (score.archetype_value || score.content_fuel || 0.5) * 0.15 +
              (score.ideal_self_push || 0.5) * 0.15
            );
            
            scores[item.id] = {
              identity_alignment: score.identity_alignment,
              values_alignment: score.values_alignment,
              current_reality_fit: score.current_reality_fit,
              objective_alignment: score.objective_alignment,
              action_potential: score.action_potential,
              archetype_value: score.archetype_value || score.content_fuel || 0.5,
              ideal_self_push: score.ideal_self_push || 0.5,
              overall: Math.min(1, Math.max(0, overall))
            };
          }
        }
      }
    } catch (e) {
      console.error("Scoring batch error:", e);
      // Assign default scores
      for (const item of batch) {
        scores[item.id] = {
          identity_alignment: 0.5,
          values_alignment: 0.5,
          current_reality_fit: 0.5,
          objective_alignment: 0.5,
          action_potential: 0.5,
          archetype_value: 0.5,
          ideal_self_push: 0.5,
          overall: 0.5
        };
      }
    }
  }

  return scores;
}

// Extract learnings from experiments
function extractLearningsFromExperiments(experiments: any[]): string[] {
  const learnings: string[] = [];
  
  for (const exp of experiments) {
    if (exp.status === 'completed' || exp.result_summary || exp.results) {
      const learning = exp.result_summary || exp.results;
      if (learning && learning.length > 10) {
        learnings.push(`${exp.title}: ${learning.substring(0, 200)}`);
      }
    }
  }
  
  return learnings.slice(0, 10);
}

// Find forgotten gems
function findForgottenGems(
  insights: any[],
  documents: any[],
  scores: Record<string, AlignmentScore>
): string[] {
  const gems: string[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const insight of insights) {
    const scoreKey = `insight:${insight.id}`;
    const score = scores[scoreKey];
    const createdAt = new Date(insight.created_at);
    
    // High alignment but created > 30 days ago
    if (score && score.overall > 0.7 && createdAt < thirtyDaysAgo) {
      gems.push(`[Insight] ${insight.title}`);
    }
  }

  for (const doc of documents) {
    const scoreKey = `document:${doc.id}`;
    const score = scores[scoreKey];
    const createdAt = new Date(doc.created_at);
    
    if (score && score.overall > 0.7 && createdAt < thirtyDaysAgo) {
      gems.push(`[Doc] ${doc.title}`);
    }
  }

  return gems.slice(0, 5);
}

// Determine next edge
async function determineNextEdge(
  identity: { ideal_self: string; values: string[]; objectives: string[]; current_blocks: string[] },
  weekly: WeeklyPattern,
  experiments: any[],
  insights: any[],
  apiKey: string
): Promise<string> {
  const activeExperiments = experiments.filter(e => e.status === 'in_progress' || e.status === 'active');
  const recentInsights = insights.slice(0, 10).map(i => i.title).join(', ');

  const prompt = `Based on this person's current state, identify their NEXT EDGE - the one specific area where pushing would create maximum growth.

IDEAL SELF: ${identity.ideal_self}
VALUES: ${identity.values.join(', ')}
CURRENT OBJECTIVES: ${identity.objectives.join(', ')}
CURRENT BLOCKS: ${identity.current_blocks.join(', ')}

THIS WEEK:
- Themes: ${weekly.themes.join(', ') || 'None identified'}
- Identity Shifts: ${weekly.identity_shifts.join(', ') || 'None detected'}
- Momentum: ${Math.round(weekly.momentum_score * 100)}%
- Pillars Active: ${weekly.pillars_active.join(', ') || 'None'}

ACTIVE EXPERIMENTS: ${activeExperiments.map(e => e.title).join(', ') || 'None'}
RECENT INSIGHTS: ${recentInsights || 'None'}

Return ONE sentence describing their next edge - the specific friction point where they should push to grow. Be specific and actionable.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You identify growth edges. Return one specific, actionable sentence." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }
  } catch (e) {
    console.error("Next edge determination error:", e);
  }

  return "Focus on consistent daily action in your weakest pillar.";
}

// Update scores in database
async function updateContentScores(
  supabase: any,
  userId: string,
  scores: Record<string, AlignmentScore>
) {
  for (const [key, score] of Object.entries(scores)) {
    const [type, id] = key.split(':');
    const table = type === 'insight' ? 'insights' : 'documents';
    
    await supabase
      .from(table)
      .update({ relevance_score: score.overall })
      .eq('id', id)
      .eq('user_id', userId);
  }
}

// Weekly synthesis endpoint
async function synthesizeWeek(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [actionsResult, experimentsResult] = await Promise.all([
    supabase.from("action_history")
      .select("action_text, pillar, why_it_mattered, action_date")
      .eq("user_id", userId)
      .gte("action_date", weekAgo.toISOString().split('T')[0])
      .order("action_date", { ascending: false }),
    supabase.from("experiments")
      .select("title, status, identity_shift_target")
      .eq("user_id", userId)
      .in("status", ["in_progress", "active"])
  ]);

  const patterns = await synthesizeWeeklyPatterns(
    actionsResult.data || [],
    experimentsResult.data || [],
    apiKey
  );

  return new Response(JSON.stringify({ 
    success: true, 
    weekly_patterns: patterns 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Score all content endpoint
async function scoreAllContent(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  const [identityResult, insightsResult, documentsResult] = await Promise.all([
    supabase.from("identity_seeds")
      .select("content, core_values, weekly_focus")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("insights")
      .select("id, title, content")
      .eq("user_id", userId)
      .limit(100),
    supabase.from("documents")
      .select("id, title, summary, extracted_content")
      .eq("user_id", userId)
      .limit(50)
  ]);

  if (!identityResult.data?.content) {
    return new Response(JSON.stringify({ error: "No identity seed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const identity = await analyzeIdentity(identityResult.data, apiKey);
  const scores = await scoreContentAlignment(
    insightsResult.data || [],
    documentsResult.data || [],
    identity,
    apiKey
  );

  await updateContentScores(supabase, userId, scores);

  return new Response(JSON.stringify({ 
    success: true, 
    scored: Object.keys(scores).length 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Extract experiment learnings endpoint
async function extractExperimentLearnings(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  const { data: experiments } = await supabase
    .from("experiments")
    .select("id, title, description, status, results, result_summary, identity_shift_target")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  const learnings = extractLearningsFromExperiments(experiments || []);

  return new Response(JSON.stringify({ 
    success: true, 
    learnings 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Find next edge endpoint
async function findNextEdge(
  supabase: any,
  userId: string,
  apiKey: string,
  corsHeaders: Record<string, string>
) {
  const [identityResult, actionsResult, experimentsResult, insightsResult] = await Promise.all([
    supabase.from("identity_seeds")
      .select("content, core_values, weekly_focus, current_phase")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("action_history")
      .select("action_text, pillar, action_date")
      .eq("user_id", userId)
      .order("action_date", { ascending: false })
      .limit(30),
    supabase.from("experiments")
      .select("title, status, identity_shift_target")
      .eq("user_id", userId)
      .limit(10),
    supabase.from("insights")
      .select("title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  if (!identityResult.data?.content) {
    return new Response(JSON.stringify({ error: "No identity seed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const identity = await analyzeIdentity(identityResult.data, apiKey);
  const weekly = await synthesizeWeeklyPatterns(actionsResult.data || [], experimentsResult.data || [], apiKey);
  const nextEdge = await determineNextEdge(identity, weekly, experimentsResult.data || [], insightsResult.data || [], apiKey);

  return new Response(JSON.stringify({ 
    success: true, 
    next_edge: nextEdge,
    weekly_momentum: weekly.momentum_score
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
