import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract Instagram post/reel ID from URL
function extractInstagramId(url: string): { id: string; type: 'post' | 'reel' } | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reels\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      const type = cleanUrl.includes('/reel') ? 'reel' : 'post';
      return { id: match[1], type };
    }
  }
  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, ' ');
}

interface InstagramMetadata {
  title: string;
  description: string;
  hashtags: string[];
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  embedHtml: string;
  captionText: string;
}

// Try Instagram oEmbed API first (free, reliable for public posts)
async function fetchOEmbed(url: string): Promise<Partial<InstagramMetadata>> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&omitscript=true`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("oEmbed success - author:", data.author_name, "title length:", data.title?.length);
      
      // The oEmbed HTML contains the full caption
      let captionText = '';
      if (data.html) {
        // Extract caption from embed HTML - it's between blockquote tags
        const captionMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        if (captionMatch) {
          captionText = captionMatch[1]
            .replace(/<[^>]+>/g, '') // strip HTML tags
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
      
      return {
        title: data.title || '',
        authorName: data.author_name || '',
        authorUrl: data.author_url || '',
        thumbnailUrl: data.thumbnail_url || '',
        embedHtml: data.html || '',
        captionText: decodeHtmlEntities(captionText),
      };
    } else {
      console.log("oEmbed failed:", response.status);
    }
  } catch (e) {
    console.error("oEmbed error:", e);
  }
  return {};
}

// Fallback: scrape og:meta from page
async function fetchPageMetadata(url: string): Promise<Partial<InstagramMetadata>> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    if (!response.ok) return {};
    const html = await response.text();
    
    let title = '';
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                         html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);
    if (ogTitleMatch) title = decodeHtmlEntities(ogTitleMatch[1]);
    
    let description = '';
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                        html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i) ||
                        html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    if (ogDescMatch) description = decodeHtmlEntities(ogDescMatch[1]);
    
    // Extract author from title pattern "Author on Instagram: ..."
    let authorName = '';
    const authorMatch = title.match(/^(.+?)\s+on\s+Instagram/i);
    if (authorMatch) authorName = authorMatch[1].trim();
    
    // Try to get image URL
    let thumbnailUrl = '';
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (ogImageMatch) thumbnailUrl = ogImageMatch[1];
    
    const hashtagMatches = (description + ' ' + title).match(/#[a-zA-Z0-9_]+/g) || [];
    const hashtags = [...new Set(hashtagMatches.map(h => h.toLowerCase()))];
    
    return { title, description, hashtags, authorName, thumbnailUrl };
  } catch (e) {
    console.error("Page fetch error:", e);
  }
  return {};
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

    const body = await req.json();
    const rawUrl = body.instagramUrl;
    const rawTitle = body.title;
    
    if (!rawUrl || typeof rawUrl !== 'string') throw new Error("Instagram URL is required");
    
    const instagramUrl = rawUrl.trim().slice(0, 500);
    const providedTitle = (typeof rawTitle === 'string') ? rawTitle.trim().slice(0, 200) : undefined;
    
    if (!instagramUrl.includes('instagram.com')) {
      throw new Error("Invalid Instagram URL format.");
    }

    const extracted = extractInstagramId(instagramUrl);
    if (!extracted) throw new Error("Invalid Instagram URL format.");

    console.log("Processing Instagram:", extracted.id, "Type:", extracted.type);

    // Layer 1: Try oEmbed (most reliable for public content)
    const oembedData = await fetchOEmbed(instagramUrl);
    
    // Layer 2: Fallback to page scraping
    const pageData = await fetchPageMetadata(instagramUrl);
    
    // Merge all sources - prioritize oEmbed
    const authorName = oembedData.authorName || pageData.authorName || '';
    const captionText = oembedData.captionText || pageData.description || '';
    const videoTitle = providedTitle || 
      (authorName ? `${authorName}'s Instagram ${extracted.type}` : '') ||
      oembedData.title || pageData.title || 
      `Instagram ${extracted.type}`;
    
    const allHashtags = [
      ...(pageData.hashtags || []),
      ...(captionText.match(/#[a-zA-Z0-9_]+/g) || []).map(h => h.toLowerCase()),
    ];
    const hashtags = [...new Set(allHashtags)].slice(0, 30);
    
    // Build rich extracted content
    const extractedContent = [
      `Title: ${videoTitle}`,
      authorName ? `Author: ${authorName}` : '',
      captionText ? `\nCaption:\n${captionText}` : '',
      hashtags.length > 0 ? `\nHashtags: ${hashtags.join(' ')}` : '',
      `\nType: Instagram ${extracted.type}`,
      `URL: ${instagramUrl}`,
      oembedData.thumbnailUrl ? `\nThumbnail: ${oembedData.thumbnailUrl}` : '',
      !captionText ? '\nNote: Caption not available. Insights generated from available metadata.' : '',
    ].filter(Boolean).join('\n');

    console.log("Extracted content length:", extractedContent.length, "Caption length:", captionText.length, "Hashtags:", hashtags.length);

    // Create document
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: videoTitle,
        summary: `Instagram ${extracted.type} by ${authorName || 'unknown'}${captionText ? ': ' + captionText.slice(0, 150) : ''}`,
        file_type: `instagram_${extracted.type}`,
        file_path: instagramUrl,
        extracted_content: extractedContent.substring(0, 100000),
      })
      .select()
      .single();

    if (docError) throw docError;

    // AI processing - use caption + hashtags for richer insights
    let insightsCreated = 0;
    const contentForAI = captionText || pageData.description || '';
    
    if (contentForAI.length > 15) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
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
                content: `Extract 1-3 actionable insights from this Instagram content.

Return ONLY a valid JSON array. Format:
[{"title": "short title under 10 words", "content": "detailed insight with specific takeaway"}]

Rules:
- Focus on the CORE message, not surface-level observations
- Each insight should be something the reader can immediately apply
- If the creator shared a tip, framework, or perspective — extract that specifically
- If it's lifestyle/motivational — extract the underlying principle
- Ignore promotional/CTA content`
              },
              {
                role: "user",
                content: `Instagram ${extracted.type} by ${authorName}:\n\nCaption: ${contentForAI}\n\nHashtags: ${hashtags.join(' ')}`
              }
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices[0].message.content;
          content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const insights = JSON.parse(jsonMatch[0]);
            for (const insight of insights) {
              if (insight.title && insight.content) {
                await supabase.from("insights").insert({
                  user_id: user.id,
                  title: insight.title,
                  content: insight.content,
                  source: instagramUrl,
                });
                insightsCreated++;
              }
            }
            console.log("Created", insightsCreated, "insights from Instagram");
          }
        } else {
          console.error("AI request failed:", response.status);
          const errText = await response.text();
          console.error("AI error body:", errText);
        }
      } catch (aiError) {
        console.error("AI processing error:", aiError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        documentId: docData.id,
        instagramId: extracted.id,
        type: extracted.type,
        insightsCreated,
        author: authorName,
        captionLength: captionText.length,
        message: insightsCreated > 0 
          ? `Instagram ${extracted.type} processed! Created ${insightsCreated} insights.`
          : `Instagram ${extracted.type} saved.${captionText.length < 15 ? ' Caption was too short for AI insights.' : ''}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Instagram processor error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to process Instagram content" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
