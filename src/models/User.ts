export interface User {
  id: number;
  username: string;
  full_name: string;
  is_staff: boolean;
  is_pro_member: boolean;
  email?: string;
  is_sent?: boolean;
  last_scraped_at?: Date;
  skip_count?: number;
}

export interface UserWithEmail extends User {
  email: string;
}
