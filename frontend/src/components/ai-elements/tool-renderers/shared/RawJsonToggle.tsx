"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { CodeBlock } from "../../code-block";
import type { ComponentProps } from "react";

interface RawJsonToggleProps extends ComponentProps<"div"> {
  data: unknown;
}

/**
 * Collapsible raw JSON viewer - assistant-ui style.
 * Dashed border separator, muted trigger, smooth expand.
 */
export function RawJsonToggle({ data, className, ...props }: RawJsonToggleProps) {
  if (data === undefined || data === null) return null;

  const json =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <div className={cn("mt-3 border-t border-dashed px-4 pt-2", className)} {...props}>
      <Collapsible>
        <CollapsibleTrigger className="group/raw flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <span>View raw data</span>
          <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/raw:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="max-h-64 overflow-auto rounded-lg bg-muted/50">
            <CodeBlock code={json} language="json" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
