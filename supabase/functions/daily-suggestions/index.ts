import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { topicId, mode = 'topic' } = body;

    // Fetch full user context using shared module
    const userContext = await fetchUserContext(supabase, user.id);
    const contextPrompt = formatContextForAI(userContext);

    let additionalContext = '';

    // If topic-specific, fetch topic details
    if (mode === 'topic' && topicId) {
      const { data: topic } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topic) {
        const { data: topicInsights } = await supabase
          .from('insights')
          .select('title, content')
          .eq('topic_id', topicId)
          .order('created_at', { ascending: false })
          .limit(5);

        const { data: topicDocs } = await supabase
          .from('documents')
          .select('title, summary')
          .eq('topic_id', topicId)
          .limit(3);

        additionalContext = `
SPECIFIC TOPIC: ${topic.name}
${topic.description ? `Description: ${topic.description}` : ''}
${topicInsights?.length ? `Topic Insights:\n${topicInsights.map(i => `- ${i.title}`).join('\n')}` : ''}
${topicDocs?.length ? `Topic Documents:\n${topicDocs.map(d => `- ${d.title}`).join('\n')}` : ''}
`;
      }
    }

    // For general mode, use broader context
    if (mode === 'general') {
      // Get recent insights not tied to specific topics
      const { data: recentInsights } = await supabase
        .from('insights')
        .select('title, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (recentInsights?.length) {
        additionalContext = `
RECENT INSIGHTS TO BUILD ON:
${recentInsights.map(i => `- ${i.title}: ${i.content.substring(0, 100)}`).join('\n')}
`;
      }
    }

    console.log('Generating context-aware suggestions...');
    console.log('Mode:', mode);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert personal operating system. Generate 3-5 high-leverage actions based on the user's full context.

${contextPrompt}
${additionalContext}

TASK GENERATION RULES:
1. Each action must be 15-45 minutes and completable TODAY
2. Prioritize IDENTITY-ALIGNED actions over generic productivity
3. Build on existing insights, experiments, and documents
4. Create momentum through small wins
5. Balance application (doing) over consumption (learning)
6. Consider pillar rotation - avoid same pillar 3x in a row

PRIORITIZATION:
- High: Directly advances active experiment or identity shift
- Medium: Builds on recent insight or document
- Low: General improvement or exploration

OUTPUT RULES:
- No emojis
- Specific and actionable
- Reference specific insights/documents when relevant
- Each task should feel like progress, not homework`
          },
          {
            role: 'user',
            content: mode === 'topic' && topicId 
              ? `Generate 3-5 specific actions for this topic that advance my identity shift.`
              : `Generate 3-5 context-aware actions based on my full profile. Prioritize what will create the most momentum today.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_contextual_tasks",
              description: "Suggest 3-5 contextual tasks based on user's full profile",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "Clear, action-oriented title (no emojis)"
                        },
                        description: { 
                          type: "string",
                          description: "1-2 sentences on what to do and why"
                        },
                        priority: { 
                          type: "string", 
                          enum: ["low", "medium", "high"] 
                        },
                        pillar: {
                          type: "string",
                          enum: ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Connection", "Learning"]
                        },
                        time_estimate: {
                          type: "string",
                          description: "Estimated time (e.g., '20 min', '30 min')"
                        },
                        builds_on: {
                          type: "string",
                          description: "What existing insight/experiment/document this builds on"
                        }
                      },
                      required: ["title", "description", "priority", "pillar", "time_estimate"],
                      additionalProperties: false
                    }
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why these tasks were chosen (1-2 sentences)"
                  }
                },
                required: ["suggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_contextual_tasks" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('AI response received');

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'No suggestions generated' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ 
      suggestions: result.suggestions,
      reasoning: result.reasoning,
      mode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in daily-suggestions:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
