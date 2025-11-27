import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ALL PILLARS - expanded for life balance
const ALL_PILLARS = [
  "Stability",   // Cash, job, income
  "Skill",       // UPath, learning, education, projects
  "Content",     // Creation, communication, output
  "Health",      // Physical, nutrition, movement
  "Presence",    // Emotional, identity, nervous system
  "Admin",       // Life maintenance, organization
  "Dating",      // Relationships, social, dating
  "Learning"     // Education, courses, skill development
];

interface ExperimentOutput {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  identity_shift_target: string;
  pillar: string;
  baseline_impact: number;
  content_fuel: number;
  identity_alignment: number;
}

function validateExperiments(data: any): ExperimentOutput[] {
  if (!data.experiments || !Array.isArray(data.experiments)) {
    throw new Error('Invalid experiments array');
  }
  
  data.experiments.forEach((exp: any) => {
    if (!exp.title || typeof exp.title !== 'string') throw new Error('Invalid experiment title');
    if (!exp.description || typeof exp.description !== 'string') throw new Error('Invalid experiment description');
    if (!exp.steps || !Array.isArray(exp.steps) || exp.steps.length < 2) throw new Error('Invalid experiment steps');
    if (!exp.duration || typeof exp.duration !== 'string') throw new Error('Invalid experiment duration');
    if (!exp.identity_shift_target || typeof exp.identity_shift_target !== 'string') throw new Error('Invalid identity_shift_target');
  });
  
  return data.experiments as ExperimentOutput[];
}

function getFallbackExperiments(forcedPillar: string): ExperimentOutput[] {
  const fallbacks: { [key: string]: ExperimentOutput } = {
    "Stability": {
      title: "3-Day Income Generation Sprint",
      description: "Generate income through any available channel. The goal is proof of resourcefulness, not perfection.",
      steps: ["Day 1: Identify 3 immediate income opportunities", "Day 2: Execute on the fastest one", "Day 3: Double down or pivot"],
      duration: "3 days",
      identity_shift_target: "I am someone who creates income from nothing.",
      pillar: "Stability",
      baseline_impact: 9, content_fuel: 5, identity_alignment: 8
    },
    "Skill": {
      title: "5-Day Build Challenge",
      description: "Ship one visible feature or project milestone each day. Small wins compound into momentum.",
      steps: ["Define 5 micro-deliverables", "Ship one per day no matter what", "Document what you learned", "Share progress publicly"],
      duration: "5 days",
      identity_shift_target: "I am someone who ships, not someone who plans.",
      pillar: "Skill",
      baseline_impact: 6, content_fuel: 8, identity_alignment: 9
    },
    "Content": {
      title: "7-Day Story Sprint",
      description: "Post one authentic story daily about your journey. Build in public, attract your tribe.",
      steps: ["Write one insight/story daily", "Post to your main platform", "Engage with 5 people in your space", "Track what resonates"],
      duration: "7 days",
      identity_shift_target: "I am someone who shares openly and attracts opportunity.",
      pillar: "Content",
      baseline_impact: 5, content_fuel: 10, identity_alignment: 8
    },
    "Health": {
      title: "5-Day Movement Reset",
      description: "Move your body intentionally every day. Energy creates clarity.",
      steps: ["30 min movement daily (any form)", "Track energy levels before/after", "No screens first hour of waking", "Sleep by 11pm"],
      duration: "5 days",
      identity_shift_target: "I am someone who prioritizes physical energy.",
      pillar: "Health",
      baseline_impact: 4, content_fuel: 3, identity_alignment: 7
    },
    "Presence": {
      title: "3-Day Presence Practice",
      description: "Train presence through tiny real-world reps. Confidence comes from action, not affirmation.",
      steps: ["One presence rep daily (eye contact, slower speech, direct truth)", "5 min nervous system regulation", "Journal what shifted"],
      duration: "3 days",
      identity_shift_target: "I am someone who is calm, grounded, and present.",
      pillar: "Presence",
      baseline_impact: 3, content_fuel: 6, identity_alignment: 10
    },
    "Admin": {
      title: "4-Day Life Clear",
      description: "Remove friction from one life system daily. Clarity comes from removing, not adding.",
      steps: ["Day 1: Clear physical space", "Day 2: Clear digital clutter", "Day 3: Automate one recurring task", "Day 4: Cancel/end one draining commitment"],
      duration: "4 days",
      identity_shift_target: "I am someone who removes friction ruthlessly.",
      pillar: "Admin",
      baseline_impact: 5, content_fuel: 4, identity_alignment: 7
    },
    "Dating": {
      title: "5-Day Social Expansion",
      description: "Expand your social presence through small daily interactions. Confidence compounds.",
      steps: ["Start one conversation with a stranger daily", "Reach out to one person you admire", "Say yes to one social invitation", "Practice one vulnerable share"],
      duration: "5 days",
      identity_shift_target: "I am someone who connects easily and authentically.",
      pillar: "Dating",
      baseline_impact: 3, content_fuel: 5, identity_alignment: 8
    },
    "Learning": {
      title: "5-Day Deep Dive",
      description: "Learn one new skill intensively. Compress months into days through focused immersion.",
      steps: ["Choose one specific skill to acquire", "1 hour focused learning daily", "Apply what you learn immediately", "Teach one concept to someone"],
      duration: "5 days",
      identity_shift_target: "I am someone who learns fast and applies immediately.",
      pillar: "Learning",
      baseline_impact: 5, content_fuel: 7, identity_alignment: 8
    }
  };
  
  return [fallbacks[forcedPillar] || fallbacks["Skill"]];
}

// Determine which pillar to use based on rotation and recent history
function choosePillarForRotation(recentPillars: string[], phase: string, isInCrisis: boolean): string {
  // If in crisis mode (zero income, unstable), allow Stability
  if (isInCrisis) {
    // Even in crisis, don't do Stability 3x in a row
    const last2 = recentPillars.slice(0, 2);
    if (last2.every(p => p === "Stability")) {
      const nonStability = ALL_PILLARS.filter(p => p !== "Stability");
      return nonStability[Math.floor(Math.random() * nonStability.length)];
    }
    return "Stability";
  }
  
  // Find pillars used in last 3 experiments/tasks
  const recentUnique = [...new Set(recentPillars.slice(0, 3))];
  
  // Filter out recently used pillars
  const availablePillars = ALL_PILLARS.filter(p => !recentUnique.includes(p));
  
  // If all pillars used recently, just avoid the most recent one
  if (availablePillars.length === 0) {
    const filtered = ALL_PILLARS.filter(p => p !== recentPillars[0]);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
  
  // Weight pillars based on phase
  let weighted = availablePillars;
  if (phase === "baseline") {
    // In baseline, slightly prefer Stability, Skill, Content
    const preferred = availablePillars.filter(p => ["Stability", "Skill", "Content"].includes(p));
    if (preferred.length > 0 && Math.random() > 0.4) {
      weighted = preferred;
    }
  } else {
    // In empire, prefer Skill, Content, Presence, Learning
    const preferred = availablePillars.filter(p => ["Skill", "Content", "Presence", "Learning"].includes(p));
    if (preferred.length > 0 && Math.random() > 0.4) {
      weighted = preferred;
    }
  }
  
  return weighted[Math.floor(Math.random() * weighted.length)];
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
    if (!user) throw new Error("Unauthorized");

    console.log("Experiment generator called for user:", user.id);

    // Check for active experiments
    const { data: activeExperiments } = await supabase
      .from("experiments")
      .select("id, title")
      .eq("user_id", user.id)
      .in("status", ["in_progress", "planning"])
      .limit(1);

    if (activeExperiments && activeExperiments.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Complete or pause your active experiment first.",
          active_experiment: activeExperiments[0]
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch context
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);
    
    // Get phase and income info
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, current_monthly_income")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const currentIncome = identityData?.current_monthly_income || 0;
    
    // Crisis mode = zero income AND in baseline
    const isInCrisis = phase === "baseline" && currentIncome === 0;
    
    // Get recent experiment pillars for rotation
    const { data: recentExperiments } = await supabase
      .from("experiments")
      .select("title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);
    
    // Also get recent task pillars
    const recentPillars = [
      ...userContext.pillar_history,
      ...(recentExperiments?.map(e => {
        // Try to infer pillar from title
        const title = e.title.toLowerCase();
        if (title.includes("job") || title.includes("income") || title.includes("cash")) return "Stability";
        if (title.includes("build") || title.includes("ship") || title.includes("upath")) return "Skill";
        if (title.includes("content") || title.includes("post") || title.includes("story")) return "Content";
        if (title.includes("health") || title.includes("move") || title.includes("physical")) return "Health";
        if (title.includes("presence") || title.includes("identity") || title.includes("calm")) return "Presence";
        if (title.includes("dating") || title.includes("social") || title.includes("connect")) return "Dating";
        if (title.includes("learn") || title.includes("course") || title.includes("study")) return "Learning";
        if (title.includes("admin") || title.includes("clear") || title.includes("organize")) return "Admin";
        return null;
      }).filter(Boolean) || [])
    ];

    // Choose pillar for this experiment
    const forcedPillar = choosePillarForRotation(recentPillars as string[], phase, isInCrisis);
    console.log(`Forcing pillar: ${forcedPillar} (recent: ${recentPillars.slice(0, 3).join(', ')})`);

    const systemPrompt = `You are an experiment designer creating FUN, identity-driven experiments.

${context}

PILLAR FOR THIS EXPERIMENT: ${forcedPillar}
You MUST design an experiment in the "${forcedPillar}" pillar.

${isInCrisis ? "⚠️ USER IN BASELINE CRISIS (zero income). Even so, rotate pillars." : ""}

PILLAR DEFINITIONS:
• Stability: Income, cash flow, job search, financial security
• Skill: Building projects, UPath, shipping features, technical skills
• Content: Creating posts, videos, stories, building in public
• Health: Movement, nutrition, sleep, physical energy
• Presence: Emotional regulation, identity shifts, confidence, nervous system
• Admin: Life organization, clearing blockers, systems
• Dating: Social expansion, relationships, connection, dating
• Learning: Courses, education, acquiring new knowledge

EXPERIMENT DESIGN PRINCIPLES:
✓ FUN and engaging (not homework)
✓ 3-7 days duration
✓ Clear daily actions (3-4 steps)
✓ Creates visible proof
✓ Identity-shifting ("I am someone who...")
✓ Actionable and simple

DO NOT:
✗ Create job-focused experiments unless pillar is Stability
✗ Make it feel like work
✗ Over-complicate
✗ Give vague steps

SCORING (0-10):
• baseline_impact: Does this stabilize/grow foundation?
• content_fuel: Does this create shareable proof?
• identity_alignment: Does this prove the identity shift?`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Design ONE exceptional "${forcedPillar}" experiment for me. Make it fun and identity-shifting.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate ONE experiment in the specified pillar",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short, compelling title" },
                        description: { type: "string", description: "What you're testing (2-3 sentences)" },
                        steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
                        duration: { type: "string" },
                        identity_shift_target: { type: "string", description: "I am someone who..." },
                        pillar: { type: "string", enum: ALL_PILLARS },
                        baseline_impact: { type: "integer", minimum: 0, maximum: 10 },
                        content_fuel: { type: "integer", minimum: 0, maximum: 10 },
                        identity_alignment: { type: "integer", minimum: 0, maximum: 10 }
                      },
                      required: ["title", "description", "steps", "duration", "identity_shift_target", "pillar"]
                    },
                    minItems: 1,
                    maxItems: 1
                  }
                },
                required: ["experiments"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_experiments" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Use fallback
      return new Response(JSON.stringify({ experiments: getFallbackExperiments(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call, using fallback");
      return new Response(JSON.stringify({ experiments: getFallbackExperiments(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let experiments;
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      experiments = validateExperiments(parsed);
      // Ensure pillar is set
      experiments = experiments.map(exp => ({ ...exp, pillar: exp.pillar || forcedPillar }));
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify({ experiments: getFallbackExperiments(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert experiment
    for (const exp of experiments) {
      await supabase.from("experiments").insert({
        user_id: user.id,
        title: exp.title,
        description: exp.description,
        steps: exp.steps.join("\n"),
        duration: exp.duration,
        identity_shift_target: exp.identity_shift_target,
        status: "planning",
        baseline_impact: exp.baseline_impact || 5,
        content_fuel: exp.content_fuel || 5,
        identity_alignment: exp.identity_alignment || 5
      });
    }

    console.log(`Generated ${forcedPillar} experiment: ${experiments[0].title}`);

    return new Response(JSON.stringify({ experiments }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Experiment generator error:", error);
    return new Response(JSON.stringify({ experiments: getFallbackExperiments("Skill") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
