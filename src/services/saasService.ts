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
