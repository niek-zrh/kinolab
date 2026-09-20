import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Empty states are invitations (spec §9.3): message + the action right there.
 *
 * v1.2 gives the invitation a shape — the icon sits in a badge so the eye has
 * somewhere to land, and the message is set in foreground rather than muted.
 * Eight screens can be empty on day one of a production; a page of grey text
 * on a dashed rectangle reads as "nothing here" instead of "start here".
 */
export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  /** Optional second line — the detail, kept out of the headline. */
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-8 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="max-w-sm text-sm text-foreground/85">{title}</p>
        {description && (
          <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
