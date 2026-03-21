/** Response shape for the /health endpoint. */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}
