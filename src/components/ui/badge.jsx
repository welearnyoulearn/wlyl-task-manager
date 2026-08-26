import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Dev-status and QA-status color coding, reusing the exact hex
        // values from styles.css's .qa-badge-* / status dot classes so
        // the color meaning stays identical to the pre-shadcn UI - not
        // shadcn's default palette.
        qaNotReady: "border-transparent bg-[#ECEAE3] text-muted-foreground",
        qaReady: "border-transparent bg-[#FCF1DE] text-[#9C6A16]",
        qaPassed: "border-transparent bg-accent text-accent-foreground",
        qaFailed: "border-transparent bg-[#fbeceb] text-destructive",
        severityBlocker: "border-transparent bg-destructive text-destructive-foreground",
        severityMajor: "border-transparent bg-[#C9622B] text-white",
        severityMinor: "border-transparent bg-secondary text-secondary-foreground",
        severityCosmetic: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
