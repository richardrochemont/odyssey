import jwt from "jsonwebtoken";

const FALLBACK_JWT_SECRET = "local-development-secret-jwt-key-change-in-production";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;
  if (secret === FALLBACK_JWT_SECRET && process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error(
      "[SECURITY WARNING] JWT_SECRET is not set in production — fallback secret in use. Set JWT_SECRET in this environment."
    );
  }
  return secret;
}

export interface UserSessionPayload {
  id: string;
  activeOrgId: string;
  orgId: string; // compatibility fallback
  role: "owner" | "manager" | "accountant" | "maintenance" | "read_only";
  email: string;
  name: string;
  tokenVersion: number;
}

export function generateToken(payload: UserSessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): UserSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return decoded as UserSessionPayload;
  } catch (error) {
    return null;
  }
}
