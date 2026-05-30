interface Env {
  AI: {
    run(
      model: string,
      options: {
        messages: Array<{ role: string; content: string }>;
      }
    ): Promise<{ response: string }>;
  };
}

interface AssessRequest {
  module: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let body: AssessRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { module } = body;

  if (!module) {
    return new Response(
      JSON.stringify({ error: "module is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const systemPrompt = `Generate a quiz for the OpenAI module: ${module}. Return ONLY valid JSON: {"questions": [{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct": 0, "explanation": "..."}]}. 4 practical questions about OpenAI tools and concepts.`;

  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a 4-question quiz for the module: ${module}`,
        },
      ],
      max_tokens: 1024,
    });

    let quiz;
    try {
      const responseText = result.response;
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*"questions"[\s\S]*\}/);
      if (jsonMatch) {
        quiz = JSON.parse(jsonMatch[0]);
      } else {
        quiz = JSON.parse(responseText);
      }
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse quiz. Please try again.",
          raw: result.response,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(quiz), {
      headers: { "Content-Type": "application/json" },
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
