export interface EmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<EmailSendResult>;
}
