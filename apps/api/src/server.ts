import fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import * as dotenv from "dotenv";

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

const PORT = parseInt(process.env.PORT || "4000", 10);

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
  await app.register(cors, {
    origin: true, // allow all origins in development
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // Swagger Documentation Setup
  await app.register(swagger, {
    swagger: {
      info: {
        title: "Hearthlane REST API",
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
    
    // Check if validation error
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

  // Simple Health Check
  app.get("/health", async () => {
    return { status: "healthy", timestamp: new Date().toISOString() };
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
