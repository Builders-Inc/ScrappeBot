export type EmailStatus = "pending" | "sent" | "failed" | "bounced" | "complained";

export interface User {
  id: number;
  username: string;
  full_name: string;
  is_staff: boolean;
  is_pro_member: boolean;
  email?: string;
  is_sent?: boolean;
  status?: EmailStatus;
  ses_message_id?: string;
  sent_at?: Date;
  last_error?: string;
  bounce_type?: string;
  last_scraped_at?: Date;
  skip_count?: number;
}

export interface UserWithEmail extends User {
  email: string;
}
