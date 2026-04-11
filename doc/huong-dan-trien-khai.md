# Hướng Dẫn Triển Khai Revit MCP Server Từ A đến Z

> Kết nối AI (Claude, Copilot, Cursor...) với Autodesk Revit để điều khiển mô hình bằng ngôn ngữ tự nhiên.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Yêu cầu hệ thống](#3-yêu-cầu-hệ-thống)
4. [Clone & cài đặt dự án](#4-clone--cài-đặt-dự-án)
5. [Build dự án](#5-build-dự-án)
6. [Cấu hình MCP Client](#6-cấu-hình-mcp-client)
   - [VS Code Copilot](#vs-code-copilot)
   - [Claude Desktop](#claude-desktop)
7. [Cài đặt Revit Plugin](#7-cài-đặt-revit-plugin)
8. [Kiểm tra kết nối](#8-kiểm-tra-kết-nối)
9. [Danh sách công cụ có sẵn](#9-danh-sách-công-cụ-có-sẵn)
10. [Xử lý lỗi thường gặp](#xử-lý-lỗi-thường-gặp)
11. [Tài nguyên tham khảo](#tài-nguyên-tham-khảo)

---

## 1. Tổng quan

**Revit MCP Server** là một server triển khai giao thức [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — chuẩn mở để AI giao tiếp với các ứng dụng bên ngoài.

Dự án này cho phép các AI assistant như Claude Desktop, VS Code Copilot, Cursor, Windsurf, Cline... **trực tiếp tương tác với Autodesk Revit** thông qua ngôn ngữ tự nhiên: tạo phòng, tường, dầm, xuất dữ liệu, đổi màu cấu kiện, chạy code C# trong Revit, v.v.

**GitHub:** https://github.com/nguyenngocdue/revit-mcp-server

---

## 2. Kiến trúc hệ thống

```
AI Client ──stdio──▶ MCP Server (Node.js) ──TCP/JSON-RPC 2.0──▶ Revit Plugin ──▶ Revit API
```

Luồng hoạt động:

1. AI client (Claude Desktop, VS Code...) gọi tool qua giao thức **stdio**
2. MCP Server quét port `8080`–`8099` để tìm Revit Plugin đang chạy
3. Mở kết nối TCP và gửi lệnh theo chuẩn **JSON-RPC 2.0**
4. Revit Plugin nhận lệnh, thực thi qua **Revit API**
5. Kết quả trả về cho AI

---

## 3. Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|---|---|
| Node.js | >= 18 |
| pnpm | mới nhất |
| Autodesk Revit | 2021+ (có plugin MCP) |
| Hệ điều hành | Windows (do Revit chỉ chạy trên Windows) |

Kiểm tra môi trường hiện tại:

```bash
node -v
pnpm -v
```

Nếu chưa có **pnpm**, cài bằng lệnh:

```bash
npm install -g pnpm
```

---

## 4. Clone & cài đặt dự án

### Bước 1 — Clone repository

```bash
git clone https://github.com/nguyenngocdue/revit-mcp-server.git
cd revit-mcp-server
```

### Bước 2 — Cài đặt dependencies

```bash
pnpm install
```

> **Lưu ý:** `better-sqlite3` cần build native bindings. `pnpm` sẽ tự xử lý việc này.

Sau khi cài xong, thư mục `node_modules/` sẽ xuất hiện với đầy đủ packages.

---

## 5. Build dự án

```bash
pnpm build
```

Lệnh này sẽ:
1. Xóa thư mục `build/` cũ (nếu có)
2. Compile toàn bộ TypeScript trong `src/` sang JavaScript
3. Xuất kết quả ra thư mục `build/`

Cấu trúc sau khi build:

```
build/
├── index.js          ← Entry point chính
├── tools/            ← 30+ tool đã compile
├── utils/
│   ├── SocketClient.js
│   └── ConnectionManager.js
└── database/
    └── service.js
```

> **Kiểm tra nhanh:** Nếu thấy `build/index.js` tồn tại → build thành công.

---

## 6. Cấu hình MCP Client

Bây giờ bạn cần nói cho AI client biết vị trí của MCP Server. Chọn client bạn đang dùng:

---

### VS Code Copilot

Tạo file `.vscode/mcp.json` trong **workspace** của bạn (không phải trong thư mục revit-mcp-server):

```json
{
  "servers": {
    "revit-mcp-server": {
      "command": "node",
      "args": ["C:/path/to/revit-mcp-server/build/index.js"]
    }
  }
}
```

> Thay `C:/path/to/revit-mcp-server` bằng **đường dẫn tuyệt đối thực tế** trên máy bạn.
> Ví dụ: `"C:/Users/YourName/projects/revit-mcp-server/build/index.js"`

---

### Claude Desktop

Mở file config của Claude Desktop:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Thêm đoạn config sau:

```json
{
  "mcpServers": {
    "revit-mcp-server": {
      "command": "node",
      "args": ["C:/path/to/revit-mcp-server/build/index.js"]
    }
  }
}
```

Sau khi lưu file, **khởi động lại Claude Desktop** để áp dụng.

---

### Cursor / Windsurf / Cline

Tham khảo tài liệu của từng client, nhưng về cơ bản config đều tương tự: chỉ định `command: "node"` và `args: ["/đường/dẫn/tới/build/index.js"]`.

---

## 7. Cài đặt Revit Plugin

MCP Server chỉ là **cầu nối** — Revit cần có **plugin** đang chạy để nhận lệnh qua TCP.

### Bước 1 — Chuẩn bị plugin

Plugin C# cần được build riêng và cài vào Revit. Plugin sẽ:
- Lắng nghe kết nối TCP trên port trong dải `8080`–`8099`
- Nhận lệnh JSON-RPC 2.0
- Thực thi qua Revit API và trả về kết quả

### Bước 2 — Load plugin trong Revit

Copy file `.dll` vào thư mục Revit AddIns:

```
C:\ProgramData\Autodesk\Revit\Addins\20XX\
```

Hoặc thêm file `.addin` manifest tương ứng.

### Bước 3 — Khởi động Revit

Mở Revit và load một dự án (`.rvt`). Plugin sẽ tự khởi động và bắt đầu lắng nghe trên port.

---

## 8. Kiểm tra kết nối

### Kiểm tra server có hoạt động không

```bash
node build/index.js
```

Nếu thấy output:

```
Revit MCP Server started successfully.
```

→ Server hoạt động bình thường. (Server sẽ thoát ngay vì cần được gọi bởi MCP client, không phải chạy thủ công.)

### Kiểm tra trong AI Client

Với **VS Code Copilot**, mở chat và gõ:

```
@revit-mcp-server say hello to Revit
```

Hoặc với **Claude Desktop**, chỉ cần chat:

```
Hãy gọi tool say_hello để kiểm tra kết nối với Revit
```

Nếu Revit **hiển thị một hộp thoại** → kết nối thành công!

---

## 9. Danh sách công cụ có sẵn

| Tool | Mô tả |
|---|---|
| `say_hello` | Hiển thị dialog chào trong Revit |
| `get_selected_elements` | Lấy danh sách cấu kiện đang chọn |
| `get_current_view_info` | Thông tin view hiện tại |
| `get_current_view_elements` | Danh sách cấu kiện trong view |
| `get_available_family_types` | Liệt kê family types có sẵn |
| `get_material_quantities` | Khối lượng vật liệu |
| `create_point_based_element` | Tạo cấu kiện theo điểm (cột, nội thất...) |
| `create_line_based_element` | Tạo cấu kiện theo đường (tường, dầm...) |
| `create_surface_based_element` | Tạo cấu kiện theo mặt (sàn, mái...) |
| `create_grid` | Tạo lưới trục |
| `create_level` | Tạo cao độ |
| `create_room` | Tạo phòng |
| `create_dimensions` | Tạo kích thước |
| `create_structural_framing_system` | Tạo hệ khung kết cấu |
| `modify_element` | Chỉnh sửa tham số cấu kiện |
| `delete_element` | Xóa cấu kiện |
| `operate_element` | Move / Rotate / Copy / Mirror |
| `color_elements` | Đổi màu cấu kiện |
| `tag_all_rooms` | Gán tag tất cả phòng |
| `tag_all_walls` | Gán tag tất cả tường |
| `analyze_model_statistics` | Thống kê mô hình |
| `export_room_data` | Xuất dữ liệu phòng |
| `export_sheets_to_excel` | Xuất bản vẽ ra Excel |
| `get_sheet_exportable_properties` | Lấy thuộc tính xuất được của sheet |
| `ai_element_filter` | Lọc cấu kiện bằng AI |
| `send_code_to_revit` | Gửi và chạy code C# trong Revit |
| `store_project_data` | Lưu dữ liệu dự án vào DB |
| `store_room_data` | Lưu dữ liệu phòng vào DB |
| `query_stored_data` | Truy vấn dữ liệu đã lưu |
| `search_modules` | Tìm kiếm module code tái sử dụng |
| `use_module` | Chạy một module đã lưu |

---

## Xử lý lỗi thường gặp

### ❌ "Cannot connect to Revit"

- Kiểm tra Revit đã mở và plugin đã load chưa
- Plugin cần đang lắng nghe trên port `8080`–`8099`
- Tắt tường lửa thử xem có kết nối được không

### ❌ "Module not found" khi build

- Chạy lại `pnpm install`
- Kiểm tra `tsconfig.json` có `"module": "Node16"` chưa

### ❌ Tool không xuất hiện trong AI Client

- Chắc chắn đường dẫn trong config là **đường dẫn tuyệt đối** (không dùng `~/` hay `./`)
- Khởi động lại AI client sau khi sửa config

---

## Tài nguyên tham khảo

- [Model Context Protocol Docs](https://modelcontextprotocol.io)
- [MCP SDK cho TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [Source code dự án](https://github.com/nguyenngocdue/revit-mcp-server)
- [Revit API Docs](https://www.revitapidocs.com)
