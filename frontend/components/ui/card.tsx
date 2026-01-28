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
  if (sx.ml !== undefined) classes.push(`ml-${spacingMap[sx.ml as number] || sx.ml}`);
  if (sx.mr !== undefined) classes.push(`mr-${spacingMap[sx.mr as number] || sx.mr}`);
  if (sx.p !== undefined) classes.push(`p-${spacingMap[sx.p as number] || sx.p}`);

  return classes.join(" ");
}

interface CardBaseProps {
  sx?: Record<string, unknown>
}

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      sxToClassName(sx),
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", sxToClassName(sx), className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", sxToClassName(sx), className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", sxToClassName(sx), className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", sxToClassName(sx), className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", sxToClassName(sx), className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

const CardAction = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardBaseProps
>(({ className, sx, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-end gap-2", sxToClassName(sx), className)}
    {...props}
  />
))
CardAction.displayName = "CardAction"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardAction }
