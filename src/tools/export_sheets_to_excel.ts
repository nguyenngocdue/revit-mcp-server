import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerExportSheetsToExcelTool(server: McpServer) {
  server.tool(
    "export_sheets_to_excel",
    "Export all sheets from the current Revit project to an Excel file. You can choose which sheet properties (columns) to export. Call get_sheet_exportable_properties first to get the list of available property names.",
    {
      outputPath: z
        .string()
        .describe("Full path for the output .xlsx file (e.g. C:\\Exports\\Sheets.xlsx)"),
      propertyNames: z
        .array(z.string())
        .describe("Array of sheet parameter names to export (e.g. [\"Sheet Number\", \"Sheet Name\", \"Checked by\"])"),
    },
    async (args) => {
      const params = {
        outputPath: args.outputPath,
        propertyNames: args.propertyNames ?? [],
      };

      try {
        const response = await withRevitConnection(async (revitClient) => {
          return await revitClient.sendCommand("export_sheets_to_excel", params);
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
              text: `export_sheets_to_excel failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
