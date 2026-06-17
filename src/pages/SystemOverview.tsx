import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { components } from "../api/schema";
import { SkeletonTable } from "../components/Skeleton";
import { useAuditLog, useSchemas, useTenants, useUnusedFields } from "../lib/hooks";
import { label } from "../lib/labels";

type Tenant = components["schemas"]["v1Tenant"];
type Schema = components["schemas"]["v1Schema"];

/**
 * How far back the unused-field scan reaches. The gateway requires an explicit
 * `since` (there is no all-time default — it would force an expensive full scan),
 * so the overview asks for a fixed 30-day window.
 */
const UNUSED_SINCE_DAYS = 30;

/** Per-tenant signal lifted up from each row so the strip + panels can aggregate. */
interface TenantSignal {
	/** Count of fields with no reads in the scan window. */
	unused: number;
	/** Audit entries the gateway returned for this tenant (chain length proxy). */
	auditEntries: number;
	/** Whether the per-tenant audit/usage queries have settled. */
	loaded: boolean;
}

/** First two alphanumeric chars of a name, uppercased — matches the rail avatar. */
function initials(name: string | undefined): string {
	if (!name) return "?";
	const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
	return cleaned.slice(0, 2).toUpperCase() || "?";
}

function isoSinceDays(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString();
}

/**
 * Superadmin system overview (hi-fi Screen 3). A cross-tenant dashboard: a stat
 * strip, the tenant + schema lifecycle tables, and the two differentiators —
 * tamper-evident audit and usage governance — given a home.
 *
 * Trust badge honesty: the decree server maintains a SHA-256-linked, per-tenant
 * audit chain, but the REST gateway does not (yet) expose a chain-verification
 * RPC. So the badge reports the chain as *active* (present, append-only, with a
 * live entry count) rather than claiming an independent re-verification the
 * gateway can't back. Exposing `VerifyChain` through the gateway is a server
 * follow-up; until then this degrades gracefully to the best available signal.
 */
export function SystemOverview() {
	const { data: tenantsData, isLoading: tenantsLoading, error: tenantsError } = useTenants();
	const { data: schemasData, isLoading: schemasLoading } = useSchemas();

	const tenants = useMemo<Tenant[]>(() => tenantsData?.tenants ?? [], [tenantsData]);
	const schemas = useMemo<Schema[]>(() => schemasData?.schemas ?? [], [schemasData]);

	const schemaNames = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of schemas) {
			if (s.id && s.name) m.set(s.id, s.name);
		}
		return m;
	}, [schemas]);

	// Per-tenant signals reported up from each TenantRow. Keyed by tenant id.
	const [signals, setSignals] = useState<Record<string, TenantSignal>>({});
	const reportSignal = useCallback((id: string, signal: TenantSignal) => {
		setSignals((prev) => {
			const existing = prev[id];
			if (
				existing &&
				existing.unused === signal.unused &&
				existing.auditEntries === signal.auditEntries &&
				existing.loaded === signal.loaded
			) {
				return prev;
			}
			return { ...prev, [id]: signal };
		});
	}, []);

	const publishedSchemas = schemas.filter((s) => s.published);
	const draftSchemas = schemas.filter((s) => !s.published);

	// How many tenants are bound to each schema id — drives the schema table.
	const tenantsPerSchema = useMemo(() => {
		const m = new Map<string, number>();
		for (const t of tenants) {
			if (t.schemaId) m.set(t.schemaId, (m.get(t.schemaId) ?? 0) + 1);
		}
		return m;
	}, [tenants]);

	const totalUnused = tenants.reduce((sum, t) => sum + (signals[t.id ?? ""]?.unused ?? 0), 0);
	const totalAuditEntries = tenants.reduce(
		(sum, t) => sum + (signals[t.id ?? ""]?.auditEntries ?? 0),
		0,
	);
	const governanceSettled =
		tenants.length === 0 || tenants.every((t) => signals[t.id ?? ""]?.loaded);

	const initialLoading = tenantsLoading || schemasLoading;
	const isEmpty = !initialLoading && tenants.length === 0 && schemas.length === 0;

	return (
		<div className="overflow-y-auto" data-testid="system-overview-page">
			{initialLoading && <SkeletonTable rows={6} />}

			{tenantsError && (
				<p className="text-danger">Error loading overview: {tenantsError.message}</p>
			)}

			{isEmpty && <p className="text-fg-3">{label("overview.empty")}</p>}

			{!initialLoading && !isEmpty && (
				<>
					{/* hidden per-tenant data collectors — stable hook order, one per tenant */}
					{tenants.map((t) => (
						<TenantSignalCollector key={t.id} tenantId={t.id ?? ""} onSignal={reportSignal} />
					))}

					<StatStrip
						tenantCount={tenants.length}
						publishedCount={publishedSchemas.length}
						draftCount={draftSchemas.length}
						auditEntries={totalAuditEntries}
						unusedTotal={totalUnused}
						governanceSettled={governanceSettled}
					/>

					<TenantsSection tenants={tenants} schemaNames={schemaNames} signals={signals} />

					<SchemasSection schemas={schemas} tenantsPerSchema={tenantsPerSchema} />

					<TrustGovernanceSection
						tenantCount={tenants.length}
						auditEntries={totalAuditEntries}
						chainSettled={governanceSettled}
						tenants={tenants}
						signals={signals}
					/>
				</>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Per-tenant data collector                                           */
/* ------------------------------------------------------------------ */

/**
 * Renders nothing — it exists only to run the per-tenant audit + unused-field
 * queries with a stable hook order (one instance per tenant, keyed by id) and
 * report the results up. This is the "separate component over a hook loop"
 * pattern the app uses to keep hook order invariant.
 */
function TenantSignalCollector({
	tenantId,
	onSignal,
}: {
	tenantId: string;
	onSignal: (id: string, signal: TenantSignal) => void;
}) {
	const since = useMemo(() => isoSinceDays(UNUSED_SINCE_DAYS), []);
	const { data: auditData, isSuccess: auditDone, isError: auditErr } = useAuditLog(tenantId);
	const {
		data: unusedData,
		isSuccess: unusedDone,
		isError: unusedErr,
	} = useUnusedFields(tenantId, since);

	const auditEntries = auditData?.entries?.length ?? 0;
	const unused = unusedData?.fieldPaths?.length ?? 0;
	const loaded = (auditDone || auditErr) && (unusedDone || unusedErr);

	// Report after commit (never during render). onSignal de-dupes by value, so a
	// repeated identical report is a no-op and won't loop.
	useEffect(() => {
		onSignal(tenantId, { unused, auditEntries, loaded });
	}, [onSignal, tenantId, unused, auditEntries, loaded]);
	return null;
}

/* ------------------------------------------------------------------ */
/* Section: stat strip                                                 */
/* ------------------------------------------------------------------ */

function StatStrip({
	tenantCount,
	publishedCount,
	draftCount,
	auditEntries,
	unusedTotal,
	governanceSettled,
}: {
	tenantCount: number;
	publishedCount: number;
	draftCount: number;
	auditEntries: number;
	unusedTotal: number;
	governanceSettled: boolean;
}) {
	return (
		<section className="mt-1">
			<SectionHeader title={label("overview.title")} sub={label("overview.subtitle")} />
			<div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
				<StatCard
					k={label("overview.statTenants")}
					icon={ICON_TENANT}
					value={String(tenantCount)}
					sub={`on ${publishedCount} published ${publishedCount === 1 ? "schema" : "schemas"}`}
				/>
				<StatCard
					k={label("overview.statSchemas")}
					icon={ICON_SCHEMA}
					value={String(publishedCount)}
					valueSuffix={draftCount > 0 ? `+${draftCount} draft` : undefined}
					sub={`${publishedCount + draftCount} total`}
				/>
				<StatCard
					k={label("overview.statChain")}
					icon={ICON_SHIELD}
					tone="ok"
					value={governanceSettled ? "active" : "…"}
					sub={`${auditEntries} ${auditEntries === 1 ? "entry" : "entries"} · tamper-evident`}
				/>
				<StatCard
					k={label("overview.statGovernance")}
					icon={ICON_BARS}
					tone={unusedTotal > 0 ? "warn" : undefined}
					value={governanceSettled ? String(unusedTotal) : "…"}
					accent
					sub="unused fields across tenants"
				/>
			</div>
		</section>
	);
}

function StatCard({
	k,
	icon,
	value,
	valueSuffix,
	sub,
	tone,
	accent,
}: {
	k: string;
	icon: React.ReactNode;
	value: string;
	valueSuffix?: string;
	sub: string;
	tone?: "ok" | "warn";
	accent?: boolean;
}) {
	const toneBorder =
		tone === "ok" ? "border-ok/35" : tone === "warn" ? "border-warn/35" : "border-line";
	const valueColor = tone === "ok" ? "text-ok" : "text-fg";
	const accentColor = tone === "warn" ? "text-warn" : "text-accent";
	return (
		<div className={`flex flex-col gap-1 rounded-lg border ${toneBorder} bg-surface px-4 py-3.5`}>
			<span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide text-fg-3">
				<span className="h-3.5 w-3.5">{icon}</span>
				{k}
			</span>
			<span className={`text-[27px] font-semibold leading-tight tracking-tight ${valueColor}`}>
				<span className={accent ? accentColor : undefined}>{value}</span>
				{valueSuffix && (
					<small className="ml-1.5 text-sm font-medium text-fg-3">{valueSuffix}</small>
				)}
			</span>
			<span className="text-[11.5px] text-fg-2">{sub}</span>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Section: tenants table                                              */
/* ------------------------------------------------------------------ */

function TenantsSection({
	tenants,
	schemaNames,
	signals,
}: {
	tenants: Tenant[];
	schemaNames: Map<string, string>;
	signals: Record<string, TenantSignal>;
}) {
	return (
		<section className="mt-6">
			<SectionHeader
				title={label("overview.tenants")}
				sub={String(tenants.length)}
				more={{ to: "/tenants", labelKey: "overview.manageAll" }}
			/>
			<div className="overflow-hidden rounded-lg border border-line bg-surface">
				<table className="w-full border-collapse text-[13px]">
					<thead>
						<tr>
							<Th>{label("overview.colTenant")}</Th>
							<Th>{label("overview.colSchema")}</Th>
							<Th>{label("overview.colConfig")}</Th>
							<Th>{label("overview.colLastChange")}</Th>
							<Th>{label("overview.colChain")}</Th>
							<Th>{label("overview.colGovernance")}</Th>
						</tr>
					</thead>
					<tbody>
						{tenants.map((t) => {
							const sig = signals[t.id ?? ""];
							return (
								<tr key={t.id} className="border-t border-line hover:bg-surface-2">
									<Td>
										<Link
											to={`/tenants/${t.id}`}
											className="flex items-center gap-2.5 font-semibold text-fg hover:text-accent"
										>
											<Avatar text={initials(t.name)} />
											{t.name}
										</Link>
									</Td>
									<Td>
										<span className="font-mono text-fg-2">
											{t.schemaId ? (schemaNames.get(t.schemaId) ?? t.schemaId) : "—"}
										</span>{" "}
										{t.schemaVersion !== undefined && (
											<span className="font-mono text-fg-3">v{t.schemaVersion}</span>
										)}
									</Td>
									<Td>
										<span className="font-mono text-fg-3">—</span>
									</Td>
									<Td>
										<span className="text-fg-3">
											{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
										</span>
									</Td>
									<Td>
										<ChainChip entries={sig?.auditEntries ?? 0} loaded={sig?.loaded ?? false} />
									</Td>
									<Td>
										<GovernanceChip unused={sig?.unused ?? 0} loaded={sig?.loaded ?? false} />
									</Td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

/** Per-tenant chain status. Honest: "active" (chain present) — not "verified". */
function ChainChip({ entries, loaded }: { entries: number; loaded: boolean }) {
	if (!loaded) return <span className="font-mono text-[10px] text-fg-3">…</span>;
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 font-mono text-[10px] text-ok"
			title={`Append-only SHA-256 audit chain is active for this tenant (${entries} ${
				entries === 1 ? "entry" : "entries"
			}). Independent re-verification is not yet exposed by the REST gateway.`}
		>
			<span className="h-2.5 w-2.5">{ICON_CHECK}</span>
			active
		</span>
	);
}

/** Per-tenant governance flag — unused-field count, or "clean". */
function GovernanceChip({ unused, loaded }: { unused: number; loaded: boolean }) {
	if (!loaded) return <span className="font-mono text-[10px] text-fg-3">…</span>;
	if (unused === 0) {
		return (
			<span className="inline-flex items-center rounded-full border border-line-2 bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-fg-2">
				clean
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 font-mono text-[10px] text-warn">
			{unused} unused
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* Section: schemas table                                              */
/* ------------------------------------------------------------------ */

function SchemasSection({
	schemas,
	tenantsPerSchema,
}: {
	schemas: Schema[];
	tenantsPerSchema: Map<string, number>;
}) {
	return (
		<section className="mt-6">
			<SectionHeader
				title={label("overview.schemas")}
				sub="authoring · lifecycle"
				more={{ to: "/schemas", labelKey: "overview.schemaWorkbench" }}
			/>
			<div className="overflow-hidden rounded-lg border border-line bg-surface">
				<table className="w-full border-collapse text-[13px]">
					<thead>
						<tr>
							<Th>{label("overview.colSchema")}</Th>
							<Th>{label("overview.colVersion")}</Th>
							<Th>{label("overview.colStatus")}</Th>
							<Th>{label("overview.colFields")}</Th>
							<Th>{label("overview.colTenants")}</Th>
							<Th>{label("overview.colLastChange")}</Th>
						</tr>
					</thead>
					<tbody>
						{schemas.map((s) => {
							const bound = s.id ? (tenantsPerSchema.get(s.id) ?? 0) : 0;
							return (
								<tr key={s.id} className="border-t border-line hover:bg-surface-2">
									<Td>
										<Link
											to={`/schemas/${s.id}`}
											className="flex items-center gap-2.5 font-semibold text-fg hover:text-accent"
										>
											<Avatar text={initials(s.name)} />
											{s.name}
										</Link>
									</Td>
									<Td>
										<span className="font-mono text-fg-2">v{s.version}</span>
									</Td>
									<Td>
										<StatusChip published={s.published} />
									</Td>
									<Td>
										<span className="font-mono text-fg-2">{s.fields?.length ?? 0}</span>
									</Td>
									<Td>
										{s.published ? (
											<span className="font-mono text-fg-2">{bound}</span>
										) : (
											<span className="font-mono text-fg-3">—</span>
										)}
									</Td>
									<Td>
										<span className="font-mono text-fg-3">
											{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
										</span>
									</Td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function StatusChip({ published }: { published?: boolean }) {
	if (published) {
		return (
			<span className="inline-flex items-center rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">
				published
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full border border-dashed border-line-2 bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-fg-2">
			draft
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* Section: trust & governance                                         */
/* ------------------------------------------------------------------ */

function TrustGovernanceSection({
	tenantCount,
	auditEntries,
	chainSettled,
	tenants,
	signals,
}: {
	tenantCount: number;
	auditEntries: number;
	chainSettled: boolean;
	tenants: Tenant[];
	signals: Record<string, TenantSignal>;
}) {
	// Tenants with at least one unused field — the deprecation candidates.
	const flagged = tenants
		.map((t) => ({ tenant: t, unused: signals[t.id ?? ""]?.unused ?? 0 }))
		.filter((x) => x.unused > 0)
		.sort((a, b) => b.unused - a.unused);

	return (
		<section className="mt-6">
			<SectionHeader title={label("overview.trustGovernance")} sub="the differentiators" />
			<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
				{/* chain health */}
				<div className="overflow-hidden rounded-lg border border-line bg-surface">
					<PanelHeader title={label("overview.chainHealth")} icon={ICON_SHIELD} />
					<div className="px-4 pt-4 pb-1.5">
						<ChainBlocks tenantCount={tenantCount} settled={chainSettled} />
						<div className="flex items-baseline gap-2">
							<span className="text-[22px] font-semibold text-ok">
								{chainSettled ? auditEntries : "…"}
							</span>
							<span className="text-xs text-fg-2">
								audit {auditEntries === 1 ? "entry" : "entries"} across{" "}
								<b className="text-fg-2">
									{tenantCount} {tenantCount === 1 ? "chain" : "chains"}
								</b>
							</span>
						</div>
					</div>
					<div className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 font-mono text-[11px] text-fg-3">
						<span>tamper-evident · SHA-256 linked · epoch 1</span>
					</div>
					{/* Honest limitation: the gateway can't independently re-verify yet. */}
					<div className="border-t border-line bg-surface-2 px-4 py-2.5 text-[11.5px] text-fg-2">
						The server maintains an append-only, SHA-256-linked audit chain per tenant. Independent
						chain re-verification is not yet exposed by the REST gateway, so this panel reflects
						chain <b className="text-fg">activity</b>, not a re-walk.
					</div>
				</div>

				{/* unused fields */}
				<div className="overflow-hidden rounded-lg border border-line bg-surface">
					<PanelHeader
						title={label("overview.unusedFields")}
						icon={ICON_BARS}
						trailing={
							<span className="font-mono text-[11px] text-fg-3">
								since {UNUSED_SINCE_DAYS}d ago
							</span>
						}
					/>
					{!chainSettled && <p className="px-4 py-3 text-[12px] text-fg-3">Scanning usage…</p>}
					{chainSettled && flagged.length === 0 && (
						<p className="px-4 py-3 text-[12px] text-fg-3">
							No unused fields detected in the last {UNUSED_SINCE_DAYS} days.
						</p>
					)}
					{chainSettled &&
						flagged.map(({ tenant, unused }) => (
							<div
								key={tenant.id}
								className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 first:border-t-0"
							>
								<Avatar text={initials(tenant.name)} />
								<Link
									to={`/tenants/${tenant.id}/usage`}
									className="font-mono text-[12.5px] text-fg hover:text-accent"
								>
									{tenant.name}
								</Link>
								<span className="ml-auto rounded-xs border border-warn/30 bg-warn-soft px-2 py-0.5 font-mono text-[9.5px] text-warn">
									{unused} unused
								</span>
							</div>
						))}
					<div className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 font-mono text-[11px] text-fg-3">
						<span>candidates for deprecation or removal</span>
					</div>
				</div>
			</div>
		</section>
	);
}

/**
 * The chain block strip — one block per tenant chain (capped). Purely a visual
 * affordance for "every chain is intact"; it carries no claim the gateway can't
 * back. Dim while signals are still settling.
 */
function ChainBlocks({ tenantCount, settled }: { tenantCount: number; settled: boolean }) {
	const count = Math.min(Math.max(tenantCount, 1), 40);
	// Stable, unique keys for the decorative blocks (no array-index keys).
	const blocks = Array.from({ length: count }, (_, i) => `chain-block-${i}`);
	return (
		<div className="mb-3 flex flex-wrap gap-[3px]" aria-hidden="true">
			{blocks.map((id) => (
				<i
					key={id}
					className={`h-[22px] w-[14px] rounded-[2px] bg-ok ${settled ? "opacity-85" : "opacity-40"}`}
				/>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

function SectionHeader({
	title,
	sub,
	more,
}: {
	title: string;
	sub?: string;
	more?: { to: string; labelKey: string };
}) {
	return (
		<div className="mb-3.5 flex items-center gap-2.5">
			<h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
			{sub && <span className="font-mono text-[11px] text-fg-3">{sub}</span>}
			<span className="h-px flex-1 bg-line" />
			{more && (
				<Link to={more.to} className="text-[12px] text-accent hover:underline">
					{label(more.labelKey)}
				</Link>
			)}
		</div>
	);
}

function PanelHeader({
	title,
	icon,
	trailing,
}: {
	title: string;
	icon: React.ReactNode;
	trailing?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
			<span className="h-4 w-4 text-fg-2">{icon}</span>
			<h3 className="text-[13px] font-semibold">{title}</h3>
			{trailing && <span className="ml-auto">{trailing}</span>}
		</div>
	);
}

function Th({ children }: { children: React.ReactNode }) {
	return (
		<th className="border-b border-line bg-surface-2 px-3.5 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-wide text-fg-3 whitespace-nowrap">
			{children}
		</th>
	);
}

function Td({ children }: { children: React.ReactNode }) {
	return <td className="px-3.5 py-2.5 align-middle">{children}</td>;
}

function Avatar({ text }: { text: string }) {
	return (
		<span className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line-2 bg-surface-3 font-mono text-[9.5px] text-fg-2">
			{text}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* Icons (inline, no runtime deps)                                     */
/* ------------------------------------------------------------------ */

const svgProps = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	"aria-hidden": true,
	className: "h-full w-full",
} as const;

const ICON_TENANT = (
	<svg {...svgProps}>
		<title>Tenants</title>
		<path d="M3 21h18M5 21V8l7-5 7 5v13" />
	</svg>
);
const ICON_SCHEMA = (
	<svg {...svgProps}>
		<title>Schemas</title>
		<rect x="4" y="4" width="7" height="7" rx="1" />
		<rect x="13" y="4" width="7" height="7" rx="1" />
		<rect x="4" y="13" width="7" height="7" rx="1" />
	</svg>
);
const ICON_SHIELD = (
	<svg {...svgProps}>
		<title>Audit chain</title>
		<path d="M12 3l8 4v5c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" />
		<path d="M9 12l2 2 4-4" />
	</svg>
);
const ICON_BARS = (
	<svg {...svgProps}>
		<title>Usage</title>
		<path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" />
	</svg>
);
const ICON_CHECK = (
	<svg {...svgProps} strokeWidth={2.4}>
		<title>Active</title>
		<path d="M5 12l5 5L20 7" />
	</svg>
);
