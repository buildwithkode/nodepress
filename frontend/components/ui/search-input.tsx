import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

function SearchInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        className={cn(
          "h-9 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring",
          className
        )}
        {...props}
      />
    </div>
  )
}

export { SearchInput }
