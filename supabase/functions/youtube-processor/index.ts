import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  if (!url) return null;
  
  const cleanUrl = url.trim();
  
  // If it's already just a video ID (11 characters, alphanumeric + _ and -)
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  // Comprehensive patterns for all YouTube URL formats
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Fetch transcript using YouTube's internal API (no key required)
async function fetchTranscript(videoId: string): Promise<{ transcript: string; title: string }> {
  console.log("Fetching transcript for video:", videoId);
  
  // Method 1: Try youtubetranscript.com (free, no API key)
  try {
    const response = await fetch(`https://www.youtubetranscript.com/?server_vid2=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      // Parse the transcript text from the response
      const textMatch = html.match(/<text[^>]*>([^<]+)<\/text>/g);
      if (textMatch && textMatch.length > 0) {
        const transcript = textMatch
          .map(t => t.replace(/<\/?text[^>]*>/g, ''))
          .join(' ')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        
        if (transcript.length > 50) {
          console.log("Transcript fetched via youtubetranscript.com, length:", transcript.length);
          return { transcript, title: "" };
        }
      }
    }
  } catch (e) {
    console.log("youtubetranscript.com failed:", e);
  }

  // Method 2: Try to extract from YouTube page directly using timedtext API
  try {
    const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (watchResponse.ok) {
      const html = await watchResponse.text();
      
      // Extract title
      let title = "";
      const titleMatch = html.match(/"title":"([^"]+)"/);
      if (titleMatch) {
        title = titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
      }
      
      // Extract caption track URL
      const captionMatch = html.match(/"captionTracks":\[(.*?)\]/);
      if (captionMatch) {
        const trackData = captionMatch[1];
        const urlMatch = trackData.match(/"baseUrl":"([^"]+)"/);
        
        if (urlMatch) {
          const captionUrl = urlMatch[1].replace(/\\u0026/g, '&');
          console.log("Found caption URL, fetching...");
          
          const captionResponse = await fetch(captionUrl);
          if (captionResponse.ok) {
            const captionXml = await captionResponse.text();
            
            // Parse XML to extract text
            const textMatches = captionXml.match(/<text[^>]*>([^<]*)<\/text>/g);
            if (textMatches) {
              const transcript = textMatches
                .map(t => {
                  const content = t.replace(/<\/?text[^>]*>/g, '');
                  return content
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/\n/g, ' ');
                })
                .join(' ')
                .trim();
              
              if (transcript.length > 50) {
                console.log("Transcript extracted from YouTube captions, length:", transcript.length);
                return { transcript, title };
              }
            }
          }
        }
      }
      
      // Fallback: Extract description
      const descMatch = html.match(/"description":{"simpleText":"([^"]+)"}/);
      if (descMatch) {
        const description = descMatch[1].substring(0, 3000);
        console.log("Using video description as fallback, length:", description.length);
        return { transcript: description, title };
      }
      
      return { transcript: "", title };
    }
  } catch (e) {
    console.error("YouTube page fetch failed:", e);
  }

  return { transcript: "", title: "" };
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
    
    // Input validation
    const rawUrl = body.youtubeUrl;
    const rawTitle = body.title;
    
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error("YouTube URL is required");
    }
    
    const youtubeUrl = rawUrl.trim().slice(0, 500);
    const providedTitle = (typeof rawTitle === 'string') ? rawTitle.trim().slice(0, 200) : undefined;
    
    if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be') && !/^[a-zA-Z0-9_-]{11}$/.test(youtubeUrl)) {
      throw new Error("Invalid YouTube URL format. Please provide a valid YouTube link.");
    }

    console.log("Processing YouTube URL:", youtubeUrl);
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube URL format. Please provide a valid YouTube link.`);
    }

    console.log("Video ID:", videoId);

    // Fetch transcript
    const { transcript, title: fetchedTitle } = await fetchTranscript(videoId);
    const videoTitle = providedTitle || fetchedTitle || "YouTube Video";
    
    console.log("Transcript length:", transcript.length, "Title:", videoTitle);

    // Store the full transcript in extracted_content
    const extractedContent = transcript.length > 50 
      ? transcript.substring(0, 100000)  // Store up to 100KB
      : `Video: ${videoTitle}. Transcript not available - captions may be disabled.`;

    // Create document entry with transcript stored
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: videoTitle,
        summary: `YouTube video: ${youtubeUrl}`,
        file_type: "youtube_video",
        file_path: youtubeUrl,
        extracted_content: extractedContent,
      })
      .select()
      .single();

    if (docError) throw docError;

    // Process with AI if we have substantial transcript
    if (transcript && transcript.length > 100) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
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
              content: `You are an insight extraction expert. Analyze this YouTube video and extract 2-4 powerful, actionable insights.

EACH INSIGHT MUST BE:
- Action-oriented and immediately applicable
- Specific with concrete examples or frameworks
- Memorable (quotable quality)
- Relevant to personal growth, productivity, skill-building, or mindset shifts

INSIGHT QUALITY RULES:
- Focus on unique mental models, not obvious advice
- Extract frameworks or systems if present
- Identify identity-level shifts (not just tactics)
- Prioritize insights that create leverage or compound effects

Return as JSON array: [{"title": "short catchy title", "content": "detailed insight with context and application"}]`
            },
            {
              role: "user",
              content: `Video: ${videoTitle}\n\nTranscript: ${transcript.substring(0, 15000)}`
            }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let content = data.choices[0].message.content;
        
        // Strip markdown code blocks if present
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        try {
          const insights = JSON.parse(content);
          let insightsCreated = 0;
          
          for (const insight of insights) {
            await supabase.from("insights").insert({
              user_id: user.id,
              title: insight.title,
              content: insight.content,
              source: `youtube:${videoId}`,
            });
            insightsCreated++;
          }
          
          console.log("Created", insightsCreated, "insights from video");
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              documentId: docData.id,
              insightsCreated,
              videoId,
              transcriptLength: transcript.length
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e) {
          console.error("Failed to parse AI insights:", e);
        }
      } else {
        console.error("AI request failed:", response.status, await response.text());
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        documentId: docData.id,
        videoId,
        transcriptLength: transcript.length,
        message: transcript.length > 100 
          ? "Video processed successfully."
          : "Video saved. Transcript not available (captions may be disabled)."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("YouTube processor error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to process video" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
