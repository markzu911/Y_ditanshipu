import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  Sparkles, 
  ChevronRight, 
  Image as ImageIcon, 
  CheckCircle2, 
  RefreshCcw, 
  Download,
  Info,
  Maximize,
  X,
  ArrowLeft,
  Loader2,
  Bot,
  User,
  MessageSquare,
  Cpu,
  Layers,
  Send,
  SlidersHorizontal
} from "lucide-react";
import { 
  analyzeRoom, 
  analyzeCarpet, 
  generateResultPrompt, 
  generateCarpetFitting,
  generateCarpetDetail,
  generateCarpetModelInteraction,
  generateCarpetModelFrontal,
  validateIsRoom,
  validateIsCarpet,
  GenerationParams,
  parseParamsFromText,
  analyzeCarpetDescription,
  analyzeRoomDescription
} from "./services/geminiService";
import { 
  launchTool, 
  verifyIntegral, 
  consumeIntegral,
  SaaSUser,
  uploadResultImage,
  createRequestId
} from "./services/saasService";

function createDefaultCarpet(description: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Base colors depending on description
  let baseColor = "#f5f2eb"; // cream
  let patternColor = "#d6cbbe";
  let accentColor = "#6366f1"; // indigo

  const desc = description.toLowerCase();
  if (desc.includes("中式") || desc.includes("山水") || desc.includes("古典")) {
    baseColor = "#f4f1ea";
    patternColor = "#8a7e72";
    accentColor = "#c5a880"; // gold/bronze
  } else if (desc.includes("现代") || desc.includes("几何") || desc.includes("极简")) {
    baseColor = "#eaeaea";
    patternColor = "#333333";
    accentColor = "#10b981"; // emerald
  } else if (desc.includes("复古") || desc.includes("红") || desc.includes("波斯")) {
    baseColor = "#800020"; // burgundy
    patternColor = "#d4af37"; // gold
    accentColor = "#4a0404";
  } else if (desc.includes("绿") || desc.includes("森林")) {
    baseColor = "#2d4a43";
    patternColor = "#d1e2db";
    accentColor = "#bfdbfe";
  } else if (desc.includes("蓝") || desc.includes("海洋")) {
    baseColor = "#1e3a8a";
    patternColor = "#93c5fd";
    accentColor = "#fef08a";
  }

  // Draw base
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 400, 400);

  // Draw subtle texture (wool grains)
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 400;
    const y = Math.random() * 400;
    const size = 1 + Math.random() * 2;
    ctx.fillRect(x, y, size, size);
  }

  // Draw pattern depending on description
  if (desc.includes("中式") || desc.includes("山水") || desc.includes("古典")) {
    // Draw mountain silhouettes or zen circles
    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Zen circle in center
    ctx.arc(200, 200, 80, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(200, 200, 5, 0, Math.PI * 2);
    ctx.fill();

    // Chinese landscape lines
    ctx.strokeStyle = "rgba(138, 126, 114, 0.4)";
    ctx.beginPath();
    ctx.moveTo(50, 320);
    ctx.quadraticCurveTo(150, 260, 250, 320);
    ctx.quadraticCurveTo(320, 280, 350, 320);
    ctx.stroke();
  } else if (desc.includes("现代") || desc.includes("几何") || desc.includes("极简")) {
    // Elegant interlocking geometry
    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.strokeRect(50 + i * 20, 50 + i * 20, 300 - i * 40, 300 - i * 40);
    }
    // Diagonal accent line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(360, 360);
    ctx.stroke();
  } else if (desc.includes("复古") || desc.includes("波斯")) {
    // Persian style borders and central medallion
    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, 360, 360);

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(200, 200, 50, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(35, 35, 330, 330);
  } else {
    // Default: Cream/cozy style, simple grid or subtle lines
    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 12]);
    // Grid lines
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 80, 20);
      ctx.lineTo(i * 80, 380);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(20, i * 80);
      ctx.lineTo(380, i * 80);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Soft frame border
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.lineWidth = 15;
    ctx.strokeRect(20, 20, 360, 360);
  }

  // Draw fringes on sides if relevant
  ctx.fillStyle = "#e2dacf";
  for (let i = 10; i < 390; i += 6) {
    // Top fringes
    ctx.fillRect(i, 0, 2, 8);
    // Bottom fringes
    ctx.fillRect(i, 392, 2, 8);
  }

  return canvas.toDataURL("image/jpeg");
}

type Step = "room" | "carpet" | "generate" | "result";
type AppMode = "select" | "engineer" | "agent";

interface ChatMessage {
  id: string;
  sender: "assistant" | "user";
  text?: string;
  type?: "text" | "options" | "upload_room" | "upload_carpet" | "room_analysis" | "carpet_analysis" | "generating" | "result" | "param_config" | "thinking";
  options?: { id: string; label: string }[];
  data?: any;
}

/**
 * Helper to ensure the image is a JPEG and within supported format for GPT Image API
 */
const ensureJpeg = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Limit max dimension to avoid huge payloads while maintaining quality
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>("room");
  const [roomImage, setRoomImage] = useState<string | null>(null);
  const [carpetImage, setCarpetImage] = useState<string | null>(null);
  const [roomAnalysis, setRoomAnalysis] = useState<string | null>(null);
  const [carpetAnalysis, setCarpetAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [detailImage, setDetailImage] = useState<string | null>(null);
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [modelFrontImage, setModelFrontImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [usePredefinedStyle, setUsePredefinedStyle] = useState(false);
  const [uploadedRoomImage, setUploadedRoomImage] = useState<string | null>(null);
  const [uploadedRoomAnalysis, setUploadedRoomAnalysis] = useState<string | null>(null);
  const [predefinedStyleAnalysis, setPredefinedStyleAnalysis] = useState<string | null>(null);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [appMode, setAppMode] = useState<AppMode>("select");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [agentInputMode, setAgentInputMode] = useState<"none" | "custom-style-name" | "render-params-or-start">("none");
  const [agentTextValue, setAgentTextValue] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const agentRoomInputRef = useRef<HTMLInputElement>(null);
  const agentCarpetInputRef = useRef<HTMLInputElement>(null);

  const initAgentChat = () => {
    setChatMessages([
      {
        id: "msg-welcome",
        sender: "assistant",
        text: "👋 您好！我是您的 AI 智能铺装设计助手。我会一步一步协助您分析空间、挑选地毯，并渲染出完美的实景效果图。\n\n首先，请问您想如何提供您的房间场景呢？",
        type: "options",
        options: [
          { id: "opt-room-upload", label: "📷 上传我的房间照片" },
          { id: "opt-room-style", label: "🎨 选择特定装修风格" }
        ]
      }
    ]);
    setAgentInputMode("none");
    setAgentTextValue("");
    setRoomImage(null);
    setCarpetImage(null);
    setRoomAnalysis(null);
    setCarpetAnalysis(null);
    setResultImage(null);
    setDetailImage(null);
    setModelImage(null);
    setModelFrontImage(null);
    setUsePredefinedStyle(false);
    setUploadedRoomImage(null);
    setUploadedRoomAnalysis(null);
    setPredefinedStyleAnalysis(null);
  };

  useEffect(() => {
    if (appMode === "agent" && chatMessages.length === 0) {
      initAgentChat();
    }
  }, [appMode]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, agentInputMode]);

  useEffect(() => {
    if (isAnalyzing) {
      setAnalysisStepIndex(0);
      const timer = setInterval(() => {
        setAnalysisStepIndex(prev => (prev + 1) % 4);
      }, 2500);
      return () => clearInterval(timer);
    }
  }, [isAnalyzing]);

  const predefinedStyles = [
    { id: "modern", name: "现代简约 (Modern)", desc: "配色纯净，线条利落，注重功能性与空间感的平衡。通常包含极简布艺沙发与几何感地板。" },
    { id: "nordic", name: "北欧风 (Nordic)", desc: "大量使用原木与浅灰色调，强调自然采光，营造通透温润的北欧森林居家感。" },
    { id: "newchinese", name: "新中式 (New Chinese)", desc: "传统元素与现代审美的结合，沉稳的实木框架与留白造景，在考究的细节中展现东方雅致的生活品味。" },
    { id: "cream", name: "奶油风 (Creamy)", desc: "米色调法式线条背景，搭配经典的奶白色 Togo 毛绒沙发与波浪落地灯，鱼骨拼地板交织出极致治愈的法式简约美学。" },
    { id: "wabisabi", name: "侘寂风 (Wabi-sabi)", desc: "微水泥质感墙面，原始风格的原木长桌，点缀枯木枝桠，在留白中感悟自然的静谧与禅意。" },
    { id: "lightluxury", name: "轻奢风 (Light Luxury)", desc: "精致的大理石与金属线条交相辉映，高饱和度的绒面靠背椅，打造摩登优雅的现代都市豪宅质感。" }
  ];

  const [params, setParams] = useState<GenerationParams>({
    aspectRatio: "1:1",
    imageSize: "1K",
    model: "gemini-3.1-flash-image",
    filter: "none",
    modelGender: "female",
    modelAge: "youth",
    modelEthnicity: "asian"
  });

  const [userId, setUserId] = useState<string>("");
  const [toolId, setToolId] = useState<string>("");
  const [integral, setIntegral] = useState<number | null>(null);
  const [userInfo, setUserInfo] = useState<SaaSUser | null>(null);
  const [saasContext, setSaasContext] = useState<string>("");
  const [saasPrompt, setSaasPrompt] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize tool and fetch user info
  React.useEffect(() => {
    const handleSaaSInit = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'SAAS_INIT') {
        let { userId: uid, toolId: tid, context: sContext, prompt: sPrompt } = event.data;
        
        // Filter out "null" or "undefined" strings as per spec
        uid = (uid === "null" || uid === "undefined") ? "" : (uid || "");
        tid = (tid === "null" || tid === "undefined") ? "" : (tid || "");

        if (uid && tid) {
          setUserId(uid);
          setToolId(tid);
          
          if (sContext) setSaasContext(sContext);
          if (Array.isArray(sPrompt)) setSaasPrompt(sPrompt);

          try {
            const res = await launchTool(uid, tid);
            if (res.success && res.data) {
              setUserInfo(res.data.user);
              setIntegral(res.data.user.integral);
            }
          } catch (error) {
            console.error("Failed to launch tool:", error);
          }
        }
      }
    };

    window.addEventListener('message', handleSaaSInit);
    
    // Also check URL params as fallback
    const urlParams = new URLSearchParams(window.location.search);
    let uid = urlParams.get('userId');
    let tid = urlParams.get('toolId');

    // Apply filtering to URL params too
    uid = (uid === "null" || uid === "undefined") ? "" : (uid || "");
    tid = (tid === "null" || tid === "undefined") ? "" : (tid || "");

    if (uid && tid) {
      window.postMessage({ type: 'SAAS_INIT', userId: uid, toolId: tid }, '*');
    }

    return () => window.removeEventListener('message', handleSaaSInit);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: "room" | "carpet") => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      let dataUrl = e.target?.result as string;
      
      // Always convert to JPEG to ensure compatibility with GPT Image API (especially for AVIF)
    setIsAnalyzing(true);
    setAnalysisError(null);
      try {
        // Integral check before analysis
        if (type === "room" && userId && toolId) {
          const verify = await verifyIntegral(userId, toolId);
          if (!verify.success) {
            setAnalysisError(verify.message || "积分不足，无法进行分析。");
            setIsAnalyzing(false);
            return;
          }
        }

        dataUrl = await ensureJpeg(dataUrl);
        const base64 = dataUrl.split(",")[1];

        if (type === "room") {
          setRoomImage(dataUrl); // Set image immediately for visual feedback
          setUploadedRoomImage(dataUrl); // Keep updated uploaded image!
          
          // Validate Room
          const validation = await validateIsRoom(base64);
          if (!validation.isValid) {
            setAnalysisError(validation.reason || "上传的图片似乎不包含房间场景，建议更换符合要求的图片以获得更佳生成效果。");
            setIsAnalyzing(false);
            return;
          }
          
          const analysis = await analyzeRoom(base64);
          setRoomAnalysis(analysis);
          setUploadedRoomAnalysis(analysis); // Keep updated uploaded analysis!
        } else {
          setCarpetImage(dataUrl); // Set image immediately for visual feedback
          
          // Validate Carpet
          const validation = await validateIsCarpet(base64);
          if (!validation.isValid) {
            setAnalysisError(validation.reason || "上传的图片似乎不是地毯，建议上传清晰的地毯原图。");
            setIsAnalyzing(false);
            return;
          }
          
          const analysis = await analyzeCarpet(base64);
          setCarpetAnalysis(analysis);
        }
      } catch (error: any) {
      console.error("Analysis failed", error);
      const errorContent = JSON.stringify(error).toLowerCase();
      if (errorContent.includes("high demand") || errorContent.includes("503") || errorContent.includes("unavailable")) {
        setAnalysisError("AI 分析引擎目前压力过大。我们已尝试自动修复，但服务器仍处于繁忙状态，请稍后再试一次。");
      } else {
        setAnalysisError("图片解析遇到异常，请尝试换一张图片或重新上传。");
      }
    } finally {
      setIsAnalyzing(false);
    }
    };
    reader.readAsDataURL(file);
  };

  const triggerRenderWorkflow = async (targetParams: GenerationParams) => {
    const progressMsgId = `msg-generating-${Date.now()}`;
    const generatingMsg: ChatMessage = {
      id: progressMsgId,
      sender: "assistant",
      type: "generating"
    };
    setChatMessages(prev => [...prev, generatingMsg]);
    
    try {
      // Verify integral
      if (userId && toolId) {
        const verify = await verifyIntegral(userId, toolId);
        if (!verify.success) {
          setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
            id: `msg-error-${Date.now()}`,
            sender: "assistant",
            text: `❌ 积分不足：${verify.message || "无法开启 AI 极速渲染。"}`
          }));
          return;
        }
      }

      const prompt = await generateResultPrompt(
        roomAnalysis || "", 
        carpetAnalysis || "", 
        !usePredefinedStyle,
        saasContext,
        saasPrompt
      );
      const roomBase64 = roomImage ? roomImage.split(",")[1] : null;
      const carpetBase64 = carpetImage ? carpetImage.split(",")[1] : null;
      if (!carpetBase64) throw new Error("Carpet image is missing");

      let finalResultImg = "";
      let finalDetailImg = "";
      let finalModelImg = "";
      let finalModelFrontImg = "";

      const panoPromise = generateCarpetFitting(roomBase64, carpetBase64, prompt, targetParams).then(img => {
        finalResultImg = img;
        setResultImage(img);
        return img;
      });
      const detailPromise = generateCarpetDetail(carpetBase64, carpetAnalysis || "", targetParams).then(img => {
        finalDetailImg = img;
        setDetailImage(img);
        return img;
      });
      
      const allPromises: Promise<string>[] = [panoPromise, detailPromise];

      if (targetParams.hasModel) {
        const modelTopPromise = generateCarpetModelInteraction(roomBase64, carpetBase64, prompt, targetParams).then(img => {
          finalModelImg = img;
          setModelImage(img);
          return img;
        });
        const modelFrontPromise = generateCarpetModelFrontal(roomBase64, carpetBase64, prompt, targetParams).then(img => {
          finalModelFrontImg = img;
          setModelFrontImage(img);
          return img;
        });
        allPromises.push(modelTopPromise, modelFrontPromise);
      }

      const generatedImages = await Promise.all(allPromises);

      // Consume integral
      if (userId && toolId) {
        try {
          const requestId = createRequestId();
          const res = await consumeIntegral(userId, toolId, requestId);
          if (res.success && res.data) {
            setIntegral(res.data.currentIntegral);
            if (generatedImages.length > 0) {
              await uploadResultImage(userId, toolId, generatedImages, requestId);
            }
          }
        } catch (error) {
          console.error("Failed to consume integral in Agent mode:", error);
        }
      }

      // Show Success Results in Chat Bubble
      setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
        id: `msg-result-${Date.now()}`,
        sender: "assistant",
        type: "result",
        text: "✨ 地毯铺装渲染效果已圆满生成！您可以直接查看、切换预览图，或点击下载高清效果图：",
        data: {
          resultImage: finalResultImg,
          detailImage: finalDetailImg,
          modelImage: finalModelImg,
          modelFrontImage: finalModelFrontImg
        }
      }, {
        id: `msg-followup-${Date.now()}`,
        sender: "assistant",
        text: "您想继续尝试其他搭配或开启全新设计吗？",
        type: "options",
        options: [
          { id: "opt-restart-agent", label: "🔄 重新开始设计" }
        ]
      }));

    } catch (error: any) {
      console.error("Agent generation failed:", error);
      const errorContent = JSON.stringify(error).toLowerCase();
      let customError = "❌ 铺装渲染过程中出现了未知错误。建议您点击下方按钮重新尝试生成：";
      if (errorContent.includes("high demand") || errorContent.includes("503") || errorContent.includes("unavailable")) {
        customError = "❌ 渲染引擎繁忙：目前 AI 算力请求过多，已自动尝试恢复。请您稍等几秒后，重新点击开始渲染！";
      }
      setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
        id: `msg-error-${Date.now()}`,
        sender: "assistant",
        text: customError,
        type: "options",
        options: [
          { id: "opt-start-render", label: "🔄 重新生成试铺" }
        ]
      }));
    }
  };

  const handleAgentOption = async (optionId: string, optionLabel: string, skipUserMsg = false) => {
    // Add user's selection to chat
    if (!skipUserMsg) {
      const newUserMsg: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        sender: "user",
        text: optionLabel
      };
      
      setChatMessages(prev => [...prev, newUserMsg]);
    }

    // Simulate assistant replying
    setTimeout(async () => {
      if (optionId === "opt-room-upload") {
        setUsePredefinedStyle(false);
        const assistantReply: ChatMessage = {
          id: `msg-asst-${Date.now()}`,
          sender: "assistant",
          text: "好的！请上传您的房间原图，我会立刻帮您评估全景的空间透视与环境光照结构：",
          type: "upload_room"
        };
        setChatMessages(prev => [...prev, assistantReply]);
      } else if (optionId === "opt-room-style") {
        setUsePredefinedStyle(true);
        const assistantReply: ChatMessage = {
          id: `msg-asst-${Date.now()}`,
          sender: "assistant",
          text: "没问题！我为您准备了 6 款经典的软装与家装设计风格，或者您也可以选择『自定义设计风格』：",
          type: "options",
          options: [
            ...predefinedStyles.map(style => ({
              id: `opt-style-${style.id}`,
              label: `${style.name}`
            })),
            { id: "opt-style-custom", label: "✨ 自定义设计风格..." }
          ]
        };
        setChatMessages(prev => [...prev, assistantReply]);
      } else if (optionId === "opt-style-custom") {
        const assistantReply: ChatMessage = {
          id: `msg-asst-${Date.now()}`,
          sender: "assistant",
          text: "✍️ 没问题！请输入您自定义的装修风格名称或描述。\n\n例如：「日式原木风」、「法式复古绿浪漫风」或「现代工业极简」。\n\n请在下方的输入框中输入并发送，我将为您量身定制渲染场景！"
        };
        setChatMessages(prev => [...prev, assistantReply]);
        setAgentInputMode("custom-style-name");
      } else if (optionId.startsWith("opt-style-")) {
        const styleId = optionId.replace("opt-style-", "");
        const selectedStyle = predefinedStyles.find(s => s.id === styleId);
        if (selectedStyle) {
          const styleDesc = selectedStyle.name + "：" + selectedStyle.desc;
          setRoomAnalysis(styleDesc);
          setPredefinedStyleAnalysis(styleDesc);
          setUsePredefinedStyle(true);
          
          const assistantReply: ChatMessage = {
            id: `msg-asst-${Date.now()}`,
            sender: "assistant",
            text: `✨ 很好，已成功为您加载预设的「${selectedStyle.name}」背景场景。\n\n💡 **风格介绍**：\n${selectedStyle.desc}\n\n接下来，请上传或拖拽您的地毯图（原图或样本），我将帮您提取材质特性与纹理分布：`,
            type: "upload_carpet"
          };
          setChatMessages(prev => [...prev, assistantReply]);
        }
      } else if (optionId === "opt-start-render") {
        await triggerRenderWorkflow(params);
      } else if (optionId === "opt-restart-agent") {
        initAgentChat();
      }
    }, 400);
  };

  const handleAgentFileUpload = async (file: File, type: "room" | "carpet") => {
    if (!file) return;

    const progressMsgId = `msg-analyzing-${Date.now()}`;
    const fileReader = new FileReader();

    fileReader.onload = async (e) => {
      let dataUrl = e.target?.result as string;
      
      try {
        // Show user upload image in chat
        const userImageMsg: ChatMessage = {
          id: `msg-user-img-${Date.now()}`,
          sender: "user",
          text: type === "room" ? "📷 上传了我的房间照片" : "🧶 上传了我的地毯样本图片",
          data: { previewUrl: dataUrl }
        };

        // Show analytical progress steps (room_analysis or carpet_analysis)
        const analysisProgressMsg: ChatMessage = {
          id: progressMsgId,
          sender: "assistant",
          type: type === "room" ? "room_analysis" : "carpet_analysis"
        };

        setChatMessages(prev => [...prev, userImageMsg, analysisProgressMsg]);

        // Start step-by-step state animations
        setAnalysisStepIndex(0);
        const intervalId = setInterval(() => {
          setAnalysisStepIndex(prev => (prev + 1) % 4);
        }, 1800);

        // Verify integral
        if (userId && toolId) {
          const verify = await verifyIntegral(userId, toolId);
          if (!verify.success) {
            clearInterval(intervalId);
            setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
              id: `msg-error-${Date.now()}`,
              sender: "assistant",
              text: `❌ 积分不足：${verify.message || "您的积分不足，无法分析与上传图片。"}`
            }));
            return;
          }
        }

        dataUrl = await ensureJpeg(dataUrl);
        const base64 = dataUrl.split(",")[1];

        if (type === "room") {
          setRoomImage(dataUrl);
          setUploadedRoomImage(dataUrl);
          
          // Validate Room
          const validation = await validateIsRoom(base64);
          clearInterval(intervalId);
          if (!validation.isValid) {
            setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
              id: `msg-error-${Date.now()}`,
              sender: "assistant",
              text: `⚠️ 空间检测失败：${validation.reason || "没有识别到合适的室内空间。"} 请重新上传一张清晰的卧室或客厅地面实景照。`
            }, {
              id: `msg-reupload-${Date.now()}`,
              sender: "assistant",
              text: "请在此处重试上传房间图片：",
              type: "upload_room"
            }));
            return;
          }

          // Deduct points and upload room image
          if (userId && toolId) {
            try {
              const requestId = createRequestId();
              const res = await consumeIntegral(userId, toolId, requestId);
              if (res.success && res.data) {
                setIntegral(res.data.currentIntegral);
                await uploadResultImage(userId, toolId, dataUrl, requestId);
              }
            } catch (error) {
              console.error("Failed to consume/upload room in Agent mode:", error);
            }
          }

          const analysis = await analyzeRoom(base64);
          setRoomAnalysis(analysis);
          setUploadedRoomAnalysis(analysis);

          setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
            id: `msg-success-room-${Date.now()}`,
            sender: "assistant",
            text: `🎯 三维空间定位与光影解析完成！\n\n**🔍 空间分析报告：**\n${analysis}\n\n接下来，请上传您的地毯图（原图或样本），我会帮您提取材质特性与纹理：`,
            type: "upload_carpet"
          }));

        } else {
          setCarpetImage(dataUrl);
          
          // Validate Carpet
          const validation = await validateIsCarpet(base64);
          clearInterval(intervalId);
          if (!validation.isValid) {
            setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
              id: `msg-error-${Date.now()}`,
              sender: "assistant",
              text: `⚠️ 地毯识别失败：${validation.reason || "没有识别到地毯原图或面料。"} 请重新上传一张清晰的地毯图案照片。`
            }, {
              id: `msg-reupload-${Date.now()}`,
              sender: "assistant",
              text: "请在此处重试上传地毯图片：",
              type: "upload_carpet"
            }));
            return;
          }

          // Deduct points and upload carpet image
          if (userId && toolId) {
            try {
              const requestId = createRequestId();
              const res = await consumeIntegral(userId, toolId, requestId);
              if (res.success && res.data) {
                setIntegral(res.data.currentIntegral);
                await uploadResultImage(userId, toolId, dataUrl, requestId);
              }
            } catch (error) {
              console.error("Failed to consume/upload carpet in Agent mode:", error);
            }
          }

          const analysis = await analyzeCarpet(base64);
          setCarpetAnalysis(analysis);

          setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
            id: `msg-success-carpet-analysis-${Date.now()}`,
            sender: "assistant",
            text: `🎯 地毯纹理及微观绒头分析成功！\n\n**🔍 地毯材质特征报告：**\n${analysis}`,
          }, {
            id: `msg-param-config-${Date.now()}`,
            sender: "assistant",
            text: `在开始试铺前，您可以根据需要，在下方调整地毯铺装的渲染参数（比例、清晰度、是否需要模特等）：`,
            type: "param_config"
          }, {
            id: `msg-success-next-${Date.now()}`,
            sender: "assistant",
            text: `参数配置完成后，您也可以直接在对话框中告诉我您的需求（如「我要16:9比例，加个年轻女模特，帮我渲染」），或者直接点击下方按钮开启 AI 极速渲染：`,
            type: "options",
            options: [
              { id: "opt-start-render", label: "🚀 开启智能极速渲染" }
            ]
          }));
          setAgentInputMode("render-params-or-start");
        }

      } catch (error: any) {
        console.error("Agent upload parsing error:", error);
        setChatMessages(prev => prev.filter(m => m.id !== progressMsgId).concat({
          id: `msg-error-${Date.now()}`,
          sender: "assistant",
          text: "❌ 空间图片处理出现未知错误。请检查网络后重试。"
        }, {
          id: `msg-reupload-${Date.now()}`,
          sender: "assistant",
          text: "请点击下方按钮重试：",
          type: type === "room" ? "upload_room" : "upload_carpet"
        }));
      }
    };
    fileReader.readAsDataURL(file);
  };

  const handleAgentSubmitText = async () => {
    if (!agentTextValue.trim()) return;
    const userInput = agentTextValue.trim();
    setAgentTextValue("");

    // Add user's text message to chat
    const newUserMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      text: userInput
    };
    
    setChatMessages(prev => [...prev, newUserMsg]);
    setAgentInputMode("none");

    const isBackgroundSelection = !roomImage && !usePredefinedStyle && !roomAnalysis;
    const isStyleSelection = usePredefinedStyle && !roomAnalysis;
    const isCarpetUpload = (roomImage || usePredefinedStyle) && (!carpetImage || !carpetAnalysis);

    if (isBackgroundSelection) {
      // Stage 1: Room background selection or upload request
      const isUploadRequest = /上传|照片|拍照|原图|实景|相机|图片|图片上传|upload|photo|image|camera/i.test(userInput);
      const isPredefinedStylesRequest = /特定风格|装修风格|自带风格|预置|特定装修风格|选风格|选择风格/i.test(userInput);

      if (isUploadRequest) {
        setTimeout(() => {
          handleAgentOption("opt-room-upload", "📷 上传我的房间照片");
        }, 400);
      } else if (isPredefinedStylesRequest) {
        setTimeout(() => {
          handleAgentOption("opt-room-style", "🎨 选择特定装修风格");
        }, 400);
      } else {
        // Check for quick matches of style names (exact or near matches only)
        let foundStyleId = "";
        let foundStyleLabel = "";
        
        const cleanInput = userInput.trim().replace(/风$/, "");
        if (cleanInput === "奶油") {
          foundStyleId = "opt-style-cream";
          foundStyleLabel = "奶油风";
        } else if (cleanInput === "现代" || cleanInput === "简约" || cleanInput === "现代简约") {
          foundStyleId = "opt-style-modern";
          foundStyleLabel = "现代简约";
        } else if (cleanInput === "北欧") {
          foundStyleId = "opt-style-nordic";
          foundStyleLabel = "北欧风";
        } else if (cleanInput === "新中式" || cleanInput === "中式") {
          foundStyleId = "opt-style-newchinese";
          foundStyleLabel = "新中式";
        } else if (cleanInput === "侘寂") {
          foundStyleId = "opt-style-wabisabi";
          foundStyleLabel = "侘寂风";
        } else if (cleanInput === "轻奢") {
          foundStyleId = "opt-style-lightluxury";
          foundStyleLabel = "轻奢风";
        }

        if (foundStyleId) {
          setTimeout(() => {
            handleAgentOption(foundStyleId, foundStyleLabel, true);
          }, 400);
        } else {
          // Process as raw custom style name via Gemini to draft professional analysis report
          const thinkingId = `thinking-${Date.now()}`;
          setChatMessages(prev => [...prev, { 
            id: thinkingId, 
            sender: "assistant", 
            text: `🔍 正在为您规划和解析「${userInput}」风格的室内空间、环境光影及三维透视结构，请稍候...`,
            type: "thinking"
          }]);

          try {
            const analysis = await analyzeRoomDescription(userInput);
            const styleDesc = "自定义风格：" + userInput + " (" + analysis + ")";
            setRoomAnalysis(styleDesc);
            setPredefinedStyleAnalysis(styleDesc);
            setUsePredefinedStyle(true);
            setCurrentStep("carpet");

            setTimeout(() => {
              const assistantReply: ChatMessage = {
                id: `msg-asst-${Date.now()}`,
                sender: "assistant",
                text: `✨ 很好，我已根据您的描述，为您成功规划和定制了 **${userInput}** 渲染场景：\n\n**🔍 场景设计方案：**\n${analysis}\n\n接下来，请**上传您的地毯图**，或者直接在此输入文字描述您想要的地毯外观（如「绿色的几何图案地毯」），我帮您进行智能编织：`,
                type: "upload_carpet"
              };
              setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat(assistantReply));
            }, 400);
          } catch (err) {
            console.error("Failed to analyze room description:", err);
            const styleDesc = "自定义风格：" + userInput;
            setRoomAnalysis(styleDesc);
            setPredefinedStyleAnalysis(styleDesc);
            setUsePredefinedStyle(true);
            setCurrentStep("carpet");

            setTimeout(() => {
              const assistantReply: ChatMessage = {
                id: `msg-asst-${Date.now()}`,
                sender: "assistant",
                text: `✨ 很好，已成功为您量身定制 **${userInput}** 背景场景。\n\n接下来，请**上传或拖拽您的地毯图**，或直接输入文字描述地毯图案，我将帮您提取材质特性与纹理分布：`,
                type: "upload_carpet"
              };
              setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat(assistantReply));
            }, 400);
          }
        }
      }
    } else if (isStyleSelection) {
      // Stage 2: In style selection menu, but room analysis not done yet
      let foundStyleId = "";
      let foundStyleLabel = "";
      
      const cleanInput = userInput.trim().replace(/风$/, "");
      if (cleanInput === "奶油") {
        foundStyleId = "opt-style-cream";
        foundStyleLabel = "奶油风";
      } else if (cleanInput === "现代" || cleanInput === "简约" || cleanInput === "现代简约") {
        foundStyleId = "opt-style-modern";
        foundStyleLabel = "现代简约";
      } else if (cleanInput === "北欧") {
        foundStyleId = "opt-style-nordic";
        foundStyleLabel = "北欧风";
      } else if (cleanInput === "新中式" || cleanInput === "中式") {
        foundStyleId = "opt-style-newchinese";
        foundStyleLabel = "新中式";
      } else if (cleanInput === "侘寂") {
        foundStyleId = "opt-style-wabisabi";
        foundStyleLabel = "侘寂风";
      } else if (cleanInput === "轻奢") {
        foundStyleId = "opt-style-lightluxury";
        foundStyleLabel = "轻奢风";
      } else if (userInput.includes("自定义") || userInput.includes("自己设计")) {
        foundStyleId = "opt-style-custom";
        foundStyleLabel = "✨ 自定义设计风格...";
      }

      if (foundStyleId) {
        setTimeout(() => {
          handleAgentOption(foundStyleId, foundStyleLabel, true);
        }, 400);
      } else {
        // Treat as direct custom style name
        const thinkingId = `thinking-${Date.now()}`;
        setChatMessages(prev => [...prev, { 
          id: thinkingId, 
          sender: "assistant", 
          text: `🔍 正在为您规划 and 解析「${userInput}」风格的室内空间、环境光影及三维透视结构，请稍候...`,
          type: "thinking"
        }]);

        try {
          const analysis = await analyzeRoomDescription(userInput);
          const styleDesc = "自定义风格：" + userInput + " (" + analysis + ")";
          setRoomAnalysis(styleDesc);
          setPredefinedStyleAnalysis(styleDesc);
          setUsePredefinedStyle(true);
          setCurrentStep("carpet");

          setTimeout(() => {
            const assistantReply: ChatMessage = {
              id: `msg-asst-${Date.now()}`,
              sender: "assistant",
              text: `✨ 很好，我已根据您的描述，为您成功规划和定制了 **${userInput}** 渲染场景：\n\n**🔍 场景设计方案：**\n${analysis}\n\n接下来，请**上传您的地毯图**，或者直接在此输入文字描述您想要的地毯外观，我帮您进行智能编织：`,
              type: "upload_carpet"
            };
            setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat(assistantReply));
          }, 400);
        } catch (err) {
          console.error("Failed to analyze room description:", err);
          const styleDesc = "自定义风格：" + userInput;
          setRoomAnalysis(styleDesc);
          setPredefinedStyleAnalysis(styleDesc);
          setUsePredefinedStyle(true);
          setCurrentStep("carpet");

          setTimeout(() => {
            const assistantReply: ChatMessage = {
              id: `msg-asst-${Date.now()}`,
              sender: "assistant",
              text: `✨ 很好，已成功为您量身定制 **${userInput}** 背景场景。\n\n接下来，请**上传或拖拽您的地毯图（原图或样本）**，我将帮您提取材质特性与纹理分布：`,
              type: "upload_carpet"
            };
            setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat(assistantReply));
          }, 400);
        }
      }
    } else if (isCarpetUpload) {
      // Stage 3: Carpet upload or text-based custom carpet creation
      const isDefaultCarpet = /经典地毯|默认|经典羊毛|随便配个|默认地毯|用经典的/i.test(userInput);
      
      if (isDefaultCarpet) {
        setTimeout(() => {
          const defaultCarpetImg = createDefaultCarpet("classic");
          setCarpetImage(defaultCarpetImg);
          const analysis = "材质与边缘：经典羊毛手工编织，平整无流苏边缘。\n视觉：温馨象牙白，带有精致经纬编织凹凸纹理。";
          setCarpetAnalysis(analysis);
          setCurrentStep("generate");
          
          setChatMessages(prev => [...prev, {
            id: `msg-success-carpet-${Date.now()}`,
            sender: "assistant",
            text: `🎯 已为您智能配置了**经典羊毛编织地毯**作为铺装样本：\n\n**🔍 地毯材质特征报告：**\n${analysis}`
          }, {
            id: `msg-param-config-${Date.now()}`,
            sender: "assistant",
            text: `在开始试铺前，您可以根据需要，在下方调整地毯铺装的渲染参数（比例、清晰度、是否需要模特等）：`,
            type: "param_config"
          }, {
            id: `msg-success-next-${Date.now()}`,
            sender: "assistant",
            text: `参数配置完成后，您也可以直接在对话框中告诉我您的需求（如「我要16:9比例，加个年轻女模特，帮我渲染」），或者直接点击下方按钮开启 AI 极速渲染：`,
            type: "options",
            options: [
              { id: "opt-start-render", label: "🚀 开启智能极速渲染" }
            ]
          }]);
          setAgentInputMode("render-params-or-start");
        }, 400);
      } else {
        // Draw a customized styled carpet in a canvas, and run analyzeCarpetDescription
        const thinkingId = `thinking-${Date.now()}`;
        setChatMessages(prev => [...prev, {
          id: thinkingId,
          sender: "assistant",
          text: `🧶 正在为您智能编织并分析「${userInput}」地毯面料与肌理纤维，请稍候...`,
          type: "thinking"
        }]);

        try {
          const generatedCarpetImg = createDefaultCarpet(userInput);
          setCarpetImage(generatedCarpetImg);
          
          const analysis = await analyzeCarpetDescription(userInput);
          setCarpetAnalysis(analysis);
          setCurrentStep("generate");
          
          setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat({
            id: `msg-success-carpet-${Date.now()}`,
            sender: "assistant",
            text: `🎯 成功根据您的描述「${userInput}」智能设计并生成了地毯面料样式：\n\n**🔍 地毯材质特征报告：**\n${analysis}`
          }, {
            id: `msg-param-config-${Date.now()}`,
            sender: "assistant",
            text: `在开始试铺前，您可以根据需要，在下方调整地毯铺装的渲染参数（比例、清晰度、是否需要模特等）：`,
            type: "param_config"
          }, {
            id: `msg-success-next-${Date.now()}`,
            sender: "assistant",
            text: `参数配置完成后，您也可以直接在对话框中告诉我您的需求（如「我要16:9比例，加个年轻女模特，帮我渲染」），或者直接点击下方按钮开启 AI 极速渲染：`,
            type: "options",
            options: [
              { id: "opt-start-render", label: "🚀 开启智能极速渲染" }
            ]
          }));
          setAgentInputMode("render-params-or-start");
        } catch (err) {
          console.error("Failed to analyze carpet description:", err);
          const generatedCarpetImg = createDefaultCarpet(userInput);
          setCarpetImage(generatedCarpetImg);
          const analysis = `材质与边缘：定制平织面料，平整无流苏边缘。\n视觉：${userInput}图案。`;
          setCarpetAnalysis(analysis);
          setCurrentStep("generate");
          
          setChatMessages(prev => prev.filter(m => m.id !== thinkingId).concat({
            id: `msg-success-carpet-${Date.now()}`,
            sender: "assistant",
            text: `🎯 成功根据您的描述「${userInput}」设计并生成了地毯面料样式：\n\n**🔍 地毯材质特征报告：**\n${analysis}`
          }, {
            id: `msg-param-config-${Date.now()}`,
            sender: "assistant",
            text: `在开始试铺前，您可以根据需要，在下方调整地毯铺装的渲染参数（比例、清晰度、是否需要模特等）：`,
            type: "param_config"
          }, {
            id: `msg-success-next-${Date.now()}`,
            sender: "assistant",
            text: `参数配置完成后，您也可以直接在对话框中告诉我您的需求（如「我要16:9比例，加个年轻女模特，帮我渲染」），或者直接点击下方按钮开启 AI 极速渲染：`,
            type: "options",
            options: [
              { id: "opt-start-render", label: "🚀 开启智能极速渲染" }
            ]
          }));
          setAgentInputMode("render-params-or-start");
        }
      }
    } else {
      // Stage 4: Parameter configuration and starting generation
      const thinkingMsgId = `msg-thinking-${Date.now()}`;
      setChatMessages(prev => [...prev, {
        id: thinkingMsgId,
        sender: "assistant",
        text: "🔍 正在为您解析指令，调整参数选项...",
      }]);

      try {
        const { updatedParams, shouldStart, feedback } = await parseParamsFromText(userInput, params);
        
        setParams(updatedParams);

        setChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId).concat({
          id: `msg-asst-feedback-${Date.now()}`,
          sender: "assistant",
          text: feedback
        }));

        if (shouldStart) {
          setTimeout(async () => {
            await triggerRenderWorkflow(updatedParams);
          }, 1200);
        } else {
          setAgentInputMode("render-params-or-start");
        }
      } catch (err) {
        console.error("Conversational params parse failed:", err);
        setChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId).concat({
          id: `msg-asst-error-${Date.now()}`,
          sender: "assistant",
          text: "⚠️ 解析您的指令时有些超时或网络波动，但您仍然可以通过上方控制面板直接点击或选择参数。调整好后可点击开启智能极速渲染！"
        }));
        setAgentInputMode("render-params-or-start");
      }
    }
  };

  const startGeneration = async () => {
    if ((!roomImage && !usePredefinedStyle) || !carpetImage || !roomAnalysis || !carpetAnalysis) return;
    
    setIsGenerating(true);
    setGenError(null);
    setCurrentStep("result");
    setResultImage(null);
    setDetailImage(null);
    setModelImage(null);
    setModelFrontImage(null);

    try {
      // Step 1: Verify integral before any AI work (V4-3Step Requirement)
      if (userId && toolId) {
        const verify = await verifyIntegral(userId, toolId);
        if (!verify.success) {
          setGenError(verify.message || "积分不足，无法开启 AI 极速渲染。");
          setIsGenerating(false);
          return;
        }
      }

      const prompt = await generateResultPrompt(
        roomAnalysis, 
        carpetAnalysis, 
        !usePredefinedStyle,
        saasContext,
        saasPrompt
      );
      const roomBase64 = roomImage ? roomImage.split(",")[1] : null;
      const carpetBase64 = carpetImage.split(",")[1];
      
      // We start all tasks as individual promises and update state as they finish
      const panoPromise = generateCarpetFitting(roomBase64, carpetBase64, prompt, params).then(img => {
        setResultImage(img);
        return img;
      });
      const detailPromise = generateCarpetDetail(carpetBase64, carpetAnalysis, params).then(img => {
        setDetailImage(img);
        return img;
      });
      
      const allPromises: Promise<string>[] = [panoPromise, detailPromise];

      if (params.hasModel) {
        const modelTopPromise = generateCarpetModelInteraction(roomBase64, carpetBase64, prompt, params).then(img => {
          setModelImage(img);
          return img;
        });
        const modelFrontPromise = generateCarpetModelFrontal(roomBase64, carpetBase64, prompt, params).then(img => {
          setModelFrontImage(img);
          return img;
        });
        allPromises.push(modelTopPromise, modelFrontPromise);
      }

      const generatedImages = await Promise.all(allPromises);

      // Consume integral after successful generation
      if (userId && toolId) {
        try {
          const requestId = createRequestId();
          const res = await consumeIntegral(userId, toolId, requestId);
          if (res.success && res.data) {
            setIntegral(res.data.currentIntegral);
            
            // Upload result images to SaaS for persistence in "My Gallery"
            if (generatedImages.length > 0) {
              await uploadResultImage(userId, toolId, generatedImages, requestId);
            }
          }
        } catch (error) {
          console.error("Failed to consume integral or upload image:", error);
        }
      }
    } catch (error: any) {
      console.error("Generation failed", error);
      const errorContent = JSON.stringify(error).toLowerCase();
      if (errorContent.includes("503") || errorContent.includes("high demand") || errorContent.includes("unavailable")) {
        setGenError("AI 渲染服务目前负载过高，已尝试多次自动排队。请稍等几分钟后再试，通常拥堵很快就会缓解。");
      } else {
        setGenError("生成过程中发生未知错误，请检查网络后重试。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setCurrentStep("room");
    setRoomImage(null);
    setCarpetImage(null);
    setRoomAnalysis(null);
    setCarpetAnalysis(null);
    setResultImage(null);
    setDetailImage(null);
    setModelImage(null);
    setModelFrontImage(null);
    setGenError(null);
    setUsePredefinedStyle(false);
    setUploadedRoomImage(null);
    setUploadedRoomAnalysis(null);
    setPredefinedStyleAnalysis(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm flex items-center shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center cursor-pointer" onClick={() => setAppMode("select")}>
              <div className="w-4 h-4 bg-white rounded-sm rotate-45"></div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 cursor-pointer" onClick={() => setAppMode("select")}>AI 地毯试铺助手</h1>
              {appMode !== "select" && (
                <span className="text-[10px] text-indigo-600 font-semibold leading-none">
                  {appMode === "agent" ? "🤖 智能设计助手" : "📐 专家工作室"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Mode Switcher Segmented Control */}
            {appMode !== "select" && (
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => { setAppMode("agent"); initAgentChat(); }}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                    appMode === "agent" 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">智能体</span>
                </button>
                <button
                  onClick={() => { setAppMode("engineer"); reset(); }}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                    appMode === "engineer" 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">专家模式</span>
                </button>
              </div>
            )}

            {appMode === "engineer" && (
              <>
                <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
                  {["场景分析", "地毯匹配", "生成预览", "结果预览"].map((label, idx) => {
                    const steps: Step[] = ["room", "carpet", "generate", "result"];
                    const isActive = currentStep === steps[idx];
                    const isDone = steps.indexOf(currentStep) > idx;

                    if (isActive) {
                      return (
                        <div key={label} className="flex items-center gap-1.5 text-indigo-600 font-bold">
                          <span className="w-5 h-5 rounded-full border-2 border-indigo-600 flex items-center justify-center text-[10px] italic">
                            0{idx + 1}
                          </span>
                          <span className="text-xs">{label}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={label} className={`flex items-center gap-1.5 ${isDone ? "text-indigo-400" : "text-slate-400"}`}>
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] ${isDone ? "border-indigo-400 bg-indigo-50" : "border-slate-300"}`}>
                          {isDone ? <CheckCircle2 className="w-2.5 h-2.5" /> : `0${idx + 1}`}
                        </span>
                        <span className="text-xs">{label}</span>
                      </div>
                    );
                  })}
                </nav>
                <div className="lg:hidden flex items-center">
                  <div className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-indigo-100">
                    {currentStep === "room" && "步骤 1/4"}
                    {currentStep === "carpet" && "步骤 2/4"}
                    {currentStep === "generate" && "步骤 3/4"}
                    {currentStep === "result" && "步骤 4/4"}
                  </div>
                </div>
              </>
            )}

            {integral !== null && (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-indigo-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 h-4 text-indigo-600" />
                <span className="text-[10px] sm:text-sm font-bold text-indigo-700">积分: {integral}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <AnimatePresence mode="wait">
          {appMode === "select" && (
            <motion.div
              key="mode-selection"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="max-w-4xl mx-auto space-y-8 py-6"
            >
              <div className="text-center space-y-3">
                <div className="inline-flex px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold border border-indigo-100">
                  🏠 铺装拟真度评测 V4.0
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-800">
                  开启您的 AI 极速试铺之旅
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                  无论您是希望得到贴心的智能设计助理引导，还是渴望在全功能的专业面板上精细调校，我们都为您提供了专属的使用方案。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {/* Agent Mode Card */}
                <div 
                  className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300 flex flex-col justify-between group cursor-pointer"
                  onClick={() => { setAppMode("agent"); initAgentChat(); }}
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-800">智能体模式</h3>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">
                          推荐新手
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        对话式交互，像和专业软装设计师聊天一样。AI 将一步步引导您选择房间场景、材质提取、全景拟合、直接在聊天框内返回生图效果。
                      </p>
                    </div>
                  </div>
                  <button className="w-full mt-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                    开启智能对话引导
                  </button>
                </div>

                {/* Engineer Mode Card */}
                <div 
                  className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300 flex flex-col justify-between group cursor-pointer"
                  onClick={() => { setAppMode("engineer"); reset(); }}
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
                      <Cpu className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-800">专家工作台</h3>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">
                          高阶微调
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        经典分步流程。提供高可控性的光影/漫反射/比例匹配/人模参数调节，支持多图层切换比对、局部放大及原图下载。
                      </p>
                    </div>
                  </div>
                  <button className="w-full mt-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <Layers className="w-4 h-4" />
                    进入工程师工作台
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {appMode === "agent" && (
            <motion.div
              key="agent-chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col h-[75vh]"
            >
              {/* Chat Title bar */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                    <Bot className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">AI 智能设计助手</h3>
                    <p className="text-[10px] text-slate-400">正在为您提供一对一铺装顾问服务</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={initAgentChat}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors bg-white shadow-sm"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    重置对话
                  </button>
                </div>
              </div>

              {/* Message Streams */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 flex flex-col">
                {chatMessages.map((msg) => {
                  const isAsst = msg.sender === "assistant";
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex gap-3 max-w-[85%] ${isAsst ? "self-start" : "ml-auto flex-row-reverse"}`}
                    >
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAsst ? "bg-indigo-100 text-indigo-600" : "bg-indigo-600 text-white"}`}>
                        {isAsst ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>

                      <div className="space-y-2">
                        {/* Text bubble */}
                        {msg.text && (
                          <div className={`rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-sm ${
                            isAsst 
                              ? "bg-white text-slate-700 border border-slate-100 rounded-tl-none whitespace-pre-line" 
                              : "bg-indigo-600 text-white rounded-tr-none"
                          }`}>
                            {msg.text}
                          </div>
                        )}

                        {/* Thinking animation loader */}
                        {msg.type === "thinking" && (
                          <div className="flex items-center gap-1.5 px-1 py-1 text-slate-400">
                            <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                            </div>
                          </div>
                        )}

                        {/* User custom image preview inside bubble */}
                        {msg.data?.previewUrl && (
                          <div className="rounded-xl overflow-hidden border border-slate-200 max-w-xs shadow-md">
                            <img src={msg.data.previewUrl} alt="uploaded" className="w-full h-auto object-cover max-h-48" />
                          </div>
                        )}

                        {/* Interactive upload triggers */}
                        {msg.type === "upload_room" && (
                          <div className="p-4 bg-white rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 transition-all flex flex-col items-center gap-3 text-center cursor-pointer shadow-sm relative group">
                            <input 
                              type="file" 
                              ref={agentRoomInputRef} 
                              accept="image/*" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAgentFileUpload(file, "room");
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">点击或将房间照片拖到这里</p>
                              <p className="text-[10px] text-slate-400 mt-1">支持 JPEG / PNG / WEBP 格式</p>
                            </div>
                          </div>
                        )}

                        {msg.type === "upload_carpet" && (
                          <div className="p-4 bg-white rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 transition-all flex flex-col items-center gap-3 text-center cursor-pointer shadow-sm relative group">
                            <input 
                              type="file" 
                              ref={agentCarpetInputRef} 
                              accept="image/*" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAgentFileUpload(file, "carpet");
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">点击或将地毯原样/面料照片拖到这里</p>
                              <p className="text-[10px] text-slate-400 mt-1">支持 JPEG / PNG / WEBP 格式</p>
                            </div>
                          </div>
                        )}

                        {/* Option buttons */}
                        {msg.type === "options" && msg.options && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.options.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => handleAgentOption(opt.id, opt.label)}
                                className="px-3.5 py-1.5 bg-white hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-[11px] sm:text-xs font-bold text-indigo-600 hover:text-indigo-700 rounded-full transition-all shadow-sm active:scale-95"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Inline progress steps for room analysis */}
                        {msg.type === "room_analysis" && (
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm max-w-sm space-y-4">
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <div className="relative w-10 h-10 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-indigo-100 animate-[ping_1.5s_infinite]" />
                                <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-indigo-600 animate-spin" />
                                <Sparkles className="w-4 h-4 text-indigo-600" />
                              </div>
                              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full animate-pulse">
                                空间分析阶段 {analysisStepIndex + 1}/4
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {[
                                "初始化AI视觉和空间关系解析模型",
                                "判定并标记地平线、墙角以及透视比例参数",
                                "检测全屋自然光源、环境漫射光及色温明暗",
                                "融合家装风格大语言知识，输出分析标签与说明"
                              ].map((step, idx) => {
                                const isDone = analysisStepIndex > idx;
                                const isActive = analysisStepIndex === idx;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`flex items-center gap-2 p-1.5 rounded-lg text-[10px] transition-all duration-300 ${
                                      isDone ? "bg-emerald-50 text-emerald-800" : 
                                      isActive ? "bg-indigo-50 text-indigo-900 border border-indigo-100 shadow-sm" : 
                                      "text-slate-400 opacity-60"
                                    }`}
                                  >
                                    <div className="shrink-0">
                                      {isDone ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : isActive ? (
                                        <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex items-center justify-center text-[8px] font-bold">
                                          {idx + 1}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-semibold truncate">{step}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Inline progress steps for carpet analysis */}
                        {msg.type === "carpet_analysis" && (
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm max-w-sm space-y-4">
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <div className="relative w-10 h-10 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-indigo-100 animate-[ping_1.5s_infinite]" />
                                <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-indigo-600 animate-spin" />
                                <Sparkles className="w-4 h-4 text-indigo-600" />
                              </div>
                              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full animate-pulse">
                                材质分析阶段 {analysisStepIndex + 1}/4
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {[
                                "初始化地毯纹理深度提取核",
                                "色系区间、主色占比与细节密度计算",
                                "材质流苏、梭织工艺及绒高三维特征感应",
                                "根据光照折射生成法线漫反射提示模型"
                              ].map((step, idx) => {
                                const isDone = analysisStepIndex > idx;
                                const isActive = analysisStepIndex === idx;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`flex items-center gap-2 p-1.5 rounded-lg text-[10px] transition-all duration-300 ${
                                      isDone ? "bg-emerald-50 text-emerald-800" : 
                                      isActive ? "bg-indigo-50 text-indigo-900 border border-indigo-100 shadow-sm" : 
                                      "text-slate-400 opacity-60"
                                    }`}
                                  >
                                    <div className="shrink-0">
                                      {isDone ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : isActive ? (
                                        <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex items-center justify-center text-[8px] font-bold">
                                          {idx + 1}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-semibold truncate">{step}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Interactive parameters configuration block inside Chat Bubble */}
                        {msg.type === "param_config" && (
                          <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-md w-full max-w-sm space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                              <span className="text-xs font-bold text-slate-700">铺装渲染参数设置</span>
                            </div>

                            {/* Aspect Ratio */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">比例 (Ratio)</label>
                              <div className="grid grid-cols-5 gap-1">
                                {(["1:1", "4:3", "3:4", "9:16", "16:9"] as const).map((ratio) => (
                                  <button
                                    key={ratio}
                                    onClick={() => setParams(p => ({ ...p, aspectRatio: ratio }))}
                                    className={`py-1 border rounded-lg text-[10px] font-bold transition-all ${
                                      params.aspectRatio === ratio 
                                        ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm" 
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {ratio}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Image Size / Resolution */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">清晰度 (Resolution)</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                {(["1K", "2K", "4K"] as const).map((size) => (
                                  <button
                                    key={size}
                                    onClick={() => setParams(p => ({ ...p, imageSize: size }))}
                                    className={`py-1 border rounded-lg text-[10px] font-bold transition-all ${
                                      params.imageSize === size 
                                        ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm" 
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {size}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Photography Filter */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">摄影滤镜 (Filter)</label>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { id: "natural", name: "自然" },
                                  { id: "cinematic", name: "电影" },
                                  { id: "warm", name: "午后" },
                                  { id: "modern", name: "现代" },
                                  { id: "film", name: "胶片" },
                                  { id: "none", name: "默认" }
                                ].map((filter) => (
                                  <button
                                    key={filter.id}
                                    onClick={() => setParams(p => ({ ...p, filter: filter.id as any }))}
                                    className={`py-1 border rounded-lg text-[10px] font-bold transition-all ${
                                      (params.filter === filter.id || (!params.filter && filter.id === 'none'))
                                        ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm" 
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {filter.name}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Model Option */}
                            <div className="space-y-2 pt-1">
                              <button
                                onClick={() => setParams(p => ({ ...p, hasModel: !p.hasModel }))}
                                className={`w-full py-1.5 border rounded-lg flex items-center justify-between px-3 transition-all ${
                                  params.hasModel
                                    ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm" 
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className={`w-3.5 h-3.5 ${params.hasModel ? "text-indigo-600" : "text-slate-300"}`} />
                                  <span className="text-[10px] font-bold">加入人物模特 (Include Model)</span>
                                </div>
                                <span className="text-[9px] font-medium opacity-60">Lifestyle</span>
                              </button>

                              {params.hasModel && (
                                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5 block">模特性别 (Gender)</label>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {([
                                        { id: "female", name: "女性" },
                                        { id: "male", name: "男性" }
                                      ] as const).map((g) => (
                                        <button
                                          key={g.id}
                                          onClick={() => setParams(p => ({ ...p, modelGender: g.id }))}
                                          className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                                            params.modelGender === g.id 
                                              ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                              : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                          }`}
                                        >
                                          {g.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5 block">模特年龄 (Age Group)</label>
                                    <div className="grid grid-cols-3 gap-1">
                                      {([
                                        { id: "child", name: "儿童" },
                                        { id: "youth", name: "青年" },
                                        { id: "elder", name: "老年" }
                                      ] as const).map((a) => (
                                        <button
                                          key={a.id}
                                          onClick={() => setParams(p => ({ ...p, modelAge: a.id }))}
                                          className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                                            params.modelAge === a.id 
                                              ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                              : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                          }`}
                                        >
                                          {a.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5 block">模特人种 (Ethnicity)</label>
                                    <div className="grid grid-cols-5 gap-1">
                                      {([
                                        { id: "asian", name: "亚裔" },
                                        { id: "european", name: "欧美" },
                                        { id: "african", name: "非裔" },
                                        { id: "indian", name: "印裔" },
                                        { id: "latin", name: "拉美" }
                                      ] as const).map((e) => (
                                        <button
                                          key={e.id}
                                          onClick={() => setParams(p => ({ ...p, modelEthnicity: e.id }))}
                                          className={`py-1 rounded-md text-[9px] font-bold border transition-all ${
                                            params.modelEthnicity === e.id 
                                              ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                              : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                          }`}
                                        >
                                          {e.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Inline progress steps for generation */}
                        {msg.type === "generating" && (
                          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-md max-w-sm space-y-4">
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <div className="relative w-12 h-12 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-indigo-100 animate-ping" />
                                <div className="absolute inset-1 rounded-full border border-indigo-200 animate-pulse" />
                                <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-indigo-600 animate-spin" />
                                <Bot className="w-5 h-5 text-indigo-600 animate-bounce" />
                              </div>
                              <div className="space-y-1">
                                <span className="inline-flex px-2 py-0.5 rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600 animate-pulse">
                                  极速渲染中...
                                </span>
                                <h4 className="text-[11px] font-bold text-slate-700 max-w-xs leading-relaxed px-4 animate-pulse">
                                  ⚡ 正在进行 3D 深度投影拟合，融合立体材质边缘与光源折射...
                                </h4>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Big result container returned directly in Chat Bubble */}
                        {msg.type === "result" && msg.data && (
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md w-full max-w-lg space-y-4">
                            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 relative group border border-slate-100">
                              <img 
                                src={previewImage || msg.data.resultImage || msg.data.modelImage || ""} 
                                alt="fitted result" 
                                className="w-full h-full object-cover" 
                              />
                              <div className="absolute bottom-3 right-3 flex gap-2">
                                <a 
                                  href={previewImage || msg.data.resultImage || msg.data.modelImage || ""} 
                                  download="agent-fitted-carpet.png"
                                  className="p-2 bg-black/70 backdrop-blur-sm rounded-lg text-white hover:bg-black/90 transition-all shadow-md"
                                  title="下载当前效果图"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                                <button 
                                  onClick={() => setPreviewImage(previewImage || msg.data.resultImage)} 
                                  className="p-2 bg-black/70 backdrop-blur-sm rounded-lg text-white hover:bg-black/90 transition-all shadow-md"
                                >
                                  <Maximize className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Result Selection Buttons */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {msg.data.resultImage && (
                                <button 
                                  onClick={() => setPreviewImage(msg.data.resultImage)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${previewImage === msg.data.resultImage || !previewImage ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                  全景效果
                                </button>
                              )}
                              {msg.data.detailImage && (
                                <button 
                                  onClick={() => setPreviewImage(msg.data.detailImage)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${previewImage === msg.data.detailImage ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                  材质微观
                                </button>
                              )}
                              {msg.data.modelImage && (
                                <button 
                                  onClick={() => setPreviewImage(msg.data.modelImage)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${previewImage === msg.data.modelImage ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                  人模交互1
                                </button>
                              )}
                              {msg.data.modelFrontImage && (
                                <button 
                                  onClick={() => setPreviewImage(msg.data.modelFrontImage)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${previewImage === msg.data.modelFrontImage ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                  人模交互2
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input area */}
              <div className="border-t border-slate-150 bg-white p-3">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAgentSubmitText();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={agentTextValue}
                    onChange={(e) => setAgentTextValue(e.target.value)}
                    placeholder={
                      !roomImage && !usePredefinedStyle
                        ? "输入如「奶油风」或「上传房间照片」..."
                        : !(carpetImage && carpetAnalysis)
                        ? "上传地毯，或输入「经典地毯」或描述想要的地毯样式..."
                        : "输入如「比例16:9，添加女性模特」或「开始渲染」..."
                    }
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 font-medium placeholder-slate-400"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!agentTextValue.trim()}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm disabled:shadow-none flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {appMode === "engineer" && currentStep === "room" && (
            <motion.div
              key="step-room"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">第 1 步：选择或上传场景</h2>
                <p className="text-sm sm:text-base text-slate-500">AI 将根据您的房间照片或选择的装修风格进行智能分析</p>
              </div>

              <div className="flex justify-center mb-6 sm:mb-8">
                <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm w-full sm:w-auto max-w-xs sm:max-w-none mx-auto sm:mx-0">
                  <button 
                    onClick={() => {
                        setUsePredefinedStyle(false);
                        setRoomImage(uploadedRoomImage);
                        setRoomAnalysis(uploadedRoomAnalysis);
                    }}
                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${!usePredefinedStyle ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
                  >
                    上传房间照片
                  </button>
                  <button 
                    onClick={() => {
                        setUsePredefinedStyle(true);
                        setRoomImage(null);
                        setRoomAnalysis(predefinedStyleAnalysis);
                    }}
                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${usePredefinedStyle ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
                  >
                    选择装修风格
                  </button>
                </div>
              </div>

              {!roomImage && !usePredefinedStyle ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-all rounded-2xl p-12 text-center cursor-pointer bg-slate-50/50 hover:bg-white"
                >
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={(e) => handleFileUpload(e, "room")} 
                  />
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="text-indigo-600 w-8 h-8" />
                  </div>
                  <p className="text-base sm:text-lg font-medium text-slate-800">点击或拖拽上传房间场景图</p>
                  <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto opacity-30">
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse" />
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse delay-75" />
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse delay-150" />
                  </div>
                </div>
              ) : usePredefinedStyle && !roomAnalysis ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {predefinedStyles.map((style) => (
                    <motion.div
                      key={style.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const styleDesc = style.name + "：" + style.desc;
                        setRoomAnalysis(styleDesc);
                        setPredefinedStyleAnalysis(styleDesc);
                        setUsePredefinedStyle(true);
                        setCurrentStep("carpet");
                      }}
                      className="bg-white border border-slate-200 rounded-2xl p-6 cursor-pointer hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group"
                    >
                      <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors">
                        <Sparkles className="text-indigo-600 w-6 h-6 group-hover:text-white transition-colors" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-2">{style.name}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{style.desc}</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-8 items-stretch">
                  <div className="relative group overflow-hidden rounded-2xl ring-1 ring-black/5 shadow-xl bg-slate-200 aspect-[4/3] flex items-center justify-center">
                    {roomImage ? (
                        <img src={roomImage} alt="Room" className={`w-full h-full object-cover transition-all duration-1000 ${isAnalyzing ? "scale-105 blur-[2px] brightness-75" : "scale-100 blur-0 brightness-100"}`} />
                    ) : (
                        <div className="w-full h-full bg-indigo-600 flex flex-col items-center justify-center text-white p-12 text-center gap-4">
                             <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <Sparkles className="w-10 h-10" />
                             </div>
                             <div>
                                <h3 className="text-xl font-bold mb-1">风格已就绪</h3>
                                <p className="text-sm opacity-80">AI 将为您构建一个完美的场景</p>
                             </div>
                        </div>
                    )}
                    
                    {/* Advanced Scanning Animation */}
                    {isAnalyzing && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Grid Overlay */}
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGc fillPSJub25lIiBzdHJva2U9InJnYmEoNzksNzAsMjI5LDAuMSkiIHN0cm9rZS13aWR0aD0iMC41Ij48cGF0aCBkPSJNMCA0MGg0MFYwIi8+PC9nPjwvc3ZnPg==')] bg-repeat" />
                        
                        {/* Detection Nodes (Simulated AI Points) */}
                        {[...Array(6)].map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ 
                              opacity: [0, 0.8, 0], 
                              scale: [0.5, 1.2, 0.5],
                              x: Math.random() * 200 - 100 + "%",
                              y: Math.random() * 200 - 100 + "%"
                            }}
                            transition={{ 
                              duration: 2, 
                              repeat: Infinity, 
                              delay: i * 0.4,
                              ease: "easeInOut"
                            }}
                            className="absolute top-1/2 left-1/2 w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.8)]"
                          />
                        ))}

                        {/* Scanning Beam */}
                        <motion.div 
                          initial={{ top: "-10%" }}
                          animate={{ top: "110%" }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_20px_rgba(99,102,241,0.5)] z-10"
                        />
                        
                        {/* Center Pulse */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-32 h-32 border border-indigo-500/30 rounded-full animate-[ping_3s_infinite]" />
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => {
                          setRoomImage(null);
                          setRoomAnalysis(null);
                          setUploadedRoomImage(null);
                          setUploadedRoomAnalysis(null);
                      }}
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-20"
                    >
                      <RefreshCcw className="w-4 h-4 text-indigo-600" />
                    </button>
                  </div>
                  
                  <div className="relative w-full h-full min-h-[350px] md:min-h-0">
                    <div className="md:absolute md:inset-0 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between shrink-0 mb-4">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{usePredefinedStyle ? "装修风格" : "场景分析"}</h3>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                                setRoomImage(null);
                                setRoomAnalysis(null);
                                if (usePredefinedStyle) {
                                  setPredefinedStyleAnalysis(null);
                                } else {
                                  setUploadedRoomImage(null);
                                  setUploadedRoomAnalysis(null);
                                }
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                            title="返回修改场景"
                          >
                            <RefreshCcw className="w-3.5 h-3.5" />
                          </button>
                          {isAnalyzing && (
                            <div className="flex items-center gap-1.5 grayscale opacity-50">
                              <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                              <span className="text-[9px] font-bold text-slate-500 tracking-tight">ANALYZING...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3 custom-scrollbar mb-4">
                        {analysisError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 flex items-center gap-2">
                             <Info className="w-3.5 h-3.5 shrink-0" />
                             <span>{analysisError}</span>
                          </div>
                        )}
                        
                        {isAnalyzing ? (
                          <div className="flex flex-col items-center justify-start space-y-4 py-2">
                            {/* Animated Visual Loader */}
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <div className="relative w-12 h-12 flex items-center justify-center">
                                {/* Ripple effect */}
                                <div className="absolute inset-0 rounded-full border border-indigo-100 animate-[ping_1.5s_infinite]" />
                                <div className="absolute inset-2 rounded-full border border-indigo-200 animate-[ping_2s_infinite] delay-300" />
                                
                                {/* Inner spinning glowing indicator */}
                                <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-indigo-600 animate-spin" />
                                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                              </div>
                              
                              <div className="space-y-0.5">
                                <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600 animate-pulse">
                                  解析阶段 {analysisStepIndex + 1}/4
                                </span>
                                <h4 className="text-[11px] font-bold text-slate-700 transition-all duration-300 max-w-xs leading-relaxed px-2">
                                  {analysisStepIndex === 0 && "🔍 正在拉取最新的多模态大模型解析方案..."}
                                  {analysisStepIndex === 1 && "📐 智能标记地面、天花板及立面拐角定位点..."}
                                  {analysisStepIndex === 2 && "💡 分析环境漫反射、主要光源和地毯暗部细节..."}
                                  {analysisStepIndex === 3 && "✨ 结合大模型进行全域风格提炼并提词..."}
                                </h4>
                              </div>
                            </div>

                            {/* Checklist steps */}
                            <div className="space-y-1.5 max-w-sm mx-auto w-full px-1">
                              {[
                                "初始化AI视觉和空间关系解析模型",
                                "判定并标记地平线、墙角以及透视比例参数",
                                "检测全屋自然光源、环境漫射光及色温明暗",
                                "融合家装风格大语言知识，输出分析标签与说明"
                              ].map((step, idx) => {
                                const isDone = analysisStepIndex > idx;
                                const isActive = analysisStepIndex === idx;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`flex items-center gap-2.5 p-1.5 rounded-xl transition-all duration-300 text-[10px] sm:text-[11px] ${
                                      isDone ? "bg-emerald-50/50 text-emerald-800" : 
                                      isActive ? "bg-indigo-50/70 text-indigo-900 border border-indigo-100 shadow-sm shadow-indigo-100/35" : 
                                      "text-slate-400 opacity-60"
                                    }`}
                                  >
                                    <div className="shrink-0">
                                      {isDone ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      ) : isActive ? (
                                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                      ) : (
                                        <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[8px] font-bold">
                                          {idx + 1}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-semibold truncate">{step}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-1 gap-2"
                          >
                            {roomAnalysis?.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <div key={idx} className="flex gap-3 items-start p-2.5 rounded-lg bg-slate-50/80 border border-slate-100/50">
                                <div className="w-1 h-3 bg-indigo-400 rounded-full mt-1 shrink-0" />
                                <p className="text-xs text-slate-600 font-medium leading-relaxed">{line.replace(/^[-•]\s*/, '')}</p>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                      
                      <button 
                        disabled={isAnalyzing || !roomAnalysis}
                        onClick={() => setCurrentStep("carpet")}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-[0.98] shrink-0"
                      >
                        下一步 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {appMode === "engineer" && currentStep === "carpet" && (
            <motion.div
              key="step-carpet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col items-center gap-4 relative">
                <button 
                  onClick={() => {
                    if (usePredefinedStyle) {
                      setRoomImage(null);
                      setRoomAnalysis(predefinedStyleAnalysis);
                    } else {
                      setRoomImage(uploadedRoomImage);
                      setRoomAnalysis(uploadedRoomAnalysis);
                    }
                    setCurrentStep("room");
                  }}
                  className="absolute left-0 top-1.5 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  返回上一步
                </button>
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight text-slate-800">第 2 步：上传地毯样本</h2>
                  <p className="text-slate-500">AI 将分析地毯的材质、纹理与视觉色彩</p>
                </div>
              </div>

              {!carpetImage ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-all rounded-2xl p-12 text-center cursor-pointer bg-slate-50/50 hover:bg-white"
                >
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={(e) => handleFileUpload(e, "carpet")} 
                  />
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <ImageIcon className="text-indigo-600 w-8 h-8" />
                  </div>
                  <p className="text-base sm:text-lg font-medium text-slate-800">点击或拖拽上传地毯图</p>
                  <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto opacity-30">
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse" />
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse delay-75" />
                    <div className="aspect-[4/3] bg-slate-200 rounded-lg animate-pulse delay-150" />
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-8 items-stretch">
                  <div className="relative group overflow-hidden rounded-2xl ring-1 ring-black/5 shadow-xl bg-slate-200 aspect-[4/3] flex items-center justify-center">
                    <img src={carpetImage} alt="Carpet" className={`w-full h-full object-cover transition-all duration-1000 ${isAnalyzing ? "scale-110 blur-[1px] brightness-75" : "scale-100 blur-0 brightness-100"}`} />
                    
                    {/* Carpet Specific Scanning Animation */}
                    {isAnalyzing && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Delicate Mesh Overlay */}
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDc5LDcwLDIyOSwwLjIpIi8+PC9zdmc+')] bg-repeat" />
                        
                        {/* Material Micro-Nodes */}
                        {[...Array(8)].map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ 
                              opacity: [0, 1, 0],
                              scale: [0.2, 1, 0.2],
                              x: (Math.sin(i) * 40 + 50) + "%",
                              y: (Math.cos(i) * 40 + 50) + "%"
                            }}
                            transition={{ 
                              duration: 1.5, 
                              repeat: Infinity, 
                              delay: i * 0.2,
                              ease: "linear"
                            }}
                            className="absolute w-1 h-1 bg-white rounded-full shadow-[0_0_4px_white]"
                          />
                        ))}

                        <motion.div 
                          initial={{ left: "-10%" }}
                          animate={{ left: "110%" }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="absolute top-0 bottom-0 w-[1px] bg-indigo-400 shadow-[0_0_20px_2px_rgba(99,102,241,0.6)] z-10"
                        />
                      </div>
                    )}

                    <button 
                      onClick={() => setCarpetImage(null)}
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-20"
                    >
                      <RefreshCcw className="w-4 h-4 text-indigo-600" />
                    </button>
                  </div>
                  
                  <div className="relative w-full h-full min-h-[350px] md:min-h-0">
                    <div className="md:absolute md:inset-0 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between shrink-0 mb-4">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">材质分析</h3>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                                setCarpetImage(null);
                                setCarpetAnalysis(null);
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                            title="返回修改地毯"
                          >
                            <RefreshCcw className="w-3.5 h-3.5" />
                          </button>
                          {isAnalyzing && (
                            <div className="flex items-center gap-1.5 grayscale opacity-50">
                              <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                              <span className="text-[9px] font-bold text-slate-500 tracking-tight">EXTRACTING...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3 custom-scrollbar mb-4">
                        {analysisError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 flex items-center gap-2">
                             <Info className="w-3.5 h-3.5 shrink-0" />
                             <span>{analysisError}</span>
                          </div>
                        )}
                        
                        {isAnalyzing ? (
                          <div className="flex flex-col items-center justify-start space-y-4 py-2">
                            {/* Animated Visual Loader */}
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <div className="relative w-12 h-12 flex items-center justify-center">
                                {/* Ripple effect */}
                                <div className="absolute inset-0 rounded-full border border-indigo-100 animate-[ping_1.5s_infinite]" />
                                <div className="absolute inset-2 rounded-full border border-indigo-200 animate-[ping_2s_infinite] delay-300" />
                                
                                {/* Inner spinning glowing indicator */}
                                <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-indigo-600 animate-spin" />
                                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                              </div>
                              
                              <div className="space-y-0.5">
                                <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600 animate-pulse">
                                  解析阶段 {analysisStepIndex + 1}/4
                                </span>
                                <h4 className="text-[11px] font-bold text-slate-700 transition-all duration-300 max-w-xs leading-relaxed px-2">
                                  {analysisStepIndex === 0 && "🔍 正在读取地毯纤维与材质细节..."}
                                  {analysisStepIndex === 1 && "🎨 匹配微观纹理与图案对比度..."}
                                  {analysisStepIndex === 2 && "🧶 分析边缘收口与绒头工艺..."}
                                  {analysisStepIndex === 3 && "✨ 生成地毯材质与颜色提词报告..."}
                                </h4>
                              </div>
                            </div>

                            {/* Checklist steps */}
                            <div className="space-y-1.5 max-w-sm mx-auto w-full px-1">
                              {[
                                "初始化地毯纹理深度提取核",
                                "色系区间、主色占比与细节密度计算",
                                "材质流苏、梭织工艺及绒高三维特征感应",
                                "根据光照折射生成法线漫反射提示模型"
                              ].map((step, idx) => {
                                const isDone = analysisStepIndex > idx;
                                const isActive = analysisStepIndex === idx;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`flex items-center gap-2.5 p-1.5 rounded-xl transition-all duration-300 text-[10px] sm:text-[11px] ${
                                      isDone ? "bg-emerald-50/50 text-emerald-800" : 
                                      isActive ? "bg-indigo-50/70 text-indigo-900 border border-indigo-100 shadow-sm shadow-indigo-100/35" : 
                                      "text-slate-400 opacity-60"
                                    }`}
                                  >
                                    <div className="shrink-0">
                                      {isDone ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      ) : isActive ? (
                                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                      ) : (
                                        <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[8px] font-bold">
                                          {idx + 1}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-semibold truncate">{step}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-1 gap-2"
                          >
                            {carpetAnalysis?.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <div key={idx} className="flex gap-3 items-start p-2.5 rounded-lg bg-slate-50/80 border border-slate-100/50">
                                <div className="w-1 h-3 bg-indigo-400 rounded-full mt-1 shrink-0" />
                                <p className="text-xs text-slate-600 font-medium leading-relaxed">{line.replace(/^[-•]\s*/, '')}</p>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                      
                      <button 
                        disabled={isAnalyzing || !carpetAnalysis}
                        onClick={() => setCurrentStep("generate")}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-[0.98] shrink-0"
                      >
                        预览配置 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {appMode === "engineer" && currentStep === "generate" && (
            <motion.div
              key="step-generate"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex flex-col items-center gap-4 relative">
                <button 
                  onClick={() => {
                    setCarpetImage(null);
                    setCarpetAnalysis(null);
                    setCurrentStep("carpet");
                  }}
                  className="absolute left-0 top-1.5 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  返回上一步
                </button>
                <div className="text-center">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800">最后一步：渲染配置</h2>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">确认分析细节并开启 AI 极速渲染</p>
                </div>
              </div>
              
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left: Summary */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">分析汇总</h3>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-bold text-slate-700">场景结构已确认</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3 italic opacity-80">{roomAnalysis}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-bold text-slate-700">材质特征已提取</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 italic opacity-80">{carpetAnalysis}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Config */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-8 border border-slate-200 shadow-xl space-y-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">比例 (Ratio)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["1:1", "4:3", "3:4", "9:16", "16:9"] as const).map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setParams(p => ({ ...p, aspectRatio: ratio }))}
                            className={`py-1.5 border rounded-lg text-xs font-medium transition-all ${
                              params.aspectRatio === ratio 
                                ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm shadow-indigo-100" 
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">清晰度 (Resolution)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["1K", "2K", "4K"] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => setParams(p => ({ ...p, imageSize: size }))}
                            className={`py-1.5 border rounded-lg text-xs font-medium transition-all ${
                              params.imageSize === size 
                                ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm shadow-indigo-100" 
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">摄影滤镜 (Filter)</label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {[
                        { id: "natural", name: "自然" },
                        { id: "cinematic", name: "电影" },
                        { id: "warm", name: "午后" },
                        { id: "modern", name: "现代" },
                        { id: "film", name: "胶片" },
                        { id: "none", name: "默认" }
                      ].map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => setParams(p => ({ ...p, filter: filter.id as any }))}
                          className={`py-2 border rounded-lg flex flex-col items-center justify-center transition-all ${
                            (params.filter === filter.id || (!params.filter && filter.id === 'none'))
                              ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm shadow-indigo-100" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-[11px] font-bold">{filter.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">高级选项 (Advanced)</label>
                    <div className="space-y-3">
                      <button
                        onClick={() => setParams(p => ({ ...p, hasModel: !p.hasModel }))}
                        className={`w-full py-2.5 border rounded-xl flex items-center justify-between px-4 transition-all ${
                          params.hasModel
                            ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className={`w-4 h-4 ${params.hasModel ? "text-indigo-600" : "text-slate-300"}`} />
                          <span className="text-[11px] font-bold">加入模特 (Include Model)</span>
                        </div>
                        <span className="text-[10px] font-medium opacity-60">Lifestyle View</span>
                      </button>

                      {params.hasModel && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4"
                        >
                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">模特性别 (Gender)</label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { id: "female", name: "女性" },
                                { id: "male", name: "男性" }
                              ] as const).map((g) => (
                                <button
                                  key={g.id}
                                  onClick={() => setParams(p => ({ ...p, modelGender: g.id }))}
                                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    params.modelGender === g.id 
                                      ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                      : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                  }`}
                                >
                                  {g.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">模特年龄 (Age Group)</label>
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                { id: "child", name: "儿童" },
                                { id: "youth", name: "青年" },
                                { id: "elder", name: "老年" }
                              ] as const).map((a) => (
                                <button
                                  key={a.id}
                                  onClick={() => setParams(p => ({ ...p, modelAge: a.id }))}
                                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    params.modelAge === a.id 
                                      ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                      : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                  }`}
                                >
                                  {a.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">模特人种 (Ethnicity)</label>
                            <div className="grid grid-cols-5 gap-1.5">
                              {([
                                { id: "asian", name: "亚裔" },
                                { id: "european", name: "欧美" },
                                { id: "african", name: "非裔" },
                                { id: "indian", name: "印裔" },
                                { id: "latin", name: "拉美" }
                              ] as const).map((e) => (
                                <button
                                  key={e.id}
                                  onClick={() => setParams(p => ({ ...p, modelEthnicity: e.id }))}
                                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    params.modelEthnicity === e.id 
                                      ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" 
                                      : "bg-transparent border-slate-200 text-slate-500 hover:bg-white"
                                  }`}
                                >
                                  {e.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={startGeneration}
                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                  >
                    <Sparkles className="w-5 h-5" /> 开启智能生成
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {appMode === "engineer" && currentStep === "result" && (
            <motion.div
              key="step-result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex flex-col items-center gap-4 relative">
                {!isGenerating && (
                  <button 
                    onClick={() => setCurrentStep("generate")}
                    className="absolute left-0 top-1.5 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm group"
                  >
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                    返回上一步
                  </button>
                )}
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-slate-800">
                    {isGenerating ? "正在为您绘制效果图..." : genError ? "生成遇到了点问题" : "生成成功"}
                  </h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                    {isGenerating ? "系统正在执行高精度室内渲染与材质融合" : genError ? "AI 助手暂时无法完成任务" : "YOUR CUSTOM CARPET VISUALIZATION IS READY"}
                  </p>
                </div>
              </div>

              {genError && (
                <div className="max-w-xl mx-auto p-6 bg-red-50 border border-red-100 rounded-2xl text-center space-y-3">
                  <Info className="w-8 h-8 text-red-600 mx-auto" />
                  <p className="text-xs text-red-700 leading-relaxed">{genError}</p>
                  <button 
                    onClick={startGeneration}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 shadow-md transition-all active:scale-95"
                  >
                    立即重试
                  </button>
                </div>
              )}

            <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 ${genError ? 'opacity-30 pointer-events-none' : ''}`}>
                {/* Main View */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center">全景试铺效果 (Panoramic)</h3>
                  <div 
                    onClick={() => resultImage && !isGenerating && setPreviewImage(resultImage)}
                    className={`relative bg-white rounded-xl overflow-hidden shadow-lg border border-slate-200 aspect-square flex items-center justify-center ${resultImage && !isGenerating ? 'cursor-zoom-in' : ''}`}
                  >
                    {!resultImage && isGenerating ? (
                      <div className="text-center space-y-4">
                        <div className="w-12 h-12 border-4 border-slate-50 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest animate-pulse">Rendering...</span>
                      </div>
                    ) : resultImage ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full h-full"
                      >
                        <img src={resultImage} alt="Panoramic Result" className="w-full h-full object-cover" />
                        <a 
                          href={resultImage} 
                          download="carpet-fitting-panoramic.png"
                          className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-lg p-2 shadow-md hover:bg-white transition-all border border-slate-200"
                        >
                          <Download className="w-4 h-4 text-indigo-600" />
                        </a>
                      </motion.div>
                    ) : (
                      <div className="text-center p-4">
                          <p className="text-[10px] text-slate-400">渲染失败</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail View */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center">工艺细节透视 (Technical)</h3>
                  <div 
                    onClick={() => detailImage && !isGenerating && setPreviewImage(detailImage)}
                    className={`relative bg-white rounded-xl overflow-hidden shadow-lg border border-slate-200 aspect-square flex items-center justify-center ${detailImage && !isGenerating ? 'cursor-zoom-in' : ''}`}
                  >
                    {!detailImage && isGenerating ? (
                      <div className="text-center space-y-4">
                        <div className="w-12 h-12 border-4 border-slate-50 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest animate-pulse">Analyzing...</span>
                      </div>
                    ) : detailImage ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full h-full"
                      >
                        <img src={detailImage} alt="Detail Result" className="w-full h-full object-cover" />
                        <a 
                          href={detailImage} 
                          download="carpet-fitting-detail.png"
                          className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-lg p-2 shadow-md hover:bg-white transition-all border border-slate-200"
                        >
                          <Download className="w-4 h-4 text-indigo-600" />
                        </a>
                      </motion.div>
                    ) : (
                      <div className="text-center p-4">
                          <p className="text-[10px] text-slate-400">生成失败</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Model Top View */}
                {params.hasModel && (
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center">生活俯拍视角 (Overhead)</h3>
                    <div 
                      onClick={() => modelImage && !isGenerating && setPreviewImage(modelImage)}
                      className={`relative bg-white rounded-xl overflow-hidden shadow-lg border border-slate-200 aspect-square flex items-center justify-center ${modelImage && !isGenerating ? 'cursor-zoom-in' : ''}`}
                    >
                      {!modelImage && isGenerating ? (
                        <div className="text-center space-y-4">
                          <div className="w-12 h-12 border-4 border-slate-50 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest animate-pulse">Modeling...</span>
                        </div>
                      ) : modelImage ? (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="w-full h-full"
                        >
                          <img src={modelImage} alt="Model Interaction Result" className="w-full h-full object-cover" />
                          <a 
                            href={modelImage} 
                            download="carpet-fitting-lifestyle-top.png"
                            className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-lg p-2 shadow-md hover:bg-white transition-all border border-slate-200"
                          >
                            <Download className="w-4 h-4 text-indigo-600" />
                          </a>
                        </motion.div>
                      ) : (
                        <div className="text-center p-4">
                            <p className="text-[10px] text-slate-400">渲染失败</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Model Front View */}
                {params.hasModel && (
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center">坐姿正面视角 (Frontal)</h3>
                    <div 
                      onClick={() => modelFrontImage && !isGenerating && setPreviewImage(modelFrontImage)}
                      className={`relative bg-white rounded-xl overflow-hidden shadow-lg border border-slate-200 aspect-square flex items-center justify-center ${modelFrontImage && !isGenerating ? 'cursor-zoom-in' : ''}`}
                    >
                      {!modelFrontImage && isGenerating ? (
                        <div className="text-center space-y-4">
                          <div className="w-12 h-12 border-4 border-slate-50 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest animate-pulse">Modeling...</span>
                        </div>
                      ) : modelFrontImage ? (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="w-full h-full"
                        >
                          <img src={modelFrontImage} alt="Model Front Interaction Result" className="w-full h-full object-cover" />
                          <a 
                            href={modelFrontImage} 
                            download="carpet-fitting-lifestyle-front.png"
                            className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-lg p-2 shadow-md hover:bg-white transition-all border border-slate-200"
                          >
                            <Download className="w-4 h-4 text-indigo-600" />
                          </a>
                        </motion.div>
                      ) : (
                        <div className="text-center p-4">
                            <p className="text-[10px] text-slate-400">渲染失败</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {!isGenerating && !genError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-center pt-2"
                >
                  <button 
                    onClick={reset}
                    className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <RefreshCcw className="w-4 h-4" /> 重新开始
                  </button>
                  <button 
                    onClick={() => setCurrentStep("generate")}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                  >
                    <Maximize className="w-4 h-4" /> 调整配置
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Preview Lightbox */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-10"
              onClick={() => setPreviewImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              >
                <img 
                  src={previewImage} 
                  alt="Preview" 
                  className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-4">
                  <button 
                    onClick={() => setPreviewImage(null)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <a 
                    href={previewImage} 
                    download="generated-carpet-full.png"
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  >
                    <Download className="w-6 h-6" />
                  </a>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[9px] sm:text-[11px] text-slate-400 uppercase tracking-widest shrink-0 font-sans">
        <div className="text-center sm:text-left">© 2026 AI CARPET VISUALIZER SYSTEM</div>
        <div className="text-center sm:text-right">Design Precision: 100% | Rendering Engine: V2.5.0</div>
      </footer>
    </div>
  );
}
