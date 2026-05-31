import { createContext, useContext } from "react";
import { config } from "./config";
import { DEFAULT_ROLE, DEFAULT_SUBJECT, ROLES, type Role, STORAGE_KEY_AUTH } from "./constants";

/** Auth state for dev-mode metadata headers. */
export interface AuthState {
	subject: string;
	role: Role;
	tenantId?: string;
}

export interface AuthContextValue {
	auth: AuthState;
	setAuth: (auth: AuthState) => void;
}

/** Build auth defaults from runtime config (Docker env) or hardcoded fallbacks. */
function resolveDefaults(): AuthState {
	const configOnlyDefault: Role = "admin";
	const fallback = config.layoutMode === "config-only" ? configOnlyDefault : DEFAULT_ROLE;
	const role = (ROLES as readonly string[]).includes(config.defaultRole)
		? (config.defaultRole as Role)
		: fallback;
	return {
		subject: config.defaultSubject || DEFAULT_SUBJECT,
		role,
		tenantId: config.tenantId || undefined,
	};
}

export const AuthContext = createContext<AuthContextValue>({
	auth: resolveDefaults(),
	setAuth: () => {},
});

export function useAuth(): AuthContextValue {
	return useContext(AuthContext);
}

/** Load auth from localStorage, merging with config-based defaults.
 *  Config values (tenantId, role) take precedence when set — they represent
 *  the deployment intent and shouldn't be overridden by stale localStorage. */
export function loadAuth(): AuthState {
	const defaults = resolveDefaults();
	try {
		const stored = localStorage.getItem(STORAGE_KEY_AUTH);
		if (stored) {
			const parsed = JSON.parse(stored) as AuthState;
			let role: Role = config.defaultRole ? defaults.role : parsed.role || defaults.role;
			if (config.layoutMode === "config-only" && role === "superadmin") {
				role = "admin";
			}
			return {
				subject: parsed.subject || defaults.subject,
				role,
				tenantId: config.tenantId || parsed.tenantId || defaults.tenantId,
			};
		}
	} catch {
		// ignore
	}
	return defaults;
}

/** Persist auth to localStorage. */
export function saveAuth(auth: AuthState): void {
	localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
}
