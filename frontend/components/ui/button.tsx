import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// MUI sx prop to Tailwind conversion helper
function sxToClassName(sx?: Record<string, unknown>): string {
  if (!sx) return "";
  const classes: string[] = [];

  // Common MUI spacing to Tailwind
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
  if (sx.px !== undefined) classes.push(`px-${spacingMap[sx.px as number] || sx.px}`);
  if (sx.py !== undefined) classes.push(`py-${spacingMap[sx.py as number] || sx.py}`);
  if (sx.flex !== undefined) classes.push(`flex-${sx.flex}`);

  return classes.join(" ");
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  // MUI compatibility props
  fullWidth?: boolean
  component?: React.ElementType
  href?: string
  sx?: Record<string, unknown>
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, fullWidth, component, href, sx, children, ...props }, ref) => {
    // Build className with fullWidth and sx support
    const finalClassName = cn(
      buttonVariants({ variant, size }),
      fullWidth && "w-full",
      sxToClassName(sx),
      className
    );

    // If component prop is provided (MUI pattern), render as that component
    if (component) {
      const Comp = component;
      return (
        <Comp
          className={finalClassName}
          ref={ref}
          href={href}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    // Standard shadcn pattern
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={finalClassName}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
