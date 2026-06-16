// scrapper.ts

import fetch from "node-fetch";
import config from "../config/config";
import { openDb } from "../database/db";
import { User } from "../models/User";

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeLatestProjects() {
  return scrapeEndpoint(
    "https://www.artstation.com/api/v2/community/explore/projects/latest.json",
    "latest"
  );
}

export async function scrapeCommunityProjects() {
  return scrapeEndpoint(
    "https://www.artstation.com/api/v2/neighborhoods/projects/community.json",
    "community"
  );
}

async function scrapeEndpoint(
  baseUrl: string,
  endpointName: string
): Promise<number> {
  console.log(`Starting ${endpointName} scrape at ${new Date().toISOString()}`);

  let page = 1;
  let totalNewUsers = 0;
  const db = await openDb();

  try {
    while (totalNewUsers < config.maxUsersToFetch) {
      await delay(config.requestDelay);

      console.log(`Fetching ${endpointName} page ${page}...`);
      const url = `${baseUrl}?page=${page}&per_page=30`;

      const response = await fetch(url, {
        method: "GET",
        headers: config.headers,
        redirect: "follow",
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.log("Rate limit hit, waiting longer...");
          await delay(config.rateLimitDelay);
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const users = extractUserData(data);

      if (users.length === 0) {
        console.log(`No more users found in ${endpointName}`);
        break;
      }

      const newUsers = await storeUsers(db, users);
      totalNewUsers += newUsers;

      console.log(
        `Page ${page}: Found ${users.length} users (${newUsers} new)`
      );

      if (totalNewUsers >= config.maxUsersToFetch) {
        console.log(`Reached target of ${config.maxUsersToFetch} new users`);
        break;
      }

      page++;
    }

    console.log(
      `Finished ${endpointName} scrape. Total new users: ${totalNewUsers}`
    );
    return totalNewUsers;
  } catch (error) {
    console.error(`Error in ${endpointName} scrape:`, error);
    throw error;
  } finally {
    await db.close();
  }
}

function extractUserData(data: any): User[] {
  if (!data.data || !Array.isArray(data.data)) {
    return [];
  }

  return data.data
    .map((item: any) => ({
      id: item.user?.id,
      username: item.user?.username,
      full_name: item.user?.full_name,
      is_staff: item.user?.is_staff || false,
      is_pro_member: item.user?.pro_member || false,
      last_scraped_at: new Date(),
    }))
    .filter((user: User) => user.id && user.username);
}

async function storeUsers(db: any, users: User[]): Promise<number> {
  let newUserCount = 0;

  for (const user of users) {
    try {
      const result = await db.run(
        `INSERT OR IGNORE INTO users 
        (id, username, full_name, is_staff, is_pro_member, last_scraped_at) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.full_name,
          user.is_staff ? 1 : 0,
          user.is_pro_member ? 1 : 0,
          user.last_scraped_at?.toISOString(),
        ]
      );

      if (result.changes && result.changes > 0) {
        newUserCount++;
      }
    } catch (error) {
      console.error(`Error storing user ${user.username}:`, error);
    }
  }

  return newUserCount;
}

export async function getUsersToEmail(limit: number = 100): Promise<User[]> {
  const db = await openDb();
  try {
    return db.all<User[]>(
      `SELECT id, username, full_name, email 
       FROM users 
       WHERE is_sent = 0 AND email IS NOT NULL
       LIMIT ?`,
      [limit]
    );
  } finally {
    await db.close();
  }
}

export async function markAsSent(userIds: number[]) {
  const db = await openDb();
  try {
    await db.run(
      `UPDATE users SET is_sent = 1 WHERE id IN (${userIds
        .map(() => "?")
        .join(",")})`,
      userIds
    );
  } finally {
    await db.close();
  }
}

export async function updateUserEmail(userId: number, email: string) {
  const db = await openDb();
  try {
    await db.run(`UPDATE users SET email = ? WHERE id = ?`, [email, userId]);
  } finally {
    await db.close();
  }
}

export async function getNextUnemailedUser(): Promise<User | null | undefined> {
  const db = await openDb();
  try {
    return await db.get<User>(
      `SELECT * FROM users 
       WHERE (email IS NULL OR email = '') 
       AND is_sent = 0 
       AND (skip_count IS NULL OR skip_count < 2)
       ORDER BY created_at ASC
       LIMIT 1`
    );
  } finally {
    await db.close();
  }
}

export async function getNextUnemailedUsers(limit: number) {
  const db = await openDb();

  return db.all(
    `
    SELECT id, username, full_name 
    FROM users 
    WHERE email IS NULL 
    AND skip_count < 2
    AND (processing = 0 OR last_attempt < datetime('now', '-5 minutes'))
    ORDER BY last_attempt ASC NULLS FIRST
    LIMIT ?
  `,
    [limit]
  );
}

export async function markUserAsProcessing(userId: string) {
  const db = await openDb();

  await db.run(
    `
    UPDATE users 
    SET processing = 1,
        last_attempt = datetime('now')
    WHERE id = ?
  `,
    [userId]
  );
}

export async function markUserAsAvailable(userId: string) {
  const db = await openDb();

  await db.run(
    `
    UPDATE users 
    SET processing = 0
    WHERE id = ?
  `,
    [userId]
  );
}

export async function getUserById(userId: string) {
  const db = await openDb();

  const result = await db.get(
    `
    SELECT id, username, full_name
    FROM users
    WHERE id = ?
  `,
    [userId]
  );

  return result || null;
}

export async function getUserByUsername(username: string) {
  const db = await openDb();

  const result = await db.get(
    `
    SELECT id, username, full_name
    FROM users
    WHERE username = ?
  `,
    [username]
  );

  return result || null;
}

export async function incrementSkipCount(userId: string) {
  const db = await openDb();

  await db.run(
    `
    UPDATE users
    SET skip_count = skip_count + 1,
        processing = 0
    WHERE id = ?
  `,
    [userId]
  );
}
