export default {
  maxUsersToFetch: 200,
  requestDelay: 10000, // 10 seconds between requests
  rateLimitDelay: 20000, // 20 seconds if rate limited
  headers: {
    cookie: process.env.COOKIE || "",
    referer: "https://www.artstation.com/artwork/vJNvA6",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  },
  email: {
    service: "gmail",
  },
  websocket: {
    port: 8080,
  },
};

export const cronSchedules = {
  latest: "0 */2 * * *", // Every 2 hours at minute 0
  community: "30 1-23/4 * * *", // Every 4 hours at minute 30 (offset from latest)
  cleanup: "0 7 * * *", // 7:00 AM - Cleanup and send pending emails
  email: "0 */3 * * *", // Every 3 hours at minute 0
};

export const emailConfig = {
  delayBetweenEmails: 10000,
  maxRetries: 3,
  dailyCleanupLimit: 500, // Max emails to send during cleanup
};
