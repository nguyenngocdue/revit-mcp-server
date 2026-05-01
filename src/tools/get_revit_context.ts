import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerGetRevitContextTool(server: McpServer) {
  server.tool(
    "get_revit_context",
    "Get current Revit model context: document info, active view, units, current selection, levels, and wall types. Call this before generating operations.",
    {},
    async (_args, _extra) => {
      try {
        const response = await withRevitConnection(async (revitClient) => {
          return await revitClient.sendCommand("get_revit_context", {});
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    }
  );
}
