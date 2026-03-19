import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "revit-data.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      project_path TEXT,
      project_number TEXT,
      project_address TEXT,
      client_name TEXT,
      project_status TEXT,
      author TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      room_id TEXT NOT NULL,
      room_name TEXT,
      room_number TEXT,
      department TEXT,
      level TEXT,
      area REAL,
      perimeter REAL,
      occupancy TEXT,
      comments TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, room_id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_rooms_project_id ON rooms(project_id);
  `);
}

export interface ProjectRecord {
  id: number;
  name: string;
  project_path: string | null;
  project_number: string | null;
  project_address: string | null;
  client_name: string | null;
  project_status: string | null;
  author: string | null;
  metadata: string | null;
  created_at: string;
}

export interface RoomRecord {
  id: number;
  project_id: number;
  room_id: string;
  room_name: string | null;
  room_number: string | null;
  department: string | null;
  level: string | null;
  area: number | null;
  perimeter: number | null;
  occupancy: string | null;
  comments: string | null;
  metadata: string | null;
  created_at: string;
}

export function storeProject(args: {
  project_name: string;
  project_path?: string;
  project_number?: string;
  project_address?: string;
  client_name?: string;
  project_status?: string;
  author?: string;
  metadata?: Record<string, unknown>;
}): number {
  const database = getDb();
  const metadataJson = args.metadata ? JSON.stringify(args.metadata) : null;
  const stmt = database.prepare(`
    INSERT INTO projects (name, project_path, project_number, project_address, client_name, project_status, author, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      project_path = excluded.project_path,
      project_number = excluded.project_number,
      project_address = excluded.project_address,
      client_name = excluded.client_name,
      project_status = excluded.project_status,
      author = excluded.author,
      metadata = excluded.metadata
  `);
  stmt.run(
    args.project_name,
    args.project_path ?? null,
    args.project_number ?? null,
    args.project_address ?? null,
    args.client_name ?? null,
    args.project_status ?? null,
    args.author ?? null,
    metadataJson
  );
  const row = database.prepare("SELECT id FROM projects WHERE name = ?").get(args.project_name) as { id: number };
  return row.id;
}

export function getProjectByName(name: string): ProjectRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM projects WHERE name = ?").get(name) as ProjectRecord | undefined;
  return row ?? null;
}

export function getProjectById(id: number): ProjectRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRecord | undefined;
  return row ?? null;
}

export function getAllProjects(): ProjectRecord[] {
  const database = getDb();
  return database.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRecord[];
}

export function storeRoomsBatch(
  projectId: number,
  rooms: Array<{
    room_id: string;
    room_name?: string;
    room_number?: string;
    department?: string;
    level?: string;
    area?: number;
    perimeter?: number;
    occupancy?: string;
    comments?: string;
    metadata?: Record<string, unknown>;
  }>
): number {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO rooms (project_id, room_id, room_name, room_number, department, level, area, perimeter, occupancy, comments, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, room_id) DO UPDATE SET
      room_name = excluded.room_name,
      room_number = excluded.room_number,
      department = excluded.department,
      level = excluded.level,
      area = excluded.area,
      perimeter = excluded.perimeter,
      occupancy = excluded.occupancy,
      comments = excluded.comments,
      metadata = excluded.metadata
  `);
  let count = 0;
  const run = database.transaction(() => {
    for (const r of rooms) {
      stmt.run(
        projectId,
        r.room_id,
        r.room_name ?? null,
        r.room_number ?? null,
        r.department ?? null,
        r.level ?? null,
        r.area ?? null,
        r.perimeter ?? null,
        r.occupancy ?? null,
        r.comments ?? null,
        r.metadata ? JSON.stringify(r.metadata) : null
      );
      count++;
    }
  });
  run();
  return count;
}

export function getRoomsByProjectId(projectId: number): RoomRecord[] {
  const database = getDb();
  return database.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY room_number, room_id").all(projectId) as RoomRecord[];
}

export function getAllRoomsWithProject(): Array<RoomRecord & { project_name: string }> {
  const database = getDb();
  return database
    .prepare(
      `SELECT r.*, p.name AS project_name FROM rooms r JOIN projects p ON r.project_id = p.id ORDER BY p.name, r.room_number, r.room_id`
    )
    .all() as Array<RoomRecord & { project_name: string }>;
}

export function getStats(): { projects: number; rooms: number } {
  const database = getDb();
  const projects = (database.prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number }).c;
  const rooms = (database.prepare("SELECT COUNT(*) AS c FROM rooms").get() as { c: number }).c;
  return { projects, rooms };
}
