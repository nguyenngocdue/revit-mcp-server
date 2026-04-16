export class HttpRevitClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private generateRequestId(): string {
    return Date.now().toString() + Math.random().toString().substring(2, 8);
  }

  public async sendCommand(command: string, params: any = {}): Promise<any> {
    const requestId = this.generateRequestId();
    const body = {
      jsonrpc: "2.0",
      method: command,
      params: params,
      id: requestId,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.baseUrl}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { error?: { message?: string }; result?: any };
      if (data.error) {
        throw new Error(data.error.message || "Unknown error from Revit");
      }
      return data.result;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error(`Command timed out after 2 minutes: ${command}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
