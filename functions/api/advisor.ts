// POST /api/advisor — the Imbila.AI Academy Advisor (OpenAI track).
// A grounded recommender: given a learner's goal, it suggests a personalised path
// ONLY from a committed, vetted resource catalog (resources.json) — never inventing
// links — and adds Imbila's point of view. Streams via Cloudflare Workers AI.

import catalog from "../../resources.json";

interface Env {
  AI: any;
}

interface AdvisorRequest {
  goal: string;
  history?: Array<{ role: string; content: string }>;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: AdvisorRequest;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const goal = (body.goal || "").toString().trim();
  if (!goal) {
    return Response.json({ error: "goal is required" }, { status: 400 });
  }

  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  const resourceList = (catalog as any).resources
    .map(
      (r: any) =>
        `- ${r.title} | ${r.url} | ${r.kind}, ${r.level}, ${r.cost} | topics: ${(r.topics || []).join(", ")} | use when: ${r.whenToUse}`
    )
    .join("\n");

  const systemPrompt = `You are the Imbila.AI Academy Advisor for the ${(catalog as any).academy} track.
Imbila's positioning: ${(catalog as any).pov}

You recommend a personalised learning path STRICTLY from the resource catalog below. Rules:
- Recommend ONLY resources from this catalog. NEVER invent or link to anything not listed. Use each resource's exact title and URL.
- Format every recommendation as a markdown link: [Title](URL).
- Given the learner's goal/role/level, reply with: (1) one short sentence acknowledging their goal, then (2) a numbered, ordered path of 3-5 steps, each = a resource link + one line on why/when, then (3) a one-line next step.
- Be honest about cost (free / free tier / paid). Keep it concise and practical. Use South African business context where natural.
- If they want a guided, interactive Imbila course rather than self-serve links, point them to the Imbila Claude 4D Academy. If they want to build/deploy in production, point them to 2nth.ai.
- If the question is not about learning or using OpenAI, gently steer back.

RESOURCE CATALOG:
${resourceList}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: goal },
  ];

  try {
    const stream = await context.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages,
      stream: true,
      max_tokens: 900,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    return Response.json({ error: "Advisor unavailable", detail: err.message || "unknown" }, { status: 502 });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
