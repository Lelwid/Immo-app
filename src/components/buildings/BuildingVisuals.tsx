"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { currency } from "@/lib/mockData";
import type { Health, Property, UnitDashboard } from "@/lib/types";

type BuildingType = Property["propertyType"];

type BuildingVisualProps = {
  type: BuildingType;
  propertyName: string;
  units: UnitDashboard[];
  selectedUnitId: string;
  onSelectUnit: (unitId: string) => void;
};

type GridFilter = "all" | "occupied" | "vacant" | "issues" | "late";

const buildingImages: Record<BuildingType, { src: string; alt: string; aspect: string; imageClassName: string }> = {
  triplex: {
    src: "/buildings/triplex_t.png",
    alt: "Triplex",
    aspect: "aspect-[0.72]",
    imageClassName: "object-contain object-bottom",
  },
  duplex: {
    src: "/buildings/duplex_t.png",
    alt: "Duplex",
    aspect: "aspect-[0.72]",
    imageClassName: "object-contain object-bottom",
  },
  condo: {
    src: "/buildings/condo_t.png",
    alt: "Condo",
    aspect: "aspect-[0.72]",
    imageClassName: "object-contain object-bottom",
  },
  quadruplex: {
    src: "/buildings/quadruplex_t.png",
    alt: "Quadruplex",
    aspect: "aspect-[0.9]",
    imageClassName: "object-contain object-bottom",
  },
  immeuble: {
    src: "/buildings/triplex_t.png",
    alt: "Immeuble",
    aspect: "aspect-[0.72]",
    imageClassName: "object-contain object-bottom",
  },
};

const gridFilters: { label: string; value: GridFilter }[] = [
  { label: "Tous", value: "all" },
  { label: "Occupés", value: "occupied" },
  { label: "Vacants", value: "vacant" },
  { label: "Problèmes", value: "issues" },
  { label: "En retard", value: "late" },
];

const triplexSlots = [
  "left-[16%] right-[25%] top-[21%] h-[13%]",
  "left-[16%] right-[24%] top-[39.5%] h-[13%]",
  "left-[16%] right-[24%] top-[56.4%] h-[13%]",
];

const duplexSlots = [
  "left-[16%] right-[24%] top-[34%] h-[13%]",
  "left-[16%] right-[24%] top-[51%] h-[13%]",
];

const condoSlots = [
  "left-[20%] right-[29%] top-[36%] h-[15%]",
];

const quadruplexSlots = [
  "left-[16%] right-[26%] top-[14.7%] h-[11.25%] origin-center skew-y-[0.8deg]",
  "left-[16%] right-[26%] top-[28.8%] h-[11.25%] origin-center skew-y-[0.8deg]",
  "left-[16%] right-[26%] top-[43.1%] h-[11.25%] origin-center skew-y-[0.8deg]",
  "left-[16%] right-[26%] top-[57.5%] h-[11.25%] origin-center skew-y-[0.8deg]",
];

const healthCopy: Record<Health, { label: string; rail: string; dot: string; badge: string }> = {
  ok: {
    label: "OK",
    rail: "bg-[color:var(--green)]",
    dot: "bg-[color:var(--green)]",
    badge: "border-[color:var(--green)]/30 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  },
  attention: {
    label: "Attention",
    rail: "bg-[color:var(--yellow)]",
    dot: "bg-[color:var(--yellow)]",
    badge: "border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  },
  issue: {
    label: "Problème",
    rail: "bg-[color:var(--red)]",
    dot: "bg-[color:var(--red)]",
    badge: "border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  },
};

export function BuildingVisual({ type, propertyName, units, selectedUnitId, onSelectUnit }: BuildingVisualProps) {
  const shouldUseGridTwin = type === "immeuble" || units.length >= 5;

  if (shouldUseGridTwin) {
    return (
      <GridBuildingVisual
        propertyName={propertyName}
        units={units}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
      />
    );
  }

  const image = buildingImages[type];

  return (
    <div className={`relative mx-auto w-full max-w-[680px] ${image.aspect}`}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes="(max-width: 768px) 92vw, 680px"
        priority
        className={`select-none ${image.imageClassName}`}
      />
      {units.map((unit, index) => (
          <div
            key={unit.id}
            className={`absolute z-10 flex ${
              type === "triplex"
                ? triplexSlots[index] ?? triplexSlots[triplexSlots.length - 1]
                : type === "duplex"
                  ? duplexSlots[index] ?? duplexSlots[duplexSlots.length - 1]
                  : type === "quadruplex"
                    ? quadruplexSlots[index] ?? quadruplexSlots[quadruplexSlots.length - 1]
                    : condoSlots[index] ?? condoSlots[condoSlots.length - 1]
            }`}
          >
            <ApartmentOverlayCard
              unit={unit}
              selected={selectedUnitId === unit.id}
              onSelectUnit={onSelectUnit}
            />
          </div>
        ))}
    </div>
  );
}

function GridBuildingVisual({
  propertyName,
  units,
  selectedUnitId,
  onSelectUnit,
}: {
  propertyName: string;
  units: UnitDashboard[];
  selectedUnitId: string;
  onSelectUnit: (unitId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<GridFilter>("all");
  const occupiedCount = units.filter((unit) => unit.tenantId).length;
  const vacantCount = units.length - occupiedCount;
  const lateCount = units.filter((unit) => unit.paymentStatus === "late").length;
  const maintenanceCount = units.reduce((sum, unit) => sum + unit.openTickets.length, 0);
  const filteredUnits = useMemo(
    () =>
      units
        .filter((unit) => {
          if (activeFilter === "occupied") return Boolean(unit.tenantId);
          if (activeFilter === "vacant") return !unit.tenantId;
          if (activeFilter === "issues") return unit.health === "issue" || unit.openTickets.length > 0;
          if (activeFilter === "late") return unit.paymentStatus === "late";
          return true;
        })
        .sort((a, b) => getUnitSortNumber(a) - getUnitSortNumber(b)),
    [activeFilter, units],
  );

  return (
    <section className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Jumeau numérique</p>
          <h3 className="mt-1 truncate text-xl font-semibold text-[var(--foreground)]">{propertyName}</h3>
        </div>
        <span className="self-start rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {units.length} logements actifs
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Occupés" value={occupiedCount.toString()} />
        <SummaryMetric label="Vacants" value={vacantCount.toString()} />
        <SummaryMetric label="En retard" value={lateCount.toString()} />
        <SummaryMetric label="Entretien" value={maintenanceCount.toString()} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {gridFilters.map((filter) => (
          <button
            key={filter.value}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              activeFilter === filter.value
                ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[color:var(--accent)] hover:text-[var(--foreground)]"
            }`}
            onClick={() => setActiveFilter(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filteredUnits.map((unit) => (
          <GridUnitCard
            key={unit.id}
            unit={unit}
            selected={selectedUnitId === unit.id}
            onSelectUnit={onSelectUnit}
          />
        ))}
        {filteredUnits.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)] lg:col-span-2">
            Aucun logement ne correspond à ce filtre.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function GridUnitCard({
  unit,
  selected,
  onSelectUnit,
}: {
  unit: UnitDashboard;
  selected: boolean;
  onSelectUnit: (unitId: string) => void;
}) {
  const vacant = !unit.tenantId;
  const health = vacant
    ? {
        label: "Vacant",
        dot: "bg-slate-500",
        badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
      }
    : healthCopy[unit.health];
  const alertCount = unit.openTickets.length + (unit.paymentStatus === "late" ? 1 : 0);

  return (
    <button
      type="button"
      onClick={() => onSelectUnit(unit.id)}
      className={`group grid min-h-[164px] w-full min-w-0 grid-rows-[auto_1fr_auto_auto] gap-3 rounded-lg border p-4 text-left transition ${
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
          : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[color:var(--accent)]/70 hover:bg-[var(--surface-3)]"
      }`}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold leading-5 text-[var(--foreground)] group-hover:text-[color:var(--accent)]">{unit.label}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${health.dot}`} />
      </div>
      <p className="min-w-0 break-words text-sm leading-5 text-[var(--muted)]">{getTenantName(unit)}</p>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-2">
        <span className="min-w-0 whitespace-nowrap text-xs font-semibold text-[var(--foreground)]">{currency.format(unit.monthlyRent)}/mois</span>
        <span className={`min-w-0 max-w-full rounded-full border px-2 py-1 text-center text-[11px] font-semibold leading-tight [overflow-wrap:anywhere] ${health.badge}`}>{health.label}</span>
      </div>
      {alertCount > 0 ? (
        <p className="rounded-md border border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--yellow)]">
          {alertCount} alerte{alertCount > 1 ? "s" : ""}
        </p>
      ) : null}
    </button>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function getUnitSortNumber(unit: UnitDashboard) {
  const labelNumber = unit.label.match(/\d+/)?.[0];

  if (labelNumber) {
    return Number(labelNumber);
  }

  return unit.floorIndex;
}

function ApartmentOverlayCard({
  unit,
  selected,
  onSelectUnit,
}: {
  unit: UnitDashboard;
  selected: boolean;
  onSelectUnit: (unitId: string) => void;
}) {
  const health = healthCopy[unit.health];
  const alertCount = unit.openTickets.length;

  return (
    <button
      type="button"
      onClick={() => onSelectUnit(unit.id)}
      className={`group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border p-2 text-left shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition duration-150 sm:p-2.5 ${
        selected
          ? "border-[color:var(--accent)] bg-white text-slate-950"
          : "border-slate-200 bg-white/95 text-slate-950 hover:border-[color:var(--accent)]/60 hover:bg-white"
      }`}
    >
      <div className={`absolute inset-y-2 left-0 w-1 rounded-r-full sm:inset-y-2.5 ${health.rail}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold leading-tight sm:text-[13px]">{unit.label}</p>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none ${health.badge}`}>
              {health.label}
            </span>
            {alertCount > 0 ? (
              <span className="rounded border border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 px-1.5 py-0.5 text-[9px] font-bold leading-none text-[color:var(--yellow)]">
                {alertCount}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[9px] font-semibold uppercase text-slate-500 sm:text-[10px]">{unit.floor}</p>
        </div>
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${health.dot}`} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pt-1.5 text-[10px] font-semibold sm:pt-2 sm:text-[11px]">
        <span>{getTenantName(unit)}</span>
        <span>{currency.format(unit.monthlyRent)}/mois</span>
      </div>

    </button>
  );
}

function getTenantName(unit: UnitDashboard) {
  if (unit.tenant) {
    return unit.tenant.fullName?.trim() || `${unit.tenant.firstName} ${unit.tenant.lastName}`.trim();
  }

  return unit.tenantId ? "Locataire introuvable" : "Vacant";
}
