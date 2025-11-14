import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
// @ts-ignore
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

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

    const { documentId, filePath, title } = await req.json();
    

    // Download and extract text from the document
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download document: ${downloadError?.message}`);
    }

    // Extract text based on file type
    let content = '';
    try {
      const arrayBuffer = await fileData.arrayBuffer();
      
      // Check if it's a PDF
      if (title.toLowerCase().endsWith('.pdf')) {
        console.log('Processing PDF file...');
        const pdfData = await pdfParse(arrayBuffer);
        content = pdfData.text || '';
        console.log(`Extracted ${content.length} characters from PDF`);
      } else {
        // For text-based files
        content = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      }
    } catch (error) {
      console.error('Text extraction failed:', error);
      throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    if (!content || content.trim().length < 50) {
      throw new Error('Document appears to be empty or has insufficient content');
    }
    
    // Limit content size
    content = content.substring(0, 50000);

    console.log(`Processing document ${documentId} for user ${user.id}`);

    // Fetch user's identity seed and topics for context
    const { data: identitySeed } = await supabase
      .from('identity_seeds')
      .select('content')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: topics } = await supabase
      .from('topics')
      .select('name, description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build context for AI
    let contextPrompt = '';
    if (identitySeed?.content) {
      contextPrompt += `\n\nUSER'S IDENTITY & GOALS:\n${identitySeed.content}\n`;
    }
    if (topics && topics.length > 0) {
      const topicsList = topics.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n');
      contextPrompt += `\n\nUSER'S CURRENT LEARNING PATHS:\n${topicsList}\n`;
    }

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
            content: `You are a strategic document intelligence agent that extracts insights aligned with the user's identity and goals.

CRITICAL INSTRUCTIONS:
- Extract 1-2 strategic insights that directly connect to the user's identity, goals, or learning paths
- Each insight must have a descriptive title (5-10 words) and actionable content (2-4 sentences)
- Focus on insights that help the user make progress on their daily, weekly, or monthly objectives
- Insights should be: actionable, specific to their goals, and provide strategic value
- If document is corrupted or has no strategic value for this user, return empty arrays
- Connect document content to their existing learning paths when relevant
- Think strategically: what would help this person TODAY, THIS WEEK, THIS MONTH?${contextPrompt}`
          },
          {
            role: 'user',
            content: `Document Title: ${title}\n\nContent:\n${content}\n\nBased on my identity and learning paths, extract 1-2 strategic insights that will help me make progress. Focus on actionable knowledge I can use daily, weekly, or monthly.`
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
                  description: "1-2 strategic insights that align with user's identity and goals. Should help with daily, weekly, or monthly progress.",
                  items: {
                    type: "object",
                    properties: {
                      title: { 
                        type: "string",
                        description: "Strategic title showing how this helps with user's goals (5-10 words)"
                      },
                      content: { 
                        type: "string",
                        description: "Actionable explanation of how to apply this insight to daily/weekly/monthly progress (2-4 sentences)"
                      },
                      timeframe: {
                        type: "string",
                        enum: ["daily", "weekly", "monthly"],
                        description: "When this insight is most applicable"
                      }
                    },
                    required: ["title", "content", "timeframe"]
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
        .map((insight: { title: string; content: string; timeframe?: string }) => ({
          user_id: user.id,
          title: `${insight.timeframe ? `[${insight.timeframe.toUpperCase()}] ` : ''}${insight.title}`,
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
