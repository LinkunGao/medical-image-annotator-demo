import http from "./client";

export function checkHealth() {
  return http.get<{ status: string }>("/health");
}
