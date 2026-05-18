/** Animated shimmer primitives for skeleton loading states. */

/** A single line placeholder. Width defaults to full. */
export function SkeletonLine({ className = "w-full" }: { className?: string }) {
	return <div className={`h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

/** A rectangular block placeholder (e.g. for cards or images). */
export function SkeletonBlock({ className = "" }: { className?: string }) {
	return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

/** N rows of skeleton lines that approximate a table or list. */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
	return (
		<div className="space-y-3">
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
				<div key={i} className="flex gap-4">
					<SkeletonLine className="w-1/4" />
					<SkeletonLine className="w-1/3" />
					<SkeletonLine className="w-1/5" />
					<SkeletonLine className="w-1/6" />
				</div>
			))}
		</div>
	);
}

/** Skeleton approximating a detail/form card (heading + several field rows). */
export function SkeletonDetail() {
	return (
		<div className="space-y-6">
			<SkeletonLine className="w-1/3" />
			<div className="space-y-4">
				<SkeletonLine className="w-full" />
				<SkeletonLine className="w-5/6" />
				<SkeletonLine className="w-4/6" />
				<SkeletonLine className="w-full" />
				<SkeletonLine className="w-3/6" />
			</div>
		</div>
	);
}
