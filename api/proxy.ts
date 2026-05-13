import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // 1. CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const url = req.url || "";
  console.log(`Incoming request: ${req.method} ${url}`);

  try {
    // 2. Handle /api/gemini
    if (url.includes("/api/gemini")) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Server Error: GEMINI_API_KEY is not configured" });
      }

      const genAI = new GoogleGenAI({ apiKey });
      const { model, contents, config } = req.body;
      console.log(`Gemini Proxy: Calling model ${model}`);

      // We use the direct fetch or SDK as needed. Since it's a proxy, let's use the SDK way for better handling.
      const response = await genAI.models.generateContent({
        model,
        contents: contents.contents || contents,
        config: config
      });

      return res.status(200).json(response);
    }

    // 3. Handle /api/tool/* and /api/upload/* Proxy to SaaS
    if (url.includes("/api/tool/") || url.includes("/api/upload/")) {
      const targetPath = url.startsWith("/api") ? url : `/api${url}`;
      const targetUrl = `http://aibigtree.com${targetPath}`;
      console.log(`SaaS Proxy: Forwarding to ${targetUrl}`);

      const saasResponse = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      });

      const saasData = await saasResponse.json();
      return res.status(saasResponse.status).json(saasData);
    }

    // 4. Handle GPT Image API
    if (url.includes("/api/images/")) {
      const gptKey = process.env.GPTKEY;
      if (!gptKey) {
        return res.status(500).json({ error: "Server Error: GPTKEY is not configured" });
      }

      const endpoint = url.includes("generations") 
        ? "https://api.openai.com/v1/images/generations" 
        : "https://api.openai.com/v1/images/edits";

      console.log(`OpenAI Proxy: Calling ${endpoint}`);

      const gptResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gptKey}`
        },
        body: JSON.stringify(req.body)
      });

      const gptData = await gptResponse.json();
      return res.status(gptResponse.status).json(gptData);
    }

    // Default 404
    res.status(404).json({ error: "API Route Not Found" });
  } catch (error: any) {
    console.error("API Proxy Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
