import {
  getCurrentRentPeriodStart,
  isLeaseEndedByDate,
  type FinancialTrackingSelection,
} from "@/lib/data/financialTracking";

type FinancialTrackingFieldsProps = FinancialTrackingSelection & {
  endDate: string;
  name: string;
  onChange: (selection: FinancialTrackingSelection) => void;
  startDate: string;
  today: string;
};

export function FinancialTrackingFields({ customDate, endDate, mode, name, onChange, startDate, today }: FinancialTrackingFieldsProps) {
  const ended = isLeaseEndedByDate(endDate, today);
  const startedBeforeCurrentPeriod = Boolean(startDate) && startDate.slice(0, 7) < today.slice(0, 7);
  const hasHistoricalSelection = mode === "current_period" || mode === "custom" || mode === "historical_only";

  if (!startDate || !endDate || !ended && !startedBeforeCurrentPeriod && !hasHistoricalSelection) {
    return null;
  }

  const currentPeriodStart = getCurrentRentPeriodStart(today);

  return (
    <fieldset className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 md:col-span-2">
      <legend className="px-1 text-sm font-semibold text-[var(--foreground)]">
        {ended ? "Suivi financier de cet ancien bail" : "À partir de quand voulez-vous suivre les loyers dans Nexbail ?"}
      </legend>

      {ended ? (
        <>
          <TrackingOption
            checked={mode === "historical_only"}
            description="Le bail et le locataire seront conservés sans créer d’anciennes obligations de loyer."
            label="Ajouter comme historique seulement — Recommandé"
            name={name}
            onChange={() => onChange({ mode: "historical_only", customDate: "" })}
          />
          <TrackingOption
            checked={mode === "lease_start"}
            description="Nexbail générera l’historique financier depuis le début réel du bail."
            label="Importer l’historique financier"
            name={name}
            onChange={() => onChange({ mode: "lease_start", customDate: startDate })}
          />
        </>
      ) : (
        <>
          <TrackingOption
            checked={mode === "current_period"}
            description="Les loyers précédents ne seront pas considérés comme impayés."
            label="À partir de maintenant — Recommandé"
            name={name}
            onChange={() => onChange({ mode: "current_period", customDate: currentPeriodStart })}
          />
          <TrackingOption
            checked={mode === "lease_start"}
            description="Nexbail créera l’historique des loyers depuis le début du bail."
            label="Depuis le début du bail"
            name={name}
            onChange={() => onChange({ mode: "lease_start", customDate: startDate })}
          />
          <TrackingOption
            checked={mode === "custom"}
            description="Choisissez une date comprise entre le début du bail et aujourd’hui."
            label="Choisir une date"
            name={name}
            onChange={() => onChange({ mode: "custom", customDate: customDate || currentPeriodStart })}
          />
          {mode === "custom" ? (
            <label className="ml-7 grid max-w-xs gap-1 text-sm font-medium text-[var(--muted)]">
              Début du suivi financier
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                max={today}
                min={startDate}
                onChange={(event) => onChange({ mode: "custom", customDate: event.target.value })}
                type="date"
                value={customDate}
              />
            </label>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

function TrackingOption({ checked, description, label, name, onChange }: { checked: boolean; description: string; label: string; name: string; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <input checked={checked} className="mt-1" name={name} onChange={onChange} type="radio" />
      <span>
        <span className="block text-sm font-semibold text-[var(--foreground)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{description}</span>
      </span>
    </label>
  );
}
