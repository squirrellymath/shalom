import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: {
      user_id: string;
      email: string;
      role: string;
    };
    pendingInvite?: string;
  }
}
