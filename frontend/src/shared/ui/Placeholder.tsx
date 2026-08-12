export function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-base px-6 text-center text-sm text-faint">
      {label}
    </div>
  )
}
