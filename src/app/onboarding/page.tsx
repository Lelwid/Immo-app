"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ONBOARDING_KEY } from "@/components/OnboardingGate";
import { resetDemoData, saveLocalStore } from "@/lib/local-storage";
import type { Lease, LocalStore, PaymentStatus, Property, PropertyDocument, RentPaymentStatus, Tenant, Unit } from "@/lib/types";
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
  tenantName: string;
  rent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: PaymentStatus;
};

type OnboardingDocumentSelection = {
  bail: boolean;
  assurance: boolean;
  inspection: boolean;
  facture: boolean;
  autre: boolean;
};

const steps = ["Bienvenue", "Immeuble", "Locataires", "Documents", "Terminer"];

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
  const [selectedDocuments, setSelectedDocuments] = useState({
    bail: true,
    assurance: false,
    inspection: false,
    facture: false,
    autre: false,
  });
  const progress = Math.round(((step + 1) / steps.length) * 100);

  const canContinue = useMemo(() => {
    if (step === 1) {
      return propertyForm.name.trim() && propertyForm.address.trim();
    }

    return true;
  }, [propertyForm.address, propertyForm.name, step]);

  function updatePropertyType(propertyType: PropertyType) {
    const nextUnitCount = unitCounts[propertyType];
    setPropertyForm({ ...propertyForm, propertyType, unitCount: nextUnitCount });
    setTenantSetups((current) => resizeTenantSetups(current, nextUnitCount));
  }

  function updateUnitCount(unitCount: number) {
    const nextUnitCount = Math.max(5, unitCount);
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
    resetDemoData();
    window.localStorage.setItem(ONBOARDING_KEY, "demo");
    router.replace("/dashboard");
  }

  function skipOnboarding() {
    window.localStorage.setItem(ONBOARDING_KEY, "skipped");
    router.replace("/dashboard");
  }

  function finishOnboarding() {
    saveLocalStore(createOnboardingStore(propertyForm, tenantSetups, selectedDocuments));
    window.localStorage.setItem(ONBOARDING_KEY, "completed");
    router.replace("/dashboard");
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
          {step === 3 ? <DocumentsStep selected={selectedDocuments} onChange={setSelectedDocuments} /> : null}
          {step === 4 ? <FinishStep propertyName={propertyForm.name || "Votre immeuble"} unitCount={unitCount} /> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:justify-between">
            <button className="btn-secondary" disabled={step === 0} onClick={previousStep} type="button">
              Retour
            </button>
            {step < steps.length - 1 ? (
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canContinue} onClick={nextStep} type="button">
                Continuer
              </button>
            ) : (
              <button className="btn-primary" onClick={finishOnboarding} type="button">
                Terminer et ouvrir le tableau de bord
              </button>
            )}
          </div>
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
            onChange={(unitCount) => onUnitCountChange(Math.max(5, Number(unitCount) || 5))}
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

  return (
    <div>
      <h2 className="text-2xl font-semibold">Ajouter les locataires</h2>
      <div className="mt-4 grid gap-4">
        {setups.map((setup, index) => (
          <div key={index} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <h3 className="font-semibold text-[var(--foreground)]">Logement {index + 1}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <TextInput label="Nom du locataire" value={setup.tenantName} onChange={(tenantName) => update(index, { ...setup, tenantName })} />
              <TextInput label="Loyer" type="number" value={setup.rent.toString()} onChange={(rent) => update(index, { ...setup, rent: Number(rent) })} />
              <TextInput label="Début du bail" type="date" value={setup.leaseStartDate} onChange={(leaseStartDate) => update(index, { ...setup, leaseStartDate })} />
              <TextInput label="Fin du bail" type="date" value={setup.leaseEndDate} onChange={(leaseEndDate) => update(index, { ...setup, leaseEndDate })} />
              <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                Statut paiement
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                  value={setup.paymentStatus}
                  onChange={(event) => update(index, { ...setup, paymentStatus: event.target.value as PaymentStatus })}
                >
                  <option value="paid">Payé</option>
                  <option value="dueSoon">Dû bientôt</option>
                  <option value="late">En retard</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsStep({
  onChange,
  selected,
}: {
  onChange: (selected: OnboardingDocumentSelection) => void;
  selected: OnboardingDocumentSelection;
}) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Importer des documents</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Cette étape prépare seulement les dossiers. Vous pourrez téléverser les fichiers réels plus tard.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["bail", "Bail"],
          ["assurance", "Assurance"],
          ["inspection", "Inspection"],
          ["facture", "Facture"],
          ["autre", "Autre"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm font-semibold text-[var(--foreground)]">
            <input
              checked={selected[key as keyof typeof selected]}
              onChange={(event) => onChange({ ...selected, [key]: event.target.checked })}
              type="checkbox"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function FinishStep({ propertyName, unitCount }: { propertyName: string; unitCount: number }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Votre portefeuille est prêt</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {propertyName} sera créé avec {unitCount} logement{unitCount > 1 ? "s" : ""}. Vous pourrez ajuster les paiements, documents et tâches depuis le tableau de bord.
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
  return Array.from({ length: count }, () => ({
    tenantName: "",
    rent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    paymentStatus: "paid" as PaymentStatus,
  }));
}

function resizeTenantSetups(current: TenantSetup[], count: number) {
  const next = [...current];

  while (next.length < count) {
    next.push(createTenantSetups(1)[0]);
  }

  return next.slice(0, count);
}

function createOnboardingStore(
  propertyForm: PropertyForm,
  tenantSetups: TenantSetup[],
  selectedDocuments: OnboardingDocumentSelection,
): LocalStore {
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

    if (!fullName) {
      return [];
    }

    const [firstName, ...lastNameParts] = fullName.split(" ");
    const tenant: Tenant = {
      id: createId("tenant"),
      fullName,
      firstName,
      lastName: lastNameParts.join(" ") || "",
      email: "",
      phone: "",
      notes: "",
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
  const documents = createOnboardingDocuments(propertyId, units, selectedDocuments, now);
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
    documents,
    payments: leases.map((lease) => ({
      id: createId("payment"),
      propertyId,
      unitId: lease.unitId,
      leaseId: lease.id,
      tenantId: lease.tenantId,
      month: lease.startDate.slice(0, 7),
      dueDate: lease.startDate,
      amountDue: lease.monthlyRent,
      amountPaid: lease.paymentStatus === "payé" ? lease.monthlyRent : 0,
      status: lease.paymentStatus,
      paidAt: lease.paymentStatus === "payé" ? lease.startDate : "",
      paymentType: "loyer",
      notes: "Créé depuis l’assistant d’accueil.",
    })),
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

    if (!tenant || !setup) {
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
      notes: "",
      createdAt: now,
      updatedAt: now,
    }];
  });
}

function toRentPaymentStatus(status: PaymentStatus): RentPaymentStatus {
  if (status === "paid") {
    return "payé";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

function createOnboardingDocuments(
  propertyId: string,
  units: Unit[],
  selectedDocuments: OnboardingDocumentSelection,
  now: string,
): PropertyDocument[] {
  const documents: PropertyDocument[] = [];
  const firstUnit = units[0];

  if (!firstUnit) {
    return documents;
  }

  Object.entries(selectedDocuments).forEach(([type, selected]) => {
    if (!selected) {
      return;
    }

    documents.push({
      id: createId("document"),
      name: `Dossier ${type}`,
      type: type as PropertyDocument["type"],
      propertyId,
      unitId: firstUnit.id,
      uploadDate: now.slice(0, 10),
      uploadedAt: now,
      relatedEntityType: type === "bail" ? "bail" : "immeuble",
      relatedEntityId: type === "bail" ? firstUnit.id : propertyId,
    });
  });

  return documents;
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
