import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerGetSheetExportablePropertiesTool(server: McpServer) {
  server.tool(
    "get_sheet_exportable_properties",
    "Get the list of sheet parameters that can be exported to Excel. Use this before calling export_sheets_to_excel so the user or AI can choose which properties to include. Returns propertyNames array.",
    {},
    async () => {
      try {
        const response = await withRevitConnection(async (revitClient) => {
          return await revitClient.sendCommand("get_sheet_exportable_properties", {});
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
              text: `get_sheet_exportable_properties failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
