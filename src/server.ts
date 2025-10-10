import express, { type NextFunction, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const authHandler = toNodeHandler(auth);

const handleAuth = (req: Request, res: Response, next: NextFunction) => {
  req.url = req.originalUrl;
  authHandler(req, res).catch(next);
};

app.all("/api/auth", handleAuth);
app.all("/api/auth/*", handleAuth);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Better Auth server listening on http://localhost:${port}`);
});
