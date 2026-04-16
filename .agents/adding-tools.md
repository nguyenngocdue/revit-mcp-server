# How to Add a New Tool

## 1. Create the tool file

Create `src/tools/my_tool.ts`:

```typescript
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerMyTool(server: McpServer) {
  server.tool(
    "my_tool",                          // must match method name in Revit plugin
    "Description for AI to understand what this tool does and when to use it.",
    {
      // zod schema for parameters
      elementId: z.number().describe("The ElementId of the target element"),
      option: z.string().optional().describe("Optional setting"),
    },
    async (args) => {
      try {
        const response = await withRevitConnection(async (client) => {
          return await client.sendCommand("my_tool", args);
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `my_tool failed: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
```

## 2. That's it

`register.ts` auto-discovers all files in `tools/` and calls any function named `register*`. No manual import needed.

## 3. Implement in Revit plugin (C#)

The Revit plugin must handle the method name in its JSON-RPC dispatcher:

```csharp
case "my_tool":
    var elementId = (int)parameters["elementId"];
    // ... do work with Revit API
    return new { success = true, data = result };
```

---

## Naming conventions

| Item | Convention | Example |
|---|---|---|
| File name | `snake_case.ts` | `get_wall_data.ts` |
| Tool name | `snake_case` | `get_wall_data` |
| Export function | `register` + PascalCase | `registerGetWallDataTool` |
| Revit method | same as tool name | `get_wall_data` |

---

## Parameter schema tips

- Use `z.number()` for Revit `ElementId` values (they are integers)
- Use `z.string()` for Revit element names, category strings, view names
- Always add `.describe("...")` — this text is shown to the AI to understand the parameter
- Use `.optional()` for non-required params
- Use `z.enum([...])` for fixed sets of values
- For coordinates: `z.object({ x: z.number(), y: z.number(), z: z.number() })`

---

## withRevitConnection behavior

```typescript
// Local mode (no PORT env var):
// - Scans TCP ports 8080–8099 to find Revit plugin
// - Sends JSON-RPC over TCP socket
// - Mutex ensures one-at-a-time access

// Remote mode (PORT or MCP_TRANSPORT=http):
// - POSTs to process.env.REVIT_URL + "/api/command"
// - Uses fetch with 2-minute AbortController timeout
```

If the Revit plugin is not running, `withRevitConnection` throws — tool returns an error message to the AI.
