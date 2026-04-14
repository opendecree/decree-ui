import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { STORAGE_KEY_DARK_MODE } from "./lib/constants";
import "./index.css";

// Initialize dark mode before first render — applies to all layouts including embed.
const storedDark = localStorage.getItem(STORAGE_KEY_DARK_MODE);
const prefersDark =
	storedDark !== null
		? storedDark === "true"
		: window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", prefersDark);

// biome-ignore lint/style/noNonNullAssertion: root element guaranteed by index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
