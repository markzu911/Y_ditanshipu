import { GenerateContentResponse } from "@google/genai";

/**
 * Proxy function to call Gemini API through the backend
 */
async function callGeminiApi(model: string, contents: any, config?: any): Promise<GenerateContentResponse> {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      contents,
      config
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `Server error: ${response.status}`);
  }

  const data = await response.json();
  
  // Rehydrate the 'text' property which is usually a getter in the SDK
  if (data.candidates && data.candidates[0]?.content?.parts) {
    Object.defineProperty(data, 'text', {
      get: function() {
        return this.candidates[0].content.parts.find((p: any) => p.text)?.text;
      }
    });
  }

  return data;
}

/**
 * Utility function to handle retries for API calls, specifically for 503 errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Extract error information for checking
      const errorMessage = error?.message || (typeof error === 'string' ? error : '');
      const errorCode = error?.status || error?.error?.code || error?.code;
      const errorContent = JSON.stringify(error).toLowerCase();
      
      const isUnavailable = 
        errorMessage.includes("503") || 
        errorMessage.includes("high demand") ||
        errorMessage.includes("unavailable") ||
        errorCode === 503 ||
        errorContent.includes("high demand") ||
        errorContent.includes("spikes in demand");
      
      if (isUnavailable && i < maxRetries) {
        const delay = initialDelay * Math.pow(2, i) + Math.random() * 2000;
        console.warn(`Gemini Model Busy (${errorCode || '503'}). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Validates if the provided image is a room/interior space.
 */
export async function validateIsRoom(imageBase64: string): Promise<{ isValid: boolean; reason?: string }> {
  return withRetry(async () => {
    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg",
          },
        },
        {
          text: "Analyze this image. Is it a photo of a room or an interior living space (like a living room, bedroom, etc.)? Answer in JSON format: { \"isValid\": boolean, \"reason\": \"string (brief explanation in Chinese if invalid)\" }",
        },
      ],
    });
    const text = response.text || '{"isValid": false}';
    try {
      const jsonStr = text.match(/\{.*\}/s)?.[0] || '{"isValid": false}';
      return JSON.parse(jsonStr);
    } catch (e) {
      return { isValid: text.toLowerCase().includes("true") };
    }
  });
}

/**
 * Validates if the provided image is a carpet or rug.
 */
export async function validateIsCarpet(imageBase64: string): Promise<{ isValid: boolean; reason?: string }> {
  return withRetry(async () => {
    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg",
          },
        },
        {
          text: "Analyze this image. Is it a photo primarily showing a carpet, rug, or textile floor covering? Answer in JSON format: { \"isValid\": boolean, \"reason\": \"string (brief explanation in Chinese if invalid)\" }",
        },
      ],
    });
    const text = response.text || '{"isValid": false}';
    try {
      const jsonStr = text.match(/\{.*\}/s)?.[0] || '{"isValid": false}';
      return JSON.parse(jsonStr);
    } catch (e) {
      return { isValid: text.toLowerCase().includes("true") };
    }
  });
}

export async function analyzeRoom(base64Image: string): Promise<string> {
  return withRetry(async () => {
    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
        {
          text: "请分析这张房间场景图。请从以下三个维度提供专业的分析报告：\n- 房间布局：描述空间结构、门窗位置及视角。\n- 房间家具：列出主要家具、位置及材质。\n- 装修风格：流派及色彩调性。\n\n要求：不要使用 Markdown 格式（如 # 或 **），不要换行过多，请使用简短的短句。直接输出内容。",
        },
      ],
    });
    return response.text || "未能分析出房间详细特征";
  });
}

export async function analyzeCarpet(base64Image: string): Promise<string> {
  return withRetry(async () => {
    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
        {
          text: "请分析这张地毯图片。主要内容：\n- 材质与边缘：简述材质特点，并明确说明边缘是否有流苏 (Fringes/Tassels) 或为无流苏的平整边缘 (Clean edges).\n- 视觉：描述颜色和图案。\n\n要求：不要使用 Markdown 格式，保持绝对简练，直接输出两栏分析。",
        },
      ],
    });
    return response.text || "未能分析出地毯特征";
  });
}

export async function generateResultPrompt(
  roomAnalysis: string, 
  carpetAnalysis: string, 
  isUploadedRoom: boolean,
  saasContext?: string,
  saasPrompt?: string[]
): Promise<string> {
  return withRetry(async () => {
    // Check if it's "Cream Style" to provide a very specific high-end description
    const isCreamStyle = roomAnalysis.includes("奶油风") || roomAnalysis.includes("Creamy") || roomAnalysis.includes("Cream Style");
    
    let specificStyleContext = "";
    if (isCreamStyle) {
      specificStyleContext = `
      IMPORTANT STYLE DIRECTION (Creamy Style / 奶油风):
      - Architectural Features: Walls with elegant French decorative moldings (wainscoting), pristine creamy white paint. Arched doorways or windows.
      - Flooring: Light-colored wood flooring in a Herringbone or Chevron pattern.
      - Furniture: A iconic ivory-colored Togo-style tufted sofa (very important). A minimalist low-profile white coffee table. 
      - Lighting & Decor: A distinctive tall, wavy floor lamp (squiggled shape) providing soft ambient light. 
      - Vibe: Artistic, warm, sophisticated, and extremely clean.
      `;
    }

    const keywords = saasPrompt && saasPrompt.length > 0 ? `Supplemental Keywords: ${saasPrompt.join(", ")}` : "";

    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          text: `基于以下分析和SaaS平台提供的内容，请生成一段详细的英文提示词（Prompt），用于AI生图。
      
房间分析：${roomAnalysis}
地毯分析：${carpetAnalysis}
${saasContext ? `SaaS内容主体：${saasContext}` : ""}
${keywords}
${specificStyleContext}

生图核心要求（必须严格遵守）：
1. ${isUploadedRoom ? "生成的场景必须严格克隆（Strictly Clone）原房间照片的布局、家具、门窗 and 建筑结构。禁止添加或移动大型家具。" : "请基于上述风格分析构建一个全新的、高水准的室内场景。"}
2. 地毯比例（CRITICAL）：地毯必须占据地板上合理且显眼的比例，通常应延伸至沙发下方并位于茶几中心，比例需与家具大小完美协调，避免出现过小或比例失调的情况。
3. 地毯一致性：图案、颜色和纹理必须与地毯分析描述 100% 吻合。它是画面中的绝对核心。
4. 采用专业室内摄影风格（High-end Architectural Photography），光影自然。
5. 只返回生成的英文提示词，不要有其他描述。`
        }
      ]
    });
    return response.text || "A beautiful room with the specified carpet.";
  });
}

export interface GenerationParams {
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  imageSize: "512px" | "1K" | "2K" | "4K";
  model: string;
  filter?: "none" | "natural" | "cinematic" | "warm" | "modern" | "film";
  hasModel?: boolean;
  modelGender?: "female" | "male";
  modelAge?: "child" | "youth" | "elder";
  modelEthnicity?: "asian" | "european" | "african" | "indian" | "latin";
}

/**
 * Helper to get lighting and atmosphere instructions based on filter selection
 */
function getFilterInstruction(filter?: string, isDetail: boolean = false) {
  if (isDetail) {
    switch (filter) {
      case "natural": return "Lighting: Natural daylight, clear contrast, real color reproduction, high clarity.";
      case "cinematic": return "Lighting: Professional studio lighting with soft shadows, high dynamic range, subtle bloom on highlights.";
      case "warm": return "Lighting: Warm kelvin temperature (3000K), golden highlights, cozy atmospheric glow.";
      case "modern": return "Lighting: Bright balanced daylight, high-key photography, clean clinical aesthetics.";
      case "film": return "Style: Analog photography, Kodak Portra color science, subtle film grain, organic texture.";
      default: return "Output Style: Ultra-high definition professional product macro photography.";
    }
  }
  
  switch (filter) {
    case "natural": return "Lighting: Hyper-realistic natural sunlight, ray-tracing shadows, global illumination, neutral balance.";
    case "cinematic": return "Lighting: Cinematic teal and orange color grading, soft anamorphic lens flare, deep shadows, high-end commercial look.";
    case "warm": return "Lighting: Golden hour (magic hour) sunset light, warm amber tones, heavy sun-kissed highlights, cozy vibe.";
    case "modern": return "Lighting: Minimalist bright studio lighting, cold white balance (6500K), crisp contrast, ultra-modern architectural style.";
    case "film": return "Style: Vintage 35mm film look, authentic grain, slightly faded blacks, rich organic saturation, retro aesthetic.";
    default: return "Atmosphere: High-end architectural photography, natural lighting, crisp details.";
  }
}

export async function generateCarpetFitting(
  roomBase64: string | null,
  carpetBase64: string,
  prompt: string,
  params: GenerationParams
): Promise<string | null> {
  return withRetry(async () => {
    const images: { image_url: string }[] = [];
    
    if (roomBase64) {
      images.push({
        image_url: roomBase64.startsWith('data:') ? roomBase64 : `data:image/jpeg;base64,${roomBase64}`
      });
    }

    images.push({
      image_url: carpetBase64.startsWith('data:') ? carpetBase64 : `data:image/jpeg;base64,${carpetBase64}`
    });

    const filterStyle = getFilterInstruction(params.filter, false);

    const fullPrompt = `Generate a photorealistic interior scene. 
      
      CRITICAL VIRTUAL FITTING INSTRUCTIONS: 
      1. ASSET & SHAPE PRESERVATION: The carpet from Image 2 is a FIXED ASSET. You MUST maintain its EXACT geometric shape and COMPLETE appearance. Restoring its original style, pattern, and color 100% is mandatory. DO NOT create irregular, warped, or organic curved edges.
      2. PERSPECTIVE INTEGRATION: The carpet MUST be laid perfectly flat on the floor following the room's 3D perspective. If rectangular, it should appear as a sharp, clean geometric trapezoid in the scene, NOT an irregular blob.
      3. ZERO HALLUCINATION: NO alterations to pattern, weave, motifs, or colors. ABSOLUTELY NO adding of fringes, tassels, or edge details that do not exist in the original Image 2.
      ${roomBase64 ? 
        "4. STYLE INSPIRATION: Analyze the decoration style, color palette, and furniture aesthetic in Image 1. Generate a COMPLETELY NEW, high-end interior scene that matches this EXACT STYLE. Do not modify Image 1 directly." : 
        "4. SCENE CREATION: CREATE a high-end interior scene matching the exact style described."
      }
      5. INTEGRATION: Place the carpet from Image 2 into this generated scene.
      
      CARPET PROPORTION & PLACEMENT: 
      - The carpet MUST occupy a realistic and significant portion of the floor space. 
      - It must be scaled PROPORTIONALLY - do not stretch or skew.
      - Geometric edges must be perfectly straight and sharp.
      
      STYLING DIRECTIVE: 
      - Detailed Prompt: ${prompt}. 
      - ${filterStyle}`;

    const parts: any[] = [];
    
    if (roomBase64) {
      parts.push({
        inlineData: {
          data: roomBase64.includes(",") ? roomBase64.split(",")[1] : roomBase64,
          mimeType: "image/jpeg"
        }
      });
    }
    
    parts.push({
      inlineData: {
        data: carpetBase64.includes(",") ? carpetBase64.split(",")[1] : carpetBase64,
        mimeType: "image/jpeg"
      }
    });
    
    parts.push({ text: fullPrompt });

    const response = await callGeminiApi(params.model, { parts }, {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize === "512px" ? "512px" : 
                   params.imageSize === "2K" ? "2K" :
                   params.imageSize === "4K" ? "4K" : "1K"
      }
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (imagePart?.inlineData?.data) {
      return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    }
    throw new Error("No image generated by Gemini model");
  });
}

export async function generateCarpetModelFrontal(
  roomBase64: string | null,
  carpetBase64: string,
  prompt: string,
  params: GenerationParams
): Promise<string | null> {
  return withRetry(async () => {
    const filterStyle = getFilterInstruction(params.filter, false);
    const genderText = params.modelGender === "male" ? "male" : "female";
    let ageText = "young";
    if (params.modelAge === "child") ageText = "child (approx 7-10 years old)";
    else if (params.modelAge === "elder") ageText = "senior (approx 60-70 years old)";
    else ageText = "young adult";

    let ethnicityText = "Asian";
    if (params.modelEthnicity === "european") ethnicityText = "European/Western";
    else if (params.modelEthnicity === "african") ethnicityText = "African";
    else if (params.modelEthnicity === "indian") ethnicityText = "Indian";
    else if (params.modelEthnicity === "latin") ethnicityText = "Latin American";

    const fullPrompt = `Task: Generate a HIGH-END FRONTAL LIFESTYLE PHOTOGRAPHY shot.
      
      SCENE & MODEL SPECIFICATION:
      - Perspective: EYE-LEVEL FRONTAL VIEW (Sitting on the floor/carpet).
      - Model Action: A ${ageText} ${genderText} model (${ethnicityText}) is sitting elegantly and comfortably directly ON the carpet. 
      - Pose: The model could be leaning against a sofa or sitting cross-legged, looking relaxed. The expression is warm and inviting.
      - Outfit: Elegant, high-quality ivory or soft beige loungewear.
      
      CRITICAL FIDELITY MANDATE:
      1. ANATOMICAL ACCURACY: The model MUST have exactly two arms and two legs in a natural human pose. Ensure realistic human anatomy. No extra fingers, limbs, or distorted body parts.
      2. CARPET SHAPE & STYLE INTEGRITY: The carpet from Image 2 is the SOURCE OF TRUTH. You MUST maintain its EXACT PERIMETER SHAPE and ORIGINAL STYLE. Restoring every detail of the original pattern and color 100% is mandatory. DO NOT warp edges.
      3. ZERO HALLUCINATION: ABSOLUTELY NO adding of fringes, tassels, or any edge treatments or patterns that are not present in Image 2. It must be a perfect restoration of the source asset.
      4. PERSPECTIVE: The carpet must be perfectly flat on the floor with sharp, straight geometric edges that follow the floor's perspective alignment.
      ${roomBase64 ? 
        "5. STYLE REPLICATION: Replicate the EXACT interior design style, materials, and lighting mood from Image 1. Generate a NEW scene that feels like the same designer created it." : 
        "5. SCENE CREATION: CREATE a high-end interior scene matching the described style."
      }
      
      STYLING DIRECTIVE: 
      - Atmosphere: Warm, cozy, sophisticated, and realistic.
      - Context: ${prompt}. 
      - ${filterStyle}
      - NO text, NO labels, NO logos.`;

    const parts: any[] = [];
    
    if (roomBase64) {
      parts.push({
        inlineData: {
          data: roomBase64.includes(",") ? roomBase64.split(",")[1] : roomBase64,
          mimeType: "image/jpeg"
        }
      });
    }
    
    parts.push({
      inlineData: {
        data: carpetBase64.includes(",") ? carpetBase64.split(",")[1] : carpetBase64,
        mimeType: "image/jpeg"
      }
    });
    
    parts.push({ text: fullPrompt });

    const response = await callGeminiApi(params.model, { parts }, {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize === "512px" ? "512px" : 
                   params.imageSize === "2K" ? "2K" :
                   params.imageSize === "4K" ? "4K" : "1K"
      }
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (imagePart?.inlineData?.data) {
      return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    }
    throw new Error("No image generated by Gemini model");
  });
}

export async function generateCarpetDetail(
  carpetBase64: string,
  carpetAnalysis: string,
  params: GenerationParams
): Promise<string | null> {
  return withRetry(async () => {
    const images = [{
      image_url: carpetBase64.startsWith('data:') ? carpetBase64 : `data:image/jpeg;base64,${carpetBase64}`
    }];

    const filterStyle = getFilterInstruction(params.filter, true);

    const fullPrompt = `Task: Generate a PIXEL-PERFECT 2x2 PROFESSIONAL MACRO SHOWCASE GRID for the EXACT carpet shown in the reference image.
            
            CRITICAL FIDELITY MANDATE (ZERO TOLERANCE FOR HALLUCINATION):
            - 100% FAITHFUL REPRODUCTION: This is a TECHNICAL inspection view. You MUST restore the original carpet's appearance exactly. No changes to pattern, color, or texture.
            - NO INVENTED DETAILS: You MUST NOT add any patterns, motifs, borders, fringes, or tassels that do NOT exist in the source image. If the original has clean edges, the detail view MUST have clean edges. ABSOLUTELY NO FRINGES ALLOWED if the source image shows a bound/clean edge.
            - 1:1 CORRESPONDENCE: Every motif, line, and color must be a high-resolution replica of the original source. 
            - DO NOT INVENT: Do not create "matching" details or extend patterns in ways not clearly visible in the source.
            - TEXTURE ACCURACY: Replicate the EXACT weave density, pile height, and material sheen seen in the source.

            Strict Layout Requirement:
            The output MUST be a single image divided into a 2x2 grid:
            - Top-Left: SURFACE FIBER WEAVE (Macro shot of the EXACT pile and fiber density of the provided carpet).
            - Top-Right: PATTERN INTRICACY (Extreme macro detail of the SPECIFIC motifs found in the source image. Must be a 100% identical replica).
            - Bottom-Left: EDGE-LOCKING (Macro view of the edge finishing. Replicate the EXACT edge style/stitching seen in the source. If the source image has NO fringes, you are FORBIDDEN from adding any).
            - Bottom-Right: MATERIAL TEXTURE (Focus on the EXACT sheen, pile height, and material quality of the source).
            
            Strict Negative Constraints:
            - NO NEW MOTIFS or designs.
            - NO ADDED FRINGES/TASSELS.
            - NO COLOR SHIFTS or artistic enhancements.
            - NO STYLE "IMPROVEMENTS".
            - NO ARTISTIC INTERPRETATION or imaginary extensions of patterns.
            - NO LABELS, TEXT, OR HUMANS.
            
            Source Context: ${carpetAnalysis}.
            ${filterStyle}`;

    const parts: any[] = [];
    
    parts.push({
      inlineData: {
        data: carpetBase64.includes(",") ? carpetBase64.split(",")[1] : carpetBase64,
        mimeType: "image/jpeg"
      }
    });
    
    parts.push({ text: fullPrompt });

    const response = await callGeminiApi(params.model, { parts }, {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize === "512px" ? "512px" : 
                   params.imageSize === "2K" ? "2K" :
                   params.imageSize === "4K" ? "4K" : "1K"
      }
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (imagePart?.inlineData?.data) {
      return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    }
    throw new Error("No image generated by Gemini model");
  });
}

export async function generateCarpetModelInteraction(
  roomBase64: string | null,
  carpetBase64: string,
  prompt: string,
  params: GenerationParams
): Promise<string | null> {
  return withRetry(async () => {
    const filterStyle = getFilterInstruction(params.filter, false);
    const genderText = params.modelGender === "male" ? "male" : "female";
    let ageText = "young";
    if (params.modelAge === "child") ageText = "child (approx 7-10 years old)";
    else if (params.modelAge === "elder") ageText = "senior (approx 60-70 years old)";
    else ageText = "young adult";

    let ethnicityText = "Asian";
    if (params.modelEthnicity === "european") ethnicityText = "European/Western";
    else if (params.modelEthnicity === "african") ethnicityText = "African";
    else if (params.modelEthnicity === "indian") ethnicityText = "Indian";
    else if (params.modelEthnicity === "latin") ethnicityText = "Latin American";

    const fullPrompt = `Task: Generate a HIGH-END TOP-DOWN (OVERHEAD) LIFESTYLE PHOTOGRAPHY shot of the carpet.
      
      SCENE & MODEL SPECIFICATION:
      - Perspective: STRICT TOP-DOWN / FLAT LAY VIEW (Bird's eye view looking straight down at the floor).
      - Model Action: A ${ageText} ${genderText} model (${ethnicityText}) is sitting or lying gracefully on the carpet. The model is engaged with a high-quality open interior design book or magazine.
      - Pose: Part of the model's limbs and hair are visible from the overhead angle.
      - Outfit: Elegant, clean ivory or soft beige loungewear.
      - ROOM CONTEXT: The carpet MUST NOT be in a void. Include surrounding furniture elements visible from above, such as the corner of a sofa, part of a coffee table, or a side table to anchor the carpet in a real room.
      
      CRITICAL FIDELITY MANDATE:
      1. ANATOMICAL ACCURACY: The model MUST have exactly two arms and two legs in a natural overhead pose. Ensure realistic human anatomy. No extra fingers, limbs, or distorted body parts.
      2. CARPET SHAPE & PATTERN INTEGRITY: The carpet from Image 2 is the SOURCE OF TRUTH. You MUST maintain its EXACT GEOMETRIC SHAPE and 100% ORIGINAL PATTERN/COLOR. No modifications allowed.
      3. ZERO Hallucination: DO NOT add fringes, tassels, or any edge details that are not in Image 2. The edges must be an exact match to the source asset.
      4. REALISTIC INTEGRATION: The rectangular carpet must be perfectly flat on the floor with clean, STRAIGHT edges. No irregular or organic warping of the rug boundary is allowed.
      ${roomBase64 ? 
        "5. STYLE HARMONY: Replicate the EXACT design style, wood tones, and fabric textures seen in Image 1. The furniture (sofa edges, tables) must match the aesthetic of the uploaded room." : 
        "5. FURNITURE CREATION: Create high-end, complementary architectural furniture (sofa edges, designer coffee table) to place around the carpet."
      }
      
      STYLING DIRECTIVE: 
      - Atmosphere: Bright, airy, minimalist, and luxury.
      - Context: ${prompt}. 
      - ${filterStyle}
      - NO text, NO labels, NO logos on the image.`;

    const parts: any[] = [];
    
    if (roomBase64) {
      parts.push({
        inlineData: {
          data: roomBase64.includes(",") ? roomBase64.split(",")[1] : roomBase64,
          mimeType: "image/jpeg"
        }
      });
    }
    
    parts.push({
      inlineData: {
        data: carpetBase64.includes(",") ? carpetBase64.split(",")[1] : carpetBase64,
        mimeType: "image/jpeg"
      }
    });
    
    parts.push({ text: fullPrompt });

    const response = await callGeminiApi(params.model, { parts }, {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize === "512px" ? "512px" : 
                   params.imageSize === "2K" ? "2K" :
                   params.imageSize === "4K" ? "4K" : "1K"
      }
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (imagePart?.inlineData?.data) {
      return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    }
    throw new Error("No image generated by Gemini model");
  });
}

/**
 * Parses user parameters from natural language chat input
 */
export async function parseParamsFromText(
  text: string,
  currentParams: GenerationParams
): Promise<{
  updatedParams: GenerationParams;
  shouldStart: boolean;
  feedback: string;
}> {
  return withRetry(async () => {
    const promptText = `你是一个智能地毯铺装渲染助手。现在用户通过对话输入了一段关于渲染参数（如比例、清晰度、摄影滤镜、是否需要模特、模特性别、年龄、人种等）或开启渲染的指令。
当前渲染参数如下：
${JSON.stringify(currentParams)}

可选参数选项及映射关系：
1. aspectRatio (比例): "1:1", "4:3", "3:4", "9:16", "16:9" (例如"宽屏","电视比例"映射到"16:9"，"竖屏","手机屏"映射到"9:16")
2. imageSize (清晰度): "1K", "2K", "4K" ("高清","一般"->"1K", "超清"->"2K", "极清","超高质量"->"4K")
3. filter (摄影滤镜): "natural" (自然), "cinematic" (电影), "warm" (午后/温馨), "modern" (现代/时尚), "film" (胶片/复古), "none" (无/默认)
4. hasModel (是否需要人/模特): true/false (如果用户说"不需要人"、"不要模特"、"去掉人"、"只要场景"则设为 false；如果用户提到了添加模特、或者是描述了模特特征，比如"加个女人"、"要小孩"、"找个亚裔"等，则必须设为 true)
5. modelGender (模特性别): "female" (女性), "male" (男性)
6. modelAge (模特年龄段): "child" (儿童), "youth" (青年), "elder" (老年/长者)
7. modelEthnicity (模特人种): "asian" (亚裔/中国人), "european" (欧美/白人), "african" (非裔/黑人), "indian" (印裔), "latin" (拉美裔)

指令解析规则：
- 解析用户的自然语言，将提到的任何参数修改并更新到 updatedParams 中。未提及的参数保持 currentParams 的原值不变。
- 额外判断 shouldStart (是否开始渲染): 如果用户表达了"开始"、"生成"、"渲染"、"铺装"、"确定"、"冲"、"可以了"、"ok" 等，或者提供了参数并顺便要求开始（例如："帮我用16:9比例，加个外国模特，开始渲染吧"），请将 shouldStart 设为 true。
- 编写一段 feedback (中文回复)：简洁、礼貌、专业地告知用户你听懂了什么，进行了哪些参数的调整（如："已为您将比例调整为16:9，并添加了欧美年轻女模特。现在为您开启极速渲染..." 或是 "好的，已经帮您设置了2K清晰度与午后滤镜，您可以点击下方按钮开始试铺，或者继续告诉我您的其他要求！"）。

请严格返回以下 JSON 格式：
{
  "updatedParams": {
    "model": "string",
    "aspectRatio": "1:1" | "4:3" | "3:4" | "9:16" | "16:9",
    "imageSize": "1K" | "2K" | "4K",
    "filter": "natural" | "cinematic" | "warm" | "modern" | "film" | "none",
    "hasModel": boolean,
    "modelGender": "female" | "male",
    "modelAge": "child" | "youth" | "elder",
    "modelEthnicity": "asian" | "european" | "african" | "indian" | "latin"
  },
  "shouldStart": boolean,
  "feedback": "string (不超过80个字的中文优雅回复)"
}

用户输入：
"${text}"`;

    const response = await callGeminiApi("gemini-3.5-flash", {
      parts: [
        {
          text: promptText,
        },
      ],
    });

    const respText = response.text || "{}";
    try {
      const jsonStr = respText.match(/\{.*\}/s)?.[0] || "{}";
      const result = JSON.parse(jsonStr);
      
      const mergedParams = {
        ...currentParams,
        ...(result.updatedParams || {})
      };
      
      return {
        updatedParams: mergedParams,
        shouldStart: !!result.shouldStart,
        feedback: result.feedback || "好的，已为您同步调整了铺装参数。"
      };
    } catch (e) {
      console.error("Failed to parse params json:", e);
      return {
        updatedParams: currentParams,
        shouldStart: text.includes("开始") || text.includes("渲染") || text.includes("生成"),
        feedback: "好的，已帮您记录您的要求，这就为您进行更新设置。"
      };
    }
  });
}

