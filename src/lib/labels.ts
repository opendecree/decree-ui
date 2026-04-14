import defaultLabels from "../../config/labels.json";

type Labels = Record<string, string>;

let mergedLabels: Labels = { ...defaultLabels };

/**
 * Override default labels with custom values.
 * Call this at app startup before rendering, e.g., from a custom labels.json.
 */
export function setLabels(overrides: Partial<Labels>): void {
	mergedLabels = { ...defaultLabels, ...overrides };
}

/**
 * Get a label by key. Returns the key itself if not found (makes missing labels obvious).
 *
 * @example
 * ```ts
 * label("tenant.plural") // "Tenants" (or "Services" if overridden)
 * label("nav.home")      // "Home"
 * ```
 */
export function label(key: string): string {
	return mergedLabels[key] ?? key;
}
