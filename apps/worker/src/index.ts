import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import * as dotenv from "dotenv";

// Load env
dotenv.config({ path: "../../.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log(`[Worker] Connecting to Redis at ${REDIS_URL}`);

const worker = new Worker(
  "hearthlane-jobs",
  async (job: Job) => {
    console.log(`[Worker] Processing job ${job.name} (id: ${job.id})`);
    
    if (job.name === "lease-expiry-check") {
      // Backward-compatible queue consumer: Task Center is manual-only, so an
      // already-enqueued legacy lease-expiry job is acknowledged without reads,
      // task inserts, notifications, or other side effects.
      console.log("[Worker] Lease expiry task generation is disabled (manual-only Task Center).");
      return { checked: 0, generated: 0, disabled: true };
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.name} completed successfully.`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.name} failed:`, err);
});

console.log("[Worker] BullMQ Worker started successfully and listening for jobs on 'hearthlane-jobs' queue.");
