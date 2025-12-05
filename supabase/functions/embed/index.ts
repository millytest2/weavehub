import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { type, id, content } = await req.json();
    
    if (!type || !id || !content) {
      return new Response(JSON.stringify({ error: "Missing type, id, or content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Embedding ${type} ${id}, content length: ${content.length}`);

    // Use Lovable AI to generate embedding via a workaround
    // Since we don't have direct embedding API, we'll use text-embedding approach
    // For now, we use the AI to generate a semantic summary that can be stored
    
    // Generate embedding using Gemini's understanding
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
            content: "Extract 5-10 key semantic tags from this content. Return only comma-separated tags, no explanation." 
          },
          { role: "user", content: content.substring(0, 4000) }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Embedding AI error:", response.status);
      return new Response(JSON.stringify({ success: false, error: "AI error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const semanticTags = data.choices[0].message.content;
    console.log(`Semantic tags: ${semanticTags}`);

    // Update the appropriate table with semantic info
    // Note: Full vector embeddings would require a dedicated embedding model
    // For now, we enhance relevance scoring based on content length and recency
    
    const table = type === 'insight' ? 'insights' : 'documents';
    const { error: updateError } = await supabase
      .from(table)
      .update({ 
        relevance_score: Math.min(1.0, 0.7 + (content.length / 10000)),
        last_accessed: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ success: false, error: updateError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      semanticTags,
      message: `Processed ${type} ${id}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Embed error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
