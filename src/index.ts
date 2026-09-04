import express from "express";
import "dotenv/config";
import subjectsRouter from "./routes/subjects.ts";
import cors from "cors";

const app = express();
const PORT = process.env.PORT;

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

app.use("/api/subjects", subjectsRouter);

app.get("/", (req, res) => {
  res.send("Hello, Welcome to Classroom API!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});
