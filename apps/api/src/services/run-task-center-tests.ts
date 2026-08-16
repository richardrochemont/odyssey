import assert from "node:assert/strict";
import { pool } from "@odyssey/db";
import { CalendarDateSchema, isCalendarDate } from "@odyssey/validation";
import { hasTaskMutationAccess, serializeCalendarDate } from "./tasks";
import { writeTaskAudit } from "./taskAudit";
import { checkAndGenerateRenewalTask } from "./leases";

async function main() {
  for (const value of ["2026-01-01", "2024-02-29", "9999-12-31"]) {
    assert.equal(CalendarDateSchema.parse(value), value);
  }
  for (const value of ["2026-1-01", "2026-01-1", "2026-02-29", "2026-13-01", "2026-00-10", "2026-01-01T00:00:00Z", "2026-01-01+05:00"]) {
    assert.equal(isCalendarDate(value), false, `should reject ${value}`);
  }
  for (const timezone of ["Etc/GMT+12", "UTC", "Pacific/Kiritimati"]) {
    const original = process.env.TZ;
    process.env.TZ = timezone;
    assert.equal(serializeCalendarDate("2026-01-01 23:59:59"), "2026-01-01");
    process.env.TZ = original;
  }
  console.log("PASS calendar-date validation and UTC-12/UTC/UTC+14 serialization (10 assertions)");

  const task = { createdByUserId: "creator", assigneeUserId: "assignee" };
  const cases = [
    ["owner", "other", true], ["manager", "other", true],
    ["accountant", "creator", true], ["accountant", "assignee", true], ["accountant", "other", false],
    ["maintenance", "creator", true], ["maintenance", "assignee", true], ["maintenance", "other", false],
    ["read_only", "creator", false],
  ] as const;
  for (const [role, id, expected] of cases) assert.equal(hasTaskMutationAccess(task, { id, orgId: "org", role }), expected);
  console.log(`PASS role mutation matrix (${cases.length} cases)`);

  await checkAndGenerateRenewalTask("org", "user", "lease");
  console.log("PASS lease renewal compatibility helper performed no writes");

  const failure = new Error("forced audit failure");
  const tx = { insert: () => ({ values: async () => { throw failure; } }) };
  await assert.rejects(() => writeTaskAudit(tx, {
    orgId: "00000000-0000-0000-0000-000000000001", actorUserId: "00000000-0000-0000-0000-000000000002",
    taskId: "00000000-0000-0000-0000-000000000003", action: "update", previousState: {}, newState: {},
  }), /forced audit failure/);
  console.log("PASS task audit failure propagated to transaction caller");
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
