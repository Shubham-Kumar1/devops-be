import dotenv from "dotenv";
dotenv.config({ path: './.env' });  // Load environment variables from the .env file

import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import todoRoutes from "./routes/todoRoutes.js";
import { PrismaClient } from "@prisma/client";
import client from "prom-client";

const app = express();
app.use(cors());  // Enable Cross-Origin Resource Sharing
app.use(express.json());  // Parse JSON payloads

const prisma = new PrismaClient();
const PORT = process.env.PORT || 4400;  // Use the port from the environment, fallback to 4400
const register = client.register;

// Prometheus metrics: HTTP request counter and duration histogram
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

// Middleware to log request info and track metrics
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${req.method}] Request to ${req.originalUrl}`);

  // After the response is sent, log the duration and update Prometheus metrics
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

// Prometheus metrics route (metrics endpoint for Prometheus scraping)
app.get('/', async (req, res) => {
  console.log("GET request to '/backend/metrics' route");
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
    console.log("Metrics sent successfully");
  } catch (err) {
    console.error("Error fetching metrics:", err);
    res.status(500).end(err);
  }
});

// Authentication and Todo routes
app.use("/api/auth", (req, res, next) => {
  console.log(`Request to /api/auth - Method: ${req.method}`);
  next();
}, authRoutes);

app.use("/api/todos", (req, res, next) => {
  console.log(`Request to /api/todos - Method: ${req.method}`);
  next();
}, todoRoutes);

// Starting the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Prisma connection testing (optional, but recommended to test DB connection)
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

// Uncomment this line to test DB connection on startup
// testConnection();
