import nodemailer from "nodemailer";
import { emailConfig } from "../config/config";
import { getUsersToEmail, markAsSent } from "./scraper";
import { User } from "../models/User";
import { Sender, senders } from "../config/senders";
import { openDb } from "../database/db";

let isSending = false;

function createSenderTransporter(sender: Sender) {
  console.log("sender", sender);
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: sender.email,
      pass: sender.password,
    },
  });
}

function distributeUsers(users: User[]): Map<number, User[]> {
  const distribution = new Map<number, User[]>();
  users.forEach((user, index) => {
    const senderIndex = index % senders.length;
    if (!distribution.has(senderIndex)) {
      distribution.set(senderIndex, []);
    }
    distribution.get(senderIndex)?.push(user);
  });
  return distribution;
}

async function sendEmailWithRetry(
  transporter: nodemailer.Transporter,
  mailOptions: nodemailer.SendMailOptions,
  maxRetries: number
): Promise<boolean> {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempts))
      );
    }
  }
  return false;
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
    const limit = options?.isCleanupRun ? emailConfig.dailyCleanupLimit : 100;
    const users = await db.all<User[]>(
      `SELECT * FROM users WHERE is_sent = 0 AND email IS NOT NULL LIMIT ?`,
      [limit]
    );
    const failedUserIds: number[] = [];
    const emailStats = {
      total: users.length,
      success: 0,
      failures: 0,
    };

    if (users.length === 0) {
      console.log("No users to email");
      return emailStats;
    }

    const distribution = distributeUsers(users);

    for (const [senderIndex, userBatch] of distribution) {
      const sender = senders[senderIndex];
      try {
        const transporter = createSenderTransporter(sender);
        console.log(
          `Processing ${userBatch.length} emails for sender: ${sender.email}`
        );

        for (const user of userBatch) {
          try {
            const mailOptions = {
              from: `"${sender.name}" <${sender.email}>`,
              to: user.email,
              subject: subject,
              html: htmlTemplate(user, sender.name),
            };

            const success = await sendEmailWithRetry(
              transporter,
              mailOptions,
              emailConfig.maxRetries
            );

            if (success) {
              await markAsSent([user.id]);
              emailStats.success++;
            } else {
              failedUserIds.push(user.id);
              emailStats.failures++;
            }

            await new Promise((resolve) =>
              setTimeout(resolve, emailConfig.delayBetweenEmails)
            );
          } catch (error) {
            console.error(`Error sending to ${user.email}:`, error);
            failedUserIds.push(user.id);
            emailStats.failures++;
          }
        }
        transporter.close();
      } catch (error) {
        console.error(`Error with sender ${sender.email}:`, error);
        failedUserIds.push(...userBatch.map((u) => u.id));
        emailStats.failures += userBatch.length;
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
