import fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { db, databaseUrl } from "@odyssey/db";
import IORedis from "ioredis";

import { validateAppUrl } from "./config/appUrl";
import { validateEmailConfig } from "./services/email";

// Load environment variables
dotenv.config({ path: "../../.env" });

// Import routes
import authRoutes from "./routes/auth";
import workspaceRoutes from "./routes/workspaces";
import invitationRoutes from "./routes/invitations";
import propertyRoutes from "./routes/properties";
import leaseRoutes from "./routes/leases";
import maintenanceRoutes from "./routes/maintenance";
import taskRoutes from "./routes/tasks";
import financialRoutes from "./routes/financials";
import growthRoutes from "./routes/growth";
import aiRoutes from "./routes/ai";
import paymentRoutes from "./routes/payments";
import importRoutes from "./routes/imports";
import webhookRoutes from "./routes/webhooks";
import portalRoutes from "./routes/portal";

const PORT = parseInt(process.env.PORT || "4000", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function startServer() {
  const app = fastify({
    requestIdHeader: "x-request-id",
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.currentPassword",
        "req.body.newPassword",
        "req.body.confirmPassword",
        "req.body.token",
        "req.body.invitationToken",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.tokenHash",
        "*.invitationToken",
        "*.jwtSecret",
        "*.databaseUrl",
        "*.apiKey",
        "*.secret",
      ],
      transport: process.env.NODE_ENV !== "production" ? {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      } : undefined,
    },
  });

  // CORS Configuration
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // Production Security & Environment Assertions
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_AUTH_DIRECTORY === "true") {
    throw new Error("FATAL SECURITY CONFIGURATION: ENABLE_DEV_AUTH_DIRECTORY must not be set to 'true' in production.");
  }
  validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
  validateEmailConfig();

  // Rate Limiting (Redis-backed for cluster/production scalability)
  //
  // isE2ETestMode raises only the ceiling (max), never the window, keying,
  // Redis backing, or global scope: a Playwright run drives real page loads
  // (each firing ~10 app-shell requests) against the same shared budget a
  // single interactive user would otherwise use, so 100/min is exhausted by
  // the test suite alone, not by anything resembling abusive traffic. This
  // mirrors the existing NODE_ENV/E2E_TEST_MODE gate in routes/auth.ts's
  // /login rate limit and is never true outside a Playwright-driven run.
  const isE2ETestMode =
    process.env.NODE_ENV === "test" &&
    process.env.E2E_TEST_MODE === "true";

  await app.register(rateLimit, {
    global: true,
    max: isE2ETestMode ? 1000 : 100,
    timeWindow: "1 minute",
    redis: redis,
    allowList: ["/health", "/health/db", "/health/redis"],
    errorResponseBuilder: () => ({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    }),
  });

  // Swagger Documentation Setup
  await app.register(swagger, {
    swagger: {
      info: {
        title: "Odyssey REST API",
        description: "Production-minded backend cockpit for residential landlords",
        version: "1.0.0",
      },
      host: `localhost:${PORT}`,
      schemes: ["http"],
      consumes: ["application/json"],
      produces: ["application/json"],
      securityDefinitions: {
        apiKey: {
          type: "apiKey",
          name: "Authorization",
          in: "header",
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "none",
      deepLinking: false,
    },
  });

  // Global Error Handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    if (error.validation) {
      return reply.code(400).send({
        error: "Validation failed",
        message: error.message,
        details: error.validation,
      });
    }
    const statusCode = error.statusCode || 500;
    const isProd = process.env.NODE_ENV === "production";
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "InternalServerError" : error.name || "Error",
      message: (isProd && statusCode === 500) ? "An unexpected error occurred" : (error.message || "An unexpected error occurred"),
    });
  });

  // Register endpoints
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(workspaceRoutes, { prefix: "/workspaces" });
  await app.register(invitationRoutes, { prefix: "/invitations" });
  await app.register(propertyRoutes, { prefix: "/properties" });
  await app.register(leaseRoutes, { prefix: "/leases" });
  await app.register(maintenanceRoutes, { prefix: "/maintenance" });
  await app.register(taskRoutes, { prefix: "/tasks" });
  await app.register(financialRoutes, { prefix: "/financials" });
  await app.register(growthRoutes, { prefix: "/growth" });
  await app.register(aiRoutes, { prefix: "/ai" });
  await app.register(paymentRoutes, { prefix: "/payments" });
  await app.register(importRoutes, { prefix: "/imports" });
  await app.register(webhookRoutes, { prefix: "/webhooks" });
  await app.register(portalRoutes, { prefix: "/portal" });

  // Liveness health check returning 200 without DB/Redis queries
  app.get("/health", async () => {
    return { status: "healthy", timestamp: new Date().toISOString() };
  });

  // Database connectivity check
  app.get("/health/db", async (_request, reply) => {
    if (process.env.NODE_ENV === "production" && databaseUrl.includes("localhost")) {
      return reply.code(503).send({
        status: "unhealthy",
        database: "disconnected",
        error: "Missing DATABASE_URL environment variable in production (currently falling back to localhost)",
        timestamp: new Date().toISOString()
      });
    }
    try {
      await db.execute(sql`select 1`);
      return { status: "healthy", database: "connected", timestamp: new Date().toISOString() };
    } catch (error: any) {
      app.log.error({ err: error }, "Database health check failed");
      return reply.code(503).send({
        status: "unhealthy",
        database: "disconnected",
        error: error.message || String(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Redis connectivity check
  app.get("/health/redis", async (_request, reply) => {
    try {
      const ping = await redis.ping();
      if (ping === "PONG") {
        return { status: "healthy", redis: "connected", timestamp: new Date().toISOString() };
      }
      throw new Error(`Unexpected Redis ping response: ${ping}`);
    } catch (error: unknown) {
      app.log.error({ err: error }, "Redis health check failed");
      return reply.code(503).send({
        status: "unhealthy",
        redis: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  });

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`Swagger documentation available at http://localhost:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();
