import { Client } from "pg";
import { databaseUrl } from "./index";

export interface TaskPreflightIssue {
  category: string;
  taskId: string;
  orgId: string;
  detail: string;
}

export const taskMigrationPreflightSql = `
WITH issues AS (
  SELECT 'unsupported_status'::text AS category, id AS task_id, org_id,
         status::text AS detail
  FROM tasks
  WHERE status NOT IN ('todo', 'in_progress', 'completed', 'cancelled')

  UNION ALL

  SELECT 'unsupported_priority', id, org_id, priority::text
  FROM tasks
  WHERE priority NOT IN ('low', 'medium', 'high', 'urgent')

  UNION ALL

  SELECT 'blank_title', id, org_id, coalesce(title, '<null>')
  FROM tasks
  WHERE title IS NULL OR length(btrim(title)) = 0

  UNION ALL

  SELECT 'missing_owner', t.id, t.org_id, t.owner_id::text
  FROM tasks t
  LEFT JOIN users u ON u.id = t.owner_id
  WHERE u.id IS NULL

  UNION ALL

  SELECT 'owner_missing_membership', t.id, t.org_id, t.owner_id::text
  FROM tasks t
  JOIN users u ON u.id = t.owner_id
  LEFT JOIN organization_memberships m
    ON m.org_id = t.org_id AND m.user_id = t.owner_id
  WHERE m.id IS NULL

  UNION ALL

  SELECT 'cross_org_property', t.id, t.org_id, t.property_id::text
  FROM tasks t JOIN properties p ON p.id = t.property_id
  WHERE p.org_id <> t.org_id

  UNION ALL

  SELECT 'cross_org_unit', t.id, t.org_id, t.unit_id::text
  FROM tasks t JOIN units u ON u.id = t.unit_id
  WHERE u.org_id <> t.org_id

  UNION ALL

  SELECT 'cross_org_tenant', t.id, t.org_id, t.tenant_id::text
  FROM tasks t JOIN tenants te ON te.id = t.tenant_id
  WHERE te.org_id <> t.org_id

  UNION ALL

  SELECT 'cross_org_lease', t.id, t.org_id, t.lease_id::text
  FROM tasks t JOIN leases l ON l.id = t.lease_id
  WHERE l.org_id <> t.org_id

  UNION ALL

  SELECT 'cross_org_maintenance_request', t.id, t.org_id,
         t.maintenance_request_id::text
  FROM tasks t JOIN maintenance_requests mr ON mr.id = t.maintenance_request_id
  WHERE mr.org_id <> t.org_id

  UNION ALL

  SELECT 'cross_org_work_order', t.id, t.org_id, t.work_order_id::text
  FROM tasks t JOIN work_orders wo ON wo.id = t.work_order_id
  WHERE wo.org_id <> t.org_id
)
SELECT category, task_id AS "taskId", org_id AS "orgId", detail
FROM issues
ORDER BY category, task_id;
`;

export async function inspectLegacyTaskRows(client: Pick<Client, "query">): Promise<TaskPreflightIssue[]> {
  const result = await client.query<TaskPreflightIssue>(taskMigrationPreflightSql);
  return result.rows;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const issues = await inspectLegacyTaskRows(client);
    if (issues.length === 0) {
      console.log("Task migration preflight passed: no invalid legacy task rows.");
      return;
    }

    console.error(`Task migration preflight failed: ${issues.length} invalid legacy row(s).`);
    console.table(issues);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main();
}
