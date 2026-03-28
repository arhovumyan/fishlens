import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt } = body;
  if (!prompt) {
    return Response.json({ error: "No prompt provided" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey || apiKey.startsWith("your_")) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[imagegen] Gemini failed:", res.status, err);
      return Response.json({ error: "Image generation failed", detail: err }, { status: 502 });
    }

    const data = await res.json();
    const imagePart = data?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType: string; data: string } }) =>
        p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart?.inlineData) {
      console.error("[imagegen] No image in response:", JSON.stringify(data).slice(0, 500));
      return Response.json({ error: "No image generated" }, { status: 502 });
    }

    return Response.json({
      image: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    });
  } catch (err) {
    console.error("[imagegen] Error:", err);
    return Response.json({ error: "Image generation failed" }, { status: 500 });
  }
}
