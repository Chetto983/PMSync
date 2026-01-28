# AI Elements Component Patches

## Overview

AI Elements components (from `@ai-elements`) were installed via CLI and require minor patches to work with our shadcn/ui setup. This document tracks all modifications for future updates.

## When Updating AI Elements

After running `npx ai-elements@latest add <component>`, reapply these patches:

---

## Patch List

### 1. `src/components/ai-elements/agent.tsx`

**Line ~83** - Accordion type union issue

```diff
- <Accordion className="rounded-md border" type="multiple" {...props} />
+ {/* @ts-expect-error - type inference issue with Accordion union types */}
+ <Accordion className="rounded-md border" type="multiple" {...props} />
```

**Reason:** TypeScript can't narrow the Accordion type union when spreading props.

---

### 2. `src/components/ai-elements/code-block.tsx`

**Lines ~208-209** - Default values for undefined colors

```diff
const tokenized: TokenizedCode = {
  tokens: result.tokens,
-  fg: result.fg,
-  bg: result.bg,
+  fg: result.fg ?? "#24292e",
+  bg: result.bg ?? "#ffffff",
};
```

**Line ~499** - Remove unsupported `size` prop from SelectTrigger

```diff
<SelectTrigger
  className={cn("h-7 border-none bg-transparent px-2 text-xs shadow-none", className)}
-  size="sm"
  {...props}
/>
```

**Reason:** Our shadcn SelectTrigger doesn't have a `size` prop.

---

### 3. `src/components/ai-elements/confirmation.tsx`

**Multiple lines** - Remove unused `@ts-expect-error` directives

The AI SDK v6 `state` property is now properly typed, so the `@ts-expect-error` comments are no longer needed. Remove all instances of:

```diff
-  // @ts-expect-error state only available in AI SDK v6
   if (state !== "approval-requested") {
```

---

### 4. `src/components/ai-elements/terminal.tsx`

**Line ~128** - Add required children to Shimmer

```diff
- {children ?? <Shimmer className="w-16" />}
+ {children ?? <Shimmer className="w-16">Processing...</Shimmer>}
```

**Reason:** TextShimmerProps requires `children: string`.

---

### 5. `src/components/ai-elements/schema-display.tsx`

**Line ~166** - Type safety for dangerouslySetInnerHTML

```diff
- dangerouslySetInnerHTML={{ __html: children ?? highlightedPath }}
+ dangerouslySetInnerHTML={{ __html: String(children ?? highlightedPath) }}
```

**Reason:** ReactNode isn't directly assignable to string | TrustedHTML.

---

## shadcn/ui Component Extensions

These are extensions to standard shadcn components needed by AI Elements:

### `components/ui/button.tsx`

Added `icon-sm` size variant:

```typescript
size: {
  // ... existing sizes
  "icon-sm": "h-7 w-7",
},
```

### `components/ui/badge.tsx`

Added `info` and `success` variants:

```typescript
variant: {
  // ... existing variants
  info: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  success: "border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
},
```

### `components/ui/card.tsx`

Added `CardAction` component:

```typescript
const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    />
  )
)
```

---

## Automated Patching (Optional)

To automate patching, install `patch-package`:

```bash
npm install patch-package --save-dev
```

After making changes, run:

```bash
npx patch-package @ai-elements
```

Add to `package.json`:

```json
"scripts": {
  "postinstall": "patch-package"
}
```

---

## Last Updated

- **Date:** 2026-01-28
- **AI Elements Version:** Latest (CLI installed)
- **AI SDK Version:** v6
