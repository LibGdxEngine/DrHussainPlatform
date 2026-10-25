import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

interface ThProps extends React.ComponentProps<"th"> {
  /** Grey header band with top border (used on full-width lists). */
  tinted?: boolean;
}

export function Th({ tinted, className, ...props }: ThProps) {
  return (
    <th
      className={cn(
        "border-b border-line px-2 py-2.5 text-start text-xs font-medium text-muted first:ps-5 last:pe-5",
        tinted && "border-t bg-canvas-2",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b border-line-soft px-2 py-3 first:ps-5 last:pe-5", className)}
      {...props}
    />
  );
}
