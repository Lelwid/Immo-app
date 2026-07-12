import {
  currency,
  documentTypeLabel,
  getNotificationItems,
  getPropertyDashboards,
  getPropertyName,
  getTenantName,
  getUnitLabel,
  rentPaymentStatusLabel,
  ticketPriorityLabel,
  ticketStatusLabel,
} from "./mockData";
import { getUnitOccupancy } from "./data/leaseAdapters";
import type { LocalStore, PropertyDashboard } from "./types";

const mockNetCashflow = 4280;

export function exportPortfolioReport(store: LocalStore) {
  const properties = getPropertyDashboards(store);
  const currentMonth = getCurrentMonth(store);
  const currentPayments = store.payments.filter((payment) => payment.month === currentMonth);
  const expected = currentPayments.reduce((sum, payment) => sum + payment.amountDue, 0);
  const received = currentPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const latePayments = currentPayments.filter((payment) => payment.status === "en retard");
  const watchedLeases = store.leases.filter((lease) => lease.status === "active" && isLeaseWithinDays(lease.endDate, 90));
  const openTickets = store.maintenanceTickets.filter((ticket) => ticket.status !== "resolved");
  const notifications = getNotificationItems(store).slice(0, 8);

  openPdfReport({
    title: "Rapport portefeuille",
    subtitle: "Vue consolidée du portefeuille locatif",
    sections: [
      metricsSection([
        ["Revenus mensuels attendus", currency.format(expected)],
        ["Revenus reçus", currency.format(received)],
        ["Paiements en retard", latePayments.length.toString()],
        ["Baux à surveiller", watchedLeases.length.toString()],
        ["Demandes d'entretien ouvertes", openTickets.length.toString()],
      ]),
      tableSection("Immeubles", ["Immeuble", "Logements", "Revenus mensuels", "Demandes d'entretien"], properties.map((property) => [
        property.name,
        property.units.length.toString(),
        currency.format(property.monthlyRent),
        property.openTicketCount.toString(),
      ])),
      tableSection("Notifications prioritaires", ["Priorité", "Titre", "Action"], notifications.map((notification) => [
        notification.priority,
        notification.title,
        notification.recommendedAction,
      ])),
    ],
  });
}

export function exportPropertyReport(store: LocalStore, property: PropertyDashboard) {
  const units = property.units;
  const payments = store.payments.filter((payment) => payment.propertyId === property.id);
  const tickets = store.maintenanceTickets.filter((ticket) => ticket.propertyId === property.id);
  const documents = store.documents.filter((document) => document.propertyId === property.id);

  openPdfReport({
    title: `Rapport immeuble · ${property.name}`,
    subtitle: `${property.address}, ${property.city}`,
    sections: [
      metricsSection([
        ["Type", property.propertyType],
        ["Logements", property.units.length.toString()],
        ["Revenus mensuels", currency.format(property.monthlyRent)],
        ["Santé", `${property.healthScore}`],
      ]),
      tableSection("Logements et locataires", ["Logement", "Locataire", "Loyer", "Fin du bail"], units.map((unit) => [
        unit.label,
        getUnitOccupancy(unit, store.leases, store.tenants).tenantName,
        currency.format(getUnitOccupancy(unit, store.leases, store.tenants).monthlyRent),
        getUnitOccupancy(unit, store.leases, store.tenants).leaseEndDate,
      ])),
      tableSection("Paiements", ["Mois", "Logement", "Statut", "Payé / Dû"], payments.map((payment) => [
        payment.month,
        getUnitLabel(payment.unitId, store),
        rentPaymentStatusLabel[payment.status],
        `${currency.format(payment.amountPaid)} / ${currency.format(payment.amountDue)}`,
      ])),
      tableSection("Demandes d'entretien", ["Demande", "Logement", "Priorité", "Statut"], tickets.map((ticket) => [
        ticket.title,
        getUnitLabel(ticket.unitId, store),
        ticketPriorityLabel[ticket.priority],
        ticketStatusLabel[ticket.status],
      ])),
      tableSection("Documents", ["Document", "Type", "Logement", "Date"], documents.map((document) => [
        document.name,
        documentTypeLabel[document.type],
        getUnitLabel(document.unitId, store),
        document.uploadDate,
      ])),
    ],
  });
}

export function exportFinancialReport(store: LocalStore) {
  const currentMonth = getCurrentMonth(store);
  const currentPayments = store.payments.filter((payment) => payment.month === currentMonth);
  const expected = currentPayments.reduce((sum, payment) => sum + payment.amountDue, 0);
  const received = currentPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const balanceDue = Math.max(0, expected - received);
  const occupancyRate = getOccupancyRate(store.units, store);
  const chartData = getLastMonths(currentMonth, 6).map((month) => {
    const payments = store.payments.filter((payment) => payment.month === month);
    return {
      month,
      expected: payments.reduce((sum, payment) => sum + payment.amountDue, 0),
      received: payments.reduce((sum, payment) => sum + payment.amountPaid, 0),
    };
  });

  openPdfReport({
    title: "Rapport financier",
    subtitle: "Performance financière du portefeuille",
    sections: [
      metricsSection([
        ["Revenus attendus", currency.format(expected)],
        ["Revenus reçus", currency.format(received)],
        ["Solde impayé", currency.format(balanceDue)],
        ["Taux d'occupation", `${occupancyRate} %`],
        ["Cashflow net", currency.format(mockNetCashflow)],
      ]),
      chartSection(chartData),
      tableSection("Revenus par immeuble", ["Immeuble", "Reçus", "Attendus", "Retards"], getPropertyDashboards(store).map((property) => {
        const payments = currentPayments.filter((payment) => payment.propertyId === property.id);
        return [
          property.name,
          currency.format(payments.reduce((sum, payment) => sum + payment.amountPaid, 0)),
          currency.format(payments.reduce((sum, payment) => sum + payment.amountDue, 0)),
          payments.filter((payment) => payment.status === "en retard").length.toString(),
        ];
      })),
      tableSection("Paiements en retard", ["Immeuble", "Logement", "Locataire", "Solde"], currentPayments.filter((payment) => payment.status === "en retard").map((payment) => [
        getPropertyName(payment.propertyId, store),
        getUnitLabel(payment.unitId, store),
        getTenantName(payment.tenantId, store),
        currency.format(payment.amountDue - payment.amountPaid),
      ])),
    ],
  });
}

function openPdfReport({ sections, subtitle, title }: { title: string; subtitle: string; sections: string[] }) {
  const reportWindow = window.open("", "_blank", "width=960,height=1200");

  if (!reportWindow) {
    return;
  }

  reportWindow.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
          main { max-width: 920px; margin: 0 auto; padding: 40px; background: white; min-height: 100vh; }
          header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
          .eyebrow { color: #2563ff; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
          h1 { margin: 8px 0 8px; font-size: 32px; }
          h2 { margin: 0 0 14px; font-size: 18px; }
          .meta { color: #64748b; font-size: 13px; }
          section { margin: 24px 0; page-break-inside: avoid; }
          .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .metric { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; }
          .metric-label { color: #64748b; font-size: 12px; font-weight: 700; }
          .metric-value { margin-top: 8px; font-size: 20px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; color: #475569; background: #f1f5f9; }
          th, td { border: 1px solid #e2e8f0; padding: 9px; vertical-align: top; }
          .bars { display: grid; gap: 8px; }
          .bar-row { display: grid; grid-template-columns: 70px 1fr 1fr; gap: 10px; align-items: center; font-size: 12px; }
          .bar { height: 12px; border-radius: 999px; background: #dbeafe; overflow: hidden; }
          .fill { height: 100%; background: #2563ff; }
          .fill-green { background: #22c55e; }
          @media print { body { background: white; } main { padding: 28px; } button { display: none; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div class="eyebrow">Gestionnaire Immo</div>
            <h1>${escapeHtml(title)}</h1>
            <div class="meta">${escapeHtml(subtitle)} · Généré le ${formatReportDate(new Date())}</div>
          </header>
          ${sections.join("")}
        </main>
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

function metricsSection(metrics: [string, string][]) {
  return `<section><h2>Résumé</h2><div class="metrics">${metrics
    .map(([label, value]) => `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`)
    .join("")}</div></section>`;
}

function tableSection(title: string, headers: string[], rows: string[][]) {
  return `<section><h2>${escapeHtml(title)}</h2><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${(rows.length > 0 ? rows : [["Aucune donnée", ...headers.slice(1).map(() => "")]])
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></section>`;
}

function chartSection(data: { month: string; expected: number; received: number }[]) {
  const maxValue = Math.max(1, ...data.map((point) => Math.max(point.expected, point.received)));

  return `<section><h2>Graphique revenus</h2><div class="bars">${data
    .map(
      (point) => `<div class="bar-row"><strong>${escapeHtml(point.month)}</strong><div class="bar"><div class="fill" style="width:${(point.expected / maxValue) * 100}%"></div></div><div class="bar"><div class="fill fill-green" style="width:${(point.received / maxValue) * 100}%"></div></div></div>`,
    )
    .join("")}</div><p class="meta">Bleu: attendus · Vert: reçus</p></section>`;
}

function getCurrentMonth(store: LocalStore) {
  return store.payments.map((payment) => payment.month).sort().at(-1) ?? new Date().toISOString().slice(0, 7);
}

function isLeaseWithinDays(date: string, days: number) {
  const now = new Date();
  const targetDate = new Date(`${date}T12:00:00`);
  const daysUntilDate = Math.ceil((targetDate.getTime() - now.getTime()) / 86_400_000);

  return daysUntilDate >= 0 && daysUntilDate <= days;
}

function getLastMonths(currentMonth: string, count: number) {
  const [year, month] = currentMonth.split("-").map(Number);
  const months: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    months.push(date.toISOString().slice(0, 7));
  }

  return months;
}

function getOccupancyRate(units: { id: string }[], store?: LocalStore) {
  if (units.length === 0) {
    return 0;
  }

  if (!store) {
    return 0;
  }

  return Math.round((units.filter((unit) => {
    const storeUnit = store.units.find((candidate) => candidate.id === unit.id);
    return storeUnit ? getUnitOccupancy(storeUnit, store.leases, store.tenants).isOccupied : false;
  }).length / units.length) * 100);
}

function formatReportDate(date: Date) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
