import defaultTheme from "../../config/theme.json";

export interface Theme {
	appName: string;
	logoUrl: string | null;
	features: {
		schemas: boolean;
		audit: boolean;
		configVersions: boolean;
		fieldLocks: boolean;
		configImportExport: boolean;
	};
}

let currentTheme: Theme = { ...defaultTheme } as Theme;

/** Override default theme with custom values. */
export function setTheme(overrides: Partial<Theme>): void {
	currentTheme = { ...defaultTheme, ...overrides } as Theme;
}

/** Get the current theme. */
export function theme(): Theme {
	return currentTheme;
}
