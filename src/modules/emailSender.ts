import { SESProvider } from "../email/SESProvider";
import { EmailProvider } from "../email/EmailProvider";
import config, { emailConfig } from "../config/config";
import { markAsSent, markAsFailed } from "./scraper";
import { User } from "../models/User";
import { openDb } from "../database/db";

let isSending = false;

function createProvider(): EmailProvider {
  return new SESProvider(
    config.ses.region,
    config.ses.fromEmail,
    config.ses.fromName
  );
}

async function sendEmailWithRetry(
  provider: EmailProvider,
  user: User,
  subject: string,
  htmlContent: string,
  maxRetries: number
): Promise<{ success: boolean; messageId?: string }> {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const result = await provider.send({
        to: user.email!,
        subject: subject,
        htmlContent: htmlContent,
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempts))
      );
    }
  }
  return { success: false };
}

export async function sendBulkEmails(
  subject: string,
  htmlTemplate: (user: User, sender: string) => string,
  options?: { isCleanupRun?: boolean }
) {
  if (isSending) {
    console.log("Email sending already in progress, skipping...");
    return { total: 0, success: 0, failures: 0 };
  }
  isSending = true;

  const db = await openDb();
  try {
    const provider = createProvider();
    const limit = options?.isCleanupRun ? emailConfig.dailyCleanupLimit : 100;
    const users = await db.all<User[]>(
      `SELECT * FROM users WHERE status = 'pending' AND email IS NOT NULL LIMIT ?`,
      [limit]
    );
    const emailStats = {
      total: users.length,
      success: 0,
      failures: 0,
    };

    if (users.length === 0) {
      console.log("No users to email");
      return emailStats;
    }

    console.log(
      `Processing ${users.length} emails via SES as ${config.ses.fromName} <${config.ses.fromEmail}>`
    );

    for (const user of users) {
      try {
        const htmlContent = htmlTemplate(user, config.ses.fromName);

        const result = await sendEmailWithRetry(
          provider,
          user,
          subject,
          htmlContent,
          emailConfig.maxRetries
        );

        if (result.success) {
          await markAsSent([user.id], result.messageId);
          emailStats.success++;
        } else {
          await markAsFailed(user.id, "Max retries exceeded");
          emailStats.failures++;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, emailConfig.delayBetweenEmails)
        );
      } catch (error: any) {
        console.error(`Error sending to ${user.email}:`, error);
        await markAsFailed(user.id, error.message || "Unknown error");
        emailStats.failures++;
      }
    }

    console.log(
      `Email sending completed. Success: ${emailStats.success}, Failures: ${emailStats.failures}`
    );
    return emailStats;
  } finally {
    await db.close();
    isSending = false;
  }
}
