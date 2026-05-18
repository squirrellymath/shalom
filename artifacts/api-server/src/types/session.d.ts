import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: {
      email: string;
      role: string;
      [key: string]: unknown;
    };
  }
}
