import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandOutput,
} from "@aws-sdk/client-ses";
import { EmailProvider, EmailPayload, EmailSendResult } from "./EmailProvider";

export class SESProvider implements EmailProvider {
  private client: SESClient;
  private fromEmail: string;
  private fromName: string;

  constructor(region: string, fromEmail: string, fromName: string) {
    this.client = new SESClient({ region });
    this.fromEmail = fromEmail;
    this.fromName = fromName;
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const fromAddress = `${this.fromName} <${this.fromEmail}>`;
    const replyTo = payload.replyTo || this.fromEmail;

    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: {
        ToAddresses: [payload.to],
      },
      Message: {
        Subject: {
          Data: payload.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: payload.htmlContent,
            Charset: "UTF-8",
          },
        },
      },
      ReplyToAddresses: [replyTo],
      Tags: [
        {
          Name: "project",
          Value: "artreserve",
        },
      ],
    });

    const response: SendEmailCommandOutput = await (
      this.client as any
    ).send(command);

    if (!response.MessageId) {
      throw new Error("SES did not return a MessageId");
    }

    return { messageId: response.MessageId };
  }
}
