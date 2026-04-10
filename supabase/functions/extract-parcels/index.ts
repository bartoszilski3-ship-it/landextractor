import "@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "https://esm.sh/openai@4.56.0";

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const { images, prompt, schema } = await req.json();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...images.map((img: string) => ({
              type: "input_image",
              image_url: `data:image/jpeg;base64,${img}`,
              detail: "high",
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "parcel_data_array",
          schema,
          strict: true,
        },
      },
    });

    return new Response(
      JSON.stringify({ result: response.output_text }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});
