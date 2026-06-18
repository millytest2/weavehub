import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { audio, mimeType } = await req.json();

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'No audio data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Gemini multimodal via Lovable AI Gateway for transcription
    // (the gateway does not expose /v1/audio/transcriptions)
    const audioMime = mimeType || 'audio/webm';
    const dataUrl = `data:${audioMime};base64,${audio}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a speech-to-text transcriber. Return ONLY the verbatim transcription of the audio with no commentary, no quotes, no formatting. If there is no speech, return an empty string.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe this audio verbatim.' },
              { type: 'input_audio', input_audio: { data: dataUrl, format: audioMime.includes('mp4') ? 'mp4' : 'webm' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Transcription error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Transcription unavailable`, fallback: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim() || '';

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Voice transcribe error:', error);
    return new Response(
      JSON.stringify({ error: error.message, fallback: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
