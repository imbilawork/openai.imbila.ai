interface Env {
  AI: {
    run(
      model: string,
      options: {
        messages: Array<{ role: string; content: string }>;
        stream: boolean;
      }
    ): Promise<ReadableStream>;
  };
}

interface TutorRequest {
  message: string;
  module: string;
  history?: Array<{ role: string; content: string }>;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let body: TutorRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, module, history = [] } = body;

  if (!message || !module) {
    return new Response(
      JSON.stringify({ error: "message and module are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const systemPrompt = `You are an AI tutor for the Imbila.AI OpenAI Academy. You teach mastery of ChatGPT, the OpenAI API, DALL-E, and AI agents. Currently teaching: ${module}. Be practical, demonstrate real prompt patterns, reference South African business use cases. Keep answers 2-3 paragraphs. Encourage trying things in ChatGPT.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  try {
    const stream = await env.AI.run("@cf/google/gemma-3-12b-it", {
      messages,
      stream: true,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "AI model error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
