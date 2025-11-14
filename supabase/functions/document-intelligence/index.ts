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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { documentId, content, title } = await req.json();

    console.log(`Processing document ${documentId} for user ${user.id}`);

    // Call Lovable AI to extract intelligence from document
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a document intelligence agent. Extract structured insights from documents.
Return JSON with this exact structure:
{
  "summary": "2-3 sentence summary",
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"],
  "actionItems": [{"title": "action", "priority": "high|medium|low"}],
  "suggestedTopics": ["topic1", "topic2"],
  "relatedExperiments": ["experiment idea 1", "experiment idea 2"]
}`
          },
          {
            role: 'user',
            content: `Document Title: ${title}\n\nContent:\n${content}\n\nExtract insights:`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_document_intelligence",
            description: "Extract structured intelligence from a document",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                keyTakeaways: {
                  type: "array",
                  items: { type: "string" }
                },
                actionItems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] }
                    },
                    required: ["title", "priority"]
                  }
                },
                suggestedTopics: {
                  type: "array",
                  items: { type: "string" }
                },
                relatedExperiments: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["summary", "keyTakeaways", "actionItems", "suggestedTopics", "relatedExperiments"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_document_intelligence" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI Gateway error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData));

    const intelligence = JSON.parse(
      aiData.choices[0].message.tool_calls[0].function.arguments
    );

    // Update document with summary
    const { error: updateError } = await supabase
      .from('documents')
      .update({ summary: intelligence.summary })
      .eq('id', documentId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating document:', updateError);
      throw updateError;
    }

    // Create insights from key takeaways
    const insightsToCreate = intelligence.keyTakeaways.map((takeaway: string) => ({
      user_id: user.id,
      title: 'Key Takeaway',
      content: takeaway,
      source: 'document_ai',
    }));

    if (insightsToCreate.length > 0) {
      const { error: insightsError } = await supabase
        .from('insights')
        .insert(insightsToCreate);

      if (insightsError) {
        console.error('Error creating insights:', insightsError);
      }
    }

    // Get or create suggested topics
    const topicIds = [];
    for (const topicName of intelligence.suggestedTopics) {
      const { data: existingTopic } = await supabase
        .from('topics')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', topicName)
        .single();

      if (existingTopic) {
        topicIds.push(existingTopic.id);
      } else {
        const { data: newTopic, error: topicError } = await supabase
          .from('topics')
          .insert({
            user_id: user.id,
            name: topicName,
            description: `Auto-created from document: ${title}`
          })
          .select('id')
          .single();

        if (!topicError && newTopic) {
          topicIds.push(newTopic.id);
        }
      }
    }

    // Create connections between document and topics
    const connections = topicIds.map(topicId => ({
      user_id: user.id,
      source_type: 'document',
      source_id: documentId,
      target_type: 'topic',
      target_id: topicId,
      note: 'AI-detected relationship'
    }));

    if (connections.length > 0) {
      await supabase.from('connections').insert(connections);
    }

    console.log(`Successfully processed document ${documentId}`);

    return new Response(JSON.stringify({
      success: true,
      intelligence,
      topicsCreated: topicIds.length,
      insightsCreated: insightsToCreate.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in document-intelligence:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
