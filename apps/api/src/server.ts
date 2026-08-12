import fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "@odyssey/db";
import IORedis from "ioredis";

// Load environment variables
dotenv.config({ path: "../../.env" });

// Import routes
import authRoutes from "./routes/auth";
import propertyRoutes from "./routes/properties";
import leaseRoutes from "./routes/leases";
import maintenanceRoutes from "./routes/maintenance";
import taskRoutes from "./routes/tasks";
import financialRoutes from "./routes/financials";
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
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // CORS Configuration
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
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
    return reply.code(error.statusCode || 500).send({
      error: error.name || "InternalServerError",
      message: error.message || "An unexpected error occurred",
    });
  });

  // Register endpoints
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(propertyRoutes, { prefix: "/properties" });
  await app.register(leaseRoutes, { prefix: "/leases" });
  await app.register(maintenanceRoutes, { prefix: "/maintenance" });
  await app.register(taskRoutes, { prefix: "/tasks" });
  await app.register(financialRoutes, { prefix: "/financials" });
  await app.register(aiRoutes, { prefix: "/ai" });
  await app.register(paymentRoutes, { prefix: "/payments" });
  await app.register(importRoutes, { prefix: "/imports" });
  await app.register(webhookRoutes, { prefix: "/webhooks" });
  await app.register(portalRoutes, { prefix: "/portal" });

  // Upgraded production-safe health check verifying api, database, and redis
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, string> = {
      api: "healthy",
      database: "unknown",
      redis: "unknown",
    };

    let isHealthy = true;

    // Verify DB
    try {
      await db.execute(sql`select 1`);
      checks.database = "healthy";
    } catch (e: any) {
      checks.database = "unhealthy";
      isHealthy = false;
      app.log.error(`HealthCheck Database failure: ${e.message}`);
    }

    // Verify Redis
    try {
      const ping = await redis.ping();
      checks.redis = ping === "PONG" ? "healthy" : "unhealthy";
      if (ping !== "PONG") isHealthy = false;
    } catch (e: any) {
      checks.redis = "unhealthy";
      isHealthy = false;
      app.log.error(`HealthCheck Redis failure: ${e.message}`);
    }

    if (!isHealthy) {
      return reply.code(503).send({ status: "unhealthy", timestamp: new Date().toISOString(), checks });
    }

    return { status: "healthy", timestamp: new Date().toISOString(), checks };
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
