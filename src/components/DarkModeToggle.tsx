import { useEffect, useState } from "react";
import { STORAGE_KEY_DARK_MODE } from "../lib/constants";
import { ICON_MOON, ICON_SUN } from "../lib/icons";

/** Toggle between light and dark mode. Follows system preference by default. */
export function DarkModeToggle({ className }: { className?: string }) {
	const [dark, setDark] = useState(() => {
		if (typeof window === "undefined") return false;
		const stored = localStorage.getItem(STORAGE_KEY_DARK_MODE);
		if (stored !== null) return stored === "true";
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
		localStorage.setItem(STORAGE_KEY_DARK_MODE, String(dark));
	}, [dark]);

	return (
		<button
			type="button"
			onClick={() => setDark((d) => !d)}
			className={`grid h-8 w-8 place-items-center rounded-sm border border-line bg-surface-2 text-fg-2 hover:border-line-2 hover:bg-surface-3 hover:text-fg${className ? ` ${className}` : ""}`}
			title={dark ? "Switch to light mode" : "Switch to dark mode"}
			aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{dark ? ICON_SUN : ICON_MOON}
		</button>
	);
}
