import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // AI Video Display API endpoints
  app.post("/api/video/generate", async (req, res) => {
    const { imageBase64, userId, toolId, aspectRatio } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured in secrets." });
      }

      console.log("Analyzing generated image first...");
      // Parse base64
      const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      const mimeType = imageBase64.includes(",") ? imageBase64.split(",")[0].match(/:(.*?);/)?.[1] || "image/jpeg" : "image/jpeg";

      const genAIClient = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      
      const analysisResponse = await genAIClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          {
            text: "请对这张已经铺好地毯的房间场景图进行深度视觉分析。识别房间空间结构、地毯位置、材质纹理、光影方向、透视关系与整体装修风格，并基于该图片生成一段约 10 秒的高端家居广告级 Veo Prompts。生成的视频必须包含多个高级镜头分镜切镜（避免单一长镜头），请给出包含多段分镜无缝衔接的完整英文描写：\n\n- 分镜 1 (0-3s)：全景推移建立镜头，摄像机平滑地以慢速移动或轨道推移，展示整个房间的设计和地毯铺设的完整空间感；\n- 分镜 2 (3-6s)：微距特写，切镜到地毯边缘及致密的毛绒材质、经纬编织纹理上，伴随柔和的侧向扫光，凸显顶级纤维厚实与高级质感；\n- 分镜 3 (6-8s)：低机位水平横向滑轨移动（Dolly Sweep），捕捉地毯与周围沙发、茶几等家具完美拼合的透视比例；\n- 分镜 4 (8-10s)：向后拉焦或抬升的优雅广角全景推拉，展示朝阳般和煦的自然光洒在地毯与全屋之上，氛围奢华高端。\n\n请严格按指定JSON schema输出您的分析与最终的Veo英文视频提示词（veoPrompt 应该包含这些分镜的合并连续描述，指定多镜头‘multi-shot cut’，‘cinematic editing’，‘high-end rug texture close-up’）。"
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              spatialStructure: { type: "STRING", description: "空间结构与透视关系分析" },
              carpetDetails: { type: "STRING", description: "地毯位置、花色设计与材质纹理分析" },
              themeStyle: { type: "STRING", description: "整体装修风格、家具搭配与光影方向分析" },
              veoPrompt: { type: "STRING", description: "Veo 视频生成英文提示词。必须是一段连贯的、包含多镜头切镜（Dolly zoom, direct cut to close up macros, horizontal rail tracking, premium luxury ambient lighting sweep）的商业家居大片风格文案。" }
            },
            required: ["spatialStructure", "carpetDetails", "themeStyle", "veoPrompt"]
          }
        }
      });

      const text = analysisResponse.text?.trim() || "{}";
      let parsedAnalysis: any = {};
      try {
        parsedAnalysis = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse analysis JSON, using fallbacks.", text);
        parsedAnalysis = {
          spatialStructure: "3D透视角度，地毯平铺于地面并延伸至沙发下方，视平线高度适中，具备良好的空间深度感。",
          carpetDetails: "地毯比例和大小合理，形状平整且四边与家具完美贴合。纤维编织紧密，纹理清洗，高度保持原作细节。",
          themeStyle: "现代雅致室内陈设，中性色彩格调为主，光线自左侧窗外照入，呈现柔和明暗和真实的自然投影效果。",
          veoPrompt: "A high-end cinematic commercial showcasing a premium carpet in a modern living room, slow dolly in, steady planning, soft warm lighting, photorealistic interior architectural photography, detailed fabric texture, UHD 4k"
        };
      }

      console.log("Visual analysis succeeded: ", parsedAnalysis);

      console.log("Triggering Veo model video generation with prompt:", parsedAnalysis.veoPrompt);
      
      // Determine the aspect ratio (landscape 16:9 or portrait 9:16)
      let videoRatio: "16:9" | "9:16" = "16:9";
      if (aspectRatio === "9:16" || aspectRatio === "3:4") {
        videoRatio = "9:16";
      }

      const operation = await genAIClient.models.generateVideos({
        model: "veo-3.1-lite-generate-preview",
        prompt: parsedAnalysis.veoPrompt,
        image: {
          imageBytes: base64Data,
          mimeType: mimeType
        },
        config: {
          numberOfVideos: 1,
          resolution: "1080p",
          aspectRatio: videoRatio
        }
      });

      console.log("Veo operation launched:", operation.name);

      return res.json({
        success: true,
        operationName: operation.name,
        visualAnalysis: {
          spatialStructure: parsedAnalysis.spatialStructure,
          carpetDetails: parsedAnalysis.carpetDetails,
          themeStyle: parsedAnalysis.themeStyle
        },
        promptUsed: parsedAnalysis.veoPrompt
      });

    } catch (error: any) {
      console.error("Video Generation Route Failed:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred during video generation."
      });
    }
  });

  app.post("/api/video/status", async (req, res) => {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: "operationName is required" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
      }

      const genAIClient = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await genAIClient.operations.getVideosOperation({ operation: op });
      
      console.log(`Veo video operation lookup: ${operationName}. Done: ${updated.done}`);
      
      res.json({
        success: true,
        done: updated.done,
        error: updated.error
      });
    } catch (error: any) {
      console.error("Video Status Route Failed:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

  app.get("/api/video/stream", async (req, res) => {
    const { operationName } = req.query;
    if (!operationName || typeof operationName !== "string") {
      return res.status(400).send("operationName query parameter is required");
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).send("GEMINI_API_KEY is not configured");
      }

      const genAIClient = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await genAIClient.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) {
        return res.status(404).send("Video content not found or generation not completed.");
      }

      console.log(`Downloading compiled video from Veo Storage: ${uri}`);
      const videoRes = await fetch(uri, {
        headers: { 'x-goog-api-key': apiKey },
      });

      if (!videoRes.ok) {
        return res.status(videoRes.status).send(`Failed to fetch video from google storage: ${videoRes.statusText}`);
      }

      res.setHeader('Content-Type', 'video/mp4');
      
      if (videoRes.body) {
        const arrayBuffer = await videoRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } else {
        res.status(500).send("Failed to capture video body stream");
      }
    } catch (error: any) {
      console.error("Video Download Route Failed:", error);
      res.status(500).send(`Stream error: ${error.message}`);
    }
  });

  // SaaS & Gemini Proxy Routes
  app.all("/api/*", async (req, res) => {
    const url = req.url;
    
    try {
      if (url.includes("/api/gemini")) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
        }

        const genAI = new GoogleGenAI({ apiKey });
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
        
        const headers: any = {
          "Content-Type": req.headers["content-type"] || "application/json",
        };
        if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];

        const isJson = headers["Content-Type"]?.includes("application/json");

        const saasResponse = await fetch(targetUrl, {
          method: req.method,
          headers: headers,
          body: req.method !== "GET" ? (isJson ? JSON.stringify(req.body) : (req as any)) : undefined,
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
