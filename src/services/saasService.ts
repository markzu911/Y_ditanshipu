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

/**
 * Helper to safely handle production responses and avoid "Unexpected token <" errors
 */
async function safeFetch<T>(url: string, options: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data: any = {};
    
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { success: false, message: text.slice(0, 300) || `HTTP Error ${res.status}` };
    }

    if (!res.ok || data.success === false) {
      // Create a predictable error structure
      const errorMsg = data.message || data.error || `Request failed with status ${res.status}`;
      return { success: false, message: errorMsg } as any;
    }

    return data;
  } catch (error: any) {
    return { success: false, message: error.message || "Network request failed" } as any;
  }
}

export async function launchTool(userId: string, toolId: string): Promise<SaaSLaunchResponse> {
  return safeFetch<SaaSLaunchResponse>("/api/tool/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, toolId }),
  });
}

export async function verifyIntegral(userId: string, toolId: string): Promise<SaaSVerifyResponse> {
  return safeFetch<SaaSVerifyResponse>("/api/tool/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, toolId }),
  });
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function consumeIntegral(userId: string, toolId: string, requestId?: string): Promise<SaaSConsumeResponse> {
  return safeFetch<SaaSConsumeResponse>("/api/tool/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId, 
      toolId,
      requestId: requestId || createRequestId()
    }),
  });
}

export interface SaaSImageUploadResponse {
  success: boolean;
  savedToRecords?: boolean;
  recordId?: string;
  url?: string;
  fileName?: string;
  image?: {
    recordId: string;
    url: string;
    fileName: string;
    savedToRecords: boolean;
  };
  message?: string;
}

/**
 * Utility to convert base64 to Blob
 */
function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

/**
 * Standard Image Upload Logic following the Triple-Step (V4-3Step) standard:
 * 1. direct-token (Get temporary OSS URL)
 * 2. PUT (Upload binary to OSS)
 * 3. commit (Confirm record persistence)
 */
export async function uploadResultImage(
  userId: string, 
  toolId: string, 
  imageData: string | string[], 
  idempotencyKey?: string
): Promise<SaaSImageUploadResponse> {
  const images = Array.isArray(imageData) ? imageData : [imageData];
  const results: SaaSImageUploadResponse[] = [];

  for (const [index, base64] of images.entries()) {
    try {
      const blob = base64ToBlob(base64);
      const fileName = `result_${Date.now()}_${index}.png`;

      // Step 1: Get direct-token
      const tokenData = await safeFetch<any>("/api/upload/direct-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toolId,
          source: "result",
          fileName,
          mimeType: blob.type,
          fileSize: blob.size,
        }),
      });

      if (!tokenData.success) {
        throw new Error(tokenData.message || "Failed to get upload token");
      }

      // Step 2: PUT to OSS (Standard binary upload)
      const uploadUrl = tokenData.uploadUrl || tokenData.ossUploadUrl;
      const ossRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          ...tokenData.headers,
          "Content-Type": blob.type,
        },
        body: blob,
      });

      if (!ossRes.ok) {
        throw new Error(`OSS Upload failed with status ${ossRes.status}`);
      }

      // Step 3: Explicit commit for persistence
      const finalResult = await safeFetch<SaaSImageUploadResponse>("/api/upload/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toolId,
          source: "result",
          objectKey: tokenData.objectKey,
          fileSize: blob.size,
        }),
      });
      
      if (finalResult.success && finalResult.savedToRecords) {
        console.log(`Image ${index} saved. RecordId: ${finalResult.recordId || finalResult.image?.recordId}`);
      } else {
        console.warn(`Image ${index} uploaded but commit failed:`, finalResult.message);
      }
      
      results.push(finalResult);
    } catch (error: any) {
      console.error(`SaaS Upload Flow Error [Image ${index}]:`, error);
      results.push({ success: false, message: error.message });
    }
  }

  return results[0] || { success: false, message: "No images were processed" };
}
