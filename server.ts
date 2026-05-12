import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // SaaS & Gemini Proxy Routes
  app.all("/api/*", async (req, res) => {
    const url = req.url;
    
    try {
      if (url.includes("/api/gemini")) {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
        }

        const { model, contents, config } = req.body;
        console.log(`Local Proxy: Calling Gemini model ${model}`);
        
        const response = await genAI.models.generateContent({
          model,
          contents: contents.contents || contents,
          config: config
        });

        return res.json(response);
      }

      if (url.includes("/api/tool/") || url.includes("/api/upload/")) {
        const targetUrl = `http://aibigtree.com${url}`;
        console.log(`Local Proxy: Forwarding to SaaS ${targetUrl}`);
        
        const saasResponse = await fetch(targetUrl, {
          method: req.method,
          headers: { "Content-Type": "application/json" },
          body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
        });

        const data = await saasResponse.json();
        return res.status(saasResponse.status).json(data);
      }

      res.status(404).json({ error: "API Route Not Found" });
    } catch (error: any) {
      console.error("Local Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Keep existing image generation route if needed, or unify it.
  // Given the user request, they want everything under /api to be handled by the proxy logic.
  // I'll group them for clarity.
  app.post("/api/images/generations", async (req, res) => {
    try {
      const gptKey = process.env.GPTKEY;
      if (!gptKey) {
        return res.status(500).json({ error: "GPTKEY is not configured in environment variables" });
      }

      console.log("Proxying request to GPT Image API...");
      
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gptKey}`
        },
        body: JSON.stringify(req.body)
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { raw: text };
      }
      
      if (!response.ok) {
        console.error(`GPT Image API Error (${response.status}):`, data);
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (error: any) {
      console.error("Backend Proxy Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/images/edits", async (req, res) => {
    try {
      const gptKey = process.env.GPTKEY;
      if (!gptKey) {
        return res.status(500).json({ error: "GPTKEY is not configured in environment variables" });
      }

      console.log("Proxying edit request to GPT Image API...");
      
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gptKey}`
        },
        body: JSON.stringify(req.body)
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { raw: text };
      }
      
      if (!response.ok) {
        console.error(`GPT Image API Edit Error (${response.status}):`, data);
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (error: any) {
      console.error("Backend Proxy Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
