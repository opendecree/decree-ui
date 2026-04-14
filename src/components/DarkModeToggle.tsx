import { useEffect, useState } from "react";
import { STORAGE_KEY_DARK_MODE } from "../lib/constants";
import { ICON_MOON, ICON_SUN } from "../lib/icons";

/** Toggle between light and dark mode. Follows system preference by default. */
export function DarkModeToggle() {
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
			className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
			title={dark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{dark ? ICON_SUN : ICON_MOON}
		</button>
	);
}
