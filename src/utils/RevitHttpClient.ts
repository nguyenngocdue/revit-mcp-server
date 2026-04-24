/**
 * RevitHttpClient — gọi Revit plugin qua HTTP thay vì TCP raw.
 *
 * Khi REVIT_HTTP_URL được set (ví dụ: https://xxxx.trycloudflare.com),
 * toàn bộ command được gửi qua HTTP POST.
 * Không cần mutex vì HTTP là stateless request/response.
 */

let revitHttpUrl: string | undefined = process.env.REVIT_HTTP_URL;
const REVIT_COMMAND_TIMEOUT_MS = 120_000; // 2 phút

/** Cập nhật URL lúc runtime — gọi từ endpoint /set-revit-url */
export function setRevitHttpUrl(url: string): void {
  revitHttpUrl = url;
}

export function getRevitHttpUrl(): string | undefined {
  return revitHttpUrl;
}

export function isHttpMode(): boolean {
  return !!revitHttpUrl;
}

export async function sendRevitCommandHttp(method: string, params: any = {}): Promise<any> {
  if (!revitHttpUrl) {
    throw new Error("REVIT_HTTP_URL is not set");
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
    id: requestId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVIT_COMMAND_TIMEOUT_MS);

  try {
    console.error(`[RevitHTTP] POST ${revitHttpUrl} → ${method}`);
    const response = await fetch(revitHttpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    console.error(`[RevitHTTP] Response received for ${method}`);

    if (data.error) {
      throw new Error(data.error.message || "Unknown error from Revit");
    }

    return data.result;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Revit command timed out after ${REVIT_COMMAND_TIMEOUT_MS / 1000}s: ${method}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
