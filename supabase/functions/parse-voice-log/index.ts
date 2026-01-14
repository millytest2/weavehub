import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { transcript } = await req.json();

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use AI to parse the messy voice transcript into structured actions
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `You are a voice log parser. The user speaks stream-of-consciousness about their day - what they did and plan to do.

Your job: Extract COMPLETED actions and PLANNED actions as a clean, bulleted list.

Rules:
1. Fix obvious transcription errors (e.g., "weed" should be "Weave" if context suggests app work)
2. Keep each item concise (5-10 words max)
3. Group related items
4. For completed items, add ✓ prefix
5. For planned items, add → prefix
6. Detect pillar categories when obvious: business, body, content, relationship, mind, play

Output format (just the list, no intro text):
✓ [action] {pillar if clear}
→ [planned action] {pillar if clear}

Example input: "So far today I worked on the app for an hour, gonna apply to some jobs, need to call about car repair"
Example output:
✓ Worked on app for 1 hour {business}
→ Apply to jobs {business}
→ Call about car repair`
          },
          {
            role: 'user',
            content: transcript
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI parsing error:', response.status, errorText);
      throw new Error(`Failed to parse transcript: ${errorText}`);
    }

    const result = await response.json();
    const parsed = result.choices?.[0]?.message?.content || transcript;

    // Also extract just the completed items as separate array for quick logging
    const lines = parsed.split('\n').filter((l: string) => l.trim());
    const completed = lines
      .filter((l: string) => l.startsWith('✓'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        const pillar = pillarMatch ? pillarMatch[1] : null;
        const text = l.replace('✓', '').replace(/\{(\w+)\}/, '').trim();
        return { text, pillar };
      });
    
    const planned = lines
      .filter((l: string) => l.startsWith('→'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        const pillar = pillarMatch ? pillarMatch[1] : null;
        const text = l.replace('→', '').replace(/\{(\w+)\}/, '').trim();
        return { text, pillar };
      });

    return new Response(
      JSON.stringify({ 
        parsed,
        completed,
        planned,
        original: transcript 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Parse voice log error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
