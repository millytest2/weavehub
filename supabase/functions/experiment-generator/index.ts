import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALL_PILLARS = ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Connection", "Learning"];

interface ExperimentOutput {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  identity_shift_target: string;
  pillar: string;
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

function getFallbackExperiment(pillar: string): ExperimentOutput[] {
  const fallbacks: { [key: string]: ExperimentOutput } = {
    "Stability": {
      title: "3-Day Income Sprint",
      description: "Generate income through any available channel. Proof of resourcefulness.",
      steps: ["Day 1: Identify 3 immediate income opportunities", "Day 2: Execute on the fastest one", "Day 3: Double down or pivot"],
      duration: "3 days",
      identity_shift_target: "I am someone who creates income from nothing.",
      pillar: "Stability"
    },
    "Skill": {
      title: "5-Day Build Challenge",
      description: "Ship one visible feature or milestone each day.",
      steps: ["Define 5 micro-deliverables", "Ship one per day", "Document learnings", "Share progress"],
      duration: "5 days",
      identity_shift_target: "I am someone who ships, not plans.",
      pillar: "Skill"
    },
    "Content": {
      title: "7-Day Story Sprint",
      description: "Post one authentic story daily. Build in public.",
      steps: ["Write one insight daily", "Post to main platform", "Engage with 5 people", "Track what resonates"],
      duration: "7 days",
      identity_shift_target: "I am someone who shares openly.",
      pillar: "Content"
    },
    "Health": {
      title: "5-Day Movement Reset",
      description: "Move intentionally every day. Energy creates clarity.",
      steps: ["30 min movement daily", "Track energy levels", "No screens first hour", "Sleep by 11pm"],
      duration: "5 days",
      identity_shift_target: "I am someone who prioritizes physical energy.",
      pillar: "Health"
    },
    "Presence": {
      title: "3-Day Presence Practice",
      description: "Train presence through real-world reps.",
      steps: ["One presence rep daily", "5 min nervous system regulation", "Journal what shifted"],
      duration: "3 days",
      identity_shift_target: "I am someone who is calm and grounded.",
      pillar: "Presence"
    },
    "Admin": {
      title: "4-Day Life Clear",
      description: "Remove friction from one life system daily.",
      steps: ["Clear physical space", "Clear digital clutter", "Automate one task", "End one draining commitment"],
      duration: "4 days",
      identity_shift_target: "I am someone who removes friction ruthlessly.",
      pillar: "Admin"
    },
    "Connection": {
      title: "5-Day Social Expansion",
      description: "Expand social presence through daily interactions.",
      steps: ["One conversation with stranger daily", "Reach out to someone you admire", "Say yes to one invitation", "Practice one vulnerable share"],
      duration: "5 days",
      identity_shift_target: "I am someone who connects easily.",
      pillar: "Connection"
    },
    "Learning": {
      title: "5-Day Deep Dive",
      description: "Learn one skill intensively through focused immersion.",
      steps: ["Choose one specific skill", "1 hour focused learning daily", "Apply immediately", "Teach one concept"],
      duration: "5 days",
      identity_shift_target: "I am someone who learns fast and applies.",
      pillar: "Learning"
    }
  };
  
  return [fallbacks[pillar] || fallbacks["Skill"]];
}

function choosePillar(recentPillars: string[]): string {
  const last3 = recentPillars.slice(0, 3);
  const recentUnique = [...new Set(last3)];
  const available = ALL_PILLARS.filter(p => !recentUnique.includes(p));
  
  if (available.length === 0) {
    const filtered = ALL_PILLARS.filter(p => p !== last3[0]);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
  
  return available[Math.floor(Math.random() * available.length)];
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

    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);
    
    const recentPillars = userContext.pillar_history;
    const forcedPillar = choosePillar(recentPillars);
    console.log(`Experiment pillar: ${forcedPillar}`);

    const systemPrompt = `You are an experiment designer. Create ONE identity-driven experiment.

${context}

PILLAR: ${forcedPillar}

CORE QUESTION: What experiment proves the user's identity shift?

PILLARS:
- Stability: Income, cash flow, financial security
- Skill: Building projects, shipping features
- Content: Creating posts, building in public
- Health: Movement, nutrition, physical energy
- Presence: Emotional regulation, confidence
- Admin: Life organization, systems
- Connection: Social expansion, relationships
- Learning: Education, skill acquisition

RULES:
- 3-7 days duration
- Clear daily actions (3-4 steps)
- Creates visible proof
- Identity-shifting ("I am someone who...")
- Fun, not homework
- No emojis`;

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
          { role: "user", content: `Design ONE "${forcedPillar}" experiment. Make it identity-shifting.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate ONE experiment",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short title, no emojis" },
                        description: { type: "string", description: "2-3 sentences, no emojis" },
                        steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
                        duration: { type: "string" },
                        identity_shift_target: { type: "string", description: "I am someone who..." },
                        pillar: { type: "string", enum: ALL_PILLARS }
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
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let experiments;
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      experiments = validateExperiments(parsed);
      experiments = experiments.map(exp => ({ ...exp, pillar: exp.pillar || forcedPillar }));
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        status: "planning"
      });
    }

    console.log(`Generated: ${experiments[0].title}`);

    return new Response(JSON.stringify({ experiments }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Experiment generator error:", error);
    return new Response(JSON.stringify({ experiments: getFallbackExperiment("Skill") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
