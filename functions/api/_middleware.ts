interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function getClientIP(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin.endsWith(".imbila.ai") ||
    origin === "https://imbila.ai" ||
    origin.includes("localhost");

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://openai.imbila.ai",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction[] = [
  async (context) => {
    const { request } = context;
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Rate limiting
    const ip = getClientIP(request);
    const now = Date.now();
    const limit = parseInt(
      (context.env as Record<string, string>).RATE_LIMIT_PER_MINUTE || "20",
      10
    );

    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + 60_000 };
      rateLimitMap.set(ip, entry);
    }

    entry.count++;

    if (entry.count > limit) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }),
        {
          status: 429,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    // Clean up stale entries periodically
    if (rateLimitMap.size > 1000) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetTime) rateLimitMap.delete(key);
      }
    }

    const response = await context.next();

    // Attach CORS headers to the response
    const newResponse = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) {
      newResponse.headers.set(key, value);
    }

    return newResponse;
  },
];
