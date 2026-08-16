import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/tasks";
import {
  TaskCreateSchema, TaskListQuerySchema, TaskPatchSchema, TaskPriorityEnum,
  TaskReopenSchema, TaskStatusEnum,
} from "@odyssey/validation";

const allRoles = ["owner", "manager", "accountant", "maintenance", "read_only"] as const;

function actor(request: any): service.TaskActor {
  return { id: request.user.id, orgId: request.user.orgId, role: request.user.role };
}

function validationError(reply: any, error: any) {
  return reply.code(400).send({ error: "Validation failed", details: error.flatten() });
}

function serviceError(reply: any, error: unknown) {
  if (error instanceof service.TaskServiceError) return reply.code(error.statusCode).send({ error: error.message });
  throw error;
}

function parseCsv<T>(value: string | undefined, schema: { safeParse(value: unknown): any }): T[] | undefined {
  if (!value) return undefined;
  const result: T[] = [];
  for (const item of value.split(",")) {
    const parsed = schema.safeParse(item);
    if (!parsed.success) throw new service.TaskServiceError(400, `Invalid filter value: ${item}`);
    result.push(parsed.data);
  }
  return result;
}

export default async function taskRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: authorize([...allRoles]) }, async (request, reply) => {
    try { return await service.getTaskSummary(actor(request)); } catch (error) { return serviceError(reply, error); }
  });

  fastify.get("/assignees", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    const query = request.query as { q?: string; page?: string; pageSize?: string };
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 25), 1), 100);
    try { return await service.listAssignees(actor(request), query.q, page, pageSize); } catch (error) { return serviceError(reply, error); }
  });

  fastify.get("/", { preHandler: authorize([...allRoles]) }, async (request, reply) => {
    const parsed = TaskListQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      return await service.listTasks(actor(request), {
        statuses: parseCsv(parsed.data.status, TaskStatusEnum),
        priorities: parseCsv(parsed.data.priority, TaskPriorityEnum),
        assigneeId: parsed.data.assigneeId,
        assigneeMe: parsed.data.assignee === "me",
        unassigned: parsed.data.unassigned === "true",
        propertyId: parsed.data.propertyId,
        due: parsed.data.due,
        dueFrom: parsed.data.dueFrom,
        dueTo: parsed.data.dueTo,
        sort: parsed.data.sort,
        direction: parsed.data.direction,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        archived: parsed.data.archived === "true",
      });
    } catch (error) { return serviceError(reply, error); }
  });

  fastify.post("/", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    const parsed = TaskCreateSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try { return reply.code(201).send(await service.createTask(actor(request), parsed.data)); } catch (error) { return serviceError(reply, error); }
  });

  fastify.get("/:id/audit", { preHandler: authorize([...allRoles]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 25), 1), 100);
    try { return await service.listTaskAudit(actor(request), id, page, pageSize); } catch (error) { return serviceError(reply, error); }
  });

  fastify.get("/:id", { preHandler: authorize([...allRoles]) }, async (request, reply) => {
    try { return await service.getTask(actor(request), (request.params as { id: string }).id); } catch (error) { return serviceError(reply, error); }
  });

  fastify.patch("/:id", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    const parsed = TaskPatchSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try { return await service.updateTask(actor(request), (request.params as { id: string }).id, parsed.data); } catch (error) { return serviceError(reply, error); }
  });

  fastify.post("/:id/complete", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    try { return await service.completeTask(actor(request), (request.params as { id: string }).id); } catch (error) { return serviceError(reply, error); }
  });

  fastify.post("/:id/reopen", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    const parsed = TaskReopenSchema.safeParse(request.body || {});
    if (!parsed.success) return validationError(reply, parsed.error);
    try { return await service.reopenTask(actor(request), (request.params as { id: string }).id, parsed.data.status); } catch (error) { return serviceError(reply, error); }
  });

  fastify.post("/:id/cancel", { preHandler: authorize(["owner", "manager", "accountant", "maintenance"]) }, async (request, reply) => {
    try { return await service.cancelTask(actor(request), (request.params as { id: string }).id); } catch (error) { return serviceError(reply, error); }
  });

  fastify.delete("/:id", { preHandler: authorize(["owner", "manager"]) }, async (request, reply) => {
    try { return await service.archiveTask(actor(request), (request.params as { id: string }).id); } catch (error) { return serviceError(reply, error); }
  });
}
