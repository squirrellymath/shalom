import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { validateSessionSecret } from "./lib/session-secret";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PgSession = connectPgSimple(session);
const sessionSecret = validateSessionSecret(
  process.env["SESSION_SECRET"],
  (message) => logger.warn(message),
);

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    errorLog: (...args: unknown[]) => logger.error({ args }, "Session store error"),
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env["NODE_ENV"] !== "test",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use("/api", router);
app.use("/", router);

const STATIC_DIR = process.env.STATIC_DIR || "/app/artifacts/shalom/dist/public";
app.use(express.static(STATIC_DIR));
app.use((_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

export default app;
