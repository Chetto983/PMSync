import * as React from "react"

import { cn } from "@/lib/utils"

// MUI sx prop to Tailwind conversion helper
function sxToClassName(sx?: Record<string, unknown>): string {
  if (!sx) return "";
  const classes: string[] = [];

  const spacingMap: Record<number, string> = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 8: "8", 10: "10", 12: "12"
  };

  if (sx.mb !== undefined) classes.push(`mb-${spacingMap[sx.mb as number] || sx.mb}`);
  if (sx.mt !== undefined) classes.push(`mt-${spacingMap[sx.mt as number] || sx.mt}`);
  if (sx.flex !== undefined) classes.push(`flex-${sx.flex}`);

  return classes.join(" ");
}

export interface InputProps extends React.ComponentProps<"input"> {
  // MUI compatibility props
  label?: string
  fullWidth?: boolean
  sx?: Record<string, unknown>
  slotProps?: {
    input?: {
      endAdornment?: React.ReactNode
      startAdornment?: React.ReactNode
    }
  }
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, fullWidth, sx, slotProps, ...props }, ref) => {
    const hasAdornment = slotProps?.input?.endAdornment || slotProps?.input?.startAdornment;

    const inputElement = (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          hasAdornment && "pr-10",
          slotProps?.input?.startAdornment && "pl-10",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    // If we have adornments, wrap in a container
    const inputWithAdornments = hasAdornment ? (
      <div className="relative flex items-center w-full">
        {slotProps?.input?.startAdornment && (
          <div className="absolute left-2 flex items-center pointer-events-auto">
            {slotProps.input.startAdornment}
          </div>
        )}
        {inputElement}
        {slotProps?.input?.endAdornment && (
          <div className="absolute right-2 flex items-center pointer-events-auto">
            {slotProps.input.endAdornment}
          </div>
        )}
      </div>
    ) : inputElement;

    // If label is provided, wrap with label element
    if (label) {
      return (
        <div className={cn("flex flex-col gap-1.5", sxToClassName(sx), fullWidth && "w-full")}>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
          {inputWithAdornments}
        </div>
      );
    }

    // No label - return input directly (possibly with adornments)
    return (
      <div className={cn(sxToClassName(sx), fullWidth && "w-full")}>
        {inputWithAdornments}
      </div>
    );
  }
)
Input.displayName = "Input"

export { Input }
