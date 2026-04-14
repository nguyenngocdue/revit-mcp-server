import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withRevitConnection } from "../utils/ConnectionManager.js";
export function registerHelloWorldTool(server: McpServer) {
    server.tool(
        "hello_world",
        "Display a hello world dialog in Revit with the user's full name and optional message. Useful for testing the connection between Claude and Revit.",
        {
            full_name: z
                .string()
                .describe("The user's full name to display in the greeting (e.g., 'John Doe')"),
            message: z
                .string()
                .optional()
                .describe("Optional custom message to display in the dialog. Defaults to 'Hello, [User's Full Name]!'"),
        },
        async (args: { full_name: string; message?: string }) => {
            try {
                const response = await withRevitConnection(async (revitClient) => {
                    return await revitClient.sendCommand("hello_world", args);
                });
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(response, null, 2),
                        },
                    ],
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Hello world failed: ${error instanceof Error ? error.message : String(error)
                                }`,
                        }
                    ]
                }
            }
        }

    )
}