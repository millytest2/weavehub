import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ContentType = 'youtube' | 'instagram' | 'twitter' | 'article' | 'unknown';

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

// Fetch YouTube transcript
async function fetchYouTubeTranscript(videoId: string): Promise<{ transcript: string; title: string }> {
  console.log("Fetching YouTube transcript for:", videoId);
  
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
    console.error("YouTube fetch error:", e);
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

// Fetch article content
async function fetchArticleContent(url: string): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) return { title: "", content: "" };
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : new URL(url).hostname;
    
    // Extract description/content
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    
    // Extract main text content (basic extraction)
    let content = descMatch ? decodeHtmlEntities(descMatch[1]) : "";
    
    // Try to get article content from common patterns
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const stripped = articleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > content.length) {
        content = stripped.substring(0, 10000);
      }
    }
    
    return { title, content };
  } catch (e) {
    console.error("Article fetch error:", e);
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

// Generate insights from content
async function generateInsights(content: string, title: string, source: string): Promise<{ title: string; content: string }[]> {
  if (content.length < 50) return [];
  
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return [];
  
  try {
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
            content: `Source: ${source}\nTitle: ${title}\n\nContent:\n${content.substring(0, 12000)}`
          }
        ],
      }),
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    let responseContent = data.choices[0].message.content;
    responseContent = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("AI processing error:", e);
  }
  
  return [];
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
      
      default:
        throw new Error("Could not detect content type. Please paste a valid URL (YouTube, Instagram, Twitter, or article).");
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
    
    // Generate and save insights
    let insightsCreated = 0;
    if (content && content.length > 50) {
      const insights = await generateInsights(content, title, detected.type);
      
      for (const insight of insights) {
        if (insight.title && insight.content) {
          await supabase.from("insights").insert({
            user_id: user.id,
            title: insight.title,
            content: insight.content,
            source,
          });
          insightsCreated++;
        }
      }
    }
    
    console.log("Created document and", insightsCreated, "insights");
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        type: detected.type,
        title,
        documentId: docData.id,
        insightsCreated,
        message: insightsCreated > 0 
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
