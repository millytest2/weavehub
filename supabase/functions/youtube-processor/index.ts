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

    // Use YouTube Transcript API endpoint
    let transcript = "";
    let videoTitle = title || "YouTube Video";
    
    try {
      // Try to fetch transcript from a public API
      const transcriptApiResponse = await fetch(
        `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${videoId}`,
        {
          headers: {
            'X-RapidAPI-Key': Deno.env.get('RAPIDAPI_KEY') || '',
            'X-RapidAPI-Host': 'youtube-transcript3.p.rapidapi.com'
          }
        }
      );

      if (transcriptApiResponse.ok) {
        const transcriptData = await transcriptApiResponse.json();
        if (transcriptData.transcript && Array.isArray(transcriptData.transcript)) {
          transcript = transcriptData.transcript.map((item: any) => item.text).join(' ');
          console.log("Transcript extracted successfully, length:", transcript.length);
        }
      }
    } catch (e) {
      console.log("RapidAPI transcript fetch failed, trying alternative method:", e);
    }

    // Fallback: Fetch video page for basic metadata
    if (!transcript) {
      try {
        const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        if (pageResponse.ok) {
          const html = await pageResponse.text();
          
          // Extract title
          const titleMatch = html.match(/"title":"([^"]+)"/);
          if (titleMatch) {
            videoTitle = titleMatch[1].replace(/\\u0026/g, '&');
          }
          
          // Extract description as fallback content
          const descMatch = html.match(/"description":{"simpleText":"([^"]+)"}/);
          if (descMatch) {
            transcript = descMatch[1].substring(0, 2000);
          }
        }
      } catch (e) {
        console.error("Failed to fetch video page:", e);
      }
    }

    if (!transcript || transcript.length < 50) {
      transcript = `YouTube video: ${videoTitle}. Full transcript not available. Please watch the video directly to extract insights.`;
    }

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
          model: "google/gemini-2.5-pro",
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
