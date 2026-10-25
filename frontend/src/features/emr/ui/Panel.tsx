import { cn } from "@/lib/utils";

interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** "solid" = white 24px surface; "outline" = bordered 22px card inside a surface. */
  variant?: "solid" | "outline";
  as?: "section" | "div" | "aside" | "header" | "article";
}

export function Panel({ variant = "solid", as: Tag = "section", className, ...props }: PanelProps) {
  return (
    <Tag
      className={cn(
        variant === "solid" ? "rounded-3xl bg-white" : "rounded-[22px] border border-line",
        className,
      )}
      {...props}
    />
  );
}

interface PanelHeadingProps {
  id?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}

/** h2 with an optional trailing element (count, link) pushed to the inline end. */
export function PanelHeading({ id, children, aside, className }: PanelHeadingProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <h2 id={id} className="m-0 text-lg font-semibold">
        {children}
      </h2>
      {aside ? <span className="ms-auto text-xs text-muted">{aside}</span> : null}
    </div>
  );
}
