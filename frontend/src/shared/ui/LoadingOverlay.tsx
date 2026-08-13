/**
 * What a view shows while it is waiting for its first data. Absolute, so the
 * panel behind it keeps its layout — the parent has to be `relative`.
 *
 * The bar is indeterminate on purpose: an informer's initial list reports no
 * progress, so a percentage would be invented.
 */
export function LoadingOverlay({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-base/70 backdrop-blur-[1px]">
      <div className="w-64 space-y-2 rounded-panel border border-line bg-surface px-5 py-4 shadow-xl">
        <div className="text-sm font-medium">{label}</div>

        <div className="h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full w-1/4 rounded-full bg-accent animate-sweep" />
        </div>

        <div className="h-4 text-xs text-faint">{detail}</div>
      </div>
    </div>
  )
}
