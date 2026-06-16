import cron from "node-cron";
import { cronSchedules } from "../config/config";
import { scrapeLatestProjects, scrapeCommunityProjects } from "./scraper";
import { sendBulkEmails } from "./emailSender";
import { runCleanup } from "./cleanupService";

export function setupSchedules() {
  // Schedule latest projects scrape (every 2 hours)
  cron.schedule(
    cronSchedules.latest,
    async () => {
      console.log("\n=== Starting scheduled latest projects scrape ===");
      try {
        await runCleanup(true); // Run cleanup before scraping
        const newUsers = await scrapeLatestProjects();
        console.log(`=== Found ${newUsers} new users ===`);
      } catch (error) {
        console.error("Scrape failed:", error);
      }
    },
    { timezone: "Africa/Lagos", scheduled: true, runOnInit: false }
  );

  // Schedule community projects scrape (every 4 hours, offset at minute 30)
  cron.schedule(
    cronSchedules.community,
    async () => {
      console.log("\n=== Starting scheduled community projects scrape ===");
      try {
        const newUsers = await scrapeCommunityProjects();
        console.log(`=== Found ${newUsers} new community users ===`);
      } catch (error) {
        console.error("Community scrape failed:", error);
      }
    },
    { timezone: "Africa/Lagos", scheduled: true, runOnInit: false }
  );

  // Schedule daily cleanup (7 AM Lagos time)
  cron.schedule(
    cronSchedules.cleanup,
    async () => {
      console.log("\n=== Starting daily cleanup ===");
      try {
        await runCleanup(false);
      } catch (error) {
        console.error("Cleanup failed:", error);
      }
    },
    { timezone: "Africa/Lagos", scheduled: true, runOnInit: false }
  );

  // Fallback email schedule (every 3 hours)
  cron.schedule(
    cronSchedules.email,
    async () => {
      console.log("\n=== Starting scheduled email sending ===");
      try {
        const stats = await sendBulkEmails(
          "Business(Artstation)",
          getEmailTemplate()
        );
        console.log(
          `=== Email stats: ${stats.success} sent, ${stats.failures} failed ===`
        );
      } catch (error) {
        console.error("Email sending failed:", error);
      }
    },
    { timezone: "Africa/Lagos", scheduled: true, runOnInit: true }
  );

  console.log("Service started with schedules (Lagos Time):");
  console.log(`- Daily cleanup: 7:00 AM (sends pending emails + cleanup)`);
  console.log(`- Latest projects scrape: Every 2 hours`);
  console.log(`- Community projects scrape: Every 4 hours (at :30)`);
  console.log(`- Fallback email sending: Every 3 hours`);
}

function getEmailTemplate() {
  return (user: any, senderName: any) => `
    <p>Hello ${user.full_name},</p>
    <p>I trust this message finds you in good health. I was quite taken with your artwork on ArtStation, especially admiring its originality and flair. I'm curious to know if any of the pieces are currently available for acquisition.</p>
    <p>I await your reply with anticipation.</p>
    <p>Best regards,<br>
    ${senderName}</p>
  `;
}
