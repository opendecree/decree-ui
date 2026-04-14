import { createContext, useContext } from "react";
import { DEFAULT_ROLE, DEFAULT_SUBJECT, type Role, STORAGE_KEY_AUTH } from "./constants";

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

const defaultAuth: AuthState = {
	subject: DEFAULT_SUBJECT,
	role: DEFAULT_ROLE,
};

export const AuthContext = createContext<AuthContextValue>({
	auth: defaultAuth,
	setAuth: () => {},
});

export function useAuth(): AuthContextValue {
	return useContext(AuthContext);
}

/** Load auth from localStorage or return defaults. */
export function loadAuth(): AuthState {
	try {
		const stored = localStorage.getItem(STORAGE_KEY_AUTH);
		if (stored) {
			return JSON.parse(stored) as AuthState;
		}
	} catch {
		// ignore
	}
	return defaultAuth;
}

/** Persist auth to localStorage. */
export function saveAuth(auth: AuthState): void {
	localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
}
