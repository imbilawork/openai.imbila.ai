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
  lesson?: string;
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

  const { message, module, history = [], lesson } = body;

  if (!message || !module) {
    return new Response(
      JSON.stringify({ error: "message and module are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const lessonBlock = (lesson && typeof lesson === "string" && lesson.trim())
    ? `\n\nGROUNDING — this is the exact lesson the learner is reading right now. Treat it as the authoritative source and answer primarily from it:\n"""\n${lesson.slice(0, 6000)}\n"""\nIf a question goes beyond this lesson, say so briefly and steer back to the module. Never invent facts, APIs, model names, prices, or attributions that are not supported by this lesson or well-established public knowledge.`
    : "";

  const systemPrompt = `You are an AI tutor for the Imbila.AI OpenAI Academy. You teach mastery of ChatGPT, the OpenAI API, DALL-E, and AI agents. Currently teaching: ${module}. Be practical, demonstrate real prompt patterns, reference South African business use cases. Keep answers 2-3 paragraphs. If you are unsure or the lesson does not cover something, say so honestly rather than guessing.${lessonBlock}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  try {
    const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
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
