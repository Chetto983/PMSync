import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// MUI sx prop to Tailwind conversion helper
function sxToClassName(sx?: Record<string, unknown>): string {
  if (!sx) return "";
  const classes: string[] = [];

  const spacingMap: Record<number, string> = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 8: "8", 10: "10", 12: "12"
  };

  if (sx.mb !== undefined) classes.push(`mb-${spacingMap[sx.mb as number] || sx.mb}`);
  if (sx.mt !== undefined) classes.push(`mt-${spacingMap[sx.mt as number] || sx.mt}`);
  if (sx.ml !== undefined) classes.push(`ml-${spacingMap[sx.ml as number] || sx.ml}`);
  if (sx.mr !== undefined) classes.push(`mr-${spacingMap[sx.mr as number] || sx.mr}`);
  if (sx.mx !== undefined) classes.push(`mx-${spacingMap[sx.mx as number] || sx.mx}`);
  if (sx.my !== undefined) classes.push(`my-${spacingMap[sx.my as number] || sx.my}`);
  if (sx.p !== undefined) classes.push(`p-${spacingMap[sx.p as number] || sx.p}`);

  return classes.join(" ");
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  // MUI compatibility
  sx?: Record<string, unknown>
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, sx, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), sxToClassName(sx), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
