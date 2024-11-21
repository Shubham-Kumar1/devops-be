import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import todoRoutes from "./routes/todoRoutes.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import client from "prom-client";

dotenv.config({ path: './.env' });

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4400;
const register = client.register;

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests made.',
  labelNames: ['method', 'status_code'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histogram of HTTP request durations.',
  labelNames: ['method', 'route', 'status_code'],
});

console.log("Configuration loaded, starting the server...");

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${req.method}] Request to ${req.originalUrl}`);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, status_code: res.statusCode });
    httpRequestDurationSeconds.observe(
      { method: req.method, route: req.originalUrl, status_code: res.statusCode },
      duration
    );
    console.log(
      `[${req.method}] ${req.originalUrl} - ${res.statusCode} - Duration: ${duration.toFixed(3)}s`
    );
  });

  next();
});

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  console.log("GET request to '/' route");
  res.send("Home test route");
});

app.use("/api/auth", (req, res, next) => {
  console.log(`Request to /api/auth - Method: ${req.method}`);
  next();
}, authRoutes);

app.use("/api/todos", (req, res, next) => {
  console.log(`Request to /api/todos - Method: ${req.method}`);
  next();
}, todoRoutes);

app.get('/metrics', async (req, res) => {
  console.log("GET request to '/metrics' route");
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
    console.log("Metrics sent successfully");
  } catch (err) {
    console.error("Error fetching metrics:", err);
    res.status(500).end(err);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database!');
  } catch (error) {
    console.error('Error connecting to the database:', error);
  } finally {
    await prisma.$disconnect();
  }
}
testConnection();