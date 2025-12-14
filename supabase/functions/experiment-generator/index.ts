import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  fetchUserContext, 
  formatWeightedContextForAgent,
  CompactContext 
} from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALL_PILLARS = ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Connection", "Learning"];

type SprintType = "standard" | "blitz_48h" | "challenge_24h" | "deep_dive" | "recovery";
type Intensity = "chill" | "push" | "extreme";

interface SprintConfig {
  type: SprintType;
  duration: string;
  intensity: Intensity;
  reason: string;
  topicId?: string;
  topicName?: string;
}

interface ExperimentOutput {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  identity_shift_target: string;
  pillar: string;
  sprint_type?: SprintType;
  intensity?: Intensity;
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu, '').trim();
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
  
  return data.experiments.map((exp: any) => ({
    title: stripEmojis(exp.title),
    description: stripEmojis(exp.description),
    steps: exp.steps.map((s: string) => stripEmojis(s)),
    duration: stripEmojis(exp.duration),
    identity_shift_target: stripEmojis(exp.identity_shift_target),
    pillar: exp.pillar,
    sprint_type: exp.sprint_type,
    intensity: exp.intensity
  })) as ExperimentOutput[];
}

// Sprint-specific fallbacks
function getFallbackExperiment(pillar: string, sprint: SprintConfig): ExperimentOutput[] {
  const sprintFallbacks: { [key: string]: { [key: string]: ExperimentOutput } } = {
    blitz_48h: {
      "Stability": {
        title: "48-Hour Cash Sprint",
        description: "Generate any income in 48 hours. Prove you can create money from nothing.",
        steps: ["Hour 0-6: List 5 ways to make money today", "Hour 6-24: Execute fastest option", "Hour 24-48: Double down or try option 2"],
        duration: "48 hours",
        identity_shift_target: "I am someone who creates income on demand.",
        pillar: "Stability",
        sprint_type: "blitz_48h",
        intensity: "extreme"
      },
      "Content": {
        title: "48-Hour Content Blitz",
        description: "Create and publish 10 pieces of content in 48 hours.",
        steps: ["Hour 0-12: Batch create 5 pieces", "Hour 12-36: Publish and engage", "Hour 36-48: Create 5 more, schedule"],
        duration: "48 hours",
        identity_shift_target: "I am someone who creates relentlessly.",
        pillar: "Content",
        sprint_type: "blitz_48h",
        intensity: "extreme"
      },
      "default": {
        title: "48-Hour Intensity Sprint",
        description: "Push your limits with focused intensity for 48 hours.",
        steps: ["Define one aggressive goal", "Work in 4-hour blocks", "Rest minimally, execute maximally"],
        duration: "48 hours",
        identity_shift_target: "I am someone who can push when needed.",
        pillar: pillar,
        sprint_type: "blitz_48h",
        intensity: "extreme"
      }
    },
    challenge_24h: {
      "Presence": {
        title: "24-Hour Social Challenge",
        description: "Talk to 10 strangers in 24 hours. Break your comfort zone.",
        steps: ["Morning: 3 conversations", "Afternoon: 4 conversations", "Evening: 3 conversations, reflect"],
        duration: "24 hours",
        identity_shift_target: "I am someone who connects fearlessly.",
        pillar: "Presence",
        sprint_type: "challenge_24h",
        intensity: "push"
      },
      "Health": {
        title: "24-Hour Movement Challenge",
        description: "Move every hour for 24 hours. Reset your relationship with your body.",
        steps: ["Set hourly reminders", "10 min movement each hour (except sleep)", "Track energy shifts"],
        duration: "24 hours",
        identity_shift_target: "I am someone who moves constantly.",
        pillar: "Health",
        sprint_type: "challenge_24h",
        intensity: "push"
      },
      "default": {
        title: "24-Hour Pattern Break",
        description: "Do the opposite of your default for 24 hours.",
        steps: ["Identify your default avoidance", "Do the opposite all day", "Journal what shifted"],
        duration: "24 hours",
        identity_shift_target: "I am someone who breaks patterns.",
        pillar: pillar,
        sprint_type: "challenge_24h",
        intensity: "push"
      }
    },
    deep_dive: {
      "Learning": {
        title: "5-Day Deep Immersion",
        description: "Master one skill through intense daily practice.",
        steps: ["Day 1: Foundations + first project", "Day 2-3: Build something real", "Day 4: Refine and polish", "Day 5: Ship and share"],
        duration: "5 days",
        identity_shift_target: "I am someone who masters through immersion.",
        pillar: "Learning",
        sprint_type: "deep_dive",
        intensity: "push"
      },
      "default": {
        title: "5-Day Knowledge Application",
        description: "Take accumulated knowledge and apply it intensively.",
        steps: ["Day 1: Synthesize key insights", "Day 2-3: Build based on insights", "Day 4: Test and iterate", "Day 5: Share learnings"],
        duration: "5 days",
        identity_shift_target: "I am someone who applies what I learn.",
        pillar: pillar,
        sprint_type: "deep_dive",
        intensity: "push"
      }
    },
    recovery: {
      "Health": {
        title: "3-Day Gentle Reset",
        description: "Restore energy through intentional rest and gentle movement.",
        steps: ["Day 1: Sleep 9+ hours, light walk", "Day 2: Gentle stretching, no screens after 8pm", "Day 3: One energizing activity"],
        duration: "3 days",
        identity_shift_target: "I am someone who rests strategically.",
        pillar: "Health",
        sprint_type: "recovery",
        intensity: "chill"
      },
      "default": {
        title: "3-Day Slow Rebuild",
        description: "Rebuild momentum through small, easy wins.",
        steps: ["Day 1: One tiny task", "Day 2: Two small tasks", "Day 3: Three tasks, celebrate"],
        duration: "3 days",
        identity_shift_target: "I am someone who rebuilds patiently.",
        pillar: pillar,
        sprint_type: "recovery",
        intensity: "chill"
      }
    }
  };

  // Try sprint-specific fallback first
  if (sprint.type !== "standard" && sprintFallbacks[sprint.type]) {
    const sprintGroup = sprintFallbacks[sprint.type];
    return [sprintGroup[pillar] || sprintGroup["default"]];
  }

  // Standard fallbacks
  const standardFallbacks: { [key: string]: ExperimentOutput } = {
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
  
  return [standardFallbacks[pillar] || standardFallbacks["Skill"]];
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

// Determine sprint type based on user momentum and patterns
async function selectSprintType(
  supabase: any, 
  userId: string, 
  context: CompactContext
): Promise<SprintConfig> {
  const recentCompleted = context.recent_actions.filter((a: any) => a.completed).length;
  const recentPillars = context.pillar_history;
  
  // HIGH MOMENTUM: 5+ completed actions recently → Blitz mode
  if (recentCompleted >= 5) {
    console.log("High momentum detected - suggesting 48h Blitz");
    return { 
      type: "blitz_48h", 
      duration: "48 hours", 
      intensity: "extreme", 
      reason: "High momentum - time to push hard" 
    };
  }
  
  // STUCK IN PATTERN: Same pillar 3+ times → Challenge to break pattern
  if (recentPillars.length >= 3) {
    const lastPillar = recentPillars[0];
    const sameCount = recentPillars.slice(0, 5).filter(p => p === lastPillar).length;
    if (sameCount >= 3) {
      console.log(`Stuck in ${lastPillar} pattern - suggesting 24h Challenge`);
      return { 
        type: "challenge_24h", 
        duration: "24 hours", 
        intensity: "push", 
        reason: `Break the ${lastPillar} loop` 
      };
    }
  }
  
  // TOPIC CLUSTERING: 10+ insights in one topic → Deep Dive
  const { data: topicCounts } = await supabase
    .from("insights")
    .select("topic_id")
    .eq("user_id", userId)
    .not("topic_id", "is", null);
  
  if (topicCounts && topicCounts.length > 0) {
    const counts: { [key: string]: number } = {};
    topicCounts.forEach((i: any) => {
      counts[i.topic_id] = (counts[i.topic_id] || 0) + 1;
    });
    
    const hotTopicEntry = Object.entries(counts).find(([_, count]) => count >= 10);
    if (hotTopicEntry) {
      const [topicId, count] = hotTopicEntry;
      // Get topic name
      const { data: topic } = await supabase
        .from("topics")
        .select("name")
        .eq("id", topicId)
        .maybeSingle();
      
      console.log(`Hot topic detected: ${topic?.name || topicId} (${count} insights) - suggesting Deep Dive`);
      return { 
        type: "deep_dive", 
        duration: "5 days", 
        intensity: "push", 
        reason: `Apply accumulated knowledge in ${topic?.name || 'this area'}`,
        topicId,
        topicName: topic?.name
      };
    }
  }
  
  // LOW MOMENTUM: Less than 2 completed actions → Recovery mode
  if (recentCompleted < 2) {
    console.log("Low momentum detected - suggesting Recovery");
    return { 
      type: "recovery", 
      duration: "3 days", 
      intensity: "chill", 
      reason: "Rebuild momentum gently" 
    };
  }
  
  // DEFAULT: Standard experiment
  return { 
    type: "standard", 
    duration: "3-7 days", 
    intensity: "push", 
    reason: "Steady identity-building" 
  };
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

    // Fetch past experiment titles to avoid duplicates
    const { data: pastExperiments } = await supabase
      .from("experiments")
      .select("title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const pastTitles = pastExperiments?.map(e => e.title.toLowerCase()) || [];
    console.log(`Past experiments to avoid: ${pastTitles.length}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const userContext = await fetchUserContext(supabase, user.id);
    // Use experiment-specific weights: Documents 35%, Identity 40%, Insights 15%
    const context = formatWeightedContextForAgent(userContext, "experiment", { includeDocContent: true });
    
    // Select sprint type based on momentum
    const sprintConfig = await selectSprintType(supabase, user.id, userContext);
    console.log(`Sprint type: ${sprintConfig.type} (${sprintConfig.intensity}) - ${sprintConfig.reason}`);
    
    const recentPillars = userContext.pillar_history;
    const forcedPillar = choosePillar(recentPillars);
    console.log(`Experiment pillar: ${forcedPillar}`);

    const avoidList = pastTitles.length > 0 
      ? `\n\nAVOID THESE PAST EXPERIMENTS (do not repeat similar titles or concepts):\n${pastTitles.slice(0, 10).map(t => `- ${t}`).join('\n')}`
      : '';

    // Build sprint-specific instructions
    const sprintInstructions = sprintConfig.type !== "standard" ? `
SPRINT MODE: ${sprintConfig.type.toUpperCase().replace('_', ' ')}
Duration: ${sprintConfig.duration}
Intensity: ${sprintConfig.intensity.toUpperCase()}
Reason: ${sprintConfig.reason}
${sprintConfig.topicName ? `Focus Topic: ${sprintConfig.topicName}` : ''}

INTENSITY RULES:
- CHILL: Low stakes, easy wins, gentle stretch. Build confidence.
- PUSH: Moderate discomfort, growth edge. 1-2 uncomfortable actions per day.
- EXTREME: High stakes, identity-challenging. Daily discomfort required. No easy days.
` : '';

    const systemPrompt = `You are designing a FUCK YEAH experiment. Not a task list. An experiment that makes them go "okay, that sounds kind of exciting."

${context}

PILLAR: ${forcedPillar}
${sprintInstructions}
${avoidList}

YOUR JOB: Find a friction point in their data, then design a CONSTRAINT-BASED experiment that addresses it.

WHAT MAKES A GREAT EXPERIMENT:
1. CONSTRAINT-BASED: "No phone until 1PM for 5 days" > "Use phone less"
2. REALITY-GROUNDED: Based on a REAL friction they're experiencing (from their insights/current reality)
3. EDGE-PUSHING: Slightly uncomfortable, not overwhelming
4. TIMEBOXED: Clear duration (24hrs, 48hrs, 3 days, 5 days, 7 days)
5. CONCRETE OUTPUT: Something visible happens at the end

FRICTION ANALYSIS REQUIRED:
Look at their CURRENT REALITY and INSIGHTS for patterns of:
- What they're avoiding
- Where they're stuck in loops
- What keeps coming up but not getting done
- Energy drains they mention
- Habits they want to break
- Discomfort they keep avoiding

Then design an experiment that DIRECTLY addresses that friction.

EXAMPLE GREAT EXPERIMENTS (notice the constraints):
- "No phone until 1PM for 5 days" - addresses phone addiction friction
- "Block 9-11am for UPath CRM only, phone in other room" - addresses focus/distraction friction
- "One cold DM per day to founders for 7 days" - addresses outreach avoidance friction
- "Ship something visible to LinkedIn every day for 5 days" - addresses perfectionism friction
- "Wake at 6am for 3 days, first 30min on [specific project]" - addresses morning routine friction
- "No Netflix/YouTube until 3 tasks done for 5 days" - addresses procrastination friction
- "Talk to one stranger every day for 4 days" - addresses social avoidance friction
- "No advice-seeking from others for 48 hours - only act on your own decisions" - addresses external validation friction

BANNED (generic, boring, uninspiring):
- "Focus on your project" - INSTEAD: specify WHICH 2-hour block and WHERE phone goes
- "Create content regularly" - INSTEAD: "Post one raw/unpolished thought to Twitter before 10am for 5 days"
- "Build healthy habits" - INSTEAD: "No eating after 8pm for 4 days"
- "Practice presence" - INSTEAD: "10 min meditation before any screen time for 3 days"
- "Work on your business" - INSTEAD: "Ship one visible feature of [specific project] each day for 3 days"
- Anything without a clear CONSTRAINT or RULE to follow

STRUCTURE REQUIRED:
- Title: The constraint/rule itself (e.g., "No Phone Till 1PM Sprint")
- Description: What friction this addresses and why it matters for their identity
- Steps: 2-4 daily actions that support the experiment (not vague - SPECIFIC times, places, quantities)
- Duration: ${sprintConfig.duration}
- Identity shift: "I am someone who..." (specific to their data)

RULES:
- Duration: ${sprintConfig.duration}
- Intensity: ${sprintConfig.intensity}
- Must include at least ONE clear constraint/rule that can be followed or broken
- Steps should be DAILY habits, not sequential tasks
- Make it sound FUN, like a challenge they'd want to try
- ABSOLUTELY NO EMOJIS
- Must be UNIQUE from past experiments`;

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
          { role: "user", content: `Design ONE unique "${forcedPillar}" experiment. Sprint mode: ${sprintConfig.type}. Intensity: ${sprintConfig.intensity}. Duration: ${sprintConfig.duration}. Make it identity-shifting. No emojis. Must be different from any past experiments.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate ONE unique experiment with NO emojis",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short title, NO emojis, must be unique" },
                        description: { type: "string", description: "2-3 sentences, NO emojis" },
                        steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
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
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar, sprintConfig) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar, sprintConfig) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let experiments;
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      experiments = validateExperiments(parsed);
      experiments = experiments.map(exp => ({ 
        ...exp, 
        pillar: exp.pillar || forcedPillar,
        sprint_type: sprintConfig.type,
        intensity: sprintConfig.intensity
      }));
      
      // Check if generated experiment is too similar to past ones
      const newTitle = experiments[0].title.toLowerCase();
      const isDuplicate = pastTitles.some((past: string) => {
        const similarity = past.split(' ').filter((word: string) => newTitle.includes(word)).length;
        return similarity >= 3 || past === newTitle;
      });
      
      if (isDuplicate) {
        console.log("Generated experiment too similar to past, using fallback");
        return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar, sprintConfig) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify({ experiments: getFallbackExperiment(forcedPillar, sprintConfig) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert experiment with sprint metadata
    for (const exp of experiments) {
      await supabase.from("experiments").insert({
        user_id: user.id,
        title: exp.title,
        description: exp.description,
        steps: exp.steps.join("\n"),
        duration: exp.duration,
        identity_shift_target: exp.identity_shift_target,
        hypothesis: `Sprint: ${sprintConfig.type} | Intensity: ${sprintConfig.intensity} | ${sprintConfig.reason}`,
        status: "planning"
      });
    }

    console.log(`Generated ${sprintConfig.type} experiment: ${experiments[0].title}`);

    return new Response(JSON.stringify({ 
      experiments,
      sprint: sprintConfig
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Experiment generator error:", error);
    const defaultSprint: SprintConfig = { type: "standard", duration: "3-7 days", intensity: "push", reason: "Default" };
    return new Response(JSON.stringify({ experiments: getFallbackExperiment("Skill", defaultSprint) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
