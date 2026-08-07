"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { getDataMode, setDataMode } from "@/lib/data/dataMode";
import { assignTenantToUnit } from "@/lib/data/leaseAssignmentService";
import { createInitialPayment, getTodayIsoDate, type InitialPaymentStatus } from "@/lib/data/paymentSideEffectsService";
import { clearPortfolioSnapshotCache, refreshSnapshot } from "@/lib/data/portfolioSnapshotService";
import { createProperty } from "@/lib/data/propertiesService";
import { createUnitsForProperty } from "@/lib/data/unitsService";
import { resetDemoData, saveLocalStore } from "@/lib/local-storage";
import { ONBOARDING_KEY, ONBOARDING_TRANSITION_KEY } from "@/lib/onboardingDecision";
import type { Lease, LocalStore, Property, RentPaymentStatus, Tenant, Unit } from "@/lib/types";
import { createId } from "@/lib/useLocalStore";

type PropertyType = Property["propertyType"];

type PropertyForm = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  propertyType: PropertyType;
  unitCount: number;
};

type TenantSetup = {
  occupancy: "occupied" | "vacant";
  tenantName: string;
  email: string;
  phone: string;
  rent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: InitialPaymentStatus;
  initialAmountPaid: number;
  paymentReceivedDate: string;
  notes: string;
};

type OnboardingStatus = "idle" | "saving" | "verifying" | "completed" | "error";

const steps = ["Bienvenue", "Immeuble", "Locataires", "Terminer"];

const propertyTypeLabels: Record<PropertyType, string> = {
  condo: "Condo",
  duplex: "Duplex",
  triplex: "Triplex",
  quadruplex: "Quadruplex",
  immeuble: "Immeuble",
};

const unitCounts: Record<PropertyType, number> = {
  condo: 1,
  duplex: 2,
  triplex: 3,
  quadruplex: 4,
  immeuble: 5,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [propertyForm, setPropertyForm] = useState<PropertyForm>({
    name: "",
    address: "",
    city: "Québec",
    postalCode: "",
    propertyType: "triplex",
    unitCount: 3,
  });
  const unitCount = getSelectedUnitCount(propertyForm);
  const [tenantSetups, setTenantSetups] = useState<TenantSetup[]>(() => createTenantSetups(3));
  const [isSaving, setIsSaving] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const completionInFlightRef = useRef(false);
  const progress = Math.round(((step + 1) / steps.length) * 100);

  const canContinue = useMemo(() => {
    if (step === 1) {
      return propertyForm.name.trim() && propertyForm.address.trim();
    }

    if (step === 2) {
      return tenantSetups.every(isTenantSetupValid);
    }

    return true;
  }, [propertyForm.address, propertyForm.name, step, tenantSetups]);

  function updatePropertyType(propertyType: PropertyType) {
    const nextUnitCount = unitCounts[propertyType];
    setPropertyForm({ ...propertyForm, propertyType, unitCount: nextUnitCount });
    setTenantSetups((current) => resizeTenantSetups(current, nextUnitCount));
  }

  function updateUnitCount(unitCountValue: number) {
    const nextUnitCount = Math.max(5, unitCountValue);
    setPropertyForm({ ...propertyForm, unitCount: nextUnitCount });
    setTenantSetups((current) => resizeTenantSetups(current, nextUnitCount));
  }

  function nextStep() {
    if (!canContinue) {
      return;
    }

    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function previousStep() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function useDemoData() {
    setDataMode("local");
    resetDemoData();
    window.localStorage.setItem(ONBOARDING_KEY, "demo");
    clearPortfolioSnapshotCache();
    router.replace("/dashboard");
  }

  function skipOnboarding() {
    if (getDataMode() === "supabase") {
      setSaveError("Ajoutez un premier immeuble pour activer votre portefeuille Supabase.");
      return;
    }

    window.localStorage.setItem(ONBOARDING_KEY, "skipped");
    router.replace("/dashboard");
  }

  async function finishOnboarding() {
    if (isSaving || completionInFlightRef.current) {
      return;
    }

    const runId = createOnboardingRunId();
    let didRedirect = false;
    completionInFlightRef.current = true;
    setIsSaving(true);
    setOnboardingStatus("saving");
    setSaveError(null);
    debugOnboarding(runId, "submit-started", { dataMode: getDataMode() });

    try {
      const dataMode = getDataMode();

      if (dataMode === "supabase") {
        setOnboardingTransition(runId, "saving");
        await finishSupabaseOnboarding(propertyForm, tenantSetups, runId);
        setOnboardingStatus("verifying");
        setOnboardingTransition(runId, "verifying");
        clearPortfolioSnapshotCache();
        debugOnboarding(runId, "cache-cleared");

        const verifiedSnapshot = await refreshSnapshot();
        const propertyCount = verifiedSnapshot.properties.length;
        debugOnboarding(runId, "forced-snapshot-loaded", { propertyCount });

        if (propertyCount === 0) {
          clearOnboardingTransition(runId, "empty-forced-snapshot");
          setOnboardingStatus("error");
          setSaveError("La configuration a été enregistrée, mais le portefeuille n’a pas pu être rechargé.");
          return;
        }

        setOnboardingStatus("completed");
        setOnboardingTransition(runId, "completed");
      } else {
        saveLocalStore(createOnboardingStore(propertyForm, tenantSetups));
        clearPortfolioSnapshotCache();
        window.localStorage.setItem(ONBOARDING_KEY, "completed");
        setOnboardingStatus("completed");
      }

      debugOnboarding(runId, "redirect-dashboard");
      didRedirect = true;
      router.replace("/dashboard");
    } catch (error) {
      console.error("Impossible de terminer l'accueil.", error);
      clearOnboardingTransition(runId, "completion-error");
      setOnboardingStatus("error");
      setSaveError("Impossible de créer votre portefeuille. Réessayez dans quelques instants.");
    } finally {
      if (!didRedirect) {
        completionInFlightRef.current = false;
        setIsSaving(false);
      }
    }
  }

  async function retrySupabaseVerification() {
    if (completionInFlightRef.current) {
      return;
    }

    const runId = createOnboardingRunId();
    completionInFlightRef.current = true;
    setIsSaving(true);
    setOnboardingStatus("verifying");
    setSaveError(null);
    setOnboardingTransition(runId, "verifying");

    try {
      clearPortfolioSnapshotCache();
      const verifiedSnapshot = await refreshSnapshot();
      const propertyCount = verifiedSnapshot.properties.length;
      debugOnboarding(runId, "retry-forced-snapshot-loaded", { propertyCount });

      if (propertyCount === 0) {
        clearOnboardingTransition(runId, "retry-empty-forced-snapshot");
        setOnboardingStatus("error");
        setSaveError("La configuration a été enregistrée, mais le portefeuille n’a pas pu être rechargé.");
        return;
      }

      setOnboardingStatus("completed");
      setOnboardingTransition(runId, "completed");
      router.replace("/dashboard");
    } catch (error) {
      console.error("Impossible de vérifier le portefeuille.", error);
      clearOnboardingTransition(runId, "retry-error");
      setOnboardingStatus("error");
      setSaveError("Impossible de vérifier votre portefeuille. Réessayez dans quelques instants.");
    } finally {
      completionInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">Configuration initiale</p>
              <h1 className="mt-1 text-3xl font-semibold">Bienvenue dans Gestionnaire Immo</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Configurez rapidement vos immeubles, locataires, baux, paiements et entretiens pour démarrer avec une base claire.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={skipOnboarding} type="button">
                Passer
              </button>
              <button className="btn-secondary" onClick={useDemoData} type="button">
                Utiliser les données démo
              </button>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>{steps[step]}</span>
              <span>{progress} %</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[var(--surface-3)]">
              <div className="h-2 rounded-full bg-[color:var(--accent)] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          {step === 0 ? <WelcomeStep /> : null}
          {step === 1 ? (
            <PropertyStep
              form={propertyForm}
              onChange={setPropertyForm}
              onTypeChange={updatePropertyType}
              onUnitCountChange={updateUnitCount}
              unitCount={unitCount}
            />
          ) : null}
          {step === 2 ? <TenantsStep setups={tenantSetups} onChange={setTenantSetups} /> : null}
          {step === 3 ? <FinishStep propertyName={propertyForm.name || "Votre immeuble"} setups={tenantSetups} unitCount={unitCount} /> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:justify-between">
            <button className="btn-secondary" disabled={step === 0} onClick={previousStep} type="button">
              Retour
            </button>
            {step < steps.length - 1 ? (
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canContinue} onClick={nextStep} type="button">
                Continuer
              </button>
            ) : (
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving} onClick={finishOnboarding} type="button">
                {onboardingStatus === "verifying"
                  ? "Vérification du portefeuille..."
                  : isSaving
                    ? "Création du portefeuille..."
                    : "Terminer et ouvrir le tableau de bord"}
              </button>
            )}
          </div>
          {onboardingStatus === "saving" || onboardingStatus === "verifying" ? (
            <p className="mt-4 text-sm font-semibold text-[var(--muted)]">
              {onboardingStatus === "saving" ? "Création de votre portefeuille..." : "Rechargement du portefeuille..."}
            </p>
          ) : null}
          {saveError ? <p className="mt-4 text-sm font-semibold text-[color:var(--red)]">{saveError}</p> : null}
          {saveError && getDataMode() === "supabase" ? (
            <button className="btn-secondary mt-3" disabled={isSaving} onClick={retrySupabaseVerification} type="button">
              Réessayer la vérification
            </button>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function WelcomeStep() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Bienvenue dans Gestionnaire Immo</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
        L’application vous aide à gérer vos immeubles, locataires, baux, paiements, documents et demandes d’entretien depuis un seul tableau de bord.
      </p>
    </div>
  );
}

function PropertyStep({
  form,
  onChange,
  onTypeChange,
  onUnitCountChange,
  unitCount,
}: {
  form: PropertyForm;
  onChange: (form: PropertyForm) => void;
  onTypeChange: (type: PropertyType) => void;
  onUnitCountChange: (unitCount: number) => void;
  unitCount: number;
}) {
  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-semibold">Ajouter votre premier immeuble</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Nom de l’immeuble" value={form.name} onChange={(name) => onChange({ ...form, name })} />
        <TextInput label="Adresse" value={form.address} onChange={(address) => onChange({ ...form, address })} />
        <TextInput label="Ville" value={form.city} onChange={(city) => onChange({ ...form, city })} />
        <TextInput label="Code postal" value={form.postalCode} onChange={(postalCode) => onChange({ ...form, postalCode })} />
        <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
          Type
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
            value={form.propertyType}
            onChange={(event) => onTypeChange(event.target.value as PropertyType)}
          >
            {Object.entries(propertyTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {form.propertyType === "immeuble" ? (
          <TextInput
            label="Nombre de logements"
            min={5}
            type="number"
            value={form.unitCount.toString()}
            onChange={(nextUnitCount) => onUnitCountChange(Math.max(5, Number(nextUnitCount) || 5))}
          />
        ) : null}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Logements générés automatiquement</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{unitCount}</p>
        </div>
      </div>
    </div>
  );
}

function TenantsStep({ onChange, setups }: { onChange: (setups: TenantSetup[]) => void; setups: TenantSetup[] }) {
  function update(index: number, nextSetup: TenantSetup) {
    onChange(setups.map((setup, setupIndex) => (setupIndex === index ? nextSetup : setup)));
  }

  function updateOccupancy(index: number, occupancy: TenantSetup["occupancy"]) {
    const current = setups[index];
    const nextSetup =
      occupancy === "vacant"
        ? createTenantSetup("vacant")
        : {
            ...current,
            occupancy,
            paymentReceivedDate: current.paymentStatus === "paid" || current.paymentStatus === "partial" ? current.paymentReceivedDate || getTodayIsoDate() : "",
          };
    update(index, nextSetup);
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold">Ajouter les locataires</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Indiquez si chaque logement est occupé ou vacant. Les logements vacants seront créés sans locataire ni bail.
      </p>
      <div className="mt-4 grid gap-4">
        {setups.map((setup, index) => (
          <div key={index} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">Logement {index + 1}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {setup.occupancy === "occupied" ? "Locataire et bail à configurer" : "Aucun locataire assigné"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
                {([
                  ["occupied", "Occupé"],
                  ["vacant", "Vacant"],
                ] as Array<[TenantSetup["occupancy"], string]>).map(([value, label]) => {
                  const selected = setup.occupancy === value;

                  return (
                    <button
                      key={value}
                      aria-pressed={selected}
                      className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                        selected ? "bg-[color:var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]"
                      }`}
                      onClick={() => updateOccupancy(index, value)}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {setup.occupancy === "vacant" ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
                Ce logement sera ajouté comme vacant. Vous pourrez lui assigner un locataire plus tard.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <TextInput label="Nom du locataire" value={setup.tenantName} onChange={(tenantName) => update(index, { ...setup, tenantName })} />
                <TextInput label="Courriel" type="email" value={setup.email} onChange={(email) => update(index, { ...setup, email })} />
                <TextInput label="Téléphone" type="tel" value={setup.phone} onChange={(phone) => update(index, { ...setup, phone })} />
                <TextInput label="Loyer" min={0} type="number" value={setup.rent.toString()} onChange={(rent) => update(index, { ...setup, rent: Number(rent) })} />
                <TextInput label="Début du bail" type="date" value={setup.leaseStartDate} onChange={(leaseStartDate) => update(index, { ...setup, leaseStartDate })} />
                <TextInput label="Fin du bail" type="date" value={setup.leaseEndDate} onChange={(leaseEndDate) => update(index, { ...setup, leaseEndDate })} />
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                  Statut paiement
                  <select
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                    value={setup.paymentStatus}
                    onChange={(event) => update(index, updateTenantSetupPaymentStatus(setup, event.target.value as InitialPaymentStatus))}
                  >
                    <option value="paid">Payé</option>
                    <option value="partial">Partiel</option>
                    <option value="dueSoon">Dû bientôt</option>
                    <option value="late">En retard</option>
                  </select>
                </label>
                {setup.paymentStatus === "partial" ? (
                  <TextInput
                    label="Montant reçu"
                    min={0}
                    type="number"
                    value={setup.initialAmountPaid.toString()}
                    onChange={(initialAmountPaid) => update(index, { ...setup, initialAmountPaid: Number(initialAmountPaid) })}
                  />
                ) : null}
                {setup.paymentStatus === "paid" || setup.paymentStatus === "partial" ? (
                  <TextInput
                    label="Date de réception du paiement"
                    type="date"
                    value={setup.paymentReceivedDate}
                    onChange={(paymentReceivedDate) => update(index, { ...setup, paymentReceivedDate })}
                  />
                ) : null}
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)] md:col-span-2">
                  Notes optionnelles
                  <textarea
                    className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                    value={setup.notes}
                    onChange={(event) => update(index, { ...setup, notes: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinishStep({ propertyName, setups, unitCount }: { propertyName: string; setups: TenantSetup[]; unitCount: number }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Votre portefeuille est prêt</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {propertyName} sera créé avec {unitCount} logement{unitCount > 1 ? "s" : ""}. Vous pourrez ajuster les paiements, documents et tâches depuis le tableau de bord.
      </p>
      <div className="mt-5 grid gap-3">
        {setups.map((setup, index) => {
          const occupied = isTenantSetupOccupied(setup);

          return (
            <div key={index} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[var(--foreground)]">Logement {index + 1}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${occupied ? "bg-[rgba(34,197,94,0.14)] text-[color:var(--green)]" : "bg-[var(--surface-3)] text-[var(--muted)]"}`}>
                    {occupied ? "Occupé" : "Vacant"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{occupied ? setup.tenantName.trim() : "Aucun locataire assigné"}</p>
              </div>
              {occupied ? <p className="text-sm font-semibold text-[var(--foreground)]">{formatCurrency(setup.rent)} / mois</p> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--muted)]">
        Votre portefeuille est prêt. Vous pourrez ajouter vos baux, assurances, inspections et factures depuis chaque immeuble ou dans la bibliothèque de documents.
      </p>
    </div>
  );
}

function TextInput({
  label,
  min,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  min?: number;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        min={min}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function getSelectedUnitCount(propertyForm: PropertyForm) {
  return propertyForm.propertyType === "immeuble" ? Math.max(5, propertyForm.unitCount) : unitCounts[propertyForm.propertyType];
}

function createTenantSetups(count: number) {
  return Array.from({ length: count }, () => createTenantSetup("vacant"));
}

function createTenantSetup(occupancy: TenantSetup["occupancy"]): TenantSetup {
  return {
    occupancy,
    tenantName: "",
    email: "",
    phone: "",
    rent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    paymentStatus: "paid",
    initialAmountPaid: 0,
    paymentReceivedDate: occupancy === "occupied" ? getTodayIsoDate() : "",
    notes: "",
  };
}

function isTenantSetupOccupied(setup: TenantSetup) {
  return setup.occupancy === "occupied";
}

function isTenantSetupValid(setup: TenantSetup) {
  if (!isTenantSetupOccupied(setup)) {
    return true;
  }

  return Boolean(
    setup.tenantName.trim() &&
      setup.rent > 0 &&
      setup.leaseStartDate &&
      setup.leaseEndDate &&
      (setup.paymentStatus !== "paid" && setup.paymentStatus !== "partial" || isPaymentReceivedDateValid(setup.paymentReceivedDate)) &&
      (setup.paymentStatus !== "partial" || isPartialPaymentAmountValid(setup.initialAmountPaid, setup.rent)),
  );
}

function updateTenantSetupPaymentStatus(setup: TenantSetup, paymentStatus: InitialPaymentStatus): TenantSetup {
  return {
    ...setup,
    paymentStatus,
    initialAmountPaid: paymentStatus === "partial" ? setup.initialAmountPaid : 0,
    paymentReceivedDate: paymentStatus === "paid" || paymentStatus === "partial" ? setup.paymentReceivedDate || getTodayIsoDate() : "",
  };
}

function isPaymentReceivedDateValid(paymentReceivedDate: string) {
  return Boolean(paymentReceivedDate) && paymentReceivedDate <= getTodayIsoDate();
}

function isPartialPaymentAmountValid(initialAmountPaid: number, rent: number) {
  return initialAmountPaid > 0 && initialAmountPaid < rent;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function resizeTenantSetups(current: TenantSetup[], count: number) {
  const next = [...current];

  while (next.length < count) {
    next.push(createTenantSetups(1)[0]);
  }

  return next.slice(0, count);
}

function createOnboardingRunId() {
  return `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setOnboardingTransition(runId: string, status: OnboardingStatus) {
  window.sessionStorage.setItem(ONBOARDING_TRANSITION_KEY, JSON.stringify({ runId, status, startedAt: new Date().toISOString() }));
  debugOnboarding(runId, "transition-set", { status });
}

function clearOnboardingTransition(runId: string, reason: string) {
  window.sessionStorage.removeItem(ONBOARDING_TRANSITION_KEY);
  debugOnboarding(runId, "transition-cleared", { reason });
}

function debugOnboarding(runId: string, event: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[onboarding]", { runId, event, ...details });
}

async function finishSupabaseOnboarding(propertyForm: PropertyForm, tenantSetups: TenantSetup[], runId: string) {
  const property = await createProperty({
    name: propertyForm.name.trim() || "Mon premier immeuble",
    address: propertyForm.address.trim(),
    city: propertyForm.city.trim() || "Québec",
    postalCode: propertyForm.postalCode.trim(),
    propertyType: propertyForm.propertyType,
  });
  debugOnboarding(runId, "property-created", { propertyId: property.id });
  const units = await createUnitsForProperty(property.id, property.propertyType, getSelectedUnitCount(propertyForm));
  debugOnboarding(runId, "units-created", { unitCount: units.length });
  let onboardingStore: LocalStore = {
    properties: [property],
    units,
    tenants: [],
    leases: [],
    maintenanceTickets: [],
    activities: [],
    documents: [],
    payments: [],
    rentCharges: [],
    paymentTransactions: [],
    paymentAllocations: [],
    notes: [],
    tasks: [],
  };

  for (const [index, setup] of tenantSetups.entries()) {
    const unit = units[index];
    const fullName = setup.tenantName.trim();

    if (!unit || !isTenantSetupOccupied(setup) || !fullName) {
      continue;
    }

    onboardingStore = await assignTenantToUnit(onboardingStore, {
      propertyId: property.id,
      unitId: unit.id,
      fullName,
      email: setup.email,
      phone: setup.phone,
      monthlyRent: setup.rent,
      leaseStartDate: setup.leaseStartDate,
      leaseEndDate: setup.leaseEndDate,
      paymentStatus: setup.paymentStatus,
      initialAmountPaid: setup.initialAmountPaid,
      paymentReceivedDate: setup.paymentReceivedDate,
      notes: setup.notes,
    });
    debugOnboarding(runId, "tenant-lease-created", { unitId: unit.id });
  }
}

function createOnboardingStore(propertyForm: PropertyForm, tenantSetups: TenantSetup[]): LocalStore {
  const now = new Date().toISOString();
  const propertyId = createId("property");
  const property: Property = {
    id: propertyId,
    name: propertyForm.name.trim() || "Mon premier immeuble",
    address: propertyForm.address.trim(),
    city: propertyForm.city.trim() || "Québec",
    province: "QC",
    postalCode: propertyForm.postalCode.trim(),
    propertyType: propertyForm.propertyType,
  };
  const tenantByUnitIndex = new Map<number, Tenant>();
  const tenants: Tenant[] = tenantSetups.flatMap((setup, index) => {
    const fullName = setup.tenantName.trim();

    if (!isTenantSetupOccupied(setup) || !fullName) {
      return [];
    }

    const [firstName, ...lastNameParts] = fullName.split(" ");
    const tenant: Tenant = {
      id: createId("tenant"),
      fullName,
      firstName,
      lastName: lastNameParts.join(" ") || "",
      email: setup.email.trim(),
      phone: setup.phone.trim(),
      notes: setup.notes.trim(),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    tenantByUnitIndex.set(index, tenant);
    return [tenant];
  });
  const units: Unit[] = tenantSetups.map((_, index) => ({
    id: createId("unit"),
    propertyId,
    label: `Logement ${index + 1}`,
    floor: getFloorLabel(property.propertyType, index),
    floorIndex: index + 1,
    monthlyRent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    tenantId: null,
    paymentStatus: "paid",
    notes: "",
  }));
  const leases = createOnboardingLeases(units, tenantSetups, tenantByUnitIndex, now);

  return {
    properties: [property],
    units,
    tenants,
    leases,
    maintenanceTickets: [],
    activities: [
      {
        id: createId("activity"),
        propertyId,
        type: "immeuble",
        title: "Portefeuille configuré",
        description: `${property.name} a été créé avec l’assistant d’accueil.`,
        date: now.slice(0, 10),
        createdAt: now,
      },
    ],
    documents: [],
    payments: leases.map((lease) => {
      const unitIndex = units.findIndex((unit) => unit.id === lease.unitId);
      const setup = tenantSetups[unitIndex];

      return {
        ...createInitialPayment({
          propertyId,
          unitId: lease.unitId,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          leaseStartDate: lease.startDate,
          rent: lease.monthlyRent,
          paymentStatus: setup?.paymentStatus ?? "dueSoon",
          initialAmountPaid: setup?.initialAmountPaid,
          paymentReceivedDate: setup?.paymentReceivedDate,
        }),
        notes: "Créé depuis l’assistant d’accueil.",
      };
    }),
    rentCharges: [],
    paymentTransactions: [],
    paymentAllocations: [],
    notes: [],
    tasks: [],
  };
}

function createOnboardingLeases(
  units: Unit[],
  tenantSetups: TenantSetup[],
  tenantByUnitIndex: Map<number, Tenant>,
  now: string,
): Lease[] {
  return units.flatMap((unit, index) => {
    const tenant = tenantByUnitIndex.get(index);
    const setup = tenantSetups[index];

    if (!tenant || !setup || !isTenantSetupOccupied(setup)) {
      return [];
    }

    return [{
      id: createId("lease"),
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: setup.leaseStartDate,
      endDate: setup.leaseEndDate,
      monthlyRent: setup.rent,
      paymentStatus: toRentPaymentStatus(setup.paymentStatus),
      status: "active",
      notes: setup.notes.trim(),
      createdAt: now,
      updatedAt: now,
    }];
  });
}

function toRentPaymentStatus(status: InitialPaymentStatus): RentPaymentStatus {
  if (status === "paid") {
    return "payé";
  }

  if (status === "partial") {
    return "partiel";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

function getFloorLabel(propertyType: PropertyType, index: number) {
  if (propertyType === "condo") {
    return "Unité principale";
  }

  if (index === 0) {
    return "Rez-de-chaussée";
  }

  return `${index + 1}e étage`;
}
