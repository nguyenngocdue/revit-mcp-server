# Guide to Build Revit MCP Server

Hướng dẫn từng bước để build một MCP Server tối giản kết nối với Revit.

---

## 1. Yêu cầu hệ thống

- **Node.js** >= 18
- **pnpm** (hoặc npm/yarn)
- **TypeScript** >= 5.3

Kiểm tra:

```bash
node -v
pnpm -v
```

---

## 2. Cấu trúc dự án

```
revit-mcp-server/
├── package.json              # Cấu hình project & dependencies
├── tsconfig.json             # Cấu hình TypeScript compiler
├── src/
│   ├── index.ts              # Entry point - khởi tạo MCP server
│   ├── tools/
│   │   └── say_hello.ts      # Tool mẫu: say_hello
│   └── utils/
│       ├── SocketClient.ts   # TCP client giao tiếp với Revit (JSON-RPC 2.0)
│       └── ConnectionManager.ts  # Quản lý kết nối, tìm port, mutex
└── build/                    # Output sau khi compile (tự sinh)
```

---

## 3. Khởi tạo dự án

```bash
mkdir revit-mcp-server
cd revit-mcp-server
```

Tạo `package.json`:

```json
{
  "name": "revit-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "revit-mcp-server": "./build/index.js"
  },
  "scripts": {
    "build": "rimraf build && tsc",
    "start": "node build/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "rimraf": "^5.0.0",
    "typescript": "^5.3.0"
  }
}
```

Tạo `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

Cài dependencies:

```bash
pnpm install
```

---

## 4. Tạo Utils - Kết nối tới Revit

### 4.1. SocketClient (`src/utils/SocketClient.ts`)

File này tạo TCP client giao tiếp với Revit plugin qua giao thức **JSON-RPC 2.0**.

Chức năng chính:
- `connect()` - Kết nối tới Revit plugin
- `disconnect()` - Ngắt kết nối
- `sendCommand(command, params)` - Gửi lệnh và nhận kết quả (timeout 2 phút)

Giao thức gửi đi:

```json
{
  "jsonrpc": "2.0",
  "method": "say_hello",
  "params": { "message": "Hello!" },
  "id": "unique_request_id"
}
```

### 4.2. ConnectionManager (`src/utils/ConnectionManager.ts`)

File này quản lý kết nối:
- **Tìm port tự động**: Scan port `8080` - `8099` để tìm Revit plugin đang chạy
- **Mutex**: Đảm bảo chỉ 1 lệnh chạy tại 1 thời điểm (tuần tự)
- **Auto cleanup**: Tự ngắt kết nối sau mỗi lệnh

Sử dụng thông qua hàm `withRevitConnection()`:

```typescript
const result = await withRevitConnection(async (revitClient) => {
  return await revitClient.sendCommand("say_hello", { message: "Hi" });
});
```

---

## 5. Tạo Tool

### 5.1. Mỗi tool là 1 file trong `src/tools/`

Ví dụ `src/tools/say_hello.ts`:

```typescript
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerSayHelloTool(server: McpServer) {
  server.tool(
    "say_hello",                    // Tên tool (snake_case)
    "Display a greeting dialog.",   // Mô tả cho AI hiểu khi nào dùng
    {
      // Schema input - dùng Zod để validate
      message: z.string().optional().describe("Custom message to display"),
    },
    async (args) => {
      try {
        // Gửi lệnh tới Revit
        const response = await withRevitConnection(async (revitClient) => {
          return await revitClient.sendCommand("say_hello", args);
        });

        // Trả kết quả về cho AI
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

### 5.2. Pattern chung khi tạo tool mới

Mỗi tool cần:

| Thành phần | Mô tả |
|---|---|
| **Tên** | `snake_case`, ví dụ: `get_elements`, `create_wall` |
| **Mô tả** | Giúp AI hiểu tool làm gì và khi nào nên dùng |
| **Schema** | Dùng `zod` để định nghĩa input parameters |
| **Handler** | Hàm async xử lý logic, gọi Revit qua `withRevitConnection` |
| **Return** | `{ content: [{ type: "text", text: "..." }] }` |

---

## 6. Tạo Entry Point (`src/index.ts`)

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSayHelloTool } from "./tools/say_hello.js";

const server = new McpServer({
  name: "revit-mcp-server",
  version: "1.0.0",
});

async function main() {
  // Đăng ký tools - thêm tool mới ở đây
  registerSayHelloTool(server);

  // Khởi động server với stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revit MCP Server started successfully.");
}

main().catch((error) => {
  console.error("Error starting Revit MCP Server:", error);
  process.exit(1);
});
```

> **Lưu ý**: Import file `.ts` phải dùng đuôi `.js` (ví dụ: `./tools/say_hello.js`) vì TypeScript dùng Node16 module resolution.

---

## 7. Build & Chạy

```bash
# Build TypeScript -> JavaScript
pnpm build

# Chạy server
pnpm start
```

---

## 8. Cấu hình trong VS Code

Tạo file `.vscode/mcp.json` trong workspace:

```json
{
  "servers": {
    "revit-mcp-server": {
      "command": "node",
      "args": ["đường-dẫn-tuyệt-đối/revit-mcp-server/build/index.js"]
    }
  }
}
```

---

## 9. Thêm tool mới

Khi muốn thêm tool, làm 3 bước:

**Bước 1** - Tạo file `src/tools/ten_tool.ts` theo pattern ở mục 5.

**Bước 2** - Import và đăng ký trong `src/index.ts`:

```typescript
import { registerTenToolTool } from "./tools/ten_tool.js";

// Trong main()
registerTenToolTool(server);
```

**Bước 3** - Build lại:

```bash
pnpm build
```

---

## 10. Luồng hoạt động

```
AI (Claude) ──stdio──> MCP Server ──TCP/JSON-RPC──> Revit Plugin ──> Revit API
                          │
                    revit-mcp-server
                    (Node.js process)
```

1. AI gọi tool `say_hello` qua MCP protocol (stdio)
2. Server nhận request, tìm port Revit đang listen (8080-8099)
3. Mở TCP connection, gửi JSON-RPC 2.0 request tới Revit plugin
4. Revit plugin thực thi lệnh, trả kết quả
5. Server trả kết quả về cho AI
