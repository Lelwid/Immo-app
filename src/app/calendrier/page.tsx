"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { loadPortfolioSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import { buildRentLedger, type RentChargeRow } from "@/lib/data/rentLedgerService";
import { documentTypeLabel, getPropertyName, getUnitLabel } from "@/lib/mockData";
import type { LocalStore } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type CalendarFilter = "tous" | "paiements" | "baux" | "entretien" | "documents";
type CalendarView = "mois" | "semaine";
type EventColor = "red" | "orange" | "blue" | "green";
type EventUrgency = "urgent" | "attention" | "info" | "ok";

type OperationalEvent = {
  id: string;
  title: string;
  type: CalendarFilter;
  typeLabel: string;
  color: EventColor;
  urgency: EventUrgency;
  property: string;
  unit: string;
  tenant: string | null;
  dueDate: string;
  href: string;
  description: string;
};

const filters: { label: string; value: CalendarFilter }[] = [
  { label: "Tous", value: "tous" },
  { label: "Paiements", value: "paiements" },
  { label: "Baux", value: "baux" },
  { label: "Demandes d'entretien", value: "entretien" },
  { label: "Documents", value: "documents" },
];

const eventColorClasses: Record<EventColor, string> = {
  red: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  orange: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  blue: "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  green: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
};

const urgencyLabel: Record<EventUrgency, string> = {
  urgent: "Urgent",
  attention: "À surveiller",
  info: "Info",
  ok: "Complété",
};

export default function CalendrierPage() {
  const { store } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("tous");
  const [calendarView, setCalendarView] = useState<CalendarView>("mois");
  const [visibleMonth, setVisibleMonth] = useState(() => getDefaultMonth(store));
  const [selectedEvent, setSelectedEvent] = useState<OperationalEvent | null>(null);
  const snapshotStore = snapshot ?? store;
  const events = useMemo(() => getOperationalEvents(snapshotStore), [snapshotStore]);

  useEffect(() => {
    let active = true;

    loadPortfolioSnapshot()
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }

        setSnapshot(nextSnapshot);
        setVisibleMonth((currentMonth) => currentMonth || getDefaultMonth(nextSnapshot));
        setSnapshotError("");
      })
      .catch((error) => {
        console.error("Impossible de charger le calendrier depuis le snapshot.", error);
        if (active) {
          setSnapshotError("Impossible de synchroniser le calendrier. Les données locales sont affichées.");
        }
      })
      .finally(() => {
        if (active) {
          setSnapshotLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredEvents = useMemo(
    () => events.filter((event) => activeFilter === "tous" || event.type === activeFilter),
    [activeFilter, events],
  );
  const visibleEvents =
    calendarView === "mois"
      ? filteredEvents.filter((event) => event.dueDate.startsWith(visibleMonth))
      : filteredEvents.filter((event) => getWeekDays(new Date()).some((day) => day.date === event.dueDate));
  const upcomingEvents = filteredEvents
    .filter((event) => event.dueDate >= today())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 12);

  return (
    <RouteShell
      title="Calendrier"
      description="Calendrier opérationnel des loyers, baux, demandes d'entretien, inspections, assurances et documents."
    >
      <section className="grid gap-5">
        {snapshotLoading ? <p className="text-sm text-[var(--muted)]">Synchronisation du calendrier...</p> : null}
        {snapshotError ? <p className="text-sm font-semibold text-[color:var(--amber)]">{snapshotError}</p> : null}

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  activeFilter === filter.value
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                calendarView === "mois"
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setCalendarView("mois")}
              type="button"
            >
              Mois
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                calendarView === "semaine"
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setCalendarView("semaine")}
              type="button"
            >
              Semaine
            </button>
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
              Mois
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                type="month"
                value={visibleMonth}
                onChange={(event) => setVisibleMonth(event.target.value)}
              />
            </label>
          </div>
        </div>

        <Legend />

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          {calendarView === "mois" ? (
            <MonthView events={visibleEvents} month={visibleMonth} onSelect={setSelectedEvent} />
          ) : (
            <WeekView events={visibleEvents} onSelect={setSelectedEvent} />
          )}

          <aside className="custom-scrollbar rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 xl:sticky xl:top-5 xl:max-h-[calc(100vh-40px)] xl:overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--muted)]">Opérations</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Événements à venir</h2>
              </div>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                {upcomingEvents.length}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} onSelect={setSelectedEvent} />
              ))}
              {upcomingEvents.length === 0 ? (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                  Aucun événement à venir pour ce filtre.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      {selectedEvent ? <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
    </RouteShell>
  );
}

function Legend() {
  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 xl:grid-cols-4">
      <LegendItem color="red" label="Demande urgente · Suivi paiement en retard" />
      <LegendItem color="orange" label="Renouvellements · Assurances · Documents" />
      <LegendItem color="blue" label="Inspections · Visites planifiées" />
      <LegendItem color="green" label="Paiements réussis" />
    </div>
  );
}

function LegendItem({ color, label }: { color: EventColor; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
      <span className={`h-2.5 w-2.5 rounded-full border ${eventColorClasses[color]}`} />
      {label}
    </div>
  );
}

function MonthView({
  events,
  month,
  onSelect,
}: {
  events: OperationalEvent[];
  month: string;
  onSelect: (event: OperationalEvent) => void;
}) {
  const days = getMonthDays(month);
  const eventsByDay = groupEventsByDay(events);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <CalendarHeader count={events.length} eyebrow="Vue mensuelle" title={formatMonthLabel(month)} />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
        {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day) => (
          <div key={day} className="bg-[var(--surface-3)] px-2 py-2 text-center text-xs font-semibold text-[var(--muted)]">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = day.date ? eventsByDay.get(day.date) ?? [] : [];

          return (
            <div key={day.key} className="min-h-[132px] bg-[var(--surface-2)] p-2">
              {day.date ? (
                <>
                  <p className="text-xs font-semibold text-[var(--muted)]">{Number(day.date.slice(-2))}</p>
                  <div className="mt-2 grid gap-1.5">
                    {dayEvents.slice(0, 4).map((event) => (
                      <EventPill key={event.id} event={event} onSelect={onSelect} />
                    ))}
                    {dayEvents.length > 4 ? (
                      <span className="text-xs font-medium text-[var(--muted)]">+{dayEvents.length - 4} autres</span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ events, onSelect }: { events: OperationalEvent[]; onSelect: (event: OperationalEvent) => void }) {
  const days = getWeekDays(new Date());
  const eventsByDay = groupEventsByDay(events);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <CalendarHeader count={events.length} eyebrow="Vue hebdomadaire" title="Cette semaine" />
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = eventsByDay.get(day.date) ?? [];

          return (
            <div key={day.date} className="min-h-[360px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">{day.label}</p>
              <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{Number(day.date.slice(-2))}</p>
              <div className="mt-4 grid gap-2">
                {dayEvents.map((event) => (
                  <EventPill key={event.id} event={event} onSelect={onSelect} />
                ))}
                {dayEvents.length === 0 ? <p className="text-xs text-[var(--muted)]">Aucun événement.</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarHeader({ count, eyebrow, title }: { count: number; eyebrow: string; title: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-[var(--muted)]">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
        {count} événements
      </span>
    </div>
  );
}

function EventPill({ event, onSelect }: { event: OperationalEvent; onSelect: (event: OperationalEvent) => void }) {
  return (
    <button
      className={`truncate rounded border px-2 py-1 text-left text-xs font-semibold transition hover:border-[color:var(--accent)]/60 ${eventColorClasses[event.color]}`}
      onClick={() => onSelect(event)}
      title={event.title}
      type="button"
    >
      {event.title}
    </button>
  );
}

function EventCard({ event, onSelect }: { event: OperationalEvent; onSelect: (event: OperationalEvent) => void }) {
  return (
    <button
      className="block rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)]"
      onClick={() => onSelect(event)}
      type="button"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${eventColorClasses[event.color]}`}>
          {urgencyLabel[event.urgency]}
        </span>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
          {event.typeLabel}
        </span>
      </div>
      <h3 className="mt-3 font-semibold text-[var(--foreground)]">{event.title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(event.dueDate)}</p>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        {event.property} · {event.unit}
        {event.tenant ? ` · ${event.tenant}` : ""}
      </p>
    </button>
  );
}

function EventDrawer({ event, onClose }: { event: OperationalEvent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/55" aria-label="Fermer le panneau" onClick={onClose} type="button" />
      <aside className="custom-scrollbar absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.32)] sm:w-[460px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{event.typeLabel}</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{event.title}</h2>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          <InfoCard label="Urgence" value={urgencyLabel[event.urgency]} />
          <InfoCard label="Date limite" value={formatDate(event.dueDate)} />
          <InfoCard label="Immeuble" value={event.property} />
          <InfoCard label="Logement" value={event.unit} />
          <InfoCard label="Locataire" value={event.tenant ?? "Non applicable"} />
          <InfoCard label="Description" value={event.description} />
        </div>

        <Link className="btn-primary mt-6 flex justify-center" href={event.href}>
          Ouvrir l&apos;élément lié
        </Link>
      </aside>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <p className="text-xs font-medium uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function getOperationalEvents(store: LocalStore): OperationalEvent[] {
  const events: OperationalEvent[] = [];

  for (const charge of buildRentLedger(store).rows) {
    const rentState = getCalendarRentState(charge);

    events.push({
      id: `rent-charge-${charge.id}`,
      title: `${rentState.title} · ${getUnitLabel(charge.unitId, store)}`,
      dueDate: charge.dueDate,
      type: "paiements",
      typeLabel: rentState.typeLabel,
      color: rentState.color,
      urgency: rentState.urgency,
      property: getPropertyName(charge.propertyId, store),
      unit: getUnitLabel(charge.unitId, store),
      tenant: getRentChargeTenantName(charge, store),
      description: rentState.description,
      href: `/dashboard?property=${charge.propertyId}&unit=${charge.unitId}&tab=paiements`,
    });

    if (rentState.isLate) {
      events.push({
        id: `payment-reminder-${charge.id}`,
        title: `Suivi retard · ${getUnitLabel(charge.unitId, store)}`,
        dueDate: today(),
        type: "paiements",
        typeLabel: "Rappel paiement",
        color: "red",
        urgency: "urgent",
        property: getPropertyName(charge.propertyId, store),
        unit: getUnitLabel(charge.unitId, store),
        tenant: getRentChargeTenantName(charge, store),
        description: "Envoyer un rappel au locataire pour le paiement en retard.",
        href: `/dashboard?property=${charge.propertyId}&unit=${charge.unitId}&tab=paiements`,
      });
    }
  }

  for (const lease of store.leases.filter((candidate) => candidate.status === "active")) {
    const unit = store.units.find((candidate) => candidate.id === lease.unitId);

    if (!unit) {
      continue;
    }

    const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);
    events.push({
      id: `lease-renewal-${lease.id}`,
      title: `Renouvellement bail · ${unit.label}`,
      dueDate: addDays(lease.endDate, -90),
      type: "baux",
      typeLabel: "Renouvellement",
      color: "orange",
      urgency: "attention",
      property: getPropertyName(lease.propertyId, store),
      unit: unit.label,
      tenant: occupancy.tenantName,
      description: "Préparer l'avis de renouvellement du bail.",
      href: `/dashboard?property=${lease.propertyId}&unit=${lease.unitId}&tab=bail`,
    });
  }

  for (const ticket of store.maintenanceTickets) {
    const urgent = ticket.priority === "urgent" || ticket.priority === "high";
    events.push({
      id: `maintenance-${ticket.id}`,
      title: urgent ? `Demande urgente · ${ticket.title}` : ticket.title,
      dueDate: ticket.createdAt,
      type: "entretien",
      typeLabel: urgent ? "Demande d'entretien urgente" : "Demande d'entretien",
      color: urgent ? "red" : "blue",
      urgency: urgent ? "urgent" : "info",
      property: getPropertyName(ticket.propertyId, store),
      unit: getUnitLabel(ticket.unitId, store),
      tenant: getTenantForUnit(ticket.unitId, store),
      description: ticket.description,
      href: "/entretien",
    });
  }

  for (const document of store.documents) {
    if (document.type === "inspection") {
      events.push({
        id: `inspection-${document.id}`,
        title: `Inspection · ${document.name}`,
        dueDate: document.uploadDate,
        type: "documents",
        typeLabel: "Inspection",
        color: "blue",
        urgency: "info",
        property: getPropertyName(document.propertyId, store),
        unit: getUnitLabel(document.unitId, store),
        tenant: getTenantForUnit(document.unitId, store),
        description: "Inspection ou rapport d'inspection lié au dossier.",
        href: `/documents?document=${document.id}`,
      });
    }

    if (document.type === "assurance") {
      const renewalDate = addDays(document.uploadDate, 365);
      events.push({
        id: `insurance-${document.id}`,
        title: `Renouvellement assurance · ${document.name}`,
        dueDate: renewalDate,
        type: "documents",
        typeLabel: "Assurance",
        color: "orange",
        urgency: "attention",
        property: getPropertyName(document.propertyId, store),
        unit: getUnitLabel(document.unitId, store),
        tenant: getTenantForUnit(document.unitId, store),
        description: "Vérifier le renouvellement ou l'expiration du document d'assurance.",
        href: `/documents?document=${document.id}`,
      });
    }

    if (document.type === "bail" || document.type === "facture") {
      const deadline = addDays(document.uploadDate, 180);
      events.push({
        id: `document-deadline-${document.id}`,
        title: `Échéance document · ${document.name}`,
        dueDate: deadline,
        type: "documents",
        typeLabel: documentTypeLabel[document.type],
        color: "orange",
        urgency: "attention",
        property: getPropertyName(document.propertyId, store),
        unit: getUnitLabel(document.unitId, store),
        tenant: getTenantForUnit(document.unitId, store),
        description: "Vérifier si le document nécessite un suivi ou un renouvellement.",
        href: `/documents?document=${document.id}`,
      });
    }
  }

  return events.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function getCalendarRentState(charge: RentChargeRow): {
  color: EventColor;
  description: string;
  isLate: boolean;
  title: string;
  typeLabel: string;
  urgency: EventUrgency;
} {
  const paid = charge.balance <= 0;
  const paidInAdvance = paid && Boolean(charge.lastPaymentAt) && charge.lastPaymentAt < charge.dueDate;
  const partial = charge.balance > 0 && charge.amountAllocated > 0;
  const late = charge.balance > 0 && charge.dueDate < today();

  if (paidInAdvance) {
    return {
      color: "green",
      description: "Le loyer a été payé avant son échéance.",
      isLate: false,
      title: "Loyer payé d'avance",
      typeLabel: "Paiement réussi",
      urgency: "ok",
    };
  }

  if (paid) {
    return {
      color: "green",
      description: "Le loyer a été payé.",
      isLate: false,
      title: "Loyer payé",
      typeLabel: "Paiement réussi",
      urgency: "ok",
    };
  }

  if (partial) {
    return {
      color: "orange",
      description: "Un paiement partiel a été reçu, mais un solde demeure ouvert.",
      isLate: false,
      title: "Loyer partiellement payé",
      typeLabel: "Paiement partiel",
      urgency: "attention",
    };
  }

  if (late) {
    return {
      color: "red",
      description: "Le loyer est en retard et demande un suivi.",
      isLate: true,
      title: "Loyer en retard",
      typeLabel: "Loyer en retard",
      urgency: "urgent",
    };
  }

  return {
    color: "orange",
    description: "Le loyer est à venir et doit être suivi à cette date.",
    isLate: false,
    title: "Loyer à venir",
    typeLabel: "Loyer à venir",
    urgency: "attention",
  };
}

function getRentChargeTenantName(charge: RentChargeRow, store: LocalStore) {
  const tenant = charge.tenantId ? store.tenants.find((candidate) => candidate.id === charge.tenantId && !candidate.archivedAt) : null;

  if (!tenant) {
    return "Locataire introuvable";
  }

  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

function getDefaultMonth(store: LocalStore) {
  return getOperationalEvents(store).find((event) => event.dueDate >= today())?.dueDate.slice(0, 7) ?? today().slice(0, 7);
}

function getMonthDays(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const dayCount = new Date(year, monthIndex, 0).getDate();
  const blanks = Array.from({ length: firstDay.getDay() }, (_, index) => ({ key: `blank-${index}`, date: null as string | null }));
  const dates = Array.from({ length: dayCount }, (_, index) => ({
    key: `${month}-${index + 1}`,
    date: `${month}-${String(index + 1).padStart(2, "0")}`,
  }));
  const total = blanks.length + dates.length;
  const trailing = Array.from({ length: (7 - (total % 7)) % 7 }, (_, index) => ({ key: `trail-${index}`, date: null as string | null }));

  return [...blanks, ...dates, ...trailing];
}

function getWeekDays(referenceDate: Date) {
  const start = new Date(referenceDate);
  start.setDate(referenceDate.getDate() - referenceDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("fr-CA", { weekday: "short" }).format(date),
    };
  });
}

function groupEventsByDay(events: OperationalEvent[]) {
  const grouped = new Map<string, OperationalEvent[]>();

  for (const event of events) {
    grouped.set(event.dueDate, [...(grouped.get(event.dueDate) ?? []), event]);
  }

  return grouped;
}

function addDays(date: string, days: number) {
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function getTenantForUnit(unitId: string, store: LocalStore) {
  const unit = store.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    return null;
  }

  const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);
  return occupancy.isOccupied ? occupancy.tenantName : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
