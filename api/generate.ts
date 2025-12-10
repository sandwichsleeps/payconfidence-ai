import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY in server env");
      return res.status(500).json({ error: "API Key missing" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const inputText = req.body?.text;
    if (!inputText) {
      return res.status(400).json({ error: "Missing text field" });
    }

    const result = await model.generateContent({
      contents: [{
        parts: [{ text: inputText }]
      }]
    });

    const review = result.response.text() || "No response text received";

    res.status(200).json({ review });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Unknown error" });
  }
}
