import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function checkRateLimit(
  userId: string,
  functionName: string,
  maxRequests: number = 20,
  windowMinutes: number = 60
): Promise<{ allowed: boolean; remaining?: number }> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_function_name: functionName,
    p_max_requests: maxRequests,
    p_window_minutes: windowMinutes
  });

  if (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow request if rate limit check fails
    return { allowed: true };
  }

  return { allowed: data === true };
}

export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ 
      error: "Rate limit exceeded. Maximum 20 requests per hour. Please try again later." 
    }),
    { 
      status: 429, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
}
