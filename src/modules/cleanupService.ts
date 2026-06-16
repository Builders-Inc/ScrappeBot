import { openDb } from "../database/db";
import { sendBulkEmails } from "./emailSender";

export async function runCleanup(beforeScrape: boolean) {
  // 1. Send all pending emails
  console.log("Sending all pending emails...");
  const stats = await sendBulkEmails(
    "Business(Artstation)",
    getEmailTemplate(),
    { isCleanupRun: true }
  );

  console.log(`=== Sent ${stats.success} pending emails (${stats.failures} failed) ===`);

  // 2. Clean up unsent records (only if not before scrape)
  if (!beforeScrape) {
    console.log("Cleaning up unsent records...");
    const db = await openDb();
    await db.run(
      `DELETE FROM users WHERE is_sent = 0 AND email IS NOT NULL`
    );
    await db.close();
  }

  console.log("=== Cleanup completed ===");
}

function getEmailTemplate() {
  return (user: any, senderName: any) => `
    <p>Hello ${user.full_name},</p>
    <p>I hope you're doing well! I recently came across your artwork on ArtStation,
    and I was truly impressed by how creative and unique each piece is.
    Are any of them for sale?</p>
    <p>Looking forward to hearing from you!</p>
    <p>Best regards,<br>
    ${senderName}</p>
  `;
}