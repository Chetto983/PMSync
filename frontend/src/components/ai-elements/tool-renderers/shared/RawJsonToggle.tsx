"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CodeIcon, ChevronRightIcon } from "lucide-react";
import { CodeBlock } from "../../code-block";
import type { ComponentProps } from "react";

interface RawJsonToggleProps extends ComponentProps<"div"> {
  data: unknown;
}

export function RawJsonToggle({ data, className, ...props }: RawJsonToggleProps) {
  if (data === undefined || data === null) return null;

  const json =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <div className={cn("border-t pt-2 mt-2", className)} {...props}>
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors group">
          <CodeIcon className="h-3 w-3" />
          <span>View raw data</span>
          <ChevronRightIcon className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="rounded-md bg-muted/30 max-h-64 overflow-auto">
            <CodeBlock code={json} language="json" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
