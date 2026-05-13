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

export async function consumeIntegral(userId: string, toolId: string): Promise<SaaSConsumeResponse> {
  const response = await fetch("/api/tool/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, toolId }),
  });
  return response.json();
}

export interface SaaSImageUploadResponse {
  success: boolean;
  url?: string;
  source?: string;
  savedToRecords?: boolean;
  recordId?: string;
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
 * Upload result images to SaaS OSS following the Triple-Step Flow:
 * 1. Get direct-token
 * 2. PUT to OSS
 * 3. Commit to database
 */
export async function uploadResultImage(userId: string, toolId: string, imageData: string | string[]): Promise<SaaSImageUploadResponse> {
  const images = Array.isArray(imageData) ? imageData : [imageData];
  const results: SaaSImageUploadResponse[] = [];

  for (const [index, base64] of images.entries()) {
    try {
      const blob = base64ToBlob(base64);
      const fileName = `result_${Date.now()}_${index}.png`;

      // 1. Get direct-token
      const tokenRes = await fetch("/api/upload/direct-token", {
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
      const tokenData = await tokenRes.json();

      if (!tokenData.success) {
        throw new Error(tokenData.message || "Failed to get upload token");
      }

      // 2. PUT to OSS (Use uploadUrl or proxyUploadUrl per spec)
      const uploadUrl = tokenData.uploadUrl || tokenData.proxyUploadUrl;
      const ossRes = await fetch(uploadUrl, {
        method: tokenData.method || "PUT",
        headers: tokenData.headers || { "Content-Type": blob.type },
        body: blob,
      });

      if (!ossRes.ok) {
        throw new Error("Failed to upload image to OSS");
      }

      // 3. Commit to database
      const commitRes = await fetch("/api/upload/commit", {
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
      const commitData = await commitRes.json();
      
      // Documentation Stability Check: verify savedToRecords and recordId
      if (commitData.success && commitData.savedToRecords) {
        console.log(`Image ${index} successfully saved to gallery. RecordId: ${commitData.recordId}`);
      } else {
        console.warn(`Image ${index} uploaded but not saved to gallery:`, commitData.message);
      }
      
      results.push(commitData);
    } catch (error: any) {
      console.error(`Failed to upload image ${index}:`, error);
      results.push({ success: false, message: error.message });
    }
  }

  // Return the first one or a summary
  return results[0] || { success: false, message: "No images to upload" };
}
