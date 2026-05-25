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
            text: "请对这张已经铺好地毯的房间场景图进行深度视觉分析。识别房间空间结构、地毯位置、材质纹理、光影方向、透视关系与整体装修风格，然后基于该图片自动生成一个约 10 秒的高质量动态展示视频所需的Veo Prompt。\n\n请保证英文提示词富有商业广告感，能描述多于一个单纯静止视角的运动画面：例如前段镜头拍摄一个优雅的亚洲女模特，穿着高质感的象牙白色家居服赤脚在地毯上轻缓漫步；中段平滑过渡到她慵懒舒适地坐在地毯上、靠在沙发边缘翻看设计图书；后段展现极高阶的摄影机环绕、缓慢推焦展示地毯与家具交界处的细腻反光纹理。同时确保其描述能让Veo模型绝对忠实保持原图中地毯的位置、形状、编织比例与整体奶油或雅致风格色彩。\n\n请严格按指定JSON schema输出您的分析与最终的Veo英文视频提示词。"
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
              veoPrompt: { type: "STRING", description: "Veo 视频生成英文提示词。必须是一段约 10 秒的商业高端家居广告提示词。要求包含优雅亚洲女模特（穿着象牙白或米色家居服）的光脚漫步与坐在地毯上看书/靠沙发休息等流畅连续动作；镜头需有深度的平移运镜（dolly-in / pan）、轻微轨道环绕（orbit）、景深渐显（depth of field shift）及微距绒毛工艺质感近景；强调绝对忠实保留原图中地毯的尺寸、纹理及透视位置关系。" }
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
          veoPrompt: "A high-end cinematic commercial showcasing a premium carpet in a modern living room. An elegant Asian female model in beige loungewear walks barefoot on the soft fibers, then relaxes while reading a design book on the rug. Slow dolly in, smooth camera orbit, warm volumetric lighting, photorealistic home atmosphere, ultra-high resolution."
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
