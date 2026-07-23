import { openDb } from "../database/db";
import { sendBulkEmails } from "./emailSender";
import { outreachTemplate } from "../email/templates";

export async function runCleanup(beforeScrape: boolean) {
  // 1. Send all pending emails
  console.log("Sending all pending emails...");
  const stats = await sendBulkEmails(
    "Your work on ArtStation",
    outreachTemplate,
    { isCleanupRun: true }
  );

  console.log(`=== Sent ${stats.success} pending emails (${stats.failures} failed) ===`);

  // 2. Clean up unsent records (only if not before scrape)
  if (!beforeScrape) {
    console.log("Cleaning up unsent records...");
    const db = await openDb();
    await db.run(
      `DELETE FROM users WHERE status IN ('failed') AND email IS NOT NULL`
    );
    await db.close();
  }

  console.log("=== Cleanup completed ===");
}