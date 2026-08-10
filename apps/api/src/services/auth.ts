import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "local-development-secret-jwt-key-change-in-production";

export interface UserSessionPayload {
  id: string;
  orgId: string;
  role: "owner" | "manager" | "maintenance" | "read_only";
  email: string;
  name: string;
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
