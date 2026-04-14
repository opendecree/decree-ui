/** Shared constants — avoids magic strings scattered across components. */

// Auth roles
export const ROLES = ["superadmin", "admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_SUBJECT = "admin";
export const DEFAULT_ROLE: Role = "superadmin";

// LocalStorage keys
export const STORAGE_KEY_AUTH = "decree-auth";
export const STORAGE_KEY_DARK_MODE = "decree-dark-mode";
