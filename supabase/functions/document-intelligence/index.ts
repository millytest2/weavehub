import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { fetchDocumentContext, formatDocumentContext } from "../shared/context.ts";

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
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('Missing authorization header');
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

    console.log('Validating user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('User validation error:', userError);
      return new Response(JSON.stringify({ 
        error: 'Authentication failed', 
        details: userError.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!user) {
      console.error('No user found after validation');
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`User validated: ${user.id}`);

    const { documentId, content, title } = await req.json();
    
    console.log(`Processing document ${documentId} for user ${user.id}`);
    console.log(`Title: ${title}`);
    console.log(`Content length: ${content?.length}`);

    if (!documentId || !content) {
      console.error('Missing required fields:', { documentId: !!documentId, content: !!content });
      return new Response(
        JSON.stringify({ error: 'Missing documentId or content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (content.trim().length < 50) {
      console.error('Content too short:', content.length);
      throw new Error('Document appears to be empty or has insufficient content');
    }
    
    // Limit content size for processing
    const extractedText = content.substring(0, 60000);
    console.log(`Using ${extractedText.length} characters for AI analysis`);

    // Fetch rich user context for intelligent processing
    const userContext = await fetchDocumentContext(supabase, user.id);
    const contextPrompt = formatDocumentContext(userContext);
    
    // Fetch ALL user topics for semantic matching
    const { data: allTopics } = await supabase
      .from('topics')
      .select('name, description')
      .eq('user_id', user.id);
    
    const topicList = allTopics && allTopics.length > 0
      ? allTopics.map(t => `- ${t.name}${t.description ? `: ${t.description}` : ''}`).join('\n')
      : 'No topics defined yet';

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling AI for document intelligence...');

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
            content: `You are a strategic document intelligence agent. Your job is to extract insights that directly help this specific user make progress.

${contextPrompt}

USER'S EXISTING TOPICS (use these for semantic matching - pick the MOST relevant one or 'none'):
${topicList}

EXTRACTION RULES:
1. Connect document content to user's identity, experiments, or weekly focus
2. Extract 1-3 insights that are ACTIONABLE within the next 7 days
3. Each insight should answer: "What can I DO with this information?"
4. Prefer insights that compound with user's existing knowledge
5. For related_topic: Match semantically to user's topics above. A document about "masculinity" might relate to a "Confidence" topic. Return the EXACT topic name from the list, or 'none' if no match.
6. If document has no strategic value for THIS user, return minimal/empty insights
7. Timeframes: daily (can apply today), weekly (this week), monthly (long-term value)

INSIGHT QUALITY:
- Title: Action-oriented, 5-10 words, shows the "so what"
- Content: 2-3 sentences explaining HOW to apply this
- Never generic advice - always specific to document + user context`
          },
          {
            role: 'user',
            content: `Document: "${title}"\n\nContent:\n${extractedText}\n\nExtract strategic insights that help me make progress on my identity shift and current focus.`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_document_intelligence",
            description: "Extract strategic insights from a document aligned with user's goals",
            parameters: {
              type: "object",
              properties: {
                summary: { 
                  type: "string",
                  description: "2-3 sentence summary of document's core value proposition"
                },
                relevance_score: {
                  type: "number",
                  description: "How relevant is this document to user's current focus (1-10)"
                },
                related_topic: {
                  type: "string",
                  description: "Which of user's topics this relates to most (or 'none')"
                },
                insights: {
                  type: "array",
                  description: "1-3 actionable insights",
                  items: {
                    type: "object",
                    properties: {
                      title: { 
                        type: "string",
                        description: "Action-oriented title (5-10 words)"
                      },
                      content: { 
                        type: "string",
                        description: "How to apply this insight (2-3 sentences)"
                      },
                      timeframe: {
                        type: "string",
                        enum: ["daily", "weekly", "monthly"],
                        description: "When this insight is most applicable"
                      },
                      connects_to: {
                        type: "string",
                        description: "What existing insight/experiment/topic this builds on"
                      }
                    },
                    required: ["title", "content", "timeframe"]
                  }
                },
                suggested_experiment: {
                  type: "object",
                  description: "Optional: suggest a 3-7 day experiment based on this document",
                  properties: {
                    title: { type: "string" },
                    hypothesis: { type: "string" },
                    duration: { type: "string" }
                  }
                }
              },
              required: ["summary", "relevance_score", "insights"]
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
    console.log('AI Response received');

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const intelligence = JSON.parse(toolCall.function.arguments);
    console.log('Intelligence extracted:', JSON.stringify(intelligence, null, 2));

    // Update document with summary and relevance
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        summary: intelligence.summary 
      })
      .eq('id', documentId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating document:', updateError);
    }

    // Link document to topic if relevant - use exact match since AI returns exact name
    if (intelligence.related_topic && intelligence.related_topic !== 'none' && intelligence.relevance_score >= 5) {
      const { data: matchingTopic } = await supabase
        .from('topics')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', intelligence.related_topic)
        .maybeSingle();
      
      if (matchingTopic) {
        await supabase
          .from('documents')
          .update({ topic_id: matchingTopic.id })
          .eq('id', documentId)
          .eq('user_id', user.id);
        console.log(`Linked document to topic: ${matchingTopic.id}`);
      } else {
        // Fallback to ilike if exact match fails
        const { data: fuzzyTopic } = await supabase
          .from('topics')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', `%${intelligence.related_topic}%`)
          .maybeSingle();
        
        if (fuzzyTopic) {
          await supabase
            .from('documents')
            .update({ topic_id: fuzzyTopic.id })
            .eq('id', documentId)
            .eq('user_id', user.id);
          console.log(`Linked document to topic (fuzzy): ${fuzzyTopic.id}`);
        }
      }
    }

    // Create insights if there are meaningful ones
    let insightsCreated = 0;
    let matchedTopicId: string | null = null;
    
    // Get topic ID for insights
    if (intelligence.related_topic && intelligence.related_topic !== 'none') {
      const { data: matchingTopic } = await supabase
        .from('topics')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', intelligence.related_topic)
        .maybeSingle();
      
      if (matchingTopic) {
        matchedTopicId = matchingTopic.id;
      } else {
        // Fallback to ilike
        const { data: fuzzyTopic } = await supabase
          .from('topics')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', `%${intelligence.related_topic}%`)
          .maybeSingle();
        
        if (fuzzyTopic) {
          matchedTopicId = fuzzyTopic.id;
        }
      }
    }
    
    if (intelligence.insights && intelligence.insights.length > 0) {
      const insightsToCreate = intelligence.insights
        .slice(0, 3)
        .map((insight: any) => ({
          user_id: user.id,
          title: `[${insight.timeframe?.toUpperCase() || 'INSIGHT'}] ${insight.title}`,
          content: insight.content + (insight.connects_to ? `\n\nBuilds on: ${insight.connects_to}` : ''),
          source: `document:${title.substring(0, 50)}`,
          topic_id: matchedTopicId,
        }));

      if (insightsToCreate.length > 0) {
        const { error: insightsError } = await supabase
          .from('insights')
          .insert(insightsToCreate);

        if (insightsError) {
          console.error('Error creating insights:', insightsError);
        } else {
          insightsCreated = insightsToCreate.length;
          console.log(`Created ${insightsCreated} insights with topic: ${matchedTopicId}`);
        }
      }
    }

    // Create suggested experiment if provided and high relevance
    let experimentCreated = false;
    if (intelligence.suggested_experiment && intelligence.relevance_score >= 7) {
      const { error: expError } = await supabase
        .from('experiments')
        .insert({
          user_id: user.id,
          title: intelligence.suggested_experiment.title,
          hypothesis: intelligence.suggested_experiment.hypothesis,
          duration: intelligence.suggested_experiment.duration || '7 days',
          status: 'planning',
          description: `Generated from document: ${title}`,
        });
      
      if (!expError) {
        experimentCreated = true;
        console.log('Created suggested experiment');
      }
    }

    console.log(`Successfully processed document ${documentId}`);

    return new Response(JSON.stringify({
      success: true,
      summary: intelligence.summary,
      relevance_score: intelligence.relevance_score,
      insightsCreated,
      experimentCreated,
      related_topic: intelligence.related_topic,
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
