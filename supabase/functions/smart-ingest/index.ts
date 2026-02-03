import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ContentType = 'youtube' | 'instagram' | 'twitter' | 'article' | 'text' | 'unknown';

interface DetectedContent {
  type: ContentType;
  url: string;
  id?: string;
}

// Detect content type from URL
function detectContentType(input: string): DetectedContent {
  const trimmed = input.trim();
  
  // YouTube
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    const videoId = extractYouTubeId(trimmed);
    return { type: 'youtube', url: trimmed, id: videoId || undefined };
  }
  
  // Instagram
  if (trimmed.includes('instagram.com')) {
    const extracted = extractInstagramId(trimmed);
    return { type: 'instagram', url: trimmed, id: extracted?.id };
  }
  
  // Twitter/X
  if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) {
    const tweetId = extractTwitterId(trimmed);
    return { type: 'twitter', url: trimmed, id: tweetId || undefined };
  }
  
  // Check if it's a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { type: 'article', url: trimmed };
  }
  
  return { type: 'unknown', url: trimmed };
}

// YouTube ID extraction
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

// Instagram ID extraction
function extractInstagramId(url: string): { id: string; type: 'post' | 'reel' } | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reels\/([a-zA-Z0-9_-]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return { id: match[1], type: url.includes('/reel') ? 'reel' : 'post' };
    }
  }
  return null;
}

// Twitter ID extraction
function extractTwitterId(url: string): string | null {
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ');
}

// Fetch YouTube transcript using RapidAPI
async function fetchYouTubeTranscript(videoId: string): Promise<{ transcript: string; title: string }> {
  console.log("Fetching YouTube transcript for:", videoId);
  
  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
  
  // Try RapidAPI first (reliable)
  if (RAPIDAPI_KEY) {
    try {
      console.log("Using RapidAPI for transcript extraction");
      const url = `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}&videoId=${videoId}&chunkSize=500&text=true&lang=en`;
      
      const response = await fetch(url, {
        headers: {
          'x-rapidapi-host': 'youtube-transcripts.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("RapidAPI response:", JSON.stringify(data).substring(0, 200));
        
        // Extract transcript text from response
        let transcript = "";
        if (data.content && Array.isArray(data.content)) {
          transcript = data.content.map((chunk: any) => chunk.text || '').join(' ').trim();
        } else if (typeof data.content === 'string') {
          transcript = data.content;
        } else if (data.text) {
          transcript = data.text;
        }
        
        // Get title from response or fetch separately
        let title = data.title || "";
        if (!title || title.length < 3) {
          console.log("Fetching title separately...");
          title = await fetchYouTubeTitle(videoId);
        }
        
        if (transcript.length > 100) {
          console.log("RapidAPI transcript extracted - Title:", title, "Length:", transcript.length);
          return { transcript, title };
        }
      } else {
        console.log("RapidAPI failed with status:", response.status);
      }
    } catch (e) {
      console.error("RapidAPI error:", e);
    }
  }
  
  // Fallback to direct scraping
  console.log("Falling back to direct YouTube scraping");
  return fetchYouTubeTranscriptFallback(videoId);
}

// Fetch YouTube title separately
async function fetchYouTubeTitle(videoId: string): Promise<string> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    if (!response.ok) return "YouTube Video";
    const html = await response.text();
    const titleMatch = html.match(/"title":"([^"]+)"/);
    return titleMatch ? decodeHtmlEntities(titleMatch[1]) : "YouTube Video";
  } catch {
    return "YouTube Video";
  }
}

// Fallback: Direct YouTube scraping (unreliable but works sometimes)
async function fetchYouTubeTranscriptFallback(videoId: string): Promise<{ transcript: string; title: string }> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) return { transcript: "", title: "" };
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/"title":"([^"]+)"/);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "";
    
    // Extract captions
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerMatch) {
      try {
        const playerData = JSON.parse(playerMatch[1]);
        const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captions?.length > 0) {
          const englishCaption = captions.find((c: any) => 
            c.languageCode === 'en' || c.languageCode?.startsWith('en')
          ) || captions[0];
          
          if (englishCaption?.baseUrl) {
            const captionResponse = await fetch(englishCaption.baseUrl);
            if (captionResponse.ok) {
              const xml = await captionResponse.text();
              const textMatches = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
              if (textMatches?.length) {
                const transcript = textMatches
                  .map(t => decodeHtmlEntities(t.replace(/<\/?text[^>]*>/g, '')))
                  .join(' ')
                  .trim();
                if (transcript.length > 100) return { transcript, title };
              }
            }
          }
        }
      } catch (e) {
        console.error("Error parsing player response:", e);
      }
    }
    
    // Fallback to description
    const descMatch = html.match(/"shortDescription":"([^"]+)"/);
    if (descMatch) {
      return { transcript: decodeHtmlEntities(descMatch[1]).substring(0, 5000), title };
    }
    
    return { transcript: "", title };
  } catch (e) {
    console.error("YouTube fallback fetch error:", e);
    return { transcript: "", title: "" };
  }
}

// Fetch Instagram metadata
async function fetchInstagramMetadata(url: string): Promise<{ title: string; description: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) return { title: "", description: "" };
    
    const html = await response.text();
    
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    
    return {
      title: titleMatch ? decodeHtmlEntities(titleMatch[1]) : "",
      description: descMatch ? decodeHtmlEntities(descMatch[1]) : ""
    };
  } catch (e) {
    console.error("Instagram fetch error:", e);
    return { title: "", description: "" };
  }
}

// Fetch article content using Jina.ai Reader API (free, no API key needed)
async function fetchArticleContent(url: string): Promise<{ title: string; content: string }> {
  console.log("Fetching article via Jina.ai:", url);
  
  try {
    // Use Jina.ai Reader API - just prefix the URL
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      }
    });
    
    if (!response.ok) {
      console.log("Jina.ai failed, falling back to basic extraction");
      return fetchArticleContentFallback(url);
    }
    
    const markdown = await response.text();
    
    // Extract title from first line (usually # Title)
    const lines = markdown.split('\n').filter(l => l.trim());
    let title = "";
    let content = markdown;
    
    if (lines[0]?.startsWith('# ')) {
      title = lines[0].replace(/^#\s+/, '').trim();
    } else if (lines[0]?.startsWith('Title: ')) {
      title = lines[0].replace(/^Title:\s+/, '').trim();
    }
    
    // If no title found in markdown, use hostname
    if (!title) {
      title = new URL(url).hostname;
    }
    
    console.log("Jina.ai extracted - Title:", title?.substring(0, 50), "Content length:", content?.length);
    
    return { 
      title, 
      content: content.substring(0, 50000) // Jina returns clean markdown, keep more
    };
  } catch (e) {
    console.error("Jina.ai fetch error:", e);
    return fetchArticleContentFallback(url);
  }
}

// Fallback to basic HTML extraction if Jina.ai fails
async function fetchArticleContentFallback(url: string): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) return { title: "", content: "" };
    
    const html = await response.text();
    
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : new URL(url).hostname;
    
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    
    let content = descMatch ? decodeHtmlEntities(descMatch[1]) : "";
    
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const stripped = articleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > content.length) {
        content = stripped.substring(0, 10000);
      }
    }
    
    return { title, content };
  } catch (e) {
    console.error("Fallback article fetch error:", e);
    return { title: "", content: "" };
  }
}

// Fetch tweet content
async function fetchTweetContent(url: string): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) return { title: "", content: "" };
    
    const html = await response.text();
    
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    
    return {
      title: titleMatch ? decodeHtmlEntities(titleMatch[1]) : "Tweet",
      content: descMatch ? decodeHtmlEntities(descMatch[1]) : ""
    };
  } catch (e) {
    console.error("Tweet fetch error:", e);
    return { title: "", content: "" };
  }
}

// Match content to best topic using AI - IDENTITY-WEIGHTED matching
// Falls back to keyword matching if AI unavailable
async function matchToTopic(
  content: string, 
  title: string, 
  topics: { id: string; name: string; description: string | null }[],
  identityContext?: { identity_seed?: string; core_values?: string; weekly_focus?: string }
): Promise<string | null> {
  if (topics.length === 0) return null;
  
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return keywordMatchTopic(content + " " + title, topics);
  }
  
  try {
    const topicList = topics.map((t, i) => `${i + 1}. ${t.name}${t.description ? ` - ${t.description}` : ''}`).join('\n');
    
    const identityPrompt = identityContext ? `
USER'S TRANSFORMATION CONTEXT (critical for matching):
${identityContext.identity_seed ? `IDENTITY: ${identityContext.identity_seed.substring(0, 400)}` : ''}
${identityContext.core_values ? `VALUES: ${identityContext.core_values}` : ''}
${identityContext.weekly_focus ? `CURRENT FOCUS: ${identityContext.weekly_focus}` : ''}

Match content to topics that SERVE THEIR CURRENT TRANSFORMATION. Ask:
- Does this content help them with what they're actively working on?
- Which topic would make this content most USEFUL and ACTIONABLE for them?
- If content spans multiple topics, pick the one most aligned with their focus.
` : '';
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You MUST classify content into ONE of these user-defined topics.
${identityPrompt}
USER'S TOPICS:
${topicList}

Return ONLY the topic number (1, 2, 3, etc.). If unclear, pick the most general.`
          },
          {
            role: "user",
            content: `Classify: "${title}" - ${content.substring(0, 1500)}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.log("AI topic match unavailable, using keyword fallback");
      return keywordMatchTopic(content + " " + title, topics);
    }
    
    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    
    const numberMatch = responseText.match(/\d+/);
    if (numberMatch) {
      const index = parseInt(numberMatch[0]) - 1;
      if (index >= 0 && index < topics.length) {
        console.log(`Topic matched: "${topics[index].name}"`);
        return topics[index].id;
      }
    }
    
    const matched = topics.find(t => 
      responseText.toLowerCase().includes(t.name.toLowerCase())
    );
    if (matched) return matched.id;
    
    return keywordMatchTopic(content + " " + title, topics);
  } catch (e) {
    console.error("Topic matching error:", e);
    return keywordMatchTopic(content + " " + title, topics);
  }
}

// Keyword-based topic matching fallback
function keywordMatchTopic(
  text: string,
  topics: { id: string; name: string; description: string | null }[]
): string | null {
  const lowerText = text.toLowerCase();
  
  // Common keyword mappings
  const keywordMap: Record<string, string[]> = {
    'identity': ['identity', 'belief', 'mindset', 'self', 'ego', 'who you are', 'becoming', 'transform', 'rewire', 'reprogram', 'subconscious', 'inner', 'thoughts', 'mental'],
    'relationship': ['relationship', 'dating', 'love', 'partner', 'connection', 'social', 'people', 'communicate', 'attraction', 'presence', 'listening'],
    'career': ['career', 'job', 'work', 'business', 'money', 'income', 'entrepreneur', 'startup', 'professional', 'skill', 'productivity'],
    'health': ['health', 'fitness', 'exercise', 'body', 'sleep', 'energy', 'workout', 'nutrition', 'wellness'],
    'finance': ['finance', 'money', 'invest', 'wealth', 'income', 'financial', 'savings', 'budget'],
    'creative': ['creative', 'content', 'create', 'art', 'write', 'design', 'build', 'make', 'audience'],
    'spiritual': ['spiritual', 'purpose', 'meaning', 'soul', 'meditation', 'consciousness', 'awareness'],
  };
  
  // Score each topic
  let bestTopic: { id: string; score: number } | null = null;
  
  for (const topic of topics) {
    let score = 0;
    const topicLower = topic.name.toLowerCase();
    const descLower = (topic.description || '').toLowerCase();
    
    // Direct name match in content
    if (lowerText.includes(topicLower)) score += 10;
    
    // Check keyword categories
    for (const [category, keywords] of Object.entries(keywordMap)) {
      if (topicLower.includes(category) || descLower.includes(category)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) score += 2;
        }
      }
    }
    
    // Words from topic name appearing in content
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    for (const word of topicWords) {
      if (lowerText.includes(word)) score += 3;
    }
    
    if (!bestTopic || score > bestTopic.score) {
      bestTopic = { id: topic.id, score };
    }
  }
  
  // Return best match if score is reasonable, otherwise first topic
  if (bestTopic && bestTopic.score >= 2) {
    const matched = topics.find(t => t.id === bestTopic!.id);
    console.log(`Keyword matched: "${matched?.name}" (score: ${bestTopic.score})`);
    return bestTopic.id;
  }
  
  // Default to first topic rather than null
  console.log(`No strong match, defaulting to first topic: "${topics[0].name}"`);
  return topics[0].id;
}

// Generate insights from content - with fallback when AI unavailable
async function generateInsights(content: string, title: string, source: string): Promise<{ title: string; content: string }[]> {
  if (content.length < 50) return [];
  
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  // Try AI-powered insight generation first
  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Extract 1-3 actionable insights from this content.

Return ONLY a valid JSON array, no other text. Format:
[{"title": "short title", "content": "detailed insight"}]

Each insight should be:
- Immediately actionable
- Specific with concrete takeaways
- Relevant to personal growth, productivity, or skill-building`
            },
            {
              role: "user",
              content: `Source: ${source}\nTitle: ${title}\n\nContent:\n${content.substring(0, 8000)}`
            }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let responseContent = data.choices[0].message.content;
        responseContent = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          console.log("AI generated", insights.length, "insights");
          return insights;
        }
      } else {
        console.log("AI unavailable (status:", response.status, "), using fallback extraction");
      }
    } catch (e) {
      console.error("AI processing error:", e);
    }
  }
  
  // FALLBACK: Extract insights using heuristics when AI is unavailable
  console.log("Using fallback insight extraction");
  return extractInsightsFallback(content, title);
}

// Fallback insight extraction using heuristics (no AI needed)
function extractInsightsFallback(content: string, title: string): { title: string; content: string }[] {
  const insights: { title: string; content: string }[] = [];
  
  // Split content into sentences
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 300);
  
  // Keywords that indicate actionable/important sentences
  const actionKeywords = [
    'you should', 'you need', 'try to', 'make sure', 'the key is', 'important to',
    'don\'t forget', 'remember to', 'focus on', 'the trick is', 'the secret',
    'step 1', 'first', 'start by', 'begin with', 'always', 'never',
    'must', 'have to', 'essential', 'crucial', 'critical', 'tip:',
    'lesson:', 'takeaway', 'insight:', 'rule:', 'principle',
    'the most important', 'key point', 'main idea', 'in summary',
    'here\'s how', 'here is how', 'this means', 'in other words'
  ];
  
  // Score sentences by actionability
  const scoredSentences = sentences.map(sentence => {
    const lower = sentence.toLowerCase();
    let score = 0;
    
    for (const keyword of actionKeywords) {
      if (lower.includes(keyword)) score += 3;
    }
    
    // Boost sentences with specific formats
    if (/^\d+[.):]/g.test(sentence)) score += 2; // Numbered lists
    if (sentence.includes(':')) score += 1; // Definitions/explanations
    if (lower.startsWith('the ')) score += 1; // Declarative statements
    
    // Penalize questions
    if (sentence.includes('?')) score -= 2;
    
    return { sentence, score };
  });
  
  // Sort by score and take top 3
  const topSentences = scoredSentences
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  // If we found actionable sentences, create insights from them
  if (topSentences.length > 0) {
    for (const { sentence } of topSentences) {
      // Generate a short title from the sentence
      const words = sentence.split(' ').slice(0, 5).join(' ');
      insights.push({
        title: words.length > 40 ? words.substring(0, 40) + '...' : words,
        content: sentence
      });
    }
  } else {
    // No actionable sentences found - create a basic summary insight
    const preview = content.substring(0, 300).trim();
    insights.push({
      title: title.substring(0, 50) || "Saved content",
      content: `Key points from "${title}": ${preview}${content.length > 300 ? '...' : ''}`
    });
  }
  
  console.log("Fallback extracted", insights.length, "insights");
  return insights;
}

// Generate a specific micro-action from content to queue for application
// Returns null if AI unavailable (graceful degradation - actions are optional)
async function generatePendingAction(
  content: string, 
  title: string, 
  identityContext?: { identity_seed?: string; core_values?: string; weekly_focus?: string }
): Promise<{ action: string; context: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || content.length < 50) return null;
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Generate ONE specific micro-action (15-30 min) to apply this content. Return JSON: {"action": "...", "context": "..."}`
          },
          {
            role: "user",
            content: `Title: ${title}\nContent: ${content.substring(0, 2000)}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.log("Pending action AI unavailable, skipping (non-critical)");
      return null;
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.action && parsed.context) {
        return parsed;
      }
    } catch {
      // If JSON parsing fails, extract action from text
      const actionMatch = text.match(/action[:\s]+"([^"]+)"/i);
      if (actionMatch) {
        return { action: actionMatch[1], context: "Apply what you learned" };
      }
    }
  } catch (e) {
    console.error("Pending action generation error:", e);
  }
  
  return null;
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

    const { input } = await req.json();
    
    if (!input || typeof input !== 'string') {
      throw new Error("Input is required");
    }
    
    const cleanInput = input.trim().slice(0, 2000);
    console.log("Smart ingest processing:", cleanInput.substring(0, 100));
    
    const detected = detectContentType(cleanInput);
    console.log("Detected content type:", detected.type);
    
    let title = "";
    let content = "";
    let fileType = detected.type;
    let source = `${detected.type}:${detected.id || 'unknown'}`;
    
    switch (detected.type) {
      case 'youtube': {
        const { transcript, title: ytTitle } = await fetchYouTubeTranscript(detected.id!);
        title = ytTitle || "YouTube Video";
        content = transcript;
        source = `youtube:${detected.id}`;
        break;
      }
      
      case 'instagram': {
        const { title: igTitle, description } = await fetchInstagramMetadata(detected.url);
        title = igTitle || "Instagram Post";
        content = description;
        source = `instagram:${detected.id}`;
        break;
      }
      
      case 'twitter': {
        const { title: twTitle, content: twContent } = await fetchTweetContent(detected.url);
        title = twTitle || "Tweet";
        content = twContent;
        source = `twitter:${detected.id}`;
        break;
      }
      
      case 'article': {
        const { title: artTitle, content: artContent } = await fetchArticleContent(detected.url);
        title = artTitle || new URL(detected.url).hostname;
        content = artContent;
        source = `article:${new URL(detected.url).hostname}`;
        break;
      }
      
      case 'unknown': {
        // Handle raw text (copied post content, notes, etc.)
        console.log("Processing as raw text input");
        title = cleanInput.substring(0, 60).split('\n')[0] || "Captured Note";
        content = cleanInput;
        fileType = 'text';
        source = 'manual:paste';
        break;
      }
    }
    
    console.log("Extracted - Title:", title?.substring(0, 50), "Content length:", content?.length);
    
    // Save as document
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: title || "Captured Content",
        summary: `${detected.type}: ${detected.url}`,
        file_type: fileType,
        file_path: detected.url,
        extracted_content: content?.substring(0, 100000) || null,
      })
      .select()
      .single();

    if (docError) throw docError;
    
    // Fetch user's topics AND identity for better matching
    const [topicsResult, identityResult] = await Promise.all([
      supabase.from("topics").select("id, name, description").eq("user_id", user.id),
      supabase.from("identity_seeds").select("content, core_values, weekly_focus").eq("user_id", user.id).maybeSingle(),
    ]);
    
    const userTopics = topicsResult.data || [];
    const identityData = identityResult.data;
    
    // Generate and save insights with IDENTITY-WEIGHTED topic matching
    let insightsCreated = 0;
    let createdInsightIds: string[] = [];
    if (content && content.length > 50) {
      const insights = await generateInsights(content, title, detected.type);
      
      // Match content to best topic using identity context
      const matchedTopicId = userTopics.length > 0
        ? await matchToTopic(content, title, userTopics, identityData ? {
            identity_seed: identityData.content,
            core_values: identityData.core_values,
            weekly_focus: identityData.weekly_focus,
          } : undefined)
        : null;
      
      console.log("Matched topic:", matchedTopicId);
      
      for (const insight of insights) {
        if (insight.title && insight.content) {
          const { data: insightData } = await supabase.from("insights").insert({
            user_id: user.id,
            title: insight.title,
            content: insight.content,
            source,
            topic_id: matchedTopicId,
          }).select("id").single();
          
          if (insightData) {
            createdInsightIds.push(insightData.id);
          }
          insightsCreated++;
        }
      }
    }
    
    console.log("Created document and", insightsCreated, "insights");
    
    // Find connected insights using semantic similarity
    let connectedInsights: { id: string; title: string; similarity: number }[] = [];
    let synthesis = "";
    let capability = "";
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && content && content.length > 100) {
      try {
        // Generate embedding for the new content
        const embedResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: `${title} ${content}`.substring(0, 3000)
          }),
        });
        
        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          const embedding = embedData.data?.[0]?.embedding;
          
          if (embedding) {
            // Find similar existing insights
            const { data: similarInsights } = await supabase.rpc('search_insights_semantic', {
              user_uuid: user.id,
              query_embedding: `[${embedding.join(',')}]`,
              match_count: 5,
              similarity_threshold: 0.5
            });
            
            if (similarInsights && similarInsights.length > 0) {
              // Filter out the ones we just created
              connectedInsights = similarInsights
                .filter((i: any) => !createdInsightIds.includes(i.id))
                .slice(0, 3)
                .map((i: any) => ({
                  id: i.id,
                  title: i.title,
                  similarity: i.similarity
                }));
              
              console.log("Found connected insights:", connectedInsights.length);
              
              // Generate synthesis if we have connections
              if (connectedInsights.length > 0 && identityData?.content) {
                try {
                  const synthesisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${LOVABLE_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "google/gemini-2.5-flash-lite",
                      max_tokens: 150,
                      messages: [
                        {
                          role: "system",
                          content: `User's 2026 direction: ${identityData.content.substring(0, 500)}

New content just saved: "${title}"
Connected to: ${connectedInsights.map(c => c.title).join(", ")}

In ONE sentence (under 25 words), explain what CAPABILITY or understanding the user is building by connecting these pieces. Be specific to their direction.`
                        },
                        { role: "user", content: "What am I building?" }
                      ],
                    }),
                  });
                  
                  if (synthesisResponse.ok) {
                    const synthData = await synthesisResponse.json();
                    synthesis = synthData.choices?.[0]?.message?.content?.trim() || "";
                    
                    // Extract capability
                    const capMatch = synthesis.match(/building\s+(?:the\s+)?(?:ability|skill|capacity)\s+to\s+([^.]+)/i);
                    if (capMatch) {
                      capability = capMatch[1].trim();
                    }
                  }
                } catch (e) {
                  console.error("Synthesis error:", e);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Connection finding error:", e);
      }
    }
    
    // Generate pending action for "Zero Information Waste" system
    let pendingActionCreated = false;
    if (content && content.length > 50) {
      const pendingAction = await generatePendingAction(content, title, identityData ? {
        identity_seed: identityData.content,
        core_values: identityData.core_values,
        weekly_focus: identityData.weekly_focus,
      } : undefined);
      
      if (pendingAction) {
        const { error: actionError } = await supabase
          .from("pending_actions")
          .insert({
            user_id: user.id,
            source_type: 'document',
            source_id: docData.id,
            source_title: title,
            action_text: pendingAction.action,
            action_context: pendingAction.context,
          });
        
        if (!actionError) {
          pendingActionCreated = true;
          console.log("Created pending action:", pendingAction.action.substring(0, 50));
          
          // Increment content_saved_count for learning debt tracking
          await supabase
            .from("identity_seeds")
            .update({ content_saved_count: (identityData as any)?.content_saved_count + 1 || 1 })
            .eq("user_id", user.id);
        }
      }
    }
    
    // Check if we only got metadata (minimal content) for social platforms
    const needsManualContent = 
      (detected.type === 'instagram' || detected.type === 'twitter') && 
      (!content || content.length < 100);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        type: detected.type,
        title,
        documentId: docData.id,
        insightsCreated,
        pendingActionCreated,
        needsManualContent,
        // NEW: Connection data for visual feedback
        connections: connectedInsights,
        synthesis,
        capability,
        message: needsManualContent 
          ? "Saved metadata. Paste caption/thread for full extraction."
          : connectedInsights.length > 0
            ? `Woven with ${connectedInsights.length} existing insight${connectedInsights.length > 1 ? 's' : ''}`
            : pendingActionCreated
              ? `Saved + action queued`
              : insightsCreated > 0 
                ? `Saved + ${insightsCreated} insight${insightsCreated > 1 ? 's' : ''} extracted`
                : "Saved"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Smart ingest error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to process content" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
