import { Mail, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountEmailIcon({
  botRisk,
  className,
}: {
  botRisk?: boolean;
  className?: string;
}) {
  if (botRisk) {
    return (
      <span title="该账号被打上机器人标记" className="inline-flex">
        <ShieldAlert
          className={cn("h-4 w-4 shrink-0 text-amber-600", className)}
          aria-label="该账号被打上机器人标记"
        />
      </span>
    );
  }
  return <Mail className={cn("h-4 w-4 shrink-0 text-primary text-sky-600", className)} aria-hidden="true" />;
}

export function AccountEmailLabel({
  email,
  botRisk,
  className,
  emailClassName,
}: {
  email?: string | null;
  botRisk?: boolean;
  className?: string;
  emailClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2", className)}>
      <AccountEmailIcon botRisk={!!botRisk} className="mt-0.5" />
      <div className={cn("min-w-0 break-all font-medium text-slate-950", emailClassName)}>
        {email || "-"}
      </div>
    </div>
  );
}
