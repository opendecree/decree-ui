const API_URL = process.env.API_URL ?? "http://localhost:8080";
const UI_URL = process.env.BASE_URL ?? "http://localhost:3000";
const AUTH_HEADERS = { "x-subject": "admin", "x-role": "superadmin" };
const MAX_WAIT_MS = 60_000;
const POLL_MS = 1_000;

async function waitFor(name: string, url: string, headers?: Record<string, string>) {
	const start = Date.now();
	while (Date.now() - start < MAX_WAIT_MS) {
		try {
			const res = await fetch(url, { headers });
			if (res.ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	throw new Error(`${name} not ready after ${MAX_WAIT_MS}ms at ${url}`);
}

export default async function globalSetup() {
	await waitFor("decree server", `${API_URL}/v1/schemas`, AUTH_HEADERS);
	await waitFor("decree-ui", UI_URL);
}
