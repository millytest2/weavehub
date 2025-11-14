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
        model: 'openai/gpt-5',
        messages: [
          {
            role: 'system',
            content: `You are a document intelligence agent that extracts key insights from documents.

CRITICAL INSTRUCTIONS:
- Only extract 1-2 truly meaningful insights that are NOT obvious from the title
- Each insight must have a unique, descriptive title (5-10 words) and detailed content
- Insights should be actionable, surprising, or provide deep understanding
- If the document is corrupted, unreadable, or contains no meaningful insights, return empty arrays
- DO NOT create generic takeaways like "The document discusses..." - be specific and insightful
- Focus on non-obvious patterns, strategies, frameworks, or actionable knowledge`
          },
          {
            role: 'user',
            content: `Document Title: ${title}\n\nContent:\n${content}\n\nExtract key insights from this document. Remember: only 1-2 truly meaningful insights with unique titles and detailed descriptions. If there are no real insights, return empty arrays.`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_document_intelligence",
            description: "Extract meaningful insights from a document",
            parameters: {
              type: "object",
              properties: {
                summary: { 
                  type: "string",
                  description: "A concise 2-3 sentence summary of the document's main content"
                },
                insights: {
                  type: "array",
                  description: "1-2 key insights with unique titles and detailed content. Leave empty if no meaningful insights found.",
                  items: {
                    type: "object",
                    properties: {
                      title: { 
                        type: "string",
                        description: "A unique, descriptive title for this insight (5-10 words)"
                      },
                      content: { 
                        type: "string",
                        description: "Detailed explanation of the insight (2-4 sentences)"
                      }
                    },
                    required: ["title", "content"]
                  }
                }
              },
              required: ["summary", "insights"]
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

    // Create insights only if there are meaningful ones
    let insightsCreated = 0;
    if (intelligence.insights && intelligence.insights.length > 0) {
      const insightsToCreate = intelligence.insights
        .slice(0, 2) // Max 2 insights
        .map((insight: { title: string; content: string }) => ({
          user_id: user.id,
          title: insight.title,
          content: insight.content,
          source: 'document_ai',
        }));

      if (insightsToCreate.length > 0) {
        const { error: insightsError } = await supabase
          .from('insights')
          .insert(insightsToCreate);

        if (insightsError) {
          console.error('Error creating insights:', insightsError);
        } else {
          insightsCreated = insightsToCreate.length;
        }
      }
    }

    console.log(`Successfully processed document ${documentId}`);

    return new Response(JSON.stringify({
      success: true,
      summary: intelligence.summary,
      insightsCreated
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
