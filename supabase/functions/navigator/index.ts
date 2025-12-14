import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

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

function getFallbackSuggestion(pillar: string): NavigatorOutput {
  const fallbacks: { [key: string]: NavigatorOutput } = {
    "Skill": {
      priority_for_today: "Skill",
      do_this_now: "Spend 30 minutes building something visible.",
      why_it_matters: "Small progress compounds. Ship something small.",
      time_required: "30 minutes"
    },
    "Content": {
      priority_for_today: "Content",
      do_this_now: "Write and share one authentic insight.",
      why_it_matters: "Building in public attracts opportunity.",
      time_required: "20 minutes"
    },
    "Health": {
      priority_for_today: "Health",
      do_this_now: "Move your body for 20 minutes.",
      why_it_matters: "Physical energy creates mental clarity.",
      time_required: "20 minutes"
    },
    "Presence": {
      priority_for_today: "Presence",
      do_this_now: "5 minutes of nervous system regulation.",
      why_it_matters: "Calm creates clarity.",
      time_required: "10 minutes"
    },
    "Stability": {
      priority_for_today: "Stability",
      do_this_now: "Take one action toward income.",
      why_it_matters: "Stability creates freedom.",
      time_required: "30 minutes"
    },
    "Admin": {
      priority_for_today: "Admin",
      do_this_now: "Clear one thing from your backlog.",
      why_it_matters: "Friction drains energy.",
      time_required: "15 minutes"
    },
    "Connection": {
      priority_for_today: "Connection",
      do_this_now: "Reach out to one person.",
      why_it_matters: "Connection compounds.",
      time_required: "10 minutes"
    },
    "Learning": {
      priority_for_today: "Learning",
      do_this_now: "25 minutes of focused learning.",
      why_it_matters: "Learn to apply, not to know.",
      time_required: "25 minutes"
    }
  };
  return fallbacks[pillar] || fallbacks["Skill"];
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

// Get current date/time context using user's timezone
function getDateTimeContext(timezone?: string): { dayOfWeek: string; date: string; timeOfDay: string; fullContext: string } {
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
  
  const date = `${month} ${day}`;
  
  let timeOfDay: string;
  if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }
  
  return {
    dayOfWeek,
    date,
    timeOfDay,
    fullContext: `${dayOfWeek}, ${date} (${timeOfDay})`
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    
    const dateTime = getDateTimeContext(timezone);
    console.log(`Navigator: ${dateTime.fullContext}, multiple: ${generateMultiple}`);

    const userContextData = await fetchUserContext(supabase, user.id);
    
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("last_pillar_used, content, core_values")
      .eq("user_id", user.id)
      .maybeSingle();
    
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
              match_count: 5,
              similarity_threshold: 0.4
            });
            
            if (relevantInsights && relevantInsights.length > 0) {
              semanticInsights = relevantInsights.map((i: any) => `[${i.source || 'insight'}] ${i.title}: ${i.content.substring(0, 150)}`);
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

    const timeGuidance = {
      morning: 'High energy. Deep work OK. 30-90 min.',
      afternoon: 'Medium energy. Varied tasks. 20-60 min.',
      evening: 'Lower energy. Social, creative, light. 15-45 min.',
      night: 'Wind down. Quick wins only. 10-20 min max.'
    };

    if (generateMultiple) {
      // Generate 3 options
      const systemPrompt = `You are a personal operating system. Generate 3 different action options for the user to choose from.
      
TODAY: ${dateTime.fullContext}
TIME CONTEXT: ${timeGuidance[dateTime.timeOfDay as keyof typeof timeGuidance]}

${contextPrompt}${semanticContext}${userMindContext}${coreValuesContext}

PILLARS TO USE: ${pillar1}, ${pillar2}, ${pillar3}

RULES:
- Each option should be from a DIFFERENT pillar
- Each should feel exciting, not like homework
- Ultra specific - include concrete details
- Time appropriate for ${dateTime.timeOfDay}
- NO emojis
- NO "read" or "review" tasks
- Reference their actual data/projects when possible

Make each option distinct and appealing so they can pick what resonates.`;

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

      if (!response.ok) {
        console.error("AI error:", response.status);
        // Return 3 fallback options
        return new Response(JSON.stringify({
          options: [
            getFallbackSuggestion(pillar1),
            getFallbackSuggestion(pillar2),
            getFallbackSuggestion(pillar3)
          ]
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
      const suggestedPillar = pillar1;
      
      const systemPrompt = `You are a personal operating system. Return ONE concrete action.

TODAY: ${dateTime.fullContext}
TIME CONTEXT: ${timeGuidance[dateTime.timeOfDay as keyof typeof timeGuidance]}

${contextPrompt}${semanticContext}${coreValuesContext}

PILLAR: ${suggestedPillar}

RULES:
- Ultra specific with concrete details
- Fun and exciting, not homework
- Time appropriate for ${dateTime.timeOfDay}
- NO emojis
- NO "read" or "review" tasks
- Reference their actual data when possible`;

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

      if (!response.ok) {
        console.error("AI error:", response.status);
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});