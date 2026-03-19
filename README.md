# Revit MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that bridges AI assistants (Claude) with Autodesk Revit. It communicates with a Revit plugin via TCP/JSON-RPC 2.0, enabling AI to query, create, and modify Revit elements through natural language.

## Architecture

```
Claude ──stdio──▶ MCP Server (Node.js) ──TCP/JSON-RPC 2.0──▶ Revit Plugin ──▶ Revit API
```

## Available Tools

| Tool | Description |
|---|---|
| `say_hello` | Display a greeting dialog in Revit |
| `get_selected_elements` | Get currently selected elements |
| `get_current_view_info` | Get active view information |
| `get_current_view_elements` | Get elements in the current view |
| `get_available_family_types` | List available family types |
| `get_material_quantities` | Get material quantities from elements |
| `create_point_based_element` | Create point-based elements (columns, furniture, etc.) |
| `create_line_based_element` | Create line-based elements (walls, beams, etc.) |
| `create_surface_based_element` | Create surface-based elements (floors, roofs, etc.) |
| `create_grid` | Create grid lines |
| `create_level` | Create levels |
| `create_room` | Create rooms |
| `create_dimensions` | Create dimensions |
| `create_structural_framing_system` | Create structural framing systems |
| `modify_element` | Modify element parameters |
| `delete_element` | Delete elements |
| `operate_element` | Perform operations on elements (move, rotate, copy, mirror) |
| `color_elements` | Apply color overrides to elements |
| `tag_all_rooms` | Tag all rooms in a view |
| `tag_all_walls` | Tag all walls in a view |
| `analyze_model_statistics` | Analyze model statistics |
| `export_room_data` | Export room data |
| `export_sheets_to_excel` | Export sheet schedules to Excel |
| `get_sheet_exportable_properties` | Get exportable sheet properties |
| `ai_element_filter` | Filter elements using AI-powered queries |
| `send_code_to_revit` | Send and execute C# code directly in Revit |
| `store_project_data` | Store project data to local database |
| `store_room_data` | Store room data to local database |
| `query_stored_data` | Query stored data from local database |
| `search_modules` | Search reusable code modules |
| `use_module` | Execute a stored code module |

## Prerequisites

- **Node.js** >= 18
- **pnpm** (or npm/yarn)
- **Revit** with the MCP plugin installed and running

## Getting Started

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Run

```bash
pnpm start
```

The server communicates via stdio — it is designed to be launched by an MCP client (VS Code, Claude Desktop), not run manually.

## Configuration

### VS Code

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "revit-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/revit-mcp-server/build/index.js"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "revit-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/revit-mcp-server/build/index.js"]
    }
  }
}
```

## How It Works

1. AI calls a tool (e.g. `create_room`) via MCP protocol (stdio)
2. Server scans ports `8080`-`8099` to find the running Revit plugin
3. Opens a TCP connection and sends a JSON-RPC 2.0 request
4. Revit plugin executes the command via Revit API
5. Result is returned to the AI

## Adding New Tools

1. Create `src/tools/your_tool.ts` with a `registerYourToolTool(server)` export
2. The tool is auto-registered on startup (no manual import needed)
3. Rebuild: `pnpm build`

See [doc/guide-to-build-server.md](doc/guide-to-build-server.md) for detailed instructions.

## Project Structure

```
revit-mcp-server/
├── src/
│   ├── index.ts                  # Entry point
│   ├── tools/
│   │   ├── register.ts           # Auto-registers all tools
│   │   ├── say_hello.ts
│   │   ├── create_room.ts
│   │   └── ...                   # 30+ tools
│   └── utils/
│       ├── SocketClient.ts       # TCP client (JSON-RPC 2.0)
│       └── ConnectionManager.ts  # Port discovery & connection mutex
├── doc/
│   ├── guide-to-build-server.md  # Build guide
│   └── guide-to-deploy-render.md # Render deployment guide
├── package.json
└── tsconfig.json
```

## Deployment

For deploying to Render (cloud), see [doc/guide-to-deploy-render.md](doc/guide-to-deploy-render.md).

## License

MIT
