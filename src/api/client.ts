import createClient from "openapi-fetch";
import type { AuthState } from "../lib/auth";
import { config } from "../lib/config";
import type { paths } from "./schema";

/** Create a typed API client with auth headers injected. */
export function createApiClient(auth: AuthState) {
	const client = createClient<paths>({
		baseUrl: config.apiUrl,
	});

	// Inject auth headers on every request.
	client.use({
		onRequest({ request }) {
			request.headers.set("x-subject", auth.subject);
			request.headers.set("x-role", auth.role);
			if (auth.tenantId) {
				request.headers.set("x-tenant-id", auth.tenantId);
			}
			return request;
		},
	});

	return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
