export interface VisualAnalysis {
  spatialStructure: string;
  carpetDetails: string;
  themeStyle: string;
}

export interface VideoGenerationResult {
  success: boolean;
  operationName?: string;
  visualAnalysis?: VisualAnalysis;
  promptUsed?: string;
  error?: string;
}

export interface VideoStatusResult {
  success: boolean;
  done: boolean;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Initiates the multi-step video generation on the back-end
 */
export async function generateVideo(
  imageBase64: string,
  userId: string,
  toolId: string,
  aspectRatio: string
): Promise<VideoGenerationResult> {
  const response = await fetch("/api/video/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageBase64,
      userId,
      toolId,
      aspectRatio,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errJson;
    try {
      errJson = JSON.parse(errText);
    } catch {
      // Not json
    }
    throw new Error(errJson?.error || errText || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Polls the current Veo operation status
 */
export async function checkVideoStatus(operationName: string): Promise<VideoStatusResult> {
  const response = await fetch("/api/video/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operationName }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
