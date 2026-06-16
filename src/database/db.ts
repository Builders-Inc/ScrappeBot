import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

export async function openDb() {
  return open({
    filename: path.join(__dirname, "../../artstation.db"),
    driver: sqlite3.Database,
  });
}

export async function initDb() {
  const db = await openDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE,
      full_name TEXT,
      is_staff INTEGER,
      is_pro_member INTEGER,
      email TEXT,
      is_sent INTEGER DEFAULT 0,
      skip_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_scraped_at TIMESTAMP,
      processing INTEGER DEFAULT 0,
      last_attempt TIMESTAMP
    )
  `);

  // Try to add columns if they don't exist (for existing databases)
  const columnsToAdd = [
    { name: "processing", type: "INTEGER DEFAULT 0" },
    { name: "last_attempt", type: "TIMESTAMP" },
  ];

  for (const column of columnsToAdd) {
    try {
      await db.run(
        `ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`
      );
    } catch (e: any) {
      if (!e.message.includes("duplicate column name")) {
        console.error(`Error adding column ${column.name}:`, e);
      }
    }
  }

  // Prevent duplicate email addresses across rows
  try {
    await db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`
    );
  } catch (e: any) {
    if (!e.message.includes("already exists")) {
      console.error("Error creating email index:", e);
    }
  }

  return db;
}
