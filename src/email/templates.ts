import { User } from "../models/User";

/**
 * Outreach email template — sent to ArtStation artists.
 * Single source of truth. Used by both scheduleManager and cleanupService.
 */
export function outreachTemplate(user: User, senderName: string): string {
  return `
    <p>Hello ${user.full_name},</p>
    <p>I hope you're doing well! I recently came across your artwork on ArtStation,
    and I was truly impressed by how creative and unique each piece is.
    Are any of them for sale?</p>
    <p>Looking forward to hearing from you!</p>
    <p>Best regards,<br>
    ${senderName}</p>
  `;
}
