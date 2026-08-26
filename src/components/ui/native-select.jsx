import * as React from "react"
import { cn } from "@/lib/utils"

// A plain <select> styled to match shadcn's Input/Select visual language,
// deliberately NOT the Radix-based Select component - Playwright's
// .selectOption() only works on native <select> elements, and this app's
// existing test suite relies on it throughout (status dropdowns, role
// pickers, Assign QA, filters). See NOTES.md Phase 5 for why real Select
// wasn't used for any dropdown in this migration.
const NativeSelect = React.forwardRef(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </select>
))
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
