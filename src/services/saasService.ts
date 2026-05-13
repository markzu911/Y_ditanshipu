export interface SaaSUser {
  name: string;
  enterprise: string;
  integral: number;
}

export interface SaaSTool {
  name: string;
  integral: number;
}

export interface SaaSLaunchResponse {
  success: boolean;
  data?: {
    user: SaaSUser;
    tool: SaaSTool;
  };
  message?: string;
}

export interface SaaSVerifyResponse {
  success: boolean;
  data?: {
    currentIntegral: number;
    requiredIntegral: number;
  };
  message?: string;
}

export interface SaaSConsumeResponse {
  success: boolean;
  data?: {
    currentIntegral: number;
    consumedIntegral: number;
  };
  message?: string;
}

export async function launchTool(userId: string, toolId: string): Promise<SaaSLaunchResponse> {
  const response = await fetch("/api/tool/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, toolId }),
  });
  return response.json();
}

export async function verifyIntegral(userId: string, toolId: string): Promise<SaaSVerifyResponse> {
  const response = await fetch("/api/tool/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, toolId }),
  });
  return response.json();
}

export async function consumeIntegral(userId: string, toolId: string, requestId?: string): Promise<SaaSConsumeResponse> {
  const response = await fetch("/api/tool/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId, 
      toolId,
      requestId: requestId || crypto.randomUUID() // Recommended idempotency key
    }),
  });
  return response.json();
}

export interface SaaSImageUploadResponse {
  success: boolean;
  url?: string;
  source?: string;
  savedToRecords?: boolean;
  recordId?: string;
  image?: {
    url: string;
    fileName: string;
    recordId: string;
    savedToRecords: boolean;
  };
  images?: any[];
  message?: string;
}

export async function saveResultUrls(userId: string, toolId: string, imageUrls: string[], idempotencyKey?: string): Promise<SaaSImageUploadResponse> {
  const response = await fetch("/api/upload/save-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      toolId,
      source: "result",
      imageUrls,
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
    }),
  });
  return response.json();
}

export async function uploadResultImage(userId: string, toolId: string, imageData: string | string[], idempotencyKey?: string): Promise<SaaSImageUploadResponse> {
  const base64s = Array.isArray(imageData) ? imageData : [imageData];
  
  try {
    const response = await fetch("/api/upload/save-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        toolId,
        source: "result",
        base64s,
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
      }),
    });
    
    const result = await response.json();
    
    if (result.success && result.savedToRecords) {
      console.log(`Images successfully saved to gallery. RecordId: ${result.recordId || result.image?.recordId}`);
    } else {
      console.warn(`Images uploaded but not saved to gallery:`, result.message);
    }
    
    return result;
  } catch (error: any) {
    console.error("Failed to upload images via save-result:", error);
    return { success: false, message: error.message };
  }
}
