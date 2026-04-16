# DeepBIM MCP Tools Reference

All tools communicate with Revit via JSON-RPC. Each tool file exports one `register*Tool(server)` function.

---

## Connection & Testing

| Tool | Description |
|---|---|
| `hello_world` | Test connection — shows greeting dialog in Revit with `full_name` |
| `say_hello` | Test connection — shows custom message dialog in Revit |

---

## Model Query

| Tool | Description |
|---|---|
| `ai_element_filter` | **Primary query tool.** Filter elements by category (`OST_Walls`, `OST_Floors`, etc.), type, FamilySymbol ID, bounding box, visibility. Returns full element data for AI to process. |
| `get_current_view_elements` | Get all elements visible in the active Revit view |
| `get_current_view_info` | Get active view metadata (type, name, scale, level) |
| `get_selected_elements` | Get elements currently selected by the user in Revit |
| `get_available_family_types` | List all loaded family types for a given category |
| `get_material_quantities` | Get material quantities for selected or all elements |
| `analyze_model_statistics` | Count elements by category, analyze model health |

---

## Element Creation

| Tool | Description |
|---|---|
| `create_point_based_element` | Place a family instance at a point (doors, windows, furniture, equipment) |
| `create_line_based_element` | Place a line-based family (walls, beams, pipes, ducts) |
| `create_surface_based_element` | Place a surface-hosted element (ceiling fixtures, face-based families) |
| `create_room` | Create a room at a given point on a level |
| `create_level` | Create a new level at a specified elevation |
| `create_grid` | Create a grid line |
| `create_dimensions` | Create dimension annotations between elements |
| `create_structural_framing_system` | Create a structural framing system (beams, columns grid) |

---

## Element Modification

| Tool | Description |
|---|---|
| `modify_element` | Modify element parameters by ElementId |
| `operate_element` | Perform operations: move, rotate, mirror, copy, delete |
| `delete_element` | Delete one or more elements by ElementId |
| `color_elements` | Override element graphics color in current view |

---

## Annotation & Export

| Tool | Description |
|---|---|
| `tag_all_rooms` | Tag all rooms in current view with room tags |
| `tag_all_walls` | Tag all walls in current view with wall tags |
| `export_room_data` | Export room data (area, number, name, level) to JSON/CSV |
| `export_sheets_to_excel` | Export sheet list with properties to Excel |
| `get_sheet_exportable_properties` | List available properties that can be exported from sheets |

---

## Code Execution

| Tool | Description |
|---|---|
| `send_code_to_revit` | **Power tool.** Send raw C# code to execute inside Revit. Code runs in the context of `Execute(Document doc, object[] parameters)`. Use for anything not covered by other tools. |

---

## Data Persistence (SQLite)

| Tool | Description |
|---|---|
| `store_project_data` | Save project metadata to local SQLite DB |
| `store_room_data` | Save room data to local SQLite DB |
| `export_room_data` | Export stored room data |
| `query_stored_data` | Query stored data with SQL-like filters |
| `search_modules` | Search saved code modules by keyword |
| `use_module` | Load and execute a saved code module |

---

## Tool patterns

Every tool follows this structure:

```typescript
export function registerMyTool(server: McpServer) {
  server.tool("tool_name", "description", { /* zod schema */ }, async (args) => {
    try {
      const response = await withRevitConnection(async (client) => {
        return await client.sendCommand("tool_name", args);
      });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }] };
    }
  });
}
```

The `withRevitConnection` abstraction handles:
- **Local mode:** scan TCP ports 8080–8099, pick first open
- **Remote mode:** POST to `REVIT_URL/api/command`

---

## Revit category strings (OST_ prefix)

Common values for `filterCategory` in `ai_element_filter`:

```
OST_Walls, OST_Floors, OST_Ceilings, OST_Roofs
OST_Doors, OST_Windows, OST_Furniture, OST_GenericModel
OST_StructuralColumns, OST_StructuralFraming, OST_StructuralFoundation
OST_Rooms, OST_Areas, OST_Levels, OST_Grids
OST_Pipes, OST_Ducts, OST_CableTray, OST_Conduit
OST_ElectricalEquipment, OST_LightingFixtures, OST_MechanicalEquipment
```

> Note: furniture may appear as `OST_Furniture` **or** `OST_GenericModel` — query both when unsure.
