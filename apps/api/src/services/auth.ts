import jwt from "jsonwebtoken";

const FALLBACK_JWT_SECRET = "local-development-secret-jwt-key-change-in-production";
const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;

if (JWT_SECRET === FALLBACK_JWT_SECRET && process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.error(
    "[SECURITY WARNING] JWT_SECRET is not set — signing tokens with the public fallback secret. " +
    "Anyone can forge valid session tokens. Set JWT_SECRET in this environment immediately."
  );
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): UserSessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as UserSessionPayload;
  } catch (error) {
    return null;
  }
}
