import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReturnToSelfOutput {
  identity: string;
  values: string;
  currentReality: string;
  fromYourMind: { 
    type: 'insight' | 'document'; 
    id: string;
    title: string; 
    content: string;
    matchedState: boolean;
  } | null;
  // For spiral states - more direct output
  isSpiral: boolean;
  physicalInterrupt?: string;
  patternName?: string;
  identityContrast?: string;
  counterAction?: string;
  // For normal states
  gentleRep: string;
  reminder: string;
  logId: string | null;
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Parse timezone and emotional state from request
    let timezone = 'UTC';
    let emotionalState: string | null = null;
    try {
      const body = await req.json();
      timezone = body.timezone || 'UTC';
      emotionalState = body.emotionalState || null;
    } catch {
      // No body or invalid JSON
    }

    console.log("Return to self - emotional state:", emotionalState);

    // Get time context
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    // Map states to keywords for insight matching (Weave-aligned, not emotional)
    const stateKeywords: Record<string, string[]> = {
      scattered: ["focus", "clarity", "one thing", "priority", "simplify", "present", "attention", "filter"],
      drifting: ["direction", "vision", "purpose", "identity", "becoming", "north star", "why", "intention"],
      stuck: ["action", "move", "start", "first step", "momentum", "begin", "rep", "ship"],
      disconnected: ["identity", "values", "who", "becoming", "self", "core", "essence", "remember"],
      overloaded: ["filter", "simplify", "less", "essential", "noise", "signal", "curate", "protect"],
      // Spiral states - match to more direct content
      anxious: ["calm", "present", "ground", "breathe", "stable", "center", "fear", "control"],
      comparing: ["enough", "unique", "path", "lane", "authentic", "validation", "external"],
      "people-pleasing": ["boundary", "self", "own", "authentic", "need", "deserve", "voice", "worth"],
      shrinking: ["expand", "bold", "courage", "step", "risk", "try", "show up", "visible"],
      spending: ["enough", "fill", "void", "present", "feel", "sit with", "need"],
      waiting: ["action", "start", "move", "create", "hustle", "initiative", "first step"],
    };

    // Spiral states get a different, more direct response
    const SPIRAL_STATES = ["anxious", "comparing", "people-pleasing", "shrinking", "spending", "waiting"];
    const isSpiral = emotionalState ? SPIRAL_STATES.includes(emotionalState) : false;

    // Fetch identity seed, insights, documents, and recent actions
    const [identitySeedResult, insightsResult, documentsResult, actionsResult] = await Promise.all([
      supabase
        .from("identity_seeds")
        .select("content, core_values, weekly_focus, year_note")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("insights")
        .select("id, title, content, relevance_score")
        .eq("user_id", user.id)
        .order("relevance_score", { ascending: false })
        .limit(15),
      supabase
        .from("documents")
        .select("id, title, summary, relevance_score")
        .eq("user_id", user.id)
        .order("relevance_score", { ascending: false })
        .limit(10),
      supabase
        .from("action_history")
        .select("action_text, pillar")
        .eq("user_id", user.id)
        .order("action_date", { ascending: false })
        .limit(15)
    ]);

    const identitySeed = identitySeedResult.data;
    const insights = insightsResult.data || [];
    const documents = documentsResult.data || [];
    const recentActions = actionsResult.data || [];

    // Combine insights and documents into a unified "your mind" pool
    const yourMind: Array<{ type: 'insight' | 'document'; id: string; title: string; content: string; relevance_score: number; matchScore?: number }> = [
      ...insights.map(i => ({ type: 'insight' as const, id: i.id, title: i.title, content: i.content, relevance_score: i.relevance_score || 0 })),
      ...documents.filter(d => d.summary).map(d => ({ type: 'document' as const, id: d.id, title: d.title, content: d.summary!, relevance_score: d.relevance_score || 0 }))
    ];

    // If state provided, score items by keyword matches
    let matchedItem: typeof yourMind[0] & { matchScore: number } | null = null;
    let wasStateMatched = false;
    if (emotionalState && stateKeywords[emotionalState] && yourMind.length > 0) {
      const keywords = stateKeywords[emotionalState];
      
      // Score all items by keyword matches
      const scoredItems = yourMind.map(item => {
        const text = `${item.title} ${item.content}`.toLowerCase();
        const matchCount = keywords.filter((kw: string) => text.includes(kw.toLowerCase())).length;
        return { ...item, matchScore: matchCount };
      });

      // Sort by match score, then relevance
      scoredItems.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.relevance_score || 0) - (a.relevance_score || 0);
      });

      // Pick best match if it has any keyword matches
      if (scoredItems[0]?.matchScore > 0) {
        matchedItem = scoredItems[0];
        wasStateMatched = true;
        console.log(`Found matching ${matchedItem.type}:`, matchedItem.title, "score:", matchedItem.matchScore);
      }
    }

    // Use matched item or fall back to random relevant one from either insights or docs
    const randomItem = matchedItem || (yourMind.length > 0 
      ? { ...yourMind.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))[Math.floor(Math.random() * Math.min(5, yourMind.length))], matchScore: 0 }
      : null);

    const identity = identitySeed?.content || "You are becoming someone who takes aligned action.";
    const values = identitySeed?.core_values || "Growth, Presence, Creation";
    const currentReality = identitySeed?.weekly_focus || "You are here. That is enough.";
    const yearNote = identitySeed?.year_note || "";

    // Detect integration pattern - the ONE practice across contexts
    const allText = [identity, values, currentReality, ...recentActions.map(a => a.action_text || '')].join(' ').toLowerCase();
    
    const practicePatterns = [
      { regex: /stay(ing)? (with|present|grounded|expanded)/gi, practice: "staying present with discomfort" },
      { regex: /trust(ing)? (yourself|the process|your)/gi, practice: "building self-trust" },
      { regex: /consistent|consistency|show(ing)? up/gi, practice: "consistent action over perfection" },
      { regex: /express|create|build|ship/gi, practice: "expression over consumption" },
    ];
    
    let corePractice = "";
    for (const p of practicePatterns) {
      if ((allText.match(p.regex) || []).length >= 2) {
        corePractice = p.practice;
        break;
      }
    }

    // Time-appropriate grounding
    const timeContext = {
      morning: "Morning energy - can suggest slightly more active grounding (movement, cold exposure, journaling)",
      afternoon: "Afternoon - balance, re-centering (short walk, breathing, quick reset)",
      evening: "Evening wind-down - gentler activities (reflection, gratitude, light reading)",
      night: "Night - pure calm (breathing, stillness, preparing for rest)"
    };

    // State context for AI (Weave-aligned: patterns and identity, not therapy)
    const stateContext = emotionalState ? {
      // Off-center states
      scattered: "Too many threads. Help them pick ONE to pull on right now.",
      drifting: "Lost sight of direction. Reflect their identity/vision back to them clearly.",
      stuck: "Can't start. Give them one tiny first rep - action over planning.",
      disconnected: "Far from who they're becoming. Mirror their identity seed back.",
      overloaded: "Too much input. Help them filter to what actually matters for their path.",
      // Spiral states - more direct
      anxious: "Nervous system activated. Physical interrupt first, then identity anchor.",
      comparing: "Looking sideways instead of forward. Name the pattern, return to their lane.",
      "people-pleasing": "Losing self to meet others' expectations. Reclaim their own needs.",
      shrinking: "Playing small out of fear. Remind them of their actual identity.",
      spending: "Trying to buy their way to feeling. Ground them in what they already have.",
      waiting: "Passive when they need to be active. Activate one move.",
    }[emotionalState] : "";

    // Spiral-specific direct naming of the pattern
    const spiralPatterns: Record<string, string> = {
      anxious: "Your nervous system is scanning for threats. It's doing its job. But you don't have to believe everything it says.",
      comparing: "You're looking at their highlight reel and comparing it to your behind-the-scenes. Different lanes, different timelines.",
      "people-pleasing": "You're outsourcing your worth to other people's opinions. They don't get to decide who you are.",
      shrinking: "You're making yourself smaller to feel safer. But safety isn't found in invisibility.",
      spending: "You're trying to buy your way to a feeling you can create for free. The void doesn't close with purchases.",
      waiting: "You're waiting for permission, for conditions, for something to happen first. But you're the one who moves.",
    };

    // Different prompts for spiral vs off-center states
    let systemPrompt: string;
    let toolDefinition: any;

    if (isSpiral && emotionalState) {
      // SPIRAL STATE - more direct, pattern-breaking
      systemPrompt = `You are a pattern-interrupt system. The user is in a spiral (${emotionalState}).
Your job: Name it directly, give a physical interrupt, show identity contrast, provide one counter-action.
NO therapy language. NO soft framing. Direct, concrete, grounded.

THE PATTERN: ${spiralPatterns[emotionalState] || ""}
${stateContext ? `CONTEXT: ${stateContext}` : ''}

USER'S ACTUAL IDENTITY: ${identity}
USER VALUES: ${values}
${yearNote ? `WHAT THEY'RE BUILDING: ${yearNote}` : ''}
${randomItem ? `FROM THEIR OWN MIND: "${randomItem.title}" - ${randomItem.content.substring(0, 200)}` : ""}

Return these fields:
- physicalInterrupt: ONE physical thing to do right now (5-30 seconds). Cold water on face. 10 jumping jacks. Walk to the window. Something that shifts the body.
- identityContrast: One sentence showing who they ARE (from their identity) vs this pattern. Direct naming. "You're [identity] - not someone who [pattern behavior]."
- counterAction: ONE action (2-5 min) that's the opposite of the spiral pattern. Based on their actual identity/goals.

Rules:
- Physical first, always
- Name patterns directly, don't dance around
- No "I know this is hard" / "give yourself grace" - that's therapy language
- Pull from their actual identity, not generic advice
- Be specific to their stated values and direction`;

      toolDefinition = {
        type: "function",
        function: {
          name: "break_spiral",
          description: "Return a spiral-breaking intervention",
          parameters: {
            type: "object",
            properties: {
              physicalInterrupt: { type: "string", description: "One immediate physical action (5-30 seconds)" },
              identityContrast: { type: "string", description: "Who they are vs this pattern" },
              counterAction: { type: "string", description: "One 2-5 min identity-aligned action" }
            },
            required: ["physicalInterrupt", "identityContrast", "counterAction"],
            additionalProperties: false
          }
        }
      };
    } else {
      // OFF-CENTER STATE - gentler grounding
      systemPrompt = `You surface what the user already knows. The user is off-center${emotionalState ? ` (specifically: ${emotionalState})` : ''}. 
Based on their saved identity and values, bring them back to themselves with one concrete micro-action.

CORE PHILOSOPHY:
The user is NOT managing separate life areas. They're living ONE integrated life. Your job is to reflect back who they already are, not prescribe who they should become.
${corePractice ? `\nDETECTED CORE PRACTICE: "${corePractice}" - this is what they're practicing everywhere. Reference it.` : ''}
${stateContext ? `\nSTATE CONTEXT: ${stateContext}` : ''}

TIME: ${timeOfDay}
${timeContext[timeOfDay as keyof typeof timeContext]}

USER IDENTITY: ${identity}
USER VALUES: ${values}
CURRENT REALITY: ${currentReality}
${yearNote ? `THEIR YEAR VISION: ${yearNote}` : ''}
${randomItem ? `FROM YOUR MIND (${randomItem.type}): "${randomItem.title}" - ${randomItem.content.substring(0, 300)}${matchedItem ? ' (matched to their current state)' : ''}` : ""}

Return a JSON object with exactly these fields:
- gentleRep: A single 2-5 minute action appropriate for ${timeOfDay}. Reference their actual identity/values. Something that reconnects them to who they're becoming.${emotionalState ? ` Address their ${emotionalState} state directly but practically.` : ''} If a core practice was detected, the action should be an expression of that practice.
- reminder: One sentence (under 15 words) that reminds them what they're doing with their life. ${corePractice ? `Connect it to their core practice: "${corePractice}"` : 'Pull from their identity.'} Be specific.

Rules:
- Match energy to ${timeOfDay} (${timeOfDay === 'night' ? 'very calm, wind-down only' : timeOfDay === 'evening' ? 'gentle' : timeOfDay === 'afternoon' ? 'balanced' : 'can be slightly more active'})
- No emojis
- No emotional language ("You've got this", "I believe in you")
- No therapeutic framing ("I know it's hard", "Give yourself grace")
- No motivational fluff
- Reference their actual identity/values from what they've saved
${randomItem ? '- Reference what they already captured back to them' : ''}
- Keep it concrete and immediate
- Frame as PERMISSION to live what they're already becoming, not another thing to manage`;

      toolDefinition = {
        type: "function",
        function: {
          name: "return_grounding",
          description: "Return a grounding response",
          parameters: {
            type: "object",
            properties: {
              gentleRep: { type: "string", description: "A gentle 2-5 minute identity-aligned action" },
              reminder: { type: "string", description: "One sentence reminder of what they're doing with their life" }
            },
            required: ["gentleRep", "reminder"],
            additionalProperties: false
          }
        }
      };
    }

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
          { role: "user", content: isSpiral ? "Break the spiral." : "Generate the grounding response." }
        ],
        tools: [toolDefinition],
        tool_choice: { type: "function", function: { name: isSpiral ? "break_spiral" : "return_grounding" } }
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      // Fallback response
      const fallback: ReturnToSelfOutput = {
        identity: identity.substring(0, 200),
        values,
        currentReality: currentReality.substring(0, 200),
        fromYourMind: randomItem ? { 
          type: randomItem.type,
          id: randomItem.id,
          title: randomItem.title, 
          content: randomItem.content.substring(0, 200),
          matchedState: wasStateMatched
        } : null,
        isSpiral,
        physicalInterrupt: isSpiral ? "Cold water on your face. 10 seconds." : undefined,
        patternName: isSpiral && emotionalState ? spiralPatterns[emotionalState] : undefined,
        identityContrast: isSpiral ? `You're ${identity.substring(0, 50)}... - not this moment.` : undefined,
        counterAction: isSpiral ? "Stand up and take 5 slow breaths." : undefined,
        gentleRep: isSpiral ? "" : "Take three slow breaths. Feel your feet on the ground. You are here.",
        reminder: isSpiral ? "" : "You are becoming who you said you'd become.",
        logId: null
      };
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    
    // Different parsing for spiral vs normal
    let gentleRep = "";
    let reminder = "";
    let physicalInterrupt = "";
    let identityContrast = "";
    let counterAction = "";

    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (isSpiral) {
          physicalInterrupt = parsed.physicalInterrupt || "Cold water on your face. Now.";
          identityContrast = parsed.identityContrast || `You're becoming ${identity.substring(0, 50)} - not this moment.`;
          counterAction = parsed.counterAction || "Stand up and take 5 slow breaths.";
        } else {
          gentleRep = parsed.gentleRep || "Take three slow breaths. Feel your feet on the ground.";
          reminder = parsed.reminder || "You are becoming who you said you'd become.";
        }
      }
    } catch (e) {
      console.error("Parse error:", e);
      // Fallbacks
      if (isSpiral) {
        physicalInterrupt = "Cold water on your face. Now.";
        identityContrast = `You're becoming ${identity.substring(0, 50)} - not this moment.`;
        counterAction = "Stand up and take 5 slow breaths.";
      } else {
        gentleRep = "Take three slow breaths. Feel your feet on the ground.";
        reminder = "You are becoming who you said you'd become.";
      }
    }

    // Log this grounding session
    let logId: string | null = null;
    try {
      const { data: logData } = await supabase
        .from("grounding_log")
        .insert({
          user_id: user.id,
          emotional_state: emotionalState,
          matched_source_type: randomItem?.type || null,
          matched_source_id: randomItem?.id || null,
          matched_source_title: randomItem?.title || null,
          gentle_rep: isSpiral ? counterAction : gentleRep,
          reminder: isSpiral ? identityContrast : reminder
        })
        .select("id")
        .single();
      
      logId = logData?.id || null;
    } catch (logError) {
      console.error("Failed to log grounding session:", logError);
    }

    const output: ReturnToSelfOutput = {
      identity: identity.substring(0, 300),
      values,
      currentReality: currentReality.substring(0, 300),
      fromYourMind: randomItem 
        ? { 
            type: randomItem.type,
            id: randomItem.id,
            title: randomItem.title, 
            content: randomItem.content.substring(0, 200),
            matchedState: wasStateMatched
          } 
        : null,
      isSpiral,
      physicalInterrupt: isSpiral ? physicalInterrupt : undefined,
      patternName: isSpiral && emotionalState ? spiralPatterns[emotionalState] : undefined,
      identityContrast: isSpiral ? identityContrast : undefined,
      counterAction: isSpiral ? counterAction : undefined,
      gentleRep: isSpiral ? "" : gentleRep,
      reminder: isSpiral ? "" : reminder,
      logId
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Return to self error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      // Provide fallback even on error
      identity: "You are becoming someone aligned with your values.",
      values: "Growth, Presence, Creation",
      currentReality: "You are here. That is enough.",
      fromYourMind: null,
      isSpiral: false,
      gentleRep: "Take three slow breaths. Feel your feet on the ground. You are here.",
      reminder: "You are becoming who you said you'd become.",
      logId: null
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
