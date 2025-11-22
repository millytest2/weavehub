import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
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

    const { youtubeUrl, title } = await req.json();
    
    if (!youtubeUrl) {
      throw new Error("YouTube URL is required");
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    console.log("Processing YouTube video:", videoId);

    // Fetch transcript using youtube-transcript-api
    const transcriptResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!transcriptResponse.ok) {
      throw new Error("Failed to fetch video data");
    }

    const html = await transcriptResponse.text();
    
    // Extract captions/transcript from YouTube's initial data
    const captionsMatch = html.match(/"captions":({[^}]+})/);
    let transcript = "";
    
    if (captionsMatch) {
      // Parse caption tracks and fetch transcript
      const captionsData = JSON.parse(captionsMatch[1]);
      // For now, we'll create a basic transcript entry
      transcript = "Video transcript processing...";
    } else {
      transcript = "No captions available for this video.";
    }

    // Get video metadata
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const videoTitle = title || (titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'YouTube Video');

    // Create document entry
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: videoTitle,
        summary: `YouTube video: ${youtubeUrl}\n\n${transcript.substring(0, 500)}`,
        file_type: "youtube_video",
        file_path: youtubeUrl,
      })
      .select()
      .single();

    if (docError) throw docError;

    // Process with AI if we have transcript
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
              content: `Extract 2-4 key insights from this YouTube video transcript. Each insight should be:
- Action-oriented
- Specific and memorable
- Relevant to personal growth, productivity, or skill-building

Return as JSON array: [{"title": "...", "content": "..."}]`
            },
            {
              role: "user",
              content: `Video: ${videoTitle}\n\nTranscript: ${transcript.substring(0, 10000)}`
            }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0].message.content;
        
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
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              documentId: docData.id,
              insightsCreated,
              videoId 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e) {
          console.error("Failed to parse AI insights:", e);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        documentId: docData.id,
        videoId,
        message: "Video saved. Transcript processing limited."
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
