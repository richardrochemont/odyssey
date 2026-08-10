import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/tasks";
import { TaskCreateSchema, TaskStatusEnum } from "@hearthlane/validation";


export default async function taskRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // List tasks (with optional query filters)
  fastify.get("/", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const { status, ownerId } = request.query as { status?: string; ownerId?: string };

    const filters: any = {};
    if (status) {
      const parsedStatus = TaskStatusEnum.safeParse(status);
      if (parsedStatus.success) filters.status = parsedStatus.data;
    }
    if (ownerId) {
      filters.ownerId = ownerId;
    }

    const list = await service.listTasks(user.orgId, filters);
    return list;
  });

  // Create task
  fastify.post("/", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = TaskCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const task = await service.createTask(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(task);
  });

  // Update task
  fastify.put("/:id", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const parseResult = TaskCreateSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateTask(user.orgId, user.id, id, parseResult.data);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Archive task (soft-delete)
  fastify.delete("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveTask(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}
