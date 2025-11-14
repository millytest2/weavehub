import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

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
    const supabaseKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
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

    const { topicId } = await req.json();

    // Fetch topic details
    const { data: topic } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch recent insights for this topic
    const { data: insights } = await supabase
      .from('insights')
      .select('title, content, created_at')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch documents for this topic
    const { data: documents } = await supabase
      .from('documents')
      .select('title, summary')
      .eq('topic_id', topicId)
      .limit(5);

    // Fetch learning paths for this topic
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('title, description, status')
      .eq('topic_id', topicId);

    // Fetch experiments for this topic
    const { data: experiments } = await supabase
      .from('experiments')
      .select('title, status, results')
      .eq('topic_id', topicId);

    // Build context for AI
    const context = `
Topic: ${topic.name}
Description: ${topic.description || 'None'}

Recent Insights (${insights?.length || 0}):
${insights?.map(i => `- ${i.title}: ${i.content.substring(0, 200)}`).join('\n') || 'None'}

Documents (${documents?.length || 0}):
${documents?.map(d => `- ${d.title}: ${d.summary?.substring(0, 200) || 'No summary'}`).join('\n') || 'None'}

Learning Paths (${paths?.length || 0}):
${paths?.map(p => `- ${p.title} (${p.status}): ${p.description?.substring(0, 100) || ''}`).join('\n') || 'None'}

Experiments (${experiments?.length || 0}):
${experiments?.map(e => `- ${e.title} (${e.status})`).join('\n') || 'None'}
`;

    console.log('Calling Lovable AI with context:', context);

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
            content: `You are a learning assistant. Based on the user's learning topic, insights, documents, and progress, suggest 3-5 concrete daily actions they should take today to advance their learning. Be specific and actionable. Format as a JSON array of objects with "title", "description", and "priority" (low/medium/high) fields.`
          },
          {
            role: 'user',
            content: context
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_daily_tasks",
              description: "Suggest 3-5 daily learning tasks based on the user's topic and progress",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high"] }
                      },
                      required: ["title", "description", "priority"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["suggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_daily_tasks" } }
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
    console.log('Lovable AI response:', JSON.stringify(data, null, 2));

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'No suggestions generated' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestions = JSON.parse(toolCall.function.arguments).suggestions;

    return new Response(JSON.stringify({ suggestions, topic: topic.name }), {
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