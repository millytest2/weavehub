import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  fetchUserContext, 
  formatWeightedContextForAgent,
  CompactContext 
} from "../shared/context.ts";
import { checkRateLimit, rateLimitResponse } from "../shared/rateLimit.ts";

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

// BANNED THERAPY-SPEAK WORDS - experiments containing these get rejected
const BANNED_WORDS = [
  "internal pressure", "anxiety", "saboteur", "deep dive", "embrace", "unlock",
  "journey", "explore", "reflect", "consider", "mindfulness", "relationship with",
  "lean into", "sit with", "unpack", "process", "heal", "inner", "authentic self",
  "self-care", "self-love", "boundaries", "triggered", "trauma", "validate",
  "space to", "permission to feel", "honor your", "gentle reminder"
];

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu, '').trim();
}

function containsBannedWords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some(word => lowerText.includes(word));
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
    
    // Reject experiments with banned therapy-speak
    if (containsBannedWords(exp.title) || containsBannedWords(exp.description)) {
      throw new Error('Experiment contains banned therapy-speak');
    }
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

// NEW FORMAT: [Duration] [Constraint] → [Deliverable]
function getFallbackExperiment(pillar: string, sprint: SprintConfig): ExperimentOutput[] {
  const sprintFallbacks: { [key: string]: { [key: string]: ExperimentOutput } } = {
    blitz_48h: {
      "Stability": {
        title: "48h No Distractions → Ship One Revenue Feature",
        description: "Phone in drawer. No social media. 48 hours of pure focus on building one feature that can generate revenue. Ship rough by Monday 8am.",
        steps: [
          "Saturday 8am: Phone off, in drawer. Open only code editor + Weave",
          "Saturday-Sunday: Build one monetizable feature for your main project",
          "Monday 8am: Ship to production. Rough is fine. Phone back"
        ],
        duration: "48 hours",
        identity_shift_target: "I ship under pressure.",
        pillar: "Stability",
        sprint_type: "blitz_48h",
        intensity: "extreme"
      },
      "Content": {
        title: "48h Content Blitz → 10 Posts Shipped",
        description: "Batch create 10 pieces of content in one weekend. No editing perfectionism. Ship raw. Volume over polish.",
        steps: [
          "Hour 0-12: Write 5 posts about what you're building. No editing.",
          "Hour 12-36: Publish all 5. Write 5 more.",
          "Hour 36-48: Publish remaining 5. Schedule for next week."
        ],
        duration: "48 hours",
        identity_shift_target: "I create relentlessly.",
        pillar: "Content",
        sprint_type: "blitz_48h",
        intensity: "extreme"
      },
      "default": {
        title: "48h Phone Blackout → Ship One Thing",
        description: "No phone for 48 hours. Pick your most important project and ship one visible feature by the end.",
        steps: [
          "Phone off, in another room for 48 hours",
          "Work in 4-hour focused blocks on your main project",
          "Ship one visible, usable thing before phone comes back"
        ],
        duration: "48 hours",
        identity_shift_target: "I execute without distractions.",
        pillar: pillar,
        sprint_type: "blitz_48h",
        intensity: "extreme"
      }
    },
    challenge_24h: {
      "Presence": {
        title: "24h Talk to 10 Strangers → Real Conversations",
        description: "Talk to 10 new people in 24 hours. Not small talk. Real conversations. Get one contact from each.",
        steps: [
          "Morning: Talk to 3 strangers. Ask about their work/life.",
          "Afternoon: Talk to 4 more. Exchange contact with at least 2.",
          "Evening: Talk to 3 more. Follow up with one via text."
        ],
        duration: "24 hours",
        identity_shift_target: "I connect with anyone, anywhere.",
        pillar: "Presence",
        sprint_type: "challenge_24h",
        intensity: "push"
      },
      "Health": {
        title: "24h Move Every Hour → Track Energy",
        description: "Set hourly alarms. Move for 10 minutes every hour you're awake. Track energy levels. See what changes.",
        steps: [
          "Set 16 hourly alarms from 6am to 10pm",
          "10 min movement each alarm: walk, stretch, pushups, anything",
          "Rate energy 1-10 after each session. Compare start vs end."
        ],
        duration: "24 hours",
        identity_shift_target: "I move constantly.",
        pillar: "Health",
        sprint_type: "challenge_24h",
        intensity: "push"
      },
      "default": {
        title: "24h Do The Opposite → Break One Pattern",
        description: "Identify your biggest avoidance pattern. Do the opposite for 24 hours straight. Track what shifts.",
        steps: [
          "Identify: What do you always avoid? That's your target.",
          "24 hours: Every time you want to avoid, do the opposite instead.",
          "End: Write what changed. What was easier than expected?"
        ],
        duration: "24 hours",
        identity_shift_target: "I break patterns on command.",
        pillar: pillar,
        sprint_type: "challenge_24h",
        intensity: "push"
      }
    },
    deep_dive: {
      "Learning": {
        title: "5-Day Skill Sprint → Build + Ship + Teach",
        description: "Pick one skill. Learn it by building. Ship something real. Teach one concept publicly.",
        steps: [
          "Day 1: Foundations. Build first tiny project.",
          "Day 2-3: Build something real with the skill.",
          "Day 4: Refine and polish. Make it shareable.",
          "Day 5: Ship publicly. Write one post teaching what you learned."
        ],
        duration: "5 days",
        identity_shift_target: "I learn by shipping.",
        pillar: "Learning",
        sprint_type: "deep_dive",
        intensity: "push"
      },
      "default": {
        title: "5-Day Build Sprint → 5 Visible Outputs",
        description: "Ship one visible thing every day for 5 days. Each builds on the last. No planning days. Only shipping.",
        steps: [
          "Day 1: Ship smallest viable version of your main project feature",
          "Day 2: Add one improvement. Ship again.",
          "Day 3: Add one more. Ship.",
          "Day 4-5: Keep shipping. Document what you learned."
        ],
        duration: "5 days",
        identity_shift_target: "I ship daily.",
        pillar: pillar,
        sprint_type: "deep_dive",
        intensity: "push"
      }
    },
    recovery: {
      "Health": {
        title: "3-Day Sleep Reset → 9 Hours Every Night",
        description: "Sleep 9+ hours for 3 nights. No screens after 8pm. Light walk each morning. Rebuild baseline energy.",
        steps: [
          "Day 1: In bed by 9pm. Phone in other room. Sleep 9+ hours.",
          "Day 2: 30 min morning walk. Same sleep protocol.",
          "Day 3: Rate energy vs Day 1. Keep what worked."
        ],
        duration: "3 days",
        identity_shift_target: "I prioritize recovery.",
        pillar: "Health",
        sprint_type: "recovery",
        intensity: "chill"
      },
      "default": {
        title: "3-Day Tiny Wins → Rebuild Momentum",
        description: "Smallest possible wins to rebuild momentum. One tiny task Day 1. Two Day 2. Three Day 3. Stack easy wins.",
        steps: [
          "Day 1: Complete ONE 5-minute task. Celebrate it.",
          "Day 2: Complete TWO small tasks (10-15 min each).",
          "Day 3: Complete THREE tasks. Notice momentum returning."
        ],
        duration: "3 days",
        identity_shift_target: "I rebuild through small wins.",
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

  // Standard fallbacks - NEW FORMAT
  const standardFallbacks: { [key: string]: ExperimentOutput } = {
    "Stability": {
      title: "5-Day Morning Block → Ship Revenue Feature",
      description: "Block 8-10am every day for revenue work only. Phone in drawer until 10am. Ship one feature that can make money by end of week.",
      steps: [
        "Day 1-5: 8am phone goes in drawer. 8-10am = revenue work only.",
        "Pick ONE feature that could generate revenue this week.",
        "Friday: Ship it live. Rough is fine. Done > perfect."
      ],
      duration: "5 days",
      identity_shift_target: "I protect my revenue hours.",
      pillar: "Stability"
    },
    "Skill": {
      title: "5-Day Ship Daily → 5 Visible Features",
      description: "Ship one visible feature every single day. No planning days. Each day must have a shipped output others can see.",
      steps: [
        "Day 1: Ship smallest feature of your main project. Post about it.",
        "Day 2-4: Ship one more feature each day. Document progress.",
        "Day 5: Ship final feature. Write recap of what you built."
      ],
      duration: "5 days",
      identity_shift_target: "I ship, not plan.",
      pillar: "Skill"
    },
    "Content": {
      title: "7-Day Post Daily → 1 Post Before 10am",
      description: "Post one piece of content every morning before 10am. No editing. No perfectionism. Raw thoughts about what you're building.",
      steps: [
        "Every day before 10am: Post one thought about your work to main platform.",
        "No drafts. No editing. Write and post in under 15 minutes.",
        "Track: Which posts get engagement? Do more of those."
      ],
      duration: "7 days",
      identity_shift_target: "I share openly and consistently.",
      pillar: "Content"
    },
    "Health": {
      title: "5-Day No Phone Till Noon → Morning Movement",
      description: "Phone stays off/away until noon every day. First hour = movement. Track energy difference by Day 5.",
      steps: [
        "Each day: Phone in drawer until 12pm.",
        "6-7am: 30 min movement (walk, gym, stretch, anything).",
        "7am-12pm: Deep work or rest. No phone checking."
      ],
      duration: "5 days",
      identity_shift_target: "I own my mornings.",
      pillar: "Health"
    },
    "Presence": {
      title: "4-Day 1 Real Conversation → Talk to Someone New",
      description: "Have one real conversation with someone new every day. Not networking. Actual connection. Get their story.",
      steps: [
        "Day 1-4: Talk to one new person each day. Coffee, walk, whatever.",
        "Ask about their work, dreams, struggles. Actually listen.",
        "Follow up with one person you connected with."
      ],
      duration: "4 days",
      identity_shift_target: "I connect easily with new people.",
      pillar: "Presence"
    },
    "Admin": {
      title: "4-Day Clear One System Per Day → Remove Friction",
      description: "Clear one life system each day. Physical space, digital, commitments, subscriptions. End with less drag.",
      steps: [
        "Day 1: Clear physical space. Throw out/donate 10 things.",
        "Day 2: Clear digital. Unsubscribe, delete apps, clean inbox to zero.",
        "Day 3: Cancel one draining commitment or subscription.",
        "Day 4: Automate one recurring task that drains energy."
      ],
      duration: "4 days",
      identity_shift_target: "I remove friction ruthlessly.",
      pillar: "Admin"
    },
    "Connection": {
      title: "5-Day Reach Out Daily → Message Someone You Admire",
      description: "Message one person you admire each day. Cold DM, email, whatever. Not asking for anything. Just genuine connection.",
      steps: [
        "Day 1-5: Send one message to someone whose work you respect.",
        "No asks. Just tell them what you appreciated about their work.",
        "Track responses. Follow up on any that reply."
      ],
      duration: "5 days",
      identity_shift_target: "I reach out boldly.",
      pillar: "Connection"
    },
    "Learning": {
      title: "5-Day Learn + Build + Teach → One New Skill",
      description: "Pick one skill. Spend 1 hour learning it daily. Build something with it by Day 4. Teach one concept by Day 5.",
      steps: [
        "Day 1-2: 1 hour focused learning. Take notes.",
        "Day 3-4: Build one small project using the skill.",
        "Day 5: Write or post one thing teaching what you learned."
      ],
      duration: "5 days",
      identity_shift_target: "I learn fast and apply immediately.",
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
  
// DEFAULT: Standard experiment (48h to 7 days)
  return { 
    type: "standard", 
    duration: "3-5 days", 
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

    // Check rate limit (20 requests/hour)
    const rateCheck = await checkRateLimit(user.id, 'experiment-generator', 20, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse();
    }

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
` : '';

    // NEW SYSTEM PROMPT - ACTION-ORIENTED, NO THERAPY-SPEAK
    const systemPrompt = `You design CONCRETE, ACTION-BASED experiments. Not therapy homework. Not abstract concepts. REAL constraints that force REAL outputs.

${context}

PILLAR: ${forcedPillar}
${sprintInstructions}
${avoidList}

═══════════════════════════════════════════════════════════════
REQUIRED FORMAT - EVERY EXPERIMENT MUST FOLLOW THIS EXACTLY:
═══════════════════════════════════════════════════════════════

TITLE FORMAT: "[Duration] [Constraint] → [Concrete Deliverable]"
Examples:
- "48h Phone Blackout → Ship UPath Landing Page"
- "5-Day Cold Email Blitz → 50 Outbound Messages"
- "7-Day Content Machine → 1 Post Every Morning"
- "24h No-Phone-Until-Shipped → Launch Landing Page"

DESCRIPTION FORMAT:
"You saved [Specific Source from their data]. [What it recommends/shows]. Try it: [Exact constraint]. [Exact deliverable]. [Deadline]."

═══════════════════════════════════════════════════════════════
9 MANDATORY RULES - BREAK ANY AND THE EXPERIMENT IS REJECTED:
═══════════════════════════════════════════════════════════════

1. CITE SPECIFIC SAVED SOURCE
   Must reference something from their insights/documents/identity.
   "You saved that video about deep work. He does 48h sprints."
   "Your identity mentions becoming a creator who ships daily."

2. CONCRETE CONSTRAINT (binary - you either follow it or break it)
   GOOD: "No phone until 1pm" / "48h media blackout" / "Cold shower every morning"
   BAD: "use phone less" / "be more focused" / "limit distractions"

3. CONCRETE DELIVERABLE (visible output at the end)
   GOOD: "Ship landing page" / "Send 50 cold emails" / "Post 7 times"
   BAD: "feel more productive" / "make progress" / "develop habit"

4. SPECIFIC DEADLINE
   GOOD: "by Sunday night" / "before 10am each day" / "within 48 hours"
   BAD: "eventually" / "when ready" / "over time"

5. ACTIVE VERBS ONLY
   USE: Ship, Send, Post, Call, Write, Test, Build, Launch, Publish, Create
   NEVER: Explore, Reflect, Consider, Embrace, Unlock, Journey, Process

6. NO THERAPY-SPEAK (instant rejection if found)
   BANNED WORDS: internal pressure, anxiety, saboteur, deep dive, embrace, unlock, 
   journey, explore, reflect, consider, mindfulness, relationship with, lean into,
   sit with, unpack, process, heal, inner, authentic self, boundaries, triggered

7. NO ABSTRACT CONCEPTS
   BAD: "Silence the Saboteur" / "Embrace Discomfort" / "Unlock Potential"
   GOOD: "No Phone Till Shipped" / "Talk to 10 Strangers" / "Ship 5 Features"

8. CHALLENGING (slightly scary = exciting)
   Should make them go "oh shit, that's hard but I kind of want to try it"
   Not comfortable. Not easy. Edge of comfort zone.

9. BINARY SUCCESS (easy to know if you did it or not)
   "Did you post 7 days in a row? Yes/No"
   "Did you ship the landing page? Yes/No"
   "Did you send 50 emails? Yes/No"

═══════════════════════════════════════════════════════════════
EXAMPLES OF GREAT EXPERIMENTS:
═══════════════════════════════════════════════════════════════

EXAMPLE 1:
Title: "48h Media Blackout → Ship UPath Sales Page"
Description: "You saved that Ali Abdaal video about deep work. He does 48h phone-off sprints to ship. Try it: No Instagram, no Twitter, no YouTube. Just UPath landing page copy. Ship rough version by Sunday night."
Steps: ["Saturday 8am: Phone off, put in drawer, start writing UPath value prop", "Saturday evening: First draft of landing page live (rough is fine)", "Sunday: Polish one section, add testimonial or demo video", "Monday 8am: Publish to domain. Phone back. Done."]

EXAMPLE 2:
Title: "5-Day Cold Email Blitz → 50 Outbound Messages"  
Description: "You saved that Hormozi cold outreach breakdown. His rule: 10 emails before breakfast. Try it: 10 cold emails to potential UPath users every morning for 5 days. Track responses. No skipping days."
Steps: ["Day 1-5: 10 cold emails sent before 9am", "Track: who responded, who ignored", "Follow up on Day 3 with anyone who opened but didn't reply", "End of Day 5: Calculate response rate. Iterate."]

EXAMPLE 3:
Title: "7-Day Content Machine → 1 Post Every Morning"
Description: "You saved that MrBeast video about daily shipping. He posted daily for 2 years before breaking out. Try it: 1 Twitter post about UPath's core insight (too many options = paralysis) every morning at 8am for 7 days. No editing, just ship."
Steps: ["Day 1-7: Write one post before 8am about decision paralysis / too many options", "No editing allowed. Write and post in under 10 minutes.", "Track: which post got most engagement? Do more like that."]

═══════════════════════════════════════════════════════════════
EXAMPLES OF BAD EXPERIMENTS (NEVER DO THIS):
═══════════════════════════════════════════════════════════════

❌ "The 'Silence the Saboteur' AI Deep Dive - addresses internal pressure to perform"
❌ "7-Day Mindfulness Journey - explore your relationship with productivity"  
❌ "Embrace the Discomfort Challenge - lean into uncertainty"
❌ "Unlock Your Creative Potential - discover what's holding you back"
❌ "Processing Your Inner Critic - sit with the discomfort"

WHY THESE ARE BAD:
- No concrete constraint (what exactly do you DO?)
- No deliverable (what ships at the end?)
- No deadline (by when?)
- Therapy-speak ("saboteur", "deep dive", "embrace", "relationship with")
- Abstract concepts (can't measure success)

═══════════════════════════════════════════════════════════════
LOOK AT THEIR DATA FOR:
═══════════════════════════════════════════════════════════════

1. What content they saved (videos, articles, insights)
2. What their identity says they're becoming
3. What projects they're working on (UPath, Weave, content, etc.)
4. What constraints have worked for them before
5. What they keep avoiding (that's the friction point)

Then design an experiment that:
- Cites a specific source from their data
- Has a Navy SEAL-style constraint (hard, clear, binary)
- Produces a real deliverable tied to their actual project
- Feels like "fuck yeah let's try that" not "ugh, homework"

Duration: ${sprintConfig.duration}
Intensity: ${sprintConfig.intensity}
NO EMOJIS. NO THERAPY-SPEAK. CONCRETE ONLY.`;

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
          { role: "user", content: `Design ONE experiment for the "${forcedPillar}" pillar. 

FORMAT REQUIRED:
- Title: "[Duration] [Constraint] → [Deliverable]"
- Description: Start with "You saved..." citing their data, then constraint + deliverable + deadline
- Steps: 2-4 concrete daily actions with specific times/quantities
- Duration: ${sprintConfig.duration}
- Identity shift: "I am someone who [action verb]..."

Sprint: ${sprintConfig.type}. Intensity: ${sprintConfig.intensity}.

Make it challenging. Make it concrete. Make it exciting. No therapy-speak.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate ONE concrete, action-based experiment with NO therapy-speak",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string", 
                          description: "Format: [Duration] [Constraint] → [Deliverable]. Example: '48h Phone Blackout → Ship Landing Page'" 
                        },
                        description: { 
                          type: "string", 
                          description: "Start with 'You saved [source]...' then constraint + deliverable + deadline" 
                        },
                        steps: { 
                          type: "array", 
                          items: { type: "string" }, 
                          minItems: 2, 
                          maxItems: 4,
                          description: "Concrete daily actions with specific times, quantities, or binary rules"
                        },
                        duration: { type: "string" },
                        identity_shift_target: { 
                          type: "string", 
                          description: "Format: 'I am someone who [action verb]...' Example: 'I ship under pressure.'" 
                        },
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
      console.log("No tool call returned, using fallback");
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
      console.error("Parse/validation error:", parseError);
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
