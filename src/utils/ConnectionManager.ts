import { HttpRevitClient } from "./HttpClient.js";

// Set REVIT_URL environment variable to point to the Revit HTTP server.
// Local default: http://localhost:8080
// On Render (or any remote): set REVIT_URL=https://<your-public-url>
const DEFAULT_REVIT_URL = "http://localhost:8080";

export async function withRevitConnection<T>(
  operation: (client: HttpRevitClient) => Promise<T>
): Promise<T> {
  const revitUrl = process.env.REVIT_URL || DEFAULT_REVIT_URL;
  const client = new HttpRevitClient(revitUrl);
  return await operation(client);
}
