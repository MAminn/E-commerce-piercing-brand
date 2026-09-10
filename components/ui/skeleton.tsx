import { cn } from "#root/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-stone-200/70",
        "after:absolute after:inset-0 after:animate-[shimmer_1.4s_ease-in-out_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/35 after:to-transparent",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
