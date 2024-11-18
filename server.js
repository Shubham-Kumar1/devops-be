import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import todoRoutes from "./routes/todoRoutes.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import client from "prom-client";

dotenv.config({
  path: './.env'
});

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT;
const register = client.register;
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests made.',
  labelNames: ['method', 'status_code']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histogram of HTTP request durations.',
  labelNames: ['method', 'route', 'status_code']
});
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, status_code: res.statusCode });
    httpRequestDurationSeconds.observe({
      method: req.method,
      route: req.originalUrl,
      status_code: res.statusCode
    }, duration);
  });

  next();
});

app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => {
  console.log("Home test route")
  res.send("Home test route")
})
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
