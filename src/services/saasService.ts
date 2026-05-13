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

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function consumeIntegral(userId: string, toolId: string, requestId?: string): Promise<SaaSConsumeResponse> {
  const response = await fetch("/api/tool/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId, 
      toolId,
      requestId: requestId || createRequestId()
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
      idempotencyKey: idempotencyKey || createRequestId(),
    }),
  });
  return response.json();
}

export async function uploadResultImage(userId: string, toolId: string, imageData: string | string[], idempotencyKey?: string): Promise<SaaSImageUploadResponse> {
  const base64s = Array.isArray(imageData) ? imageData : [imageData];
  const rootId = idempotencyKey || createRequestId();
  const results: SaaSImageUploadResponse[] = [];

  for (let i = 0; i < base64s.length; i++) {
    const base64 = base64s[i];
    try {
      const response = await fetch("/api/upload/save-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toolId,
          source: "result",
          base64s: [base64],
          idempotencyKey: `${rootId}-${i}`,
        }),
      });
      
      const result = await response.json();
      
      if (result.success && result.savedToRecords) {
        console.log(`Image ${i} successfully saved to gallery. RecordId: ${result.recordId || result.image?.recordId}`);
      } else {
        console.warn(`Image ${i} uploaded but not saved to gallery:`, result.message);
      }
      results.push(result);
    } catch (error: any) {
      console.error(`Failed to upload image ${i} via save-result:`, error);
      results.push({ success: false, message: error.message });
    }
  }
  
  // Return the first result (or a summary if needed) for compatibility
  return results[0] || { success: false, message: "No images to upload" };
}
