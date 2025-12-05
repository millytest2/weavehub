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
  
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
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

// Extract transcript directly from YouTube page
async function fetchTranscript(videoId: string): Promise<{ transcript: string; title: string }> {
  console.log("Fetching transcript for video:", videoId);
  
  try {
    // Fetch the YouTube watch page
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    if (!response.ok) {
      console.error("Failed to fetch YouTube page:", response.status);
      return { transcript: "", title: "" };
    }
    
    const html = await response.text();
    
    // Extract title
    let title = "";
    const titleMatch = html.match(/"title":"([^"]+)"/);
    if (titleMatch) {
      title = decodeHtmlEntities(titleMatch[1]);
    }
    
    console.log("Extracted title:", title);
    
    // Method 1: Extract from ytInitialPlayerResponse (most reliable)
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerResponseMatch) {
      try {
        const playerData = JSON.parse(playerResponseMatch[1]);
        const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captions && captions.length > 0) {
          // Prefer English captions, fallback to first available
          const englishCaption = captions.find((c: any) => 
            c.languageCode === 'en' || c.languageCode?.startsWith('en')
          ) || captions[0];
          
          if (englishCaption?.baseUrl) {
            console.log("Found caption track, fetching...");
            
            const captionResponse = await fetch(englishCaption.baseUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (captionResponse.ok) {
              const captionXml = await captionResponse.text();
              
              // Parse XML transcript
              const textMatches = captionXml.match(/<text[^>]*>([^<]*)<\/text>/g);
              if (textMatches && textMatches.length > 0) {
                const transcript = textMatches
                  .map(t => {
                    const content = t.replace(/<\/?text[^>]*>/g, '');
                    return decodeHtmlEntities(content);
                  })
                  .join(' ')
                  .trim();
                
                if (transcript.length > 100) {
                  console.log("Transcript extracted successfully, length:", transcript.length);
                  return { transcript, title };
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Error parsing player response:", e);
      }
    }
    
    // Method 2: Try to find captions in the page data
    const captionUrlMatch = html.match(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
    if (captionUrlMatch) {
      const captionUrl = captionUrlMatch[1].replace(/\\u0026/g, '&');
      console.log("Found timedtext URL, fetching...");
      
      try {
        const captionResponse = await fetch(captionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (captionResponse.ok) {
          const captionData = await captionResponse.text();
          
          // Try JSON format first
          try {
            const jsonData = JSON.parse(captionData);
            if (jsonData.events) {
              const transcript = jsonData.events
                .filter((e: any) => e.segs)
                .map((e: any) => e.segs.map((s: any) => s.utf8).join(''))
                .join(' ')
                .trim();
              
              if (transcript.length > 100) {
                console.log("Transcript from JSON, length:", transcript.length);
                return { transcript, title };
              }
            }
          } catch {
            // Try XML format
            const textMatches = captionData.match(/<text[^>]*>([^<]*)<\/text>/g);
            if (textMatches) {
              const transcript = textMatches
                .map(t => decodeHtmlEntities(t.replace(/<\/?text[^>]*>/g, '')))
                .join(' ')
                .trim();
              
              if (transcript.length > 100) {
                console.log("Transcript from XML, length:", transcript.length);
                return { transcript, title };
              }
            }
          }
        }
      } catch (e) {
        console.error("Error fetching timedtext:", e);
      }
    }
    
    // Method 3: Extract description as fallback
    const descMatch = html.match(/"description":{"simpleText":"([^"]+)"}/);
    if (descMatch) {
      const description = decodeHtmlEntities(descMatch[1]).substring(0, 5000);
      console.log("Using description as fallback, length:", description.length);
      return { transcript: description, title };
    }
    
    // Method 4: Extract short description
    const shortDescMatch = html.match(/"shortDescription":"([^"]+)"/);
    if (shortDescMatch) {
      const description = decodeHtmlEntities(shortDescMatch[1]).substring(0, 5000);
      console.log("Using short description as fallback, length:", description.length);
      return { transcript: description, title };
    }
    
    console.log("No transcript or description found");
    return { transcript: "", title };
    
  } catch (e) {
    console.error("Error fetching transcript:", e);
    return { transcript: "", title: "" };
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
      throw new Error("Invalid YouTube URL format. Please provide a valid YouTube link.");
    }

    console.log("Video ID:", videoId);

    // Fetch transcript
    const { transcript, title: fetchedTitle } = await fetchTranscript(videoId);
    const videoTitle = providedTitle || fetchedTitle || "YouTube Video";
    
    console.log("Final - Transcript length:", transcript.length, "Title:", videoTitle);

    const hasTranscript = transcript.length > 100;
    
    // Store the transcript
    const extractedContent = hasTranscript 
      ? transcript.substring(0, 100000)
      : `Video: ${videoTitle}. Transcript not available - captions may be disabled for this video.`;

    // Create document entry
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

    // Process with AI if we have transcript
    if (hasTranscript) {
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
                content: `Extract 2-4 actionable insights from this YouTube video transcript.

Return ONLY a valid JSON array, no other text. Format:
[{"title": "short title", "content": "detailed insight"}]

Each insight should be:
- Immediately actionable
- Specific with examples
- Relevant to personal growth or productivity`
              },
              {
                role: "user",
                content: `Video: ${videoTitle}\n\nTranscript:\n${transcript.substring(0, 12000)}`
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
            let insightsCreated = 0;
            
            for (const insight of insights) {
              if (insight.title && insight.content) {
                await supabase.from("insights").insert({
                  user_id: user.id,
                  title: insight.title,
                  content: insight.content,
                  source: `youtube:${videoId}`,
                });
                insightsCreated++;
              }
            }
            
            console.log("Created", insightsCreated, "insights");
            
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
        videoId,
        transcriptLength: transcript.length,
        message: hasTranscript 
          ? "Video processed."
          : "Video saved. No captions available for this video."
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
