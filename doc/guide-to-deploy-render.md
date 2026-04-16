# Deploy DeepBIM MCP Server lên Render

---

## 1. Kiến trúc

```
VS Code / Claude
      │
      │  HTTP POST /mcp  (MCP Streamable HTTP)
      ▼
DeepBIM MCP Server  (Render)
      │
      │  HTTP POST /api/command  (JSON-RPC)
      ▼
  REVIT_URL  (ngrok tunnel hoặc public endpoint)
      │
      ▼
Revit Plugin  (máy local, port 8080)
```

### Transport được dùng

| Thành phần | Transport |
|---|---|
| VS Code ↔ MCP Server | **MCP Streamable HTTP** (stateless, POST /mcp) |
| MCP Server ↔ Revit | **HTTP** (POST /api/command qua `HttpClient`) |

---

## 2. Yêu cầu

- Tài khoản [Render](https://dashboard.render.com)
- Tài khoản [ngrok](https://ngrok.com) (free tier đủ dùng)
- Revit plugin đang chạy HTTP server trên máy local (port 8080)
- Repo đã push lên GitHub

---

## 3. Cấu trúc file quan trọng

```
src/
  index.ts              — Express server, endpoint /mcp, /mcp/tools, /health, /
  tools/
    register.ts         — Load & cache tool modules, register vào McpServer
  utils/
    HttpClient.ts       — Gửi JSON-RPC tới Revit qua HTTP fetch
    ConnectionManager.ts — Tạo HttpRevitClient từ REVIT_URL env var
render.yaml             — Config deploy Render
Dockerfile              — Docker build (tuỳ chọn)
```

---

## 4. Expose Revit Plugin ra internet (ngrok)

Revit plugin phải listen HTTP tại `POST /api/command`, nhận JSON-RPC và trả response.

```bash
# Chạy ngrok tunnel tới port Revit plugin
ngrok http 8080
```

Kết quả:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

Lưu lại URL này — sẽ dùng làm `REVIT_URL` trên Render.

> **Lưu ý:** Free plan ngrok đổi URL mỗi lần restart. Dùng paid plan hoặc cập nhật `REVIT_URL` trên Render mỗi lần.

---

## 5. Deploy lên Render

### 5.1. Push code lên GitHub

```bash
git add .
git commit -m "feat: HTTP transport for Render deployment"
git push
```

### 5.2. Tạo Web Service

1. Vào [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect GitHub repo
3. Render tự đọc `render.yaml` — không cần cấu hình thêm

### 5.3. Cấu hình thủ công trên dashboard (nếu không dùng render.yaml)

| Trường | Giá trị |
|---|---|
| **Runtime** | Node |
| **Region** | Singapore |
| **Build Command** | `npm install -g pnpm@10.22.0 && pnpm install --frozen-lockfile && pnpm build` |
| **Start Command** | `node build/index.js` |
| **Health Check Path** | `/health` |

### 5.4. Environment Variables

| Key | Value | Bắt buộc |
|---|---|---|
| `NODE_ENV` | `production` | ✓ |
| `MCP_TRANSPORT` | `http` | ✓ |
| `REVIT_URL` | `https://abc123.ngrok-free.app` | ✓ |
| `API_KEY` | (để trống = server tự sinh, xem log) | Không |

---

## 6. Kết nối VS Code

Sau khi deploy, Render cấp URL dạng:
```
https://revit-mcp-server.onrender.com
```

Thêm vào `.vscode/mcp.json`:

```json
{
  "servers": {
    "deepbim-mcp-server-http": {
      "type": "http",
      "url": "https://revit-mcp-server.onrender.com/mcp"
    }
  }
}
```

---

## 7. Endpoints

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| `GET` | `/` | Landing page — version, uptime, tool count | Không |
| `GET` | `/health` | Health check cho Render | Không |
| `GET` | `/mcp/tools` | Danh sách tất cả tools đã đăng ký | Không |
| `POST` | `/mcp` | MCP Streamable HTTP endpoint | Không |

---

## 8. Cách server hoạt động (stateless)

Mỗi request tới `/mcp`:
1. Tạo `StreamableHTTPServerTransport` mới (`sessionIdGenerator: undefined`)
2. Tạo `McpServer` mới
3. Gọi `registerTools(sessionServer)` — dùng cache, không re-import
4. `sessionServer.connect(transport)` — không bao giờ lỗi "already connected"
5. Xử lý request, trả response, kết thúc

Không cần lưu session — phù hợp với Render (có thể có nhiều instance, restart bất kỳ lúc).

---

## 9. Troubleshooting

### `Cannot find module 'build/index.js'`
Build command chưa chạy `tsc`. Kiểm tra Build Command trên Render dashboard đã có `pnpm build` chưa.

### `Already connected to a transport`
Code cũ — pull code mới và redeploy.

### `Invalid or missing mcp-session-id`
Code cũ dùng stateful mode — pull code mới và redeploy.

### Revit không phản hồi
- Kiểm tra ngrok đang chạy
- Kiểm tra `REVIT_URL` env var trên Render đúng URL ngrok
- Kiểm tra Revit plugin listen `POST /api/command`

### Render free plan bị sleep sau 15 phút
Dùng [UptimeRobot](https://uptimerobot.com) ping `/health` mỗi 10 phút, hoặc nâng lên Starter plan.


Hướng dẫn từng bước để deploy Revit MCP Server lên [Render](https://render.com) và cấu hình kết nối từ xa với Revit plugin.

---

## 1. Tổng quan kiến trúc

### Hiện tại (Local)

```
Claude ──stdio──▶ MCP Server (local) ──TCP──▶ Revit Plugin (localhost:8080)
```

### Sau khi deploy (Remote)

```
Claude ──HTTP/SSE──▶ MCP Server (Render) ──TCP──▶ Ngrok Tunnel ──▶ Revit Plugin (máy local)
```

### Thay đổi cần thiết

| Thành phần | Hiện tại | Sau deploy |
|---|---|---|
| **MCP Transport** | stdio | HTTP + SSE (Server-Sent Events) |
| **Revit host** | `localhost` | Địa chỉ ngrok (env var) |
| **Bảo mật** | Không cần (local) | Auth token bắt buộc |

---

## 2. Yêu cầu

- Tài khoản [Render](https://dashboard.render.com)
- Tài khoản [ngrok](https://ngrok.com) (free tier đủ dùng)
- Revit plugin đang chạy trên máy local

---

## 3. Thay đổi MCP Server

### 3.1. Cài thêm dependencies

```bash
pnpm add express cors
pnpm add -D @types/express @types/cors
```

### 3.2. Cập nhật `src/index.ts`

Chuyển từ `StdioServerTransport` sang `SSEServerTransport`:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/register.js";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

const server = new McpServer({
  name: "revit-mcp-server",
  version: "1.0.0",
});

// Biến lưu transport hiện tại
let transport: SSEServerTransport | null = null;

// Health check endpoint - Render dùng để kiểm tra server còn sống
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// SSE endpoint - client kết nối vào đây để nhận events
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  console.error("Client connected via SSE");
});

// Messages endpoint - client gửi request qua đây
app.post("/messages", async (req, res) => {
  if (!transport) {
    res.status(400).json({ error: "No active SSE connection" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

async function main() {
  await registerTools(server);

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`Revit MCP Server listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Error starting Revit MCP Server:", error);
  process.exit(1);
});
```

### 3.3. Cập nhật `src/utils/ConnectionManager.ts`

Thay `localhost` bằng environment variables:

```typescript
import { RevitClientConnection } from "./SocketClient.js";
import * as net from "net";

let connectionMutex: Promise<void> = Promise.resolve();

// Đọc từ environment variables, fallback về localhost
const REVIT_HOST = process.env.REVIT_HOST || "localhost";
const PORT_START = parseInt(process.env.REVIT_PORT_START || "8080");
const PORT_END = parseInt(process.env.REVIT_PORT_END || "8099");

async function findRevitPort(): Promise<number> {
  for (let port = PORT_START; port <= PORT_END; port++) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000); // Tăng timeout vì kết nối qua internet
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, REVIT_HOST);
    });
    if (isOpen) return port;
  }
  throw new Error(
    `No Revit MCP plugin found on ${REVIT_HOST}:${PORT_START}-${PORT_END}`
  );
}

export async function withRevitConnection<T>(
  operation: (client: RevitClientConnection) => Promise<T>
): Promise<T> {
  const previousMutex = connectionMutex;
  let releaseMutex: () => void;
  connectionMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });
  await previousMutex;

  const port = await findRevitPort();
  const revitClient = new RevitClientConnection(REVIT_HOST, port);

  try {
    if (!revitClient.isConnected) {
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          resolve();
        };

        const onError = (error: any) => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          reject(new Error("Failed to connect to Revit plugin"));
        };

        revitClient.socket.on("connect", onConnect);
        revitClient.socket.on("error", onError);

        revitClient.connect();

        setTimeout(() => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          reject(new Error("Connection to Revit timed out"));
        }, 10000); // Tăng timeout lên 10s cho kết nối remote
      });
    }

    return await operation(revitClient);
  } finally {
    revitClient.disconnect();
    releaseMutex!();
  }
}
```

### 3.4. Cập nhật `package.json`

```json
{
  "scripts": {
    "build": "rimraf build && tsc",
    "start": "node build/index.js",
    "start:local": "node build/index.js --stdio"
  }
}
```

---

## 4. Expose Revit Plugin ra Internet (Ngrok)

### 4.1. Cài ngrok

Tải từ [ngrok.com/download](https://ngrok.com/download) hoặc:

```bash
# Windows (Chocolatey)
choco install ngrok

# Hoặc tải file zip và giải nén
```

### 4.2. Đăng nhập ngrok

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

Lấy authtoken tại: [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)

### 4.3. Chạy ngrok tunnel

Giả sử Revit plugin đang listen trên port `8080`:

```bash
ngrok tcp 8080
```

Kết quả sẽ hiển thị:

```
Forwarding    tcp://0.tcp.ngrok.io:12345 -> localhost:8080
```

Ghi lại **host** (`0.tcp.ngrok.io`) và **port** (`12345`) — sẽ dùng làm env var trên Render.

> **Lưu ý**: Mỗi lần restart ngrok, địa chỉ sẽ thay đổi. Dùng ngrok paid plan để có địa chỉ cố định, hoặc cập nhật env var trên Render mỗi lần đổi.

### 4.4. Giữ ngrok chạy

Ngrok phải chạy **cùng lúc** với Revit plugin. Khi tắt ngrok, MCP Server trên Render sẽ không kết nối được.

---

## 5. Deploy lên Render

### 5.1. Đưa code lên GitHub/GitLab

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/revit-mcp-server.git
git push -u origin main
```

### 5.2. Tạo Web Service trên Render

1. Vào [dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Kết nối repository GitHub/GitLab
4. Cấu hình:

| Cài đặt | Giá trị |
|---|---|
| **Name** | `revit-mcp-server` |
| **Region** | Singapore (gần Việt Nam nhất) |
| **Runtime** | Node |
| **Build Command** | `pnpm install && pnpm build` |
| **Start Command** | `pnpm start` |
| **Plan** | Free (hoặc Starter) |

### 5.3. Cấu hình Environment Variables

Trong tab **Environment** của service trên Render, thêm:

| Key | Value | Mô tả |
|---|---|---|
| `REVIT_HOST` | `0.tcp.ngrok.io` | Host từ ngrok (bước 4.3) |
| `REVIT_PORT_START` | `12345` | Port từ ngrok (bước 4.3) |
| `REVIT_PORT_END` | `12345` | Cùng port (vì ngrok chỉ map 1 port) |
| `NODE_ENV` | `production` | Môi trường production |

### 5.4. Health Check

Trong tab **Settings**, cấu hình Health Check:

- **Path**: `/health`
- **Period**: 30 seconds

### 5.5. Deploy

Click **Deploy** hoặc push code mới lên GitHub — Render tự động deploy.

---

## 6. Kết nối Claude với MCP Server trên Render

Sau khi deploy xong, Render sẽ cung cấp URL dạng:

```
https://revit-mcp-server.onrender.com
```

### 6.1. Cấu hình trong VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "revit-mcp-server-remote": {
      "type": "sse",
      "url": "https://revit-mcp-server.onrender.com/sse"
    }
  }
}
```

### 6.2. Cấu hình trong Claude Desktop

Thêm vào file config của Claude Desktop:

```json
{
  "mcpServers": {
    "revit-mcp-server": {
      "type": "sse",
      "url": "https://revit-mcp-server.onrender.com/sse"
    }
  }
}
```

---

## 7. Bảo mật (Khuyến nghị)

Khi expose Revit ra internet, cần thêm bảo mật:

### 7.1. Thêm API Key cho MCP Server

Thêm middleware xác thực trong `src/index.ts`:

```typescript
const API_KEY = process.env.API_KEY;

// Middleware kiểm tra API key
app.use((req, res, next) => {
  if (req.path === "/health") return next(); // Health check không cần auth

  const authHeader = req.headers.authorization;
  if (API_KEY && authHeader !== `Bearer ${API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});
```

Thêm env var `API_KEY` trên Render với một giá trị bí mật.

### 7.2. Thêm auth cho Revit Plugin (C#)

Trong Revit plugin, kiểm tra token trong mỗi JSON-RPC request:

```csharp
// Khi nhận JSON-RPC request, kiểm tra trường "auth" trong params
var auth = requestParams["auth"]?.ToString();
if (auth != expectedToken)
{
    // Từ chối request
    SendError(requestId, "Unauthorized");
    return;
}
```

---

## 8. Troubleshooting

### Server deploy thành công nhưng không kết nối được Revit

1. Kiểm tra ngrok đang chạy: `ngrok status`
2. Kiểm tra env var trên Render đúng host:port của ngrok
3. Kiểm tra Revit plugin đang listen trên đúng port

### Ngrok thay đổi địa chỉ sau khi restart

- **Free plan**: Cập nhật env var `REVIT_HOST` và `REVIT_PORT_START` trên Render mỗi lần restart ngrok
- **Paid plan**: Dùng fixed TCP address để tránh vấn đề này

### Render free plan bị sleep

Render free plan sẽ tắt service sau 15 phút không có request. Giải pháp:
- Dùng Starter plan ($7/tháng)
- Hoặc dùng cron job ping `/health` mỗi 10 phút (ví dụ: [UptimeRobot](https://uptimerobot.com))

### Timeout khi kết nối

Kết nối qua internet chậm hơn local. Đã tăng timeout trong code:
- Socket timeout: `300ms` → `2000ms`
- Connection timeout: `5s` → `10s`

---

## 9. Checklist Deploy

- [ ] Cập nhật `src/index.ts` — chuyển sang SSE transport
- [ ] Cập nhật `src/utils/ConnectionManager.ts` — dùng env vars
- [ ] Cài thêm `express`, `cors`
- [ ] Push code lên GitHub
- [ ] Tạo Web Service trên Render
- [ ] Cấu hình env vars trên Render
- [ ] Cài và chạy ngrok trên máy local
- [ ] Cập nhật env vars với địa chỉ ngrok
- [ ] Test kết nối từ Claude → Render → ngrok → Revit
- [ ] (Tùy chọn) Thêm API key bảo mật

---

## 10. Luồng hoạt động hoàn chỉnh

```
1. Khởi động Revit + Plugin (listen port 8080)
2. Chạy ngrok: ngrok tcp 8080 → nhận địa chỉ public
3. Cập nhật env vars trên Render (nếu địa chỉ thay đổi)
4. Claude gửi request HTTP → MCP Server (Render)
5. MCP Server kết nối TCP → ngrok tunnel → Revit Plugin
6. Revit Plugin thực thi lệnh, trả kết quả
7. MCP Server trả response về Claude qua SSE
```
