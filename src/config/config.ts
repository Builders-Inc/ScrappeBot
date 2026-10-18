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
  ses: {
    region: process.env.AWS_REGION || "us-east-1",
    fromEmail: process.env.SES_FROM_EMAIL || "grace@artreserve.org",
    fromName: process.env.SES_FROM_NAME || "Grace Logan",
  },
  websocket: {
    port: Number(process.env.WS_PORT) || 8080,
    token: process.env.WS_TOKEN || "", // if set, clients must connect with ?token=<WS_TOKEN>
  },
  webhook: {
    port: Number(process.env.PORT) || 3000,
    snsTopicArn: process.env.SNS_TOPIC_ARN || "", // if set, only accept messages from this topic
  },
};

export const cronSchedules = {
  latest: "0 */2 * * *", // Every 2 hours at minute 0
  community: "30 1-23/4 * * *", // Every 4 hours at minute 30 (offset from latest)
  cleanup: "0 7 * * *", // 7:00 AM - Cleanup and send pending emails
  email: "0 */3 * * *", // Every 3 hours at minute 0
};

export const emailConfig = {
  delayBetweenEmails: 1100, // ~1 email/sec (SES production rate limit with margin)
  maxRetries: 3,
  dailyCleanupLimit: 500, // Max emails to send during cleanup
};
