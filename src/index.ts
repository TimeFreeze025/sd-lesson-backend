import express from "express";
import "dotenv/config";
import subjectsRouter from "./routes/subjects.ts";
import usersRouter from "./routes/users.ts";
import classesRouter from "./routes/classes.ts";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { requireRole } from "./middleware/require-role.ts";
import { httpServerHandler } from "cloudflare:node";

const app = express();
const PORT = Number(process.env.PORT);

if (!process.env.FRONTEND_URL)
  throw new Error("FRONTEND_URL is not defined in the environment variables");

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json());

app.all("/api/auth/{*splat}", toNodeHandler(auth));

app.use("/api/subjects", requireRole("admin", "teacher"), subjectsRouter);

app.use("/api/classes", requireRole("admin", "teacher"), classesRouter);

app.use("/api/users", usersRouter);

app.get("/", (req, res) => {
  res.send("Hello, Welcome to Classroom API!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});

export default httpServerHandler({ port: PORT });
