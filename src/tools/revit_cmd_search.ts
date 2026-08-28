import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText } from "../rcd/schemas.js";

export function registerRevitCmdSearchTool(server: McpServer) {
  server.tool(
    "revit_cmd_search",
    [
      "Search the catalog of ALL built-in Revit commands that can be started like a user would (PostCommand): Wall, Door, Beam, Dimension, Tag, Align, Trim, Mirror, Pin, Delete, Sync, Print… (~900 commands, built from the running Revit version).",
      "Returns name (use this with revit_cmd_post), command id, keyboard shortcuts, ribbon path, tags, whether it can be posted right now (canPost), and 'interaction': instant | selection | points | sketch | dialog | unknown.",
      "Use this FIRST when you want Revit to do something and no dedicated tool exists. Then call revit_cmd_post.",
    ].join(" "),
    {
      query: z.string().optional().describe("Keywords, shortcut (WA, DI, TG) or enum name. Empty = list (use tags/limit)."),
      tags: z.array(z.string()).optional().describe("Filter by tag: architecture, structure, annotate, modify, view, file, datum, mep, addin."),
      limit: z.number().int().optional().describe("Max results (default 30)."),
      onlyPostable: z.boolean().optional().describe("Only commands that can be posted in the current context."),
      refresh: z.boolean().optional().describe("Rebuild the catalog (e.g. after editing KeyboardShortcuts.xml)."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) =>
          c.sendCommand("rcd_list_commands", { ...args, limit: args.limit ?? 30 })
        );
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
