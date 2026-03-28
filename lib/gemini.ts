import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function generateExplanation(prompt: string): Promise<string> {
  const t0 = performance.now();
  console.log(`[gemini] generateExplanation — prompt length: ${prompt.length}`);
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log(
      `[gemini] generateExplanation — done in ${Math.round(performance.now() - t0)}ms`
    );
    return text;
  } catch (err) {
    console.error("[gemini] generateExplanation failed:", err);
    return "Explanation unavailable. Please try again.";
  }
}

export async function* generateExplanationStream(
  prompt: string
): AsyncGenerator<string> {
  const t0 = performance.now();
  console.log(
    `[gemini] generateExplanationStream — prompt length: ${prompt.length}`
  );
  try {
    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
    console.log(
      `[gemini] generateExplanationStream — done in ${Math.round(performance.now() - t0)}ms`
    );
  } catch (err) {
    console.error("[gemini] generateExplanationStream failed:", err);
    yield "Explanation unavailable. Please try again.";
  }
}
