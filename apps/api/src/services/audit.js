"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
const db_1 = require("@hearthlane/db");
async function logAction(params) {
    try {
        await db_1.db.insert(db_1.auditLogs).values({
            orgId: params.orgId,
            userId: params.userId,
            entityType: params.entityType,
            entityId: params.entityId,
            action: params.action,
            previousState: params.previousState || null,
            newState: params.newState || null,
        });
    }
    catch (error) {
        console.error("Failed to write audit log:", error);
        // Audit logs shouldn't break the main business flow if they fail,
        // but in production we want this to be extremely reliable.
    }
}
