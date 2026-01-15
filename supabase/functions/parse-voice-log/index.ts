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
    // Enhanced prompting for better extraction
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
            content: `You are an expert voice log parser that extracts EVERY action from natural speech. Users speak stream-of-consciousness about their day, and you must catch EVERYTHING they mention - even brief mentions.

CRITICAL RULES:
1. Extract EVERY action mentioned, even if briefly stated
2. Separate compound actions (e.g., "workout then shower" = 2 separate actions)
3. Duration hints should be preserved (e.g., "30 min workout" not just "workout")
4. Fix obvious transcription errors contextually
5. ALWAYS assign a pillar to EVERY action

PILLARS (assign ONE per action):
• business: work, coding, apps, projects, job applications, meetings, freelance, career, money-making, emails, professional development, applications, interviews
• body: exercise, workout, gym, running, walking, yoga, stretching, sports, physical health, sleep, shower, meal prep, eating healthy, hygiene, getting ready
• content: writing, blogging, social media posts, videos, podcasts, creating content, filming, editing, publishing, tweets, threads
• relationship: calls with family/friends, dates, hanging out, quality time, messages to loved ones, networking, social events, texting, dinner with someone
• mind: reading, meditation, journaling, therapy, learning, courses, reflection, mental health, studying, research, podcasts (educational)
• play: games, hobbies, fun activities, relaxation, entertainment, creative projects for fun, travel, leisure, watching shows

OUTPUT FORMAT (be thorough - list EVERY distinct action):
COMPLETED: [specific action with duration/detail if mentioned] {pillar}
PLANNED: [specific planned action] {pillar}

EXAMPLES:
Input: "I'm gonna hit a 30-minute workout since I haven't worked out in a while, then I'm gonna clean up, take a shower, head down and then I'll get ready for tonight"
Output:
PLANNED: 30-minute workout {body}
PLANNED: Clean up {body}
PLANNED: Take a shower {body}
PLANNED: Get ready for tonight {body}

Input: "Today I did some coding on the app, sent mom a text, went for a quick run"
Output:
COMPLETED: Coding on the app {business}
COMPLETED: Texted mom {relationship}
COMPLETED: Quick run {body}

IMPORTANT: 
- Do NOT skip any mentioned activities
- If something sounds like it could be an action, include it
- Be generous in extraction - it's better to have too many items than too few
- Keep descriptions concise but include key details (time, duration, who, what)`
          },
          {
            role: 'user',
            content: `Parse this voice log THOROUGHLY. Extract EVERY action mentioned:\n\n"${transcript}"`
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
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
      .filter((l: string) => l.toUpperCase().startsWith('COMPLETED:'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        let pillar = pillarMatch ? pillarMatch[1].toLowerCase().trim() : null;
        // Validate pillar is one of our valid options
        if (pillar && !validPillars.includes(pillar)) {
          pillar = null;
        }
        const text = l.replace(/^COMPLETED:\s*/i, '').replace(/\{(\w+)\}/, '').trim();
        return { text, pillar };
      });
    
    const planned = lines
      .filter((l: string) => l.toUpperCase().startsWith('PLANNED:'))
      .map((l: string) => {
        const pillarMatch = l.match(/\{(\w+)\}/);
        let pillar = pillarMatch ? pillarMatch[1].toLowerCase().trim() : null;
        if (pillar && !validPillars.includes(pillar)) {
          pillar = null;
        }
        const text = l.replace(/^PLANNED:\s*/i, '').replace(/\{(\w+)\}/, '').trim();
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
