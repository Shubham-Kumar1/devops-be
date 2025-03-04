import dotenv from "dotenv";
dotenv.config({ path: './.env' });  // Load environment variables from the .env file

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import todoRoutes from "./routes/todoRoutes.js";
import { PrismaClient } from "@prisma/client";
import client from "prom-client";

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Rate limiting with different rules for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 failed login attempts per hour
  message: 'Too many login attempts, please try again later'
});

// Apply rate limiters
app.use(generalLimiter);
app.use('/api/auth/login', authLimiter);

// Performance middleware
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined'));

const prisma = new PrismaClient();
const PORT = process.env.PORT || 4400;  // Use the port from the environment, fallback to 4400
const register = client.register;

// Enhanced Prometheus metrics
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests made',
  labelNames: ['method', 'status_code', 'endpoint', 'ip']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histogram of HTTP request durations',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of currently active connections'
});

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1]
});

const errorCounter = new client.Counter({
  name: 'error_total',
  help: 'Total number of errors by type',
  labelNames: ['type', 'endpoint']
});

// System metrics
const memoryUsage = new client.Gauge({
  name: 'nodejs_memory_usage_bytes',
  help: 'Memory usage by type',
  labelNames: ['type']
});

const cpuUsage = new client.Gauge({
  name: 'nodejs_cpu_usage_percent',
  help: 'CPU usage percentage'
});

// Enhanced middleware for metrics and logging
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.inc();
  
  // Sanitize IP address for metrics
  const ip = req.ip.replace(/[^0-9.]/g, '');
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${ip}`);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({
      method: req.method,
      status_code: res.statusCode,
      endpoint: req.originalUrl,
      ip: ip
    });
    httpRequestDurationSeconds.observe(
      { method: req.method, route: req.originalUrl, status_code: res.statusCode },
      duration
    );
    activeConnections.dec();
    
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} - Duration: ${duration.toFixed(3)}s`
    );
  });

  next();
});

// Enhanced metrics endpoint with system metrics
app.get('/', async (req, res) => {
  try {
    // Update system metrics
    const used = process.memoryUsage();
    Object.keys(used).forEach(key => {
      memoryUsage.set({ type: key }, used[key]);
    });

    const startUsage = process.cpuUsage();
    const endUsage = process.cpuUsage(startUsage);
    const totalCPUTime = (endUsage.user + endUsage.system) / 1000000;
    const totalElapsedTime = process.uptime();
    cpuUsage.set(totalCPUTime / totalElapsedTime * 100);

    // Test database connection
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbDuration = (Date.now() - dbStart) / 1000;
    dbQueryDuration.observe({ operation: 'health_check' }, dbDuration);

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    errorCounter.inc({ type: 'internal_error', endpoint: '/' });
    console.error("Error fetching metrics:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint with enhanced checks
app.get('/health', async (req, res) => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbDuration = (Date.now() - start) / 1000;
    dbQueryDuration.observe({ operation: 'health_check' }, dbDuration);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        status: 'connected',
        latency: dbDuration
      }
    };

    res.json(health);
  } catch (error) {
    errorCounter.inc({ type: 'health_check_failure', endpoint: '/health' });
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes with error handling
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);

// Global error handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error details
  console.error({
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    error: {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      name: err.name,
      code: err.code
    }
  });

  // Increment error counter
  errorCounter.inc({ 
    type: err.name || 'unknown_error', 
    endpoint: req.originalUrl 
  });

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(400).json({
        status: 'error',
        message: 'A unique constraint violation occurred'
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        status: 'error',
        message: 'Record not found'
      });
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      message: 'Token expired'
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: err.message
    });
  }

  // Default error response
  res.status(err.statusCode).json({
    status: err.status,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    prisma.$disconnect().then(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

// Database connection testing and migration
async function testConnection() {
  try {
    // First establish database connection
    await prisma.$connect();
    console.log('Successfully connected to the database!');
    
    // Run database migrations
    console.log('Running database migrations...');
    const { execSync } = await import('child_process');
    try {
      execSync('npx prisma migrate dev --name init', { 
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' } // Enable colored output
      });
      console.log('Database migrations completed successfully!');
    } catch (migrationError) {
      console.error('Error running migrations:', migrationError);
      // Log the error but don't exit the process
      // This allows the application to start even if migrations fail
      // You might want to add a warning or notification system here
    }
  } catch (error) {
    console.error('Error connecting to the database:', error);
    process.exit(1); // Exit if database connection fails
  }
}

// Test DB connection on startup
testConnection();
