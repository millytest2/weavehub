import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatWeightedContextForAgent } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SynthesizerOutput {
  headline: string;
  summary: string;
  suggested_next_step: string;
}

function validateSynthesizerOutput(data: any): SynthesizerOutput {
  if (!data.headline || typeof data.headline !== 'string' || data.headline.length > 80) throw new Error('Invalid headline');
  if (!data.summary || typeof data.summary !== 'string') throw new Error('Invalid summary');
  if (!data.suggested_next_step || typeof data.suggested_next_step !== 'string') throw new Error('Invalid suggested_next_step');
  return data as SynthesizerOutput;
}

function getFallbackSynthesis(): SynthesizerOutput {
  return {
    headline: "Keep building momentum through small actions",
    summary: "Focus on identity-aligned action over planning. The key is consistent proof of who you are becoming.",
    suggested_next_step: "Spend 20 minutes on your most important active experiment."
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Check if this is a post generation request
    const body = await req.json().catch(() => ({}));
    const { mode, observation, experiment } = body;

    // POST GENERATOR MODE
    if (mode === "post_generator" && observation) {
      const templateMap: Record<string, string> = {
        quote: `Curated Synthesis Template:
- Lead with the quote or insight
- Add your personal data/results that validate or challenge it
- End with a takeaway or question for the reader
- Keep it punchy, 280 chars ideal, can go up to thread if needed`,
        
        decision: `Building Decision Template:
- Start with the decision you made
- Share the context briefly
- Show the result or what you learned
- End with what you'd tell someone facing the same choice`,
        
        presence: `Presence Template:
- Set the scene (who, where, context)
- Share the unexpected insight or moment
- Connect it to a bigger principle
- Keep it human and relatable`,
        
        insight: `Insight Template:
- Lead with the insight/realization
- Show how you discovered it
- Add specific data or example if you have it
- End with the "so what" for the reader`
      };

      const systemPrompt = `You are a content strategist helping create authentic, data-backed social media posts.

Your style:
- No fluff, no filler words
- Real data beats generic advice
- Personal experience > theory
- Contrarian when honest
- Never use: "game-changer", "unlock", "leverage", "mindset shift"
- Write like you talk to a smart friend

${templateMap[observation.type] || templateMap.insight}`;

      const userPrompt = `Create a post from this observation:

Type: ${observation.type}
Content: ${observation.content}
${observation.source ? `Source: ${observation.source}` : ''}
${observation.your_data ? `My data/results: ${observation.your_data}` : ''}

Write a compelling post that I can use on Twitter/LinkedIn. Make it authentic and backed by the data I provided. If I didn't provide data, focus on the insight itself.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate post");
      }

      const data = await response.json();
      const post = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ post }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // WEEKLY INTEGRATION MODE
    if (mode === "weekly_integration" && body.weekly) {
      const w = body.weekly;
      const scores = {
        business: w.business || 5,
        body: w.body || 5,
        content: w.content || 5,
        relationship: w.relationship || 5,
        mind: w.mind || 5,
        play: w.play || 5,
      };
      const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 6;
      
      // Find lowest and highest domains
      const sortedDomains = Object.entries(scores).sort((a, b) => a[1] - b[1]);
      const lowestDomain = sortedDomains[0];
      const highestDomain = sortedDomains[sortedDomains.length - 1];
      
      const systemPrompt = `You are helping create weekly integration posts for social media. The user tracks 6 life domains and posts their weekly scores with pattern insights.

Style:
- Data-first, show the actual numbers
- Honest about what's working and what needs attention
- Look for cross-domain patterns (e.g., skipping workouts affecting energy, which affects productivity)
- End with what they're testing next week
- No fluff, keep it real
- Format for Twitter (can be a thread if needed)

The user's brand is about the Integration Thesis - showing that all life domains are connected and affect each other.`;

      const userPrompt = `Create a weekly integration post from this data:

Week ${w.week_number}

SCORES:
Business: ${scores.business}/10 ${w.business_notes ? `(${w.business_notes})` : ''}
Body: ${scores.body}/10 ${w.body_notes ? `(${w.body_notes})` : ''}
Content: ${scores.content}/10 ${w.content_notes ? `(${w.content_notes})` : ''}
Relationship: ${scores.relationship}/10 ${w.relationship_notes ? `(${w.relationship_notes})` : ''}
Mind: ${scores.mind}/10 ${w.mind_notes ? `(${w.mind_notes})` : ''}
Play: ${scores.play}/10 ${w.play_notes ? `(${w.play_notes})` : ''}

Average: ${avgScore.toFixed(1)}/10
Strongest domain: ${highestDomain[0]} (${highestDomain[1]})
Needs attention: ${lowestDomain[0]} (${lowestDomain[1]})

Create:
1. A Twitter-ready post with all scores
2. A pattern insight connecting 2+ domains
3. What to test next week based on the lowest score

Also extract the main pattern detected as a separate short phrase.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate weekly export");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Try to extract a pattern (first sentence or line mentioning pattern)
      const patternMatch = content.match(/pattern[:\s]+([^\n.]+)/i) || 
                          content.match(/connection[:\s]+([^\n.]+)/i) ||
                          content.match(/insight[:\s]+([^\n.]+)/i);
      const pattern = patternMatch ? patternMatch[1].trim() : `${lowestDomain[0]} at ${lowestDomain[1]} affecting overall balance`;

      return new Response(JSON.stringify({ post: content, pattern }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // EXPERIMENT SYNTHESIS MODE
    if (mode === "experiment_synthesis" && experiment) {
      const systemPrompt = `You are helping synthesize experiment results into shareable content.

Style:
- Data-first
- Honest about what worked and didn't
- No hype, just facts
- Include specific numbers when available`;

      const userPrompt = `Create a synthesis post for this completed experiment:

Title: ${experiment.title}
Duration: ${experiment.duration_days} days
Hypothesis: ${experiment.hypothesis || 'Not specified'}
Results: ${JSON.stringify(experiment.results || {})}

Write a thread-style post (can be multiple tweets) summarizing what I tested, what I found, and what I'm testing next.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate synthesis");
      }

      const data = await response.json();
      const post = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ post }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // PATTERN ANALYZER MODE - finds cross-domain connections
    if (mode === "pattern_analyzer" && body.content) {
      const { insights, observations, experiments } = body.content;
      
      const systemPrompt = `You are a polymath pattern finder. Your job is to find NON-OBVIOUS connections between different domains like physics, business, psychology, relationships, and life.

You're looking for insights that prove the "Integration Thesis" - that knowledge from one domain can transform another.

Examples of great connections:
- "How thermodynamics improved my pricing strategy" (physics → business)
- "System thinking from physics → relationship communication"
- "What entropy taught me about startup chaos"
- "Newton's laws applied to habit formation"
- "Network effects in physics and viral growth"

You MUST output valid JSON with this structure:
{
  "connections": [
    {
      "title": "Short punchy title like the examples above",
      "insight": "2-3 sentences explaining the connection",
      "domains": ["physics", "business"],
      "sources": ["Source insight or observation titles that led to this"]
    }
  ]
}

Find 3-5 connections. Be creative but grounded in the actual content provided.`;

      const contentSummary = `
INSIGHTS (saved learnings):
${insights.map((i: any) => `- ${i.title}: ${i.content?.slice(0, 200)}`).join('\n')}

OBSERVATIONS (captured moments):
${observations.map((o: any) => `- [${o.type}] ${o.content?.slice(0, 200)}`).join('\n')}

EXPERIMENTS (things being tested):
${experiments.map((e: any) => `- ${e.title}: ${e.hypothesis || 'No hypothesis'}`).join('\n')}
`;

      const userPrompt = `Analyze this content and find cross-domain connections:

${contentSummary}

Return ONLY valid JSON with 3-5 connections.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to analyze patterns");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      
      // Parse the JSON response
      let parsed;
      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { connections: [] };
      } catch (e) {
        console.error("Failed to parse connections JSON:", e);
        parsed = { connections: [] };
      }

      return new Response(JSON.stringify(parsed), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // MULTI-PLATFORM POST MODE - generates content for TikTok, YouTube, Substack, Twitter
    if (mode === "multi_platform_post" && body.connection) {
      const conn = body.connection;
      
      // Fetch user's brand voice template
      const { data: voiceTemplate } = await supabase
        .from('platform_voice_templates')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      // Build brand context from template
      let brandContext = "";
      if (voiceTemplate) {
        const pillars = (voiceTemplate.content_pillars as any[]) || [];
        const platformVoices = voiceTemplate.platform_voices as any || {};
        const values = voiceTemplate.values || [];
        const avoidList = voiceTemplate.avoid_list || [];
        
        brandContext = `
BRAND IDENTITY:
${voiceTemplate.brand_identity || 'Not specified'}

VISION:
${voiceTemplate.vision_summary || 'Not specified'}

PERSONALITY BLEND:
${voiceTemplate.personality_blend || 'Not specified'}

CONTENT PILLARS (all content should fit one of these):
${pillars.map((p: any, i: number) => `${i + 1}. ${p.name}: ${p.description}`).join('\n')}

VALUES TO EMBODY:
${values.join(', ') || 'Authentic, data-driven'}

NEVER USE THESE WORDS/PHRASES:
${avoidList.join(', ') || 'game-changer, unlock, leverage, mindset shift'}

PLATFORM-SPECIFIC VOICE:
- TikTok: Tone: ${platformVoices.tiktok?.tone || 'Conversational, energetic'} | Style: ${platformVoices.tiktok?.style || 'Hook-driven, visual storytelling'}
- YouTube: Tone: ${platformVoices.youtube?.tone || 'Educational, authoritative'} | Style: ${platformVoices.youtube?.style || 'Long-form, value-packed'}
- Substack: Tone: ${platformVoices.substack?.tone || 'Personal, intellectual'} | Style: ${platformVoices.substack?.style || 'Essay-style, story-driven'}
- X/Twitter: Tone: ${platformVoices.twitter?.tone || 'Punchy, contrarian'} | Style: ${platformVoices.twitter?.style || 'Data-backed, thread-ready'}
`;
      }
      
      const systemPrompt = `You are a polymath content strategist adapting cross-domain insights for different platforms.
${brandContext ? brandContext : `
Default brand voice:
- No fluff, no filler words
- Real data beats generic advice
- Personal experience > theory
- Contrarian when honest
- Never use: "game-changer", "unlock", "leverage", "mindset shift"
- Write like explaining to a smart friend
`}

You understand each platform's unique style:
- TikTok: 15-60 second hook-driven, visual storytelling, conversational, pattern interrupts
- YouTube: Educational long-form, thumbnail-worthy title, value-packed, SEO-friendly
- Substack: Newsletter essay style, personal + intellectual depth, story-driven
- X/Twitter: Punchy threads or standalone insights, contrarian takes, data-backed

CRITICAL: Apply the brand identity, values, and platform-specific voice above to ALL content you generate.

You MUST return valid JSON with this exact structure:
{
  "platforms": {
    "tiktok": {
      "hook": "Opening line that stops the scroll (5-10 words)",
      "format_notes": "Visual/format suggestions for the video",
      "script_outline": "Full script outline with key talking points"
    },
    "youtube": {
      "title": "SEO-optimized title under 60 chars",
      "description": "First 2 lines of description (most important for SEO)",
      "key_points": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"]
    },
    "substack": {
      "headline": "Newsletter headline that drives opens",
      "intro": "First paragraph hook (2-3 sentences)",
      "sections_outline": ["Section 1 topic", "Section 2 topic", "Section 3 topic"]
    },
    "twitter": {
      "single_tweet": "Standalone tweet under 280 chars",
      "thread_outline": ["Tweet 1 (hook)", "Tweet 2", "Tweet 3", "Tweet 4", "Tweet 5 (CTA)"]
    }
  }
}`;

      const userPrompt = `Create multi-platform content from this cross-domain connection:

CONNECTION TITLE: ${conn.title}
DOMAINS: ${conn.domains?.join(' → ')}
INSIGHT: ${conn.insight}
SOURCES: ${conn.sources?.join(', ') || 'Various observations'}

Generate platform-specific content that shows how ${conn.domains?.[0] || 'one domain'} insights apply to ${conn.domains?.[1] || 'another domain'}.
${brandContext ? 'IMPORTANT: Match the brand voice and identity configured above.' : ''}

Return ONLY valid JSON.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 2500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate multi-platform content");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      
      // Parse the JSON response
      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { platforms: null };
      } catch (e) {
        console.error("Failed to parse multi-platform JSON:", e);
        parsed = { platforms: null };
      }

      return new Response(JSON.stringify(parsed), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // POLYMATH INSIGHT MODE - generates insights/lessons from a connection
    if (mode === "polymath_post" && body.connection) {
      const conn = body.connection;
      
      const systemPrompt = `You are a polymath thinker who weaves together insights from different domains to create new understanding. You help people see patterns that specialists miss.

Your style:
- Lead with the surprising connection
- Explain the underlying principle that links the domains
- Provide a concrete lesson or mental model
- Give 1-2 actionable applications
- Write clearly and thoughtfully, not for social media
- No fluff, no buzzwords
- Never use: "game-changer", "unlock", "leverage", "mindset shift"

Format your response as:
**The Connection**: [One sentence capturing the core insight]

**Why This Matters**: [2-3 sentences explaining the underlying principle]

**The Lesson**: [A clear takeaway or mental model to internalize]

**How to Apply It**: [1-2 concrete ways to use this insight]

The goal: Help the reader truly understand something new by weaving together knowledge across domains.`;

      const userPrompt = `Synthesize a deep insight from this cross-domain connection:

Title: ${conn.title}
Domains: ${conn.domains?.join(' → ')}
Insight: ${conn.insight}
Sources: ${conn.sources?.join(', ') || 'Various observations'}

Create a thoughtful synthesis that weaves together ${conn.domains?.[0] || 'one domain'} and ${conn.domains?.[1] || 'another domain'} into a new understanding.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate insight synthesis");
      }

      const data = await response.json();
      const post = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ post }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // EXTRACT GOALS MODE - parses identity to extract structured goals
    if (mode === "extract_goals" && body.identity) {
      const { year_note, core_values, content, weekly_focus } = body.identity;
      
      const systemPrompt = `You are helping extract structured goals from a user's identity and direction.

The 6 domains are:
- business (revenue, career, products, income)
- body (weight, fitness, health)
- content (followers, audience, content creation)
- relationship (family, friends, partner time)
- mind (learning, mental health, mindfulness)
- play (hobbies, games, fun activities)

You MUST output valid JSON with this structure:
{
  "goals": [
    {
      "domain": "business",
      "goal_name": "Short name like 'UPath Revenue' or 'Weight'",
      "target_value": 100000,
      "unit": "$" or "lbs" or "followers" etc
    }
  ]
}

Rules:
- Only extract goals that have clear numeric targets (explicit or implied)
- Don't make up goals that aren't mentioned
- If a goal is mentioned without a specific target, make a reasonable estimate
- Maximum 6 goals (one per domain max)
- Be specific with goal names - use their actual project names if mentioned`;

      const userPrompt = `Extract structured goals from this identity:

2026 DIRECTION:
${year_note || 'Not specified'}

CORE VALUES:
${core_values || 'Not specified'}

CURRENT FOCUS:
${weekly_focus || 'Not specified'}

IDENTITY:
${content || 'Not specified'}

Return ONLY valid JSON with goals array.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to extract goals");
      }

      const data = await response.json();
      const responseContent = data.choices?.[0]?.message?.content || '{}';
      
      let parsed;
      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { goals: [] };
      } catch (e) {
        console.error("Failed to parse goals JSON:", e);
        parsed = { goals: [] };
      }

      return new Response(JSON.stringify(parsed), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // WEEKLY PATTERN MODE - generates pattern insight from weekly metrics
    if (mode === "weekly_pattern" && body.metrics) {
      const metrics = body.metrics;
      const weekNumber = body.week_number;
      
      const systemPrompt = `You are finding patterns in weekly progress data across life domains.

Your job:
- Look for connections between domains (e.g., gym consistency affecting work energy)
- Identify what's driving progress or stalling it
- Suggest one focus for next week

Be concise and specific. No fluff.`;

      const metricsStr = metrics.map((m: any) => 
        `${m.domain}: ${m.goal_name} - ${m.current}/${m.target} ${m.unit}${m.notes ? ` (${m.notes})` : ''}`
      ).join('\n');

      const userPrompt = `Week ${weekNumber} metrics:

${metricsStr}

Return JSON with:
{
  "pattern": "One sentence pattern/insight across domains",
  "target": "One focus for next week"
}`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        throw new Error("Failed to generate pattern");
      }

      const data = await response.json();
      const responseContent = data.choices?.[0]?.message?.content || '{}';
      
      let parsed;
      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { pattern: "", target: "" };
      } catch (e) {
        console.error("Failed to parse pattern JSON:", e);
        parsed = { pattern: "", target: "" };
      }

      return new Response(JSON.stringify(parsed), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // MONTHLY REVERSE ENGINEER MODE - reverse engineers from 2026 Misogi
    if (body.type === "monthly_reverse_engineer" && body.context) {
      const ctx = body.context;
      
      const systemPrompt = `You are a strategic coach helping someone reverse-engineer their annual vision into monthly and weekly focus. You think in terms of "what needs to be true this month for the year to work."

Your approach:
- Start from the end goal (2026 Direction/Misogi) and work backwards
- Consider what month they're in and how much runway is left
- Look at their current weekly activity patterns to spot momentum or gaps
- Be specific and actionable, not generic motivational
- Acknowledge the journey - some weeks are harder than others
- Emphasize adaptability - the plan should flex, not break

Style:
- Direct but supportive
- Reference their specific goals/values when possible
- Give 1-2 key focuses for THIS MONTH
- Suggest one concrete adjustment based on their pillar distribution
- Maximum 150 words total`;

      const userPrompt = `Reverse-engineer from my 2026 Direction to what I should focus on this month:

MY 2026 DIRECTION:
${ctx.yearDirection || 'Not specified'}

MY IDENTITY:
${ctx.identity?.slice(0, 500) || 'Not specified'}

MY CORE VALUES:
${ctx.coreValues || 'Not specified'}

CURRENT POSITION:
- Month: ${ctx.currentMonth}
- Week ${ctx.currentWeekNumber} of 52
- ${ctx.daysIntoYear} days into 2026, ${ctx.daysLeftInYear} days left
- ${ctx.weeksIntoMonth} weeks into this month, ${ctx.weeksLeftInMonth} weeks left

THIS WEEK'S ACTIVITY:
- ${ctx.weeklyActions} actions logged
- ${ctx.activeDays}/7 days active
- Pillar distribution: ${Object.entries(ctx.pillarDistribution || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'No data'}

What should I focus on this month to stay on track for my 2026 vision? Be specific to my situation.`;

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        console.error("AI Gateway error:", response.status);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { 
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required" }), { 
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
        throw new Error("Failed to generate monthly insight");
      }

      const data = await response.json();
      const insight = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ insight }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // ORIGINAL DIRECTION CHECK MODE (default)
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatWeightedContextForAgent(userContext, "decision-mirror");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a strategic mirror. Give a SHORT direction check grounded in THIS PERSON'S specific context.

CORE QUESTION: Is their behavior aligned with their stated identity? What's the gap?

${context}

YOUR JOB:
1. See patterns in THEIR identity + insights + experiments + hurdles
2. Identify if recent actions match identity direction
3. Name the ONE focus now (based on their weekly focus or active experiment)
4. Give ONE concrete next step (15-45 min) that advances THEIR specific situation

WEAVE MISSION: This replaces generic AI advice. The direction check should feel like it was written for THEM specifically.

PERSONALIZATION REQUIREMENTS:
- Reference their specific hurdles, projects, or experiments by name
- Connect to their weekly focus or values
- The next step should directly address something in their context

RULES:
- No emojis
- No fluff
- Keep it short
- Identity-first, not productivity-first
- SPECIFIC to their situation, not generic`
          },
          {
            role: "user",
            content: `Give me my direction check.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_direction",
              description: "Synthesize direction and next step",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string", maxLength: 80, description: "Short phrase, no emojis" },
                  summary: { type: "string", description: "3-4 sentences max, no emojis" },
                  suggested_next_step: { type: "string", description: "One action, 15-45 min, no emojis" }
                },
                required: ["headline", "summary", "suggested_next_step"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "synthesize_direction" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let synthesis;
    try {
      synthesis = JSON.parse(toolCall.function.arguments);
      synthesis = validateSynthesizerOutput(synthesis);
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify(getFallbackSynthesis()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(synthesis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Synthesizer error:", error);
    return new Response(JSON.stringify(getFallbackSynthesis()), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
