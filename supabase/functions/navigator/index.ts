import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";
import { checkRateLimit, rateLimitResponse } from "../shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALL_PILLARS = ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Connection", "Learning"];

interface NavigatorOutput {
  priority_for_today: string;
  do_this_now: string;
  why_it_matters: string;
  time_required: string;
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu, '').trim();
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.priority_for_today || typeof data.priority_for_today !== 'string') throw new Error('Invalid priority_for_today');
  if (!data.do_this_now || typeof data.do_this_now !== 'string') throw new Error('Invalid do_this_now');
  if (!data.why_it_matters || typeof data.why_it_matters !== 'string') throw new Error('Invalid why_it_matters');
  if (!data.time_required || typeof data.time_required !== 'string') throw new Error('Invalid time_required');
  
  return {
    priority_for_today: stripEmojis(data.priority_for_today),
    do_this_now: stripEmojis(data.do_this_now),
    why_it_matters: stripEmojis(data.why_it_matters),
    time_required: stripEmojis(data.time_required)
  };
}

// Enhanced fallback that can incorporate user data
interface UserDataForFallback {
  weeklyFocus?: string;
  yearNote?: string;
  activeProject?: string;
  recentHurdle?: string;
  coreValues?: string;
}

function getEnhancedFallback(pillar: string, userData?: UserDataForFallback): NavigatorOutput {
  const baseFallbacks: { [key: string]: { action: string; why: string; time: string } } = {
    "Skill": { action: "Build something visible for 30 minutes", why: "Small progress compounds. Ship something small.", time: "30 minutes" },
    "Content": { action: "Write and share one authentic insight", why: "Building in public attracts opportunity.", time: "20 minutes" },
    "Health": { action: "Move your body for 20 minutes", why: "Physical energy creates mental clarity.", time: "20 minutes" },
    "Presence": { action: "5 minutes of nervous system regulation", why: "Calm creates clarity.", time: "10 minutes" },
    "Stability": { action: "Take one action toward income", why: "Stability creates freedom.", time: "30 minutes" },
    "Admin": { action: "Clear one thing from your backlog", why: "Friction drains energy.", time: "15 minutes" },
    "Connection": { action: "Reach out to one person you've been meaning to contact", why: "Connection compounds.", time: "10 minutes" },
    "Learning": { action: "25 minutes of focused learning", why: "Learn to apply, not to know.", time: "25 minutes" }
  };

  const base = baseFallbacks[pillar] || baseFallbacks["Skill"];
  
  // Personalize if we have user data
  let action = base.action;
  let why = base.why;
  
  if (userData) {
    // Inject specific projects/focus into actions
    if (pillar === "Skill" && userData.activeProject) {
      action = `Work on ${userData.activeProject.slice(0, 40)} for 30 minutes`;
    } else if (pillar === "Content" && userData.weeklyFocus) {
      action = `Write about ${userData.weeklyFocus.slice(0, 30)}`;
    } else if (pillar === "Stability" && userData.yearNote) {
      // Extract income-related context
      const incomeMatch = userData.yearNote.match(/(\$[\d,]+|income|revenue|business)/i);
      if (incomeMatch) {
        action = "One concrete step toward your income goal";
      }
    }
    
    // Make "why" reference their values if available
    if (userData.coreValues) {
      const firstValue = userData.coreValues.split(',')[0]?.trim().slice(0, 20);
      if (firstValue) {
        why = `Aligns with your value of ${firstValue}. ${base.why}`;
      }
    }
  }

  return {
    priority_for_today: pillar,
    do_this_now: action,
    why_it_matters: why,
    time_required: base.time
  };
}

// Simple fallback for when we have no user data
function getFallbackSuggestion(pillar: string): NavigatorOutput {
  return getEnhancedFallback(pillar);
}

function choosePillar(recentPillars: string[]): string {
  const last3 = recentPillars.slice(0, 3);
  
  if (last3.length >= 2 && last3[0] === last3[1]) {
    const available = ALL_PILLARS.filter(p => p !== last3[0]);
    return available[Math.floor(Math.random() * available.length)];
  }
  
  const pillarCounts: { [key: string]: number } = {};
  ALL_PILLARS.forEach(p => pillarCounts[p] = 0);
  last3.forEach(p => { if (pillarCounts[p] !== undefined) pillarCounts[p]++; });
  
  const unused = ALL_PILLARS.filter(p => pillarCounts[p] === 0);
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }
  
  const available = ALL_PILLARS.filter(p => p !== last3[0]);
  return available[Math.floor(Math.random() * available.length)];
}

// Get current date/time context using user's timezone with detailed time rules
interface TimeContext {
  dayOfWeek: string;
  date: string;
  timeOfDay: string;
  hour: number;
  dayOfWeekNum: number;
  fullContext: string;
  energyLevel: string;
  taskTypes: string;
  duration: string;
  avoidTypes: string;
  isLateNight: boolean;
  isLearned: boolean;
  learnedNote: string;
}

interface UserTimePreference {
  hour_of_day: number;
  request_count: number;
  complete_count: number;
  skip_count: number;
  success_rate: number;
}

// Default time rules (used when no learned data)
const DEFAULT_TIME_RULES: { [key: string]: { energyLevel: string; taskTypes: string; duration: string; avoidTypes: string } } = {
  late_night: {
    energyLevel: 'Very Low',
    taskTypes: 'Reflection, journaling, light admin, tomorrow prep, winding down',
    duration: '5-15 minutes max',
    avoidTypes: 'Work tasks, deep focus, meetings, anything requiring energy, creative projects'
  },
  early_morning: {
    energyLevel: 'Medium-High (for early risers)',
    taskTypes: 'Strategic thinking, planning, personal development, morning routine',
    duration: '20-45 minutes',
    avoidTypes: 'Meetings, reactive tasks, email'
  },
  morning: {
    energyLevel: 'High',
    taskTypes: 'Deep work, creative tasks, strategic execution, building, shipping',
    duration: '30-90 minutes',
    avoidTypes: 'Admin, low-value tasks'
  },
  afternoon: {
    energyLevel: 'Medium',
    taskTypes: 'Execution, meetings, collaboration, testing, iteration',
    duration: '30-45 minutes',
    avoidTypes: 'Heavy creative work (save for morning)'
  },
  evening: {
    energyLevel: 'Low-Medium',
    taskTypes: 'Light tasks, admin, learning, creative exploration, social',
    duration: '20-30 minutes',
    avoidTypes: 'Deep focus, stressful tasks, heavy work'
  }
};

function getTimeOfDayCategory(hour: number): string {
  if (hour >= 23 || hour < 5) return 'late_night';
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function getDateTimeContext(timezone?: string, userPrefs?: UserTimePreference[]): TimeContext {
  const now = new Date();
  
  // Use user's timezone if provided, otherwise fallback to UTC
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: timezone || 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  
  const dayOfWeek = parts.find(p => p.type === 'weekday')?.value || 'Monday';
  const month = parts.find(p => p.type === 'month')?.value || 'Jan';
  const day = parts.find(p => p.type === 'day')?.value || '1';
  const hourStr = parts.find(p => p.type === 'hour')?.value || '12';
  const hour = parseInt(hourStr, 10);
  
  // Get day of week as number (0 = Sunday)
  const dayMap: { [key: string]: number } = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
  const dayOfWeekNum = dayMap[dayOfWeek] ?? 1;
  
  const date = `${month} ${day}`;
  const timeOfDay = getTimeOfDayCategory(hour);
  
  // Check if user has learned preferences for this hour
  let isLearned = false;
  let learnedNote = '';
  let energyLevel: string;
  let taskTypes: string;
  let duration: string;
  let avoidTypes: string;
  
  const hourPref = userPrefs?.find(p => p.hour_of_day === hour);
  
  if (hourPref && (hourPref.complete_count + hourPref.skip_count) >= 3) {
    // We have enough data to make inferences
    isLearned = true;
    const successRate = hourPref.success_rate;
    
    if (successRate >= 0.7) {
      // User is highly productive at this hour
      learnedNote = `User completes ${Math.round(successRate * 100)}% of tasks at this hour - they're productive now`;
      energyLevel = 'High (learned from behavior)';
      taskTypes = 'Deep work, creative tasks, building, shipping - user is active at this hour';
      duration = '30-90 minutes';
      avoidTypes = 'Low-value tasks';
    } else if (successRate >= 0.4) {
      // Moderate productivity
      learnedNote = `User completes ${Math.round(successRate * 100)}% of tasks at this hour - moderate energy`;
      energyLevel = 'Medium (learned from behavior)';
      taskTypes = 'Balanced tasks, execution, light creative work';
      duration = '20-45 minutes';
      avoidTypes = 'Heavy deep work';
    } else {
      // Low completion rate - user often skips at this hour
      learnedNote = `User skips ${Math.round((1 - successRate) * 100)}% of tasks at this hour - suggest lighter tasks`;
      energyLevel = 'Low (learned from behavior)';
      taskTypes = 'Light reflection, quick wins, journaling, admin';
      duration = '5-20 minutes';
      avoidTypes = 'Deep focus, heavy work, long tasks';
    }
  } else {
    // Use default rules
    const defaultRule = DEFAULT_TIME_RULES[timeOfDay];
    energyLevel = defaultRule.energyLevel;
    taskTypes = defaultRule.taskTypes;
    duration = defaultRule.duration;
    avoidTypes = defaultRule.avoidTypes;
  }
  
  const isLateNight = (hour >= 23 || hour < 5) && !isLearned;
  
  return {
    dayOfWeek,
    date,
    timeOfDay,
    hour,
    dayOfWeekNum,
    fullContext: `${dayOfWeek}, ${date} at ${hour}:00 (${timeOfDay.replace('_', ' ')})`,
    energyLevel,
    taskTypes,
    duration,
    avoidTypes,
    isLateNight,
    isLearned,
    learnedNote
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let timezone: string | undefined;
    let userContext: string | undefined;
    let generateMultiple = false;
    
    try {
      const body = await req.json();
      timezone = body?.timezone;
      userContext = body?.context;
      generateMultiple = body?.generateMultiple === true;
    } catch {
      // No body or invalid JSON
    }

    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Check rate limit (20 requests/hour)
    const rateCheck = await checkRateLimit(user.id, 'navigator', 20, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse();
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    
    // Fetch user's learned time preferences
    const { data: userTimePrefs } = await supabase.rpc('get_user_time_preferences', { p_user_id: user.id });
    
    const dateTime = getDateTimeContext(timezone, userTimePrefs);
    console.log(`Navigator: ${dateTime.fullContext}, learned: ${dateTime.isLearned}, multiple: ${generateMultiple}`);
    
    // Track this request for learning
    await supabase.from('user_activity_patterns').insert({
      user_id: user.id,
      hour_of_day: dateTime.hour,
      day_of_week: dateTime.dayOfWeekNum,
      activity_type: 'request'
    });

    const userContextData = await fetchUserContext(supabase, user.id);
    
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("last_pillar_used, content, core_values, year_note, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();
    
    // Fetch recent completed actions to avoid repetition (past 7 days)
    const { data: recentActions } = await supabase
      .from("action_history")
      .select("action_text, pillar, action_date")
      .eq("user_id", user.id)
      .gte("action_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order("action_date", { ascending: false })
      .limit(20);
    
    // Fetch MORE semantic insights - expand to 15 for better grounding
    let semanticInsights: string[] = [];
    if (identityData?.content) {
      try {
        const embedResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: identityData.content.substring(0, 2000)
          }),
        });
        
        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          const embedding = embedData.data?.[0]?.embedding;
          
          if (embedding) {
            const { data: relevantInsights } = await supabase.rpc('search_insights_semantic', {
              user_uuid: user.id,
              query_embedding: `[${embedding.join(',')}]`,
              match_count: 15,
              similarity_threshold: 0.35
            });
            
            if (relevantInsights && relevantInsights.length > 0) {
              semanticInsights = relevantInsights.map((i: any) => 
                `[${i.source || 'insight'}] "${i.title}": ${i.content.substring(0, 200)}`
              );
            }
          }
        }
      } catch (embedError) {
        console.error('Semantic search error:', embedError);
      }
    }

    const lastPillar = identityData?.last_pillar_used || null;
    const recentPillars = [
      ...(lastPillar ? [lastPillar] : []),
      ...userContextData.pillar_history
    ];

    // For multiple options, pick 3 different pillars
    const pillar1 = choosePillar(recentPillars);
    const pillar2 = choosePillar([pillar1, ...recentPillars]);
    const pillar3 = choosePillar([pillar1, pillar2, ...recentPillars]);
    
    // Build recent actions context for de-duplication
    const recentActionsContext = recentActions && recentActions.length > 0
      ? `\n\nACTIONS ALREADY TAKEN (DO NOT REPEAT THESE):\n${recentActions.map(a => `- [${a.pillar}] ${a.action_text}`).join('\n')}`
      : '';
    
    // Build 2026 direction context
    const yearDirection = identityData?.year_note 
      ? `\n\n=== 2026 MISOGI / YEARLY DIRECTION ===\n${identityData.year_note}`
      : '';
    
    // Build weekly focus context  
    const weeklyContext = identityData?.weekly_focus
      ? `\n\n=== THIS WEEK'S FOCUS ===\n${identityData.weekly_focus}`
      : '';

    const contextPrompt = formatContextForAI(userContextData);
    const semanticContext = semanticInsights.length > 0 
      ? `\n\nRELEVANT INSIGHTS:\n${semanticInsights.join('\n')}`
      : '';
    
    const userMindContext = userContext 
      ? `\n\nWHAT'S ON THEIR MIND TODAY: "${userContext}"\nFactor this into your suggestions - what they mentioned should influence the types of actions you suggest.`
      : '';

    const coreValuesContext = identityData?.core_values
      ? `\n\nCORE VALUES: ${identityData.core_values}`
      : '';

    // Build detailed time context for prompts
    const timeContextBlock = `
=== TIME CONTEXT (FOLLOW STRICTLY) ===
Current time: ${dateTime.hour}:00 (${dateTime.timeOfDay.replace('_', ' ')})
Energy level: ${dateTime.energyLevel}
Appropriate tasks: ${dateTime.taskTypes}
Duration range: ${dateTime.duration}
AVOID at this time: ${dateTime.avoidTypes}
${dateTime.isLearned ? `\n*** PERSONALIZED: ${dateTime.learnedNote} ***` : ''}
${dateTime.isLateNight ? '\n*** CRITICAL: It is LATE NIGHT. Only suggest reflection, journaling, tomorrow prep, or rest. NO work tasks. ***' : ''}
=== END TIME CONTEXT ===`;

    // Late night fallback - only light tasks
    const lateNightPillars = ["Presence", "Health", "Admin"];
    
    if (generateMultiple) {
      // For late night, override pillars to only relaxing ones
      const effectivePillar1 = dateTime.isLateNight ? "Presence" : pillar1;
      const effectivePillar2 = dateTime.isLateNight ? "Health" : pillar2;
      const effectivePillar3 = dateTime.isLateNight ? "Admin" : pillar3;
      
      // Generate 3 options with comprehensive context
      const systemPrompt = `You help this person take ONE action that moves them toward their 2026 vision. Return 3 options.

=== WHO THEY ARE ===
${identityData?.content || 'Full-stack human building toward their vision'}
${yearDirection}
${weeklyContext}
${coreValuesContext}

=== THEIR CAPTURED WISDOM (from YouTube, articles, PDFs they've saved) ===
${semanticContext || 'No recent insights captured'}

=== WHAT THEY'VE ALREADY DONE (DON'T REPEAT) ===
${recentActionsContext || 'No recent actions tracked'}

=== ACTIVE PROJECTS ===
${userContextData.active_projects?.join(', ') || 'UPath, content creation'}

=== CURRENT HURDLES THEY'VE MENTIONED ===
${userContextData.current_hurdles?.join(', ') || 'Consistency, showing up authentically'}

TODAY: ${dateTime.fullContext}
${timeContextBlock}
${userMindContext}

PILLARS TO USE: ${effectivePillar1}, ${effectivePillar2}, ${effectivePillar3}

=== HOW TO GENERATE GOOD INVITATIONS ===

1. REVERSE ENGINEER FROM 2026:
   - Their year_note/Misogi is the END goal
   - What capability, proof point, or habit builds toward that?
   - What's ONE step they can take TODAY toward that capability?

2. BE SPECIFIC TO THEIR CONTEXT:
   - Use their actual project names (UPath, Weave, etc.)
   - Reference their actual hurdles (posting consistently, etc.)
   - Ground in their actual values

3. AVOID WHAT THEY'VE ALREADY DONE:
   - Check the "already done" list above
   - Don't suggest the same action twice in a week

4. MATCH TIME OF DAY:
   - Energy level: ${dateTime.energyLevel}
   - Duration: ${dateTime.duration}

BANNED:
- "watch/read/review" anything
- Vague actions like "work on your project"
- Generic productivity advice
- Emotional/motivational language
- Anything they've already done this week

GOOD EXAMPLES:
- "Record a 60-second talking head video about UPath for LinkedIn (15 min)"
- "DM 3 creators you admire on Twitter with genuine feedback (10 min)"
- "Build the UPath onboarding flow first screen (45 min)"
- "5-minute breathwork before your next call"

${dateTime.isLateNight ? `LATE NIGHT: Only journaling, tomorrow prep, gratitude, breathing. 5-15 min max.` : ''}`;

      // Model strategy: Try cheap model first, fall back to best if needed, then local fallback
      // 1. Primary: gemini-2.5-flash-lite (cheapest, fast)
      // 2. If low credits: enhanced local fallback (uses user data, no AI cost)
      
      const userData: UserDataForFallback = {
        weeklyFocus: identityData?.content?.match(/focus[:\s]+([^.\n]+)/i)?.[1],
        yearNote: identityData?.content?.match(/goal[:\s]+([^.\n]+)/i)?.[1] || identityData?.content?.substring(0, 100),
        activeProject: userContextData.active_projects?.[0],
        recentHurdle: userContextData.current_hurdles?.[0],
        coreValues: identityData?.core_values
      };
      
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash", // Higher quality for better invitations
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Give me 3 different action options to choose from." }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_options",
                description: "Return 3 different action options",
                parameters: {
                  type: "object",
                  properties: {
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          priority_for_today: { type: "string" },
                          do_this_now: { type: "string" },
                          why_it_matters: { type: "string" },
                          time_required: { type: "string" }
                        },
                        required: ["priority_for_today", "do_this_now", "why_it_matters", "time_required"]
                      },
                      minItems: 3,
                      maxItems: 3
                    }
                  },
                  required: ["options"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "generate_options" } }
        }),
      });

      // FALLBACK STRATEGY:
      // 402 = Payment Required (out of credits) -> use local enhanced fallback
      // 429 = Rate Limit -> use local enhanced fallback  
      // Other errors -> try local enhanced fallback
      if (!response.ok) {
        console.log(`AI error ${response.status} - using enhanced local fallback`);
        // Return personalized fallback using user's actual data (no AI cost)
        return new Response(JSON.stringify({
          options: [
            getEnhancedFallback(pillar1, userData),
            getEnhancedFallback(pillar2, userData),
            getEnhancedFallback(pillar3, userData)
          ],
          fallback: true, // Signal to frontend this is a fallback
          reason: response.status === 402 ? 'credits_low' : response.status === 429 ? 'rate_limited' : 'ai_error'
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const toolCall = data.choices[0].message.tool_calls?.[0];
      
      if (!toolCall) {
        return new Response(JSON.stringify({
          options: [
            getFallbackSuggestion(pillar1),
            getFallbackSuggestion(pillar2),
            getFallbackSuggestion(pillar3)
          ]
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        const cleanedOptions = parsed.options.map((opt: any) => ({
          priority_for_today: stripEmojis(opt.priority_for_today || "Action"),
          do_this_now: stripEmojis(opt.do_this_now),
          why_it_matters: stripEmojis(opt.why_it_matters),
          time_required: stripEmojis(opt.time_required)
        }));
        
        return new Response(JSON.stringify({ options: cleanedOptions }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (parseError) {
        console.error("Parse error:", parseError);
        return new Response(JSON.stringify({
          options: [
            getFallbackSuggestion(pillar1),
            getFallbackSuggestion(pillar2),
            getFallbackSuggestion(pillar3)
          ]
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      // Original single action flow
      // For late night, override to relaxing pillar
      const suggestedPillar = dateTime.isLateNight ? "Presence" : pillar1;
      
      const systemPrompt = `You help this person take ONE action that moves them toward their 2026 vision.

=== WHO THEY ARE ===
${identityData?.content || 'Full-stack human building toward their vision'}
${yearDirection}
${weeklyContext}
${coreValuesContext}

=== THEIR CAPTURED WISDOM ===
${semanticContext || 'No recent insights captured'}

=== WHAT THEY'VE ALREADY DONE (DON'T REPEAT) ===
${recentActionsContext || 'No recent actions tracked'}

=== ACTIVE PROJECTS ===
${userContextData.active_projects?.join(', ') || 'UPath, content creation'}

=== CURRENT HURDLES ===
${userContextData.current_hurdles?.join(', ') || 'Consistency, showing up authentically'}

TODAY: ${dateTime.fullContext}
${timeContextBlock}
${userMindContext}

PILLAR: ${suggestedPillar}

=== HOW TO GENERATE A GOOD INVITATION ===

1. REVERSE ENGINEER FROM 2026:
   - Their year_note/Misogi is the END goal
   - What capability builds toward that?
   - What's ONE step they can take TODAY?

2. BE SPECIFIC:
   - Use their actual project names
   - Reference their actual hurdles
   - Ground in their actual values

3. AVOID REPETITION:
   - Don't suggest what they've already done

BANNED: "watch/read/review", vague actions, generic advice, emotional language

GOOD EXAMPLES:
- "Record a 60-second UPath explainer video (15 min)"
- "DM 3 creators on Twitter with genuine feedback (10 min)"
- "Build the onboarding first screen (45 min)"

${dateTime.isLateNight ? `LATE NIGHT: Only journaling, tomorrow prep, breathing. 5-15 min max.` : ''}`;


      // Model strategy for single action: cheap model first, then local fallback
      const userData: UserDataForFallback = {
        weeklyFocus: identityData?.content?.match(/focus[:\s]+([^.\n]+)/i)?.[1],
        yearNote: identityData?.content?.match(/goal[:\s]+([^.\n]+)/i)?.[1],
        activeProject: userContextData.active_projects?.[0],
        recentHurdle: userContextData.current_hurdles?.[0],
        coreValues: identityData?.core_values
      };
      
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash", // Higher quality for better invitations
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Give me ONE specific "${suggestedPillar}" action.` }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "choose_daily_action",
                description: "Return one specific action",
                parameters: {
                  type: "object",
                  properties: {
                    priority_for_today: { type: "string", enum: ALL_PILLARS },
                    do_this_now: { type: "string" },
                    why_it_matters: { type: "string" },
                    time_required: { type: "string" }
                  },
                  required: ["priority_for_today", "do_this_now", "why_it_matters", "time_required"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "choose_daily_action" } }
        }),
      });

      // FALLBACK: If AI fails (402/429/other), use local enhanced fallback
      if (!response.ok) {
        console.log(`AI error ${response.status} - using enhanced local fallback for single action`);
        const fallbackResult = getEnhancedFallback(suggestedPillar, userData);
        return new Response(JSON.stringify({
          ...fallbackResult,
          fallback: true,
          reason: response.status === 402 ? 'credits_low' : response.status === 429 ? 'rate_limited' : 'ai_error'
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const toolCall = data.choices[0].message.tool_calls?.[0];
      
      if (!toolCall) {
        return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        let action = JSON.parse(toolCall.function.arguments);
        action = validateNavigatorOutput(action);
        
        const lowerAction = action.do_this_now.toLowerCase();
        if (lowerAction.includes('review') || lowerAction.includes('read') || lowerAction.includes('look at')) {
          return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        await supabase
          .from("identity_seeds")
          .update({ last_pillar_used: action.priority_for_today })
          .eq("user_id", user.id);
          
        return new Response(JSON.stringify(action), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (parseError) {
        console.error("Parse error:", parseError);
        return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  } catch (error) {
    console.error("Navigator error:", error);
    // Return a fallback suggestion instead of an error - system must always provide a next step
    const fallbackPillar = ALL_PILLARS[Math.floor(Math.random() * ALL_PILLARS.length)];
    return new Response(
      JSON.stringify(getFallbackSuggestion(fallbackPillar)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});