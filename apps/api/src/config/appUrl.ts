/**
 * APP_URL Configuration & Origin Validation Helper
 * Ensures server-side canonical application origin is valid and safe.
 */

export function validateAppUrl(urlStr?: string, nodeEnv?: string): string {
  const isProd = nodeEnv === "production";

  if (!urlStr || urlStr.trim() === "") {
    if (isProd) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: APP_URL environment variable is required in production."
      );
    }
    return "http://localhost:3000";
  }

  const trimmed = urlStr.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_err) {
    throw new Error(
      `FATAL SECURITY CONFIGURATION: APP_URL must be a valid absolute URL (received: "${urlStr}").`
    );
  }

  if (isProd) {
    if (parsed.protocol !== "https:") {
      throw new Error(
        `FATAL SECURITY CONFIGURATION: APP_URL must use HTTPS in production (received: "${urlStr}").`
      );
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
      throw new Error(
        `FATAL SECURITY CONFIGURATION: APP_URL cannot use localhost/127.0.0.1 in production (received: "${urlStr}").`
      );
    }
  }

  // Remove trailing slash for canonical origin consistency
  return parsed.origin;
}

/**
 * Get canonical server APP_URL.
 */
export function getAppUrl(): string {
  return validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
}

/**
 * Generate secure invitation URL with token fragment transport.
 * Fragment format: ${APP_URL}/invite#token=${rawToken}
 */
export function getInvitationUrl(rawToken: string): string {
  const baseUrl = getAppUrl();
  return `${baseUrl}/invite#token=${rawToken}`;
}
