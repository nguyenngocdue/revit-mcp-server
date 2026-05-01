import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";

export function registerApplyOperationsTool(server: McpServer) {
  server.tool(
    "apply_operations",
    "Send a list of primitive operations to Revit for execution. Mode 'preview' validates without modifying the model. Mode 'execute' runs inside a TransactionGroup and rolls back everything on failure. Supported ops: create_level, create_grid_line, create_wall_by_level, create_column_by_level, create_floor_by_boundary, create_isolated_foundation. If an op is unknown the error response lists all available ops.",
    {
      mode: z
        .enum(["preview", "execute"])
        .describe("'preview' = validate only, no model changes. 'execute' = run in Revit transaction."),
      operations: z
        .array(z.record(z.unknown()))
        .describe(
          "List of operations to apply. Each operation must have an 'op' field. Supported ops: create_level, create_grid_line, create_wall_by_level."
        ),
    },
    async (args, _extra) => {
      try {
        const response = await withRevitConnection(async (revitClient) => {
          return await revitClient.sendCommand("apply_operations", {
            mode: args.mode,
            operations: args.operations,
          });
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
