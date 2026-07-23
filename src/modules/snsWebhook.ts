import express, { Request, Response } from "express";
import fetch from "node-fetch";
import { markAsBounced, markAsComplained } from "./scraper";

/**
 * SNS Webhook handler for SES bounce/complaint notifications.
 * 
 * SNS sends three types of messages:
 * 1. SubscriptionConfirmation — must be confirmed by fetching the SubscribeURL
 * 2. Notification — contains bounce/complaint data from SES
 * 3. UnsubscribeConfirmation — acknowledgement of unsubscription
 */
export function createSnsWebhookRouter(): express.Router {
  const router = express.Router();

  router.post("/webhooks/sns", async (req: Request, res: Response) => {
    try {
      const messageType = req.headers["x-amz-sns-message-type"] as string;
      const body = req.body;

      if (!messageType) {
        res.status(400).json({ error: "Missing SNS message type header" });
        return;
      }

      // Handle subscription confirmation
      if (messageType === "SubscriptionConfirmation") {
        console.log("Confirming SNS subscription...");
        const subscribeUrl = body.SubscribeURL;
        if (subscribeUrl) {
          await fetch(subscribeUrl);
          console.log("SNS subscription confirmed");
        }
        res.status(200).json({ status: "confirmed" });
        return;
      }

      // Handle notifications (bounces, complaints, deliveries)
      if (messageType === "Notification") {
        const message = JSON.parse(body.Message);
        const notificationType = message.notificationType;

        if (notificationType === "Bounce") {
          await handleBounce(message);
        } else if (notificationType === "Complaint") {
          await handleComplaint(message);
        } else if (notificationType === "Delivery") {
          console.log(
            `Delivery confirmed for: ${message.delivery?.recipients?.join(", ")}`
          );
        }

        res.status(200).json({ status: "processed" });
        return;
      }

      res.status(200).json({ status: "ignored" });
    } catch (error) {
      console.error("Error processing SNS webhook:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

async function handleBounce(message: any) {
  const bounce = message.bounce;
  const bounceType = bounce.bounceType; // "Permanent" or "Transient"
  const messageId = message.mail?.messageId;

  console.log(
    `Bounce received — type: ${bounceType}, messageId: ${messageId}`
  );

  for (const recipient of bounce.bouncedRecipients || []) {
    console.log(
      `  Bounced recipient: ${recipient.emailAddress} (${recipient.diagnosticCode || "no diagnostic"})`
    );
  }

  if (messageId) {
    await markAsBounced(messageId, bounceType);
  }

  if (bounceType === "Permanent") {
    console.warn(
      `PERMANENT bounce for messageId ${messageId} — user will not be emailed again`
    );
  }
}

async function handleComplaint(message: any) {
  const complaint = message.complaint;
  const messageId = message.mail?.messageId;

  console.log(
    `Complaint received — type: ${complaint.complaintFeedbackType || "unknown"}, messageId: ${messageId}`
  );

  for (const recipient of complaint.complainedRecipients || []) {
    console.log(`  Complained recipient: ${recipient.emailAddress}`);
  }

  if (messageId) {
    await markAsComplained(messageId);
  }
}
