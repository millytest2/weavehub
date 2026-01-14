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

Your job: Extract COMPLETED actions and PLANNED actions as a clean, bulleted list with AUTOMATIC pillar categorization.

PILLARS (you MUST assign one to EVERY action):
- business: work, coding, apps, projects, job applications, meetings, freelance, career, money-making, emails, professional development
- body: exercise, workout, gym, running, walking, yoga, stretching, sports, physical health, sleep, nutrition, meal prep
- content: writing, blogging, social media posts, videos, podcasts, creating content, filming, editing, publishing
- relationship: calls with family/friends, dates, hanging out, quality time, messages to loved ones, networking, social events
- mind: reading, meditation, journaling, therapy, learning, courses, reflection, mental health, studying
- play: games, hobbies, fun activities, relaxation, entertainment, creative projects for fun, travel, leisure

Rules:
1. Fix obvious transcription errors (e.g., "weed" should be "Weave" if context suggests app work)
2. Keep each item concise (5-10 words max)
3. For completed items, add ✓ prefix
4. For planned items, add → prefix
5. ALWAYS include a pillar in {braces} for EVERY item - make your best guess based on context

Output format (just the list, no intro text):
✓ [action] {pillar}
→ [planned action] {pillar}

Example input: "So far today I worked on the app for an hour, went to the gym, gonna apply to some jobs, need to call mom about car repair"
Example output:
✓ Worked on app for 1 hour {business}
✓ Went to the gym {body}
→ Apply to jobs {business}
→ Call mom about car repair {relationship}`
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

    // Valid pillar names (lowercase)
    const validPillars = ['business', 'body', 'content', 'relationship', 'mind', 'play'];

    // Also extract just the completed items as separate array for quick logging
    const lines = parsed.split('\n').filter((l: string) => l.trim());
    const completed = lines
      .filter((l: string) => l.startsWith('✓'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        let pillar = pillarMatch ? pillarMatch[1].toLowerCase().trim() : null;
        // Validate pillar is one of our valid options
        if (pillar && !validPillars.includes(pillar)) {
          pillar = null;
        }
        const text = l.replace('✓', '').replace(/\{(\w+)\}/, '').trim();
        return { text, pillar };
      });
    
    const planned = lines
      .filter((l: string) => l.startsWith('→'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        let pillar = pillarMatch ? pillarMatch[1].toLowerCase().trim() : null;
        if (pillar && !validPillars.includes(pillar)) {
          pillar = null;
        }
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
