"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createManualNormalizedAddress, type NormalizedAddress } from "@/lib/data/addressService";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { shouldUseSupabase } from "@/lib/data/dataMode";
import { clearPortfolioSnapshotCache } from "@/lib/data/portfolioSnapshotService";
import {
  createProperty,
  deleteProperty as deletePropertyRecord,
  updateProperty,
} from "@/lib/data/propertiesService";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { createUnitsForProperty } from "@/lib/data/unitsService";
import { currency, getPropertyDashboards } from "@/lib/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type { LocalStore, Property, PropertyDashboard, Unit } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type PropertyForm = Omit<Property, "id"> & {
  unitCount: number;
};

const emptyProperty: PropertyForm = {
  name: "",
  address: "",
  city: "Québec",
  province: "QC",
  provinceCode: "QC",
  postalCode: "",
  country: "Canada",
  countryCode: "ca",
  latitude: null,
  longitude: null,
  addressProvider: null,
  addressProviderId: null,
  propertyType: "triplex",
  unitCount: 3,
};

const propertyTypeLabel: Record<Property["propertyType"], string> = {
  condo: "Condo",
  duplex: "Duplex",
  triplex: "Triplex",
  quadruplex: "Quadruplex",
  immeuble: "Immeuble",
};

export default function ImmeublesPage() {
  const router = useRouter();
  const { setStore, resetDemoData } = useLocalStore();
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const [snapshotSyncError, setSnapshotSyncError] = useState<string | null>(null);
  const [propertyRecords, setPropertyRecords] = useState<Property[] | null>(null);
  const [unitRecords, setUnitRecords] = useState<Unit[] | null>(null);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const propertySaveInFlightRef = useRef(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const snapshotStore = data ?? emptyPortfolioStore;
  const displayStore = useMemo(
    () => ({
      ...snapshotStore,
      properties: propertyRecords ?? snapshotStore.properties,
      units: unitRecords ?? snapshotStore.units,
    }),
    [propertyRecords, snapshotStore, unitRecords],
  );
  const properties = useMemo(() => getPropertyDashboards(displayStore), [displayStore]);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyForm, setPropertyForm] = useState<PropertyForm>(emptyProperty);
  const [manualAddressMode, setManualAddressMode] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<PropertyDashboard | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);

  async function refreshImmeublesSnapshot() {
    try {
      const nextSnapshot = await refreshSnapshot();
      if (!nextSnapshot) {
        return;
      }
      setPropertyRecords(nextSnapshot.properties);
      setUnitRecords(nextSnapshot.units);
      setSnapshotSyncError(null);
    } catch (error) {
      console.error("Impossible de rafraîchir les immeubles.", error);
      setSnapshotSyncError("Impossible de synchroniser les immeubles.");
    }
  }

  async function submitProperty() {
    if (propertySaveInFlightRef.current || !propertyForm.name.trim() || !propertyForm.address.trim()) {
      return;
    }

    propertySaveInFlightRef.current = true;
    setIsSavingProperty(true);
    setPropertyError(null);

    try {
      if (editingPropertyId) {
        const updatedProperty = await updateProperty(editingPropertyId, toPropertyData(propertyForm));

        setStore((current) => ({
          ...current,
          properties: current.properties.map((property) =>
            property.id === editingPropertyId ? updatedProperty : property,
          ),
        }));

        try {
          const activity = await createActivityRecord({
            propertyId: editingPropertyId,
            type: "immeuble",
            title: "Immeuble modifié",
            description: `L'immeuble ${updatedProperty.name} a été modifié.`,
          });

          setStore((current) => addActivityToStore(current, activity));
        } catch (error) {
          console.error("Impossible de créer l'activité de l'immeuble.", error);
        }
        setPropertyRecords((current) =>
          current ? current.map((property) => (property.id === editingPropertyId ? updatedProperty : property)) : [updatedProperty],
        );
      } else {
        const property = await createProperty(toPropertyData(propertyForm));
        const units = await createUnitsForProperty(property.id, property.propertyType, propertyForm.unitCount);

        setStore((current) => ({
          ...current,
          properties: current.properties.some((candidate) => candidate.id === property.id)
            ? current.properties.map((candidate) => (candidate.id === property.id ? property : candidate))
            : [...current.properties, property],
          units: mergeUnits(current.units, units),
        }));

        try {
          const activity = await createActivityRecord({
            propertyId: property.id,
            type: "immeuble",
            title: "Immeuble créé",
            description: `L'immeuble ${property.name} a été ajouté au portefeuille.`,
          });

          setStore((current) => addActivityToStore(current, activity));
        } catch (error) {
          console.error("Impossible de créer l'activité de l'immeuble.", error);
        }
        setPropertyRecords((current) => (current ? [...current, property] : [property]));
        setUnitRecords((current) => (current ? mergeUnits(current, units) : units));
      }

      await refreshImmeublesSnapshot();
      closePropertyForm();
    } catch (error: unknown) {
      setPropertyError(getErrorMessage(error, editingPropertyId ? "Impossible de modifier l’immeuble." : "Impossible de créer l’immeuble."));
    } finally {
      propertySaveInFlightRef.current = false;
      setIsSavingProperty(false);
    }
  }

  function editProperty(property: Property) {
    setEditingPropertyId(property.id);
    setPropertyForm({
      name: property.name,
      address: property.address,
      addressLine1: property.addressLine1,
      streetNumber: property.streetNumber,
      street: property.street,
      city: property.city,
      district: property.district,
      province: property.province || property.provinceCode || "QC",
      provinceCode: property.provinceCode,
      postalCode: property.postalCode,
      country: property.country || "Canada",
      countryCode: property.countryCode || "ca",
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      addressProvider: property.addressProvider ?? null,
      addressProviderId: property.addressProviderId ?? null,
      propertyType: property.propertyType,
      unitCount: Math.max(5, displayStore.units.filter((unit) => unit.propertyId === property.id).length),
    });
    setManualAddressMode(property.addressProvider === "manual" || !property.addressProvider);
    setShowPropertyForm(true);
  }

  function openCreatePropertyModal() {
    setEditingPropertyId(null);
    setPropertyForm(emptyProperty);
    setManualAddressMode(false);
    setShowPropertyForm(true);
  }

  function closePropertyForm() {
    setEditingPropertyId(null);
    setPropertyForm(emptyProperty);
    setManualAddressMode(false);
    setShowPropertyForm(false);
  }

  function selectAddress(address: NormalizedAddress) {
    setPropertyForm((current) => applyAddressToPropertyForm(current, address));
    setManualAddressMode(false);
  }

  function updateManualAddress(nextForm: PropertyForm) {
    const manualAddress = createManualNormalizedAddress({
      address: nextForm.address,
      city: nextForm.city,
      province: nextForm.province || nextForm.provinceCode || "QC",
      postalCode: nextForm.postalCode,
      country: nextForm.country || "Canada",
    });

    setPropertyForm(applyAddressToPropertyForm(nextForm, manualAddress));
  }

  function openDeleteModal(property: PropertyDashboard) {
    setPropertyToDelete(property);
    setDeleteConfirmation("");
  }

  async function confirmPropertyDelete() {
    if (!propertyToDelete || deleteConfirmation !== propertyToDelete.name) {
      return;
    }

    const propertyId = propertyToDelete.id;

    setIsSavingProperty(true);
    setPropertyError(null);

    try {
      await deletePropertyRecord(propertyId);

      if (!shouldUseSupabase() || !isSupabaseConfigured) {
        setStore((current) => {
          const unitIds = current.units.filter((unit) => unit.propertyId === propertyId).map((unit) => unit.id);
          const propertyLeases = current.leases.filter((lease) => lease.propertyId === propertyId);
          const tenantIds = new Set(propertyLeases.map((lease) => lease.tenantId));
          const tenantsWithOtherLeases = new Set(
            current.leases
              .filter((lease) => lease.propertyId !== propertyId && tenantIds.has(lease.tenantId))
              .map((lease) => lease.tenantId),
          );
          const archivedAt = new Date().toISOString();

          return {
            ...current,
            properties: current.properties.filter((property) => property.id !== propertyId),
            units: current.units.filter((unit) => unit.propertyId !== propertyId),
            tenants: current.tenants.map((tenant) =>
              tenantIds.has(tenant.id) && !tenantsWithOtherLeases.has(tenant.id)
                ? { ...tenant, archivedAt, updatedAt: archivedAt }
                : tenant,
            ),
            leases: current.leases.filter((lease) => lease.propertyId !== propertyId),
            maintenanceTickets: current.maintenanceTickets.filter((ticket) => ticket.propertyId !== propertyId),
            activities: current.activities.filter(
              (activity) => activity.propertyId !== propertyId && (!activity.unitId || !unitIds.includes(activity.unitId)),
            ),
            documents: current.documents.filter((document) => document.propertyId !== propertyId),
            payments: current.payments.filter((payment) => payment.propertyId !== propertyId),
            notes: current.notes.filter((note) => note.propertyId !== propertyId),
            tasks: current.tasks.filter((task) => task.propertyId !== propertyId),
          };
        });
      }
      setPropertyRecords((current) => (current ? current.filter((property) => property.id !== propertyId) : current));
      setUnitRecords((current) => (current ? current.filter((unit) => unit.propertyId !== propertyId) : current));
      await refreshImmeublesSnapshot();

      setPropertyToDelete(null);
      setDeleteConfirmation("");
    } catch (error: unknown) {
      setPropertyError(getErrorMessage(error, "Impossible de supprimer l’immeuble."));
    } finally {
      setIsSavingProperty(false);
    }
  }

  function confirmDemoReset() {
    const nextStore = resetDemoData();
    clearPortfolioSnapshotCache();
    setSnapshotSyncError(null);
    setPropertyRecords(nextStore.properties);
    setUnitRecords(nextStore.units);
    setEditingPropertyId(null);
    setPropertyForm(emptyProperty);
    setShowPropertyForm(false);
    setShowResetModal(false);
  }

  return (
    <RouteShell title="Immeubles" description="Vue d’ensemble de votre portefeuille immobilier.">
      <section className="grid gap-5">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Portefeuille immobilier</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Sélectionnez un immeuble pour consulter ses logements, finances, documents et historique.
            </p>
          </div>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={isSavingProperty || !data} onClick={openCreatePropertyModal} type="button">
            Ajouter un immeuble
          </button>
        </div>

        {propertyError ? (
          <div className="rounded-lg border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 p-4 text-sm font-medium text-[color:var(--red)]">
            {propertyError}
          </div>
        ) : null}
        {snapshotError ? (
          <div className="rounded-lg border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 p-4 text-sm font-medium text-[color:var(--yellow)]">
            {snapshotError}
          </div>
        ) : null}
        {snapshotSyncError ? (
          <div className="rounded-lg border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 p-4 text-sm font-medium text-[color:var(--yellow)]">
            {snapshotSyncError}
          </div>
        ) : null}

        {!data ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
            {snapshotLoading ? "Chargement des immeubles..." : "Impossible de charger les données du portefeuille."}
          </div>
        ) : properties.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard
                key={property.id}
                disabled={isSavingProperty}
                onDelete={() => openDeleteModal(property)}
                onEdit={() => editProperty(property)}
                onOpen={() => router.push(`/immeubles/${property.id}`)}
                property={property}
                store={displayStore}
              />
            ))}
          </div>
        ) : (
          <EmptyPortfolioState disabled={isSavingProperty} onAddProperty={openCreatePropertyModal} onUseDemoData={() => setShowResetModal(true)} />
        )}
      </section>

      {showPropertyForm ? (
        <FormModal title={editingPropertyId ? "Modifier l'immeuble" : "Ajouter un immeuble"} onCancel={closePropertyForm}>
          <div className="grid gap-3">
            <TextInput label="Nom" value={propertyForm.name} onChange={(name) => setPropertyForm({ ...propertyForm, name })} />
            <AddressAutocomplete
              disabled={isSavingProperty}
              manualMode={manualAddressMode}
              onChange={(address) =>
                manualAddressMode
                  ? updateManualAddress({ ...propertyForm, address })
                  : setPropertyForm({ ...propertyForm, address, addressProvider: null, addressProviderId: null })
              }
              onManualModeChange={setManualAddressMode}
              onSelect={selectAddress}
              value={propertyForm.address}
            />
            {manualAddressMode ? (
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput label="Ville" value={propertyForm.city} onChange={(city) => updateManualAddress({ ...propertyForm, city })} />
                <TextInput
                  label="Province"
                  value={propertyForm.province || propertyForm.provinceCode || ""}
                  onChange={(province) => updateManualAddress({ ...propertyForm, province, provinceCode: province })}
                />
                <TextInput label="Code postal" value={propertyForm.postalCode} onChange={(postalCode) => updateManualAddress({ ...propertyForm, postalCode })} />
                <TextInput label="Pays" value={propertyForm.country || "Canada"} onChange={(country) => updateManualAddress({ ...propertyForm, country })} />
              </div>
            ) : (
              <AddressSummary property={propertyForm} />
            )}
            <SelectInput
              label="Type"
              value={propertyForm.propertyType}
              onChange={(propertyType) => {
                const nextType = propertyType as Property["propertyType"];
                setPropertyForm({
                  ...propertyForm,
                  propertyType: nextType,
                  unitCount: getDefaultUnitCount(nextType),
                });
              }}
              options={[
                ["triplex", "Triplex"],
                ["duplex", "Duplex"],
                ["condo", "Condo"],
                ["quadruplex", "Quadruplex"],
                ["immeuble", "Immeuble"],
              ]}
            />
            {!editingPropertyId && propertyForm.propertyType === "immeuble" ? (
              <NumberInput
                label="Nombre de logements"
                min={5}
                value={propertyForm.unitCount}
                onChange={(unitCount) => setPropertyForm({ ...propertyForm, unitCount: Math.max(5, unitCount) })}
              />
            ) : null}
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={isSavingProperty} onClick={closePropertyForm} type="button">
                Annuler
              </button>
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={isSavingProperty} onClick={submitProperty} type="button">
                {isSavingProperty ? "Enregistrement..." : editingPropertyId ? "Enregistrer l'immeuble" : "Créer l'immeuble"}
              </button>
            </div>
          </div>
        </FormModal>
      ) : null}

      {propertyToDelete ? (
        <PropertyDeleteModal
          confirmation={deleteConfirmation}
          onCancel={() => setPropertyToDelete(null)}
          onChangeConfirmation={setDeleteConfirmation}
          onConfirm={confirmPropertyDelete}
          property={propertyToDelete}
          saving={isSavingProperty}
          store={displayStore}
        />
      ) : null}

      {showResetModal ? (
        <ConfirmModal
          title="Utiliser les données démo"
          warning="Cette action va remplacer vos données actuelles par les données démo."
          confirmLabel="Utiliser les données démo"
          onCancel={() => setShowResetModal(false)}
          onConfirm={confirmDemoReset}
        />
      ) : null}
    </RouteShell>
  );
}

function PropertyCard({
  disabled,
  onDelete,
  onEdit,
  onOpen,
  property,
  store,
}: {
  disabled: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  property: PropertyDashboard;
  store: LocalStore;
}) {
  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      aria-label={`Ouvrir l'immeuble: ${property.name}`}
      className="group flex h-full cursor-pointer flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
      onClick={onOpen}
      onKeyDown={handleCardKeyDown}
      role="link"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)] transition group-hover:text-[color:var(--accent)]">{property.name}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            {property.address}, {property.city}
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {propertyTypeLabel[property.propertyType]}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Metric label="Logements" value={formatUnitCount(property.units.length)} />
        <Metric label="Occupation" value={`${getOccupancyRate(property.units, store)} %`} />
        <Metric label="Loyer mensuel" value={currency.format(property.monthlyRent)} />
        <Metric label="Santé" value={`${property.healthScore}/100`} />
        <Metric label="Enjeux ouverts" value={property.openTicketCount.toString()} />
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <span className="mr-auto text-sm font-semibold text-[color:var(--accent)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true">
          Ouvrir →
        </span>
        <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={(event) => { event.stopPropagation(); onEdit(); }} type="button">
          Modifier
        </button>
        <button className="btn-danger disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={(event) => { event.stopPropagation(); onDelete(); }} type="button">
          Supprimer
        </button>
      </div>
    </article>
  );
}

function EmptyPortfolioState({
  disabled,
  onAddProperty,
  onUseDemoData,
}: {
  disabled: boolean;
  onAddProperty: () => void;
  onUseDemoData: () => void;
}) {
  return (
    <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <h2 className="text-2xl font-semibold text-[var(--foreground)]">Aucun immeuble ajouté</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
        Ajoutez votre premier immeuble ou rechargez les données démo pour explorer le portefeuille exemple.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onAddProperty} type="button">
          Ajouter un immeuble
        </button>
        <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onUseDemoData} type="button">
          Utiliser les données démo
        </button>
      </div>
    </section>
  );
}

function toPropertyData(propertyForm: PropertyForm): Omit<Property, "id"> {
  return {
    name: propertyForm.name,
    address: propertyForm.address,
    addressLine1: propertyForm.addressLine1 || propertyForm.address,
    streetNumber: propertyForm.streetNumber,
    street: propertyForm.street,
    city: propertyForm.city,
    district: propertyForm.district,
    province: propertyForm.province || propertyForm.provinceCode || "QC",
    provinceCode: propertyForm.provinceCode,
    postalCode: propertyForm.postalCode,
    country: propertyForm.country,
    countryCode: propertyForm.countryCode,
    latitude: propertyForm.latitude ?? null,
    longitude: propertyForm.longitude ?? null,
    addressProvider: propertyForm.addressProvider,
    addressProviderId: propertyForm.addressProviderId,
    propertyType: propertyForm.propertyType,
  };
}

function applyAddressToPropertyForm(form: PropertyForm, address: NormalizedAddress): PropertyForm {
  return {
    ...form,
    address: address.formattedAddress,
    addressLine1: address.formattedAddress,
    streetNumber: address.streetNumber,
    street: address.street,
    city: address.city || form.city,
    district: address.district,
    province: address.province || address.provinceCode || form.province || "QC",
    provinceCode: address.provinceCode || form.provinceCode || "QC",
    postalCode: address.postalCode,
    country: address.country || "Canada",
    countryCode: address.countryCode || "ca",
    latitude: address.latitude,
    longitude: address.longitude,
    addressProvider: address.provider,
    addressProviderId: address.providerPlaceId,
  };
}

function AddressSummary({ property }: { property: PropertyForm }) {
  if (!property.address || !property.addressProvider) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
      <p className="font-semibold text-[var(--foreground)]">{property.street || property.address}</p>
      <p>
        {[property.city, property.provinceCode || property.province].filter(Boolean).join(", ")}
        {property.postalCode ? ` ${property.postalCode}` : ""}
      </p>
      <p>{property.country || "Canada"}</p>
    </div>
  );
}

function getDefaultUnitCount(propertyType: Property["propertyType"]) {
  const counts: Record<Property["propertyType"], number> = {
    condo: 1,
    duplex: 2,
    triplex: 3,
    quadruplex: 4,
    immeuble: 5,
  };

  return counts[propertyType];
}

function getOccupancyRate(units: Unit[], store: LocalStore) {
  if (units.length === 0) {
    return 0;
  }

  return Math.round((units.filter((unit) => getUnitOccupancy(unit, store.leases, store.tenants).isOccupied).length / units.length) * 100);
}

function formatUnitCount(count: number) {
  return `${count} logement${count > 1 ? "s" : ""}`;
}

function mergeUnits(currentUnits: Unit[], nextUnits: Unit[]) {
  const unitsById = new Map(currentUnits.map((unit) => [unit.id, unit]));

  nextUnits.forEach((unit) => {
    unitsById.set(unit.id, unit);
  });

  return [...unitsById.values()].sort((a, b) => getUnitSortNumber(a) - getUnitSortNumber(b));
}

function getUnitSortNumber(unit: Unit) {
  const labelNumber = unit.label.match(/\d+/)?.[0];

  if (labelNumber) {
    return Number(labelNumber);
  }

  return unit.floorIndex;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function FormModal({
  children,
  onCancel,
  title,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Portefeuille</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PropertyDeleteModal({
  confirmation,
  onCancel,
  onChangeConfirmation,
  onConfirm,
  property,
  saving,
  store,
}: {
  confirmation: string;
  onCancel: () => void;
  onChangeConfirmation: (value: string) => void;
  onConfirm: () => void;
  property: PropertyDashboard;
  saving: boolean;
  store: LocalStore;
}) {
  const unitIds = store.units.filter((unit) => unit.propertyId === property.id).map((unit) => unit.id);
  const tenantIds = new Set(store.leases.filter((lease) => lease.propertyId === property.id).map((lease) => lease.tenantId));
  const ticketCount = store.maintenanceTickets.filter((ticket) => ticket.propertyId === property.id).length;
  const canDelete = confirmation === property.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <p className="text-sm font-semibold uppercase text-[color:var(--red)]">Action destructive</p>
        <h2 className="mt-2 text-2xl font-semibold">Supprimer {property.name}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Cette suppression est permanente dans votre stockage local. Les données associées à cet immeuble seront retirées
          du portefeuille courant.
        </p>

        <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">Ce qui sera supprimé</p>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
            <li>{unitIds.length} logements</li>
            <li>{tenantIds.size} locataires assignés</li>
            <li>{unitIds.length} baux liés aux logements</li>
            <li>{ticketCount} demandes d&apos;entretien</li>
          </ul>
        </div>

        <label className="mt-5 grid gap-2 text-sm font-medium text-[var(--muted)]">
          Tapez exactement « {property.name} » pour confirmer.
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--red)]"
            value={confirmation}
            onChange={(event) => onChangeConfirmation(event.target.value)}
          />
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-danger disabled:cursor-not-allowed disabled:opacity-40" disabled={!canDelete || saving} onClick={onConfirm} type="button">
            {saving ? "Suppression..." : "Confirmer la suppression"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  confirmLabel,
  onCancel,
  onConfirm,
  title,
  warning,
}: {
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  warning: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{warning}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-danger" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
