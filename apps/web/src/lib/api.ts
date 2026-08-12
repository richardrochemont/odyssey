/**
 * Centralized API Fetch Utility for Odyssey Web Application
 * Handles authentication headers, token expiration, and 401 unauthorized automatic cleanup.
 */

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const token = typeof window !== "undefined" ? localStorage.getItem("hearthlane_token") : null;

  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("hearthlane_token");
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    return response;
  } catch (error) {
    throw error;
  }
}
