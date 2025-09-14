import express, { Request, Response } from "express";
import { speechToText } from "./functions/speechToText";
import cors from "cors";
import * as dotenv from "dotenv";
import "dotenv/config";

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();
app.use(express.json({ limit: "50mb" }));

// Cross-origin requests
app.use(cors({ origin: "*" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/speech-to-text", (req: Request, res: Response) => {
  speechToText(req, res);
});

app.get("/", (req, res) => {
  res.send("The Speech-to-Text API is up and running! Try GET /health or POST /speech-to-text");
});

app.listen(PORT, () => console.log(`API listening on http://0.0.0.0:${PORT}`));

