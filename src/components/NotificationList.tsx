import Link from "next/link";
import type { KeyboardEvent } from "react";
import type { NotificationItem, NotificationPriority } from "@/lib/types";

export const notificationPriorityCopy: Record<NotificationPriority, { label: string; classes: string; dot: string }> = {
  urgent: {
    label: "Urgent",
    classes: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    dot: "bg-[color:var(--red)]",
  },
  attention: {
    label: "À surveiller",
    classes: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    dot: "bg-[color:var(--yellow)]",
  },
  info: {
    label: "Information",
    classes: "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
    dot: "bg-[color:var(--accent)]",
  },
};

export function NotificationList({
  compact = false,
  notifications,
}: {
  compact?: boolean;
  notifications: NotificationItem[];
}) {
  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--green)]/30 bg-[color:var(--green)]/10 p-4 text-sm font-medium text-[color:var(--green)]">
        Aucune notification active.
      </div>
    );
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <div className={compact ? "grid min-w-0 gap-2 overflow-hidden" : "grid min-w-0 gap-2.5 overflow-hidden"}>
      {notifications.map((notification) => {
        const priority = notificationPriorityCopy[notification.priority];

        return (
          <Link
            key={notification.id}
            aria-label={`Ouvrir la notification: ${notification.title}`}
            href={notification.href}
            onKeyDown={handleCardKeyDown}
            className={`group block min-w-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] [overflow-wrap:anywhere] [word-break:normal] transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] ${
              compact ? "p-2.5" : "p-3"
            }`}
          >
            <article className="min-w-0 overflow-hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 overflow-hidden">
                <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${compact ? "text-[10px]" : "text-[11px]"} ${priority.classes}`}>
                  {priority.label}
                </span>
                <span className="min-w-0 text-xs font-medium text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal]">{notification.timing}</span>
              </div>
              <div className={`${compact ? "mt-1.5" : "mt-2"} flex min-w-0 items-start justify-between gap-3 overflow-hidden`}>
                <h3 className={`min-w-0 line-clamp-2 font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal] transition group-hover:text-[color:var(--accent)] ${compact ? "text-sm leading-5" : ""}`}>
                  {notification.title}
                </h3>
                <span className={`${compact ? "text-xs" : "text-sm"} shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]`} aria-hidden="true">
                  →
                </span>
              </div>
              <p className={`${compact ? "mt-0.5 line-clamp-1 text-xs" : "mt-1 line-clamp-2 text-sm"} min-w-0 text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal]`}>
                {notification.property} · {notification.unit}
                {notification.tenant ? ` · ${notification.tenant}` : ""}
              </p>
              <div className={`${compact ? "mt-1.5 grid gap-1 text-xs leading-4" : "mt-2 grid gap-1.5 text-sm leading-5"} min-w-0 overflow-hidden`}>
                <p className={`min-w-0 text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal] ${compact ? "line-clamp-2" : ""}`}>
                  <span className="font-semibold">Action:</span> {notification.recommendedAction}
                </p>
                <p className={`min-w-0 text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal] ${compact ? "line-clamp-2" : ""}`}>
                  <span className="font-semibold text-[var(--foreground)]">Pourquoi:</span> {notification.urgencyReason}
                </p>
                {notification.relatedDeadline ? (
                  <p className="line-clamp-1 min-w-0 text-xs font-medium text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal]">
                    Échéance: {formatDate(notification.relatedDeadline)}
                  </p>
                ) : null}
              </div>
            </article>
          </Link>
        );
      })}
    </div>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
