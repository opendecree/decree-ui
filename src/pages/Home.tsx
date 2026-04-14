import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "../api/client";
import { useAuth } from "../lib/auth";
import { label } from "../lib/labels";

/** Dashboard home page with server version and quick links. */
export function Home() {
	const { auth } = useAuth();
	const client = createApiClient(auth);

	const { data: version } = useQuery({
		queryKey: ["server-version"],
		queryFn: async () => {
			const { data } = await client.GET("/v1/version");
			return data;
		},
	});

	return (
		<div className="mx-auto max-w-2xl">
			<h2 className="mb-6 text-2xl font-semibold">{label("app.title")}</h2>

			{version && (
				<p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Server v{version.version} ({version.commit})
				</p>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<QuickLink
					to="/schemas"
					title={label("schema.plural")}
					description="Manage config schemas, fields, and versions"
				/>
				<QuickLink
					to="/tenants"
					title={label("tenant.plural")}
					description="Manage tenants and their config values"
				/>
			</div>
		</div>
	);
}

function QuickLink({ to, title, description }: { to: string; title: string; description: string }) {
	return (
		<a
			href={to}
			className="rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
		>
			<h3 className="mb-1 font-medium">{title}</h3>
			<p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
		</a>
	);
}
