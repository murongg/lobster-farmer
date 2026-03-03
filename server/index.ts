import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feedLobster, getState } from "./game.js";

const port = Number(process.env.PORT ?? 18990);
const currentDir = dirname(fileURLToPath(import.meta.url));
const appRootCandidates = [
  join(process.cwd(), "public"),
  join(currentDir, "../public"),
  join(currentDir, "../../../public")
];
const appRoot = appRootCandidates.find((path) => existsSync(path));

if (!appRoot) {
  throw new Error("Cannot locate static public directory");
}

const app = express();

app.use(express.json({ limit: "64kb" }));

app.use((req: Request, res: Response, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/api/state", (_req: Request, res: Response) => {
  res.json({ state: getState() });
});

app.post("/api/feed", (req: Request, res: Response) => {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const model = typeof body.model === "string" ? body.model : "";
  const inputTokens = body.input_tokens;
  const outputTokens = body.output_tokens;
  const tokens = body.tokens;
  const emotion = body.emotion;

  try {
    res.json(feedLobster(model, inputTokens, outputTokens, tokens, emotion));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(express.static(appRoot));

app.get("*", (req: Request, res: Response) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.sendFile(join(appRoot, "index.html"));
});

app.listen(port, () => {
  console.log(`Lobster Farmer server is running at http://localhost:${port}`);
});
