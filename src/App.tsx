import React, { useState, useRef } from "react";
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
  ArrowLeft
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
  GenerationParams
} from "./services/geminiService";
import { 
  launchTool, 
  verifyIntegral, 
  consumeIntegral,
  SaaSUser,
  uploadResultImage,
  createRequestId
} from "./services/saasService";

type Step = "room" | "carpet" | "generate" | "result";

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
    model: "gemini-3.1-flash-image-preview",
    filter: "none",
    modelGender: "female",
    modelAge: "youth"
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
          
          // Validate Room
          const validation = await validateIsRoom(base64);
          if (!validation.isValid) {
            setAnalysisError(validation.reason || "上传的图片似乎不包含房间场景，建议更换符合要求的图片以获得更佳生成效果。");
            setIsAnalyzing(false);
            return;
          }
          
          const analysis = await analyzeRoom(base64);
          setRoomAnalysis(analysis);
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
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm flex items-center shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm rotate-45"></div>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">AI 地毯试铺助手</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            {integral !== null && (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-indigo-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 h-4 text-indigo-600" />
                <span className="text-[10px] sm:text-sm font-bold text-indigo-700">积分: {integral}</span>
              </div>
            )}
            <nav className="hidden lg:flex items-center gap-8 text-sm font-medium">
              {["场景分析", "地毯匹配", "生成预览", "结果预览"].map((label, idx) => {
                const steps: Step[] = ["room", "carpet", "generate", "result"];
                const isActive = currentStep === steps[idx];
                const isDone = steps.indexOf(currentStep) > idx;

                if (isActive) {
                  return (
                    <div key={label} className="flex items-center gap-2 text-indigo-600">
                      <span className="w-6 h-6 rounded-full border-2 border-indigo-600 flex items-center justify-center text-xs italic">
                        0{idx + 1}
                      </span>
                      <span>{label}</span>
                    </div>
                  );
                }

                return (
                  <div key={label} className={`flex items-center gap-2 ${isDone ? "text-indigo-400" : "text-slate-400"}`}>
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${isDone ? "border-indigo-400 bg-indigo-50" : "border-slate-300"}`}>
                      {isDone ? <CheckCircle2 className="w-3 h-3" /> : `0${idx + 1}`}
                    </span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </nav>
            <div className="lg:hidden flex items-center">
              <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-100">
                {currentStep === "room" && "步骤 1/4"}
                {currentStep === "carpet" && "步骤 2/4"}
                {currentStep === "generate" && "步骤 3/4"}
                {currentStep === "result" && "步骤 4/4"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {currentStep === "room" && (
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
                        setRoomAnalysis(null);
                        setRoomImage(null);
                    }}
                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${!usePredefinedStyle ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
                  >
                    上传房间照片
                  </button>
                  <button 
                    onClick={() => {
                        setUsePredefinedStyle(true);
                        setRoomAnalysis(null);
                        setRoomImage(null);
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
                  <p className="text-slate-400 text-[10px] sm:text-sm mt-1">支持常见图片格式（如 JPG, PNG, WebP），最大支持 20MB（通过前端压缩上传）</p>
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
                        setRoomAnalysis(style.name + "：" + style.desc);
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
                <div className="grid md:grid-cols-2 gap-8 items-start">
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
                      }}
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-20"
                    >
                      <RefreshCcw className="w-4 h-4 text-indigo-600" />
                    </button>
                  </div>
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{usePredefinedStyle ? "装修风格" : "场景分析"}</h3>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                                setRoomImage(null);
                                setRoomAnalysis(null);
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
                      
                      {analysisError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 flex items-center gap-2">
                           <Info className="w-3.5 h-3.5 shrink-0" />
                           <span>{analysisError}</span>
                        </div>
                      )}
                      
                      {isAnalyzing ? (
                        <div className="space-y-2">
                          {[1, 2].map(i => (
                            <div key={i} className="h-6 bg-slate-100 rounded-lg animate-pulse" />
                          ))}
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
                      
                      <button 
                        disabled={isAnalyzing || !roomAnalysis}
                        onClick={() => setCurrentStep("carpet")}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
                      >
                        下一步 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "carpet" && (
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
                    setRoomImage(null);
                    setRoomAnalysis(null);
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
                  className="group relative border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-all rounded-2xl p-8 sm:p-12 text-center cursor-pointer bg-slate-50/50 hover:bg-white"
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
                  <p className="text-slate-400 text-[10px] sm:text-sm mt-1">支持常见图片格式（如 JPG, PNG, WebP），最大支持 20MB（通过前端压缩上传）</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-8 items-start">
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
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
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

                      {analysisError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 flex items-center gap-2">
                           <Info className="w-3.5 h-3.5 shrink-0" />
                           <span>{analysisError}</span>
                        </div>
                      )}
                      
                      {isAnalyzing ? (
                        <div className="space-y-2">
                          <div className="h-6 bg-slate-100 rounded-lg animate-pulse" />
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
                      <button 
                        disabled={isAnalyzing || !carpetAnalysis}
                        onClick={() => setCurrentStep("generate")}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-[0.98]"
                      >
                        预览配置 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "generate" && (
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

          {currentStep === "result" && (
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
