export interface ClientSession {
  id: string;
  token: string;
  email: string;
  name: string;
  phone: string;
  expiresAt: Date;
  role: "admin" | "vendor" | "user" | "superadmin";
  emailVerified?: boolean;
  profilePicture?: string | null;
  image?: string | null;
}
