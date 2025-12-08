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
  
  // Match various Instagram URL formats
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

// Extract metadata from Instagram page
async function fetchInstagramMetadata(url: string): Promise<{ title: string; description: string; hashtags: string[] }> {
  console.log("Fetching Instagram metadata for:", url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    if (!response.ok) {
      console.error("Failed to fetch Instagram page:", response.status);
      return { title: "", description: "", hashtags: [] };
    }
    
    const html = await response.text();
    
    // Extract title from og:title or twitter:title
    let title = "";
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                         html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);
    if (ogTitleMatch) {
      title = decodeHtmlEntities(ogTitleMatch[1]);
    }
    
    // Extract description from og:description or meta description
    let description = "";
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                        html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i) ||
                        html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    if (ogDescMatch) {
      description = decodeHtmlEntities(ogDescMatch[1]);
    }
    
    // Extract hashtags from description
    const hashtagMatches = description.match(/#[a-zA-Z0-9_]+/g) || [];
    const hashtags = [...new Set(hashtagMatches.map(h => h.toLowerCase()))];
    
    // Also try to get hashtags from the page content
    const pageHashtags = html.match(/#[a-zA-Z0-9_]{2,30}/g) || [];
    const allHashtags = [...new Set([...hashtags, ...pageHashtags.map(h => h.toLowerCase())])].slice(0, 20);
    
    console.log("Extracted - Title:", title?.substring(0, 50), "Description length:", description?.length, "Hashtags:", allHashtags.length);
    
    return { title, description, hashtags: allHashtags };
    
  } catch (e) {
    console.error("Error fetching Instagram metadata:", e);
    return { title: "", description: "", hashtags: [] };
  }
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
    
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error("Instagram URL is required");
    }
    
    const instagramUrl = rawUrl.trim().slice(0, 500);
    const providedTitle = (typeof rawTitle === 'string') ? rawTitle.trim().slice(0, 200) : undefined;
    
    if (!instagramUrl.includes('instagram.com')) {
      throw new Error("Invalid Instagram URL format. Please provide a valid Instagram link.");
    }

    console.log("Processing Instagram URL:", instagramUrl);
    
    const extracted = extractInstagramId(instagramUrl);
    if (!extracted) {
      throw new Error("Invalid Instagram URL format. Please provide a valid post or reel link.");
    }

    console.log("Instagram ID:", extracted.id, "Type:", extracted.type);

    // Fetch metadata from Instagram
    const { title: fetchedTitle, description, hashtags } = await fetchInstagramMetadata(instagramUrl);
    const videoTitle = providedTitle || fetchedTitle || `Instagram ${extracted.type}`;
    
    console.log("Final - Title:", videoTitle, "Description length:", description.length);

    // Build extracted content from available metadata
    const extractedContent = [
      `Title: ${videoTitle}`,
      description ? `\nDescription: ${description}` : '',
      hashtags.length > 0 ? `\nHashtags: ${hashtags.join(' ')}` : '',
      `\nType: Instagram ${extracted.type}`,
      `\nURL: ${instagramUrl}`,
      '\n\nNote: Full transcript not available for Instagram videos. Insights generated from available metadata.'
    ].filter(Boolean).join('');

    // Create document entry
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: videoTitle,
        summary: `Instagram ${extracted.type}: ${instagramUrl}`,
        file_type: `instagram_${extracted.type}`,
        file_path: instagramUrl,
        extracted_content: extractedContent.substring(0, 100000),
      })
      .select()
      .single();

    if (docError) throw docError;

    // Process with AI if we have description
    let insightsCreated = 0;
    if (description && description.length > 20) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
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
                content: `Extract 1-3 actionable insights from this Instagram content metadata.

Return ONLY a valid JSON array, no other text. Format:
[{"title": "short title", "content": "detailed insight"}]

Each insight should be:
- Immediately actionable
- Specific with examples if possible
- Relevant to personal growth, productivity, or the topic at hand

If the content is too vague or promotional, return just 1 general insight.`
              },
              {
                role: "user",
                content: `Instagram ${extracted.type}: ${videoTitle}\n\nDescription: ${description}\n\nHashtags: ${hashtags.join(' ')}`
              }
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices[0].message.content;
          
          // Clean up response
          content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          
          // Find JSON array in response
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const insights = JSON.parse(jsonMatch[0]);
            
            for (const insight of insights) {
              if (insight.title && insight.content) {
                await supabase.from("insights").insert({
                  user_id: user.id,
                  title: insight.title,
                  content: insight.content,
                  source: `instagram:${extracted.id}`,
                });
                insightsCreated++;
              }
            }
            
            console.log("Created", insightsCreated, "insights from Instagram");
          }
        } else {
          console.error("AI request failed:", response.status);
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
        message: insightsCreated > 0 
          ? `Instagram ${extracted.type} processed! Created ${insightsCreated} insights.`
          : `Instagram ${extracted.type} saved. Add your own insights manually for best results.`
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
