import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Property } from "@/lib/types";

const table = "properties";

type SupabasePropertyRow = {
  id: string;
  user_id: string;
  name: string;
  address: string;
  address_line1?: string | null;
  street_number?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  postal_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address_provider?: string | null;
  address_provider_id?: string | null;
  type: string;
  created_at?: string;
  updated_at?: string;
};

export type PropertyInput = Omit<Property, "id">;

const propertySelect =
  "id,user_id,name,address,address_line1,street_number,street,district,city,province,province_code,postal_code,country,country_code,latitude,longitude,address_provider,address_provider_id,type,created_at,updated_at";

const loadError = "Impossible de charger les immeubles.";
const createError = "Impossible de créer l'immeuble.";
const updateError = "Impossible de modifier l'immeuble.";
const deleteError = "Impossible de supprimer l'immeuble.";

export async function getProperties(): Promise<Property[]> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(loadError);
    const { data, error } = await supabase!
      .from(table)
      .select(propertySelect)
      .eq("user_id", userId)
      .order("name");

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().properties;
}

export async function createProperty(input: PropertyInput): Promise<Property> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert({
        user_id: userId,
        ...toSupabasePayload(input),
      })
      .select(propertySelect)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const property: Property = {
    id: createLocalPropertyId(),
    ...input,
    province: input.province || input.provinceCode || "QC",
  };
  const store = loadLocalStore();

  saveLocalStore({
    ...store,
    properties: [...store.properties, property],
  });

  return property;
}

export async function updateProperty(propertyId: string, input: PropertyInput): Promise<Property> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(updateError);
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabasePayload(input))
      .eq("id", propertyId)
      .eq("user_id", userId)
      .select(propertySelect)
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const nextProperty: Property = {
    id: propertyId,
    ...input,
    province: input.province || input.provinceCode || "QC",
  };

  saveLocalStore({
    ...store,
    properties: store.properties.map((property) => (property.id === propertyId ? nextProperty : property)),
  });

  return nextProperty;
}

export async function deleteProperty(propertyId: string): Promise<void> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(deleteError);
    const { error } = await supabase!.from(table).delete().eq("id", propertyId).eq("user_id", userId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({ ...store, properties: store.properties.filter((property) => property.id !== propertyId) });
}

export async function listProperties(): Promise<Property[]> {
  return getProperties();
}

export async function upsertProperty(property: Property) {
  const input = toPropertyInput(property);
  const store = loadLocalStore();
  const exists = store.properties.some((candidate) => candidate.id === property.id);

  return exists ? updateProperty(property.id, input) : createProperty(input);
}

export async function deletePropertyRecord(propertyId: string) {
  return deleteProperty(propertyId);
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

async function getCurrentUserId(errorMessage: string) {
  const { data, error } = await supabase!.auth.getUser();

  if (error || !data.user?.id) {
    throw new Error(errorMessage);
  }

  return data.user.id;
}

function fromSupabaseRow(row: SupabasePropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address || row.address_line1 || "",
    addressLine1: row.address_line1 || undefined,
    streetNumber: row.street_number || undefined,
    street: row.street || undefined,
    district: row.district || undefined,
    city: row.city || "Québec",
    province: row.province || row.province_code || "QC",
    provinceCode: row.province_code || undefined,
    postalCode: row.postal_code || "",
    country: row.country || undefined,
    countryCode: row.country_code || undefined,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    addressProvider: row.address_provider || null,
    addressProviderId: row.address_provider_id || null,
    propertyType: normalizePropertyType(row.type),
  };
}

function toPropertyInput(property: Property): PropertyInput {
  return {
    name: property.name,
    address: property.address,
    addressLine1: property.addressLine1,
    streetNumber: property.streetNumber,
    street: property.street,
    city: property.city,
    district: property.district,
    province: property.province,
    provinceCode: property.provinceCode,
    postalCode: property.postalCode,
    country: property.country,
    countryCode: property.countryCode,
    latitude: property.latitude,
    longitude: property.longitude,
    addressProvider: property.addressProvider,
    addressProviderId: property.addressProviderId,
    propertyType: property.propertyType,
  };
}

function toSupabasePayload(input: PropertyInput) {
  return {
    name: input.name,
    address: input.address,
    address_line1: input.addressLine1 || input.address || null,
    street_number: input.streetNumber || null,
    street: input.street || null,
    district: input.district || null,
    city: input.city || null,
    province: input.province || null,
    province_code: input.provinceCode || null,
    postal_code: input.postalCode || null,
    country: input.country || null,
    country_code: input.countryCode || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    address_provider: input.addressProvider || null,
    address_provider_id: input.addressProviderId || null,
    type: input.propertyType,
  };
}

function normalizePropertyType(type: string): Property["propertyType"] {
  if (type === "condo" || type === "duplex" || type === "triplex" || type === "quadruplex" || type === "immeuble") {
    return type;
  }

  return "immeuble";
}

function createLocalPropertyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `property-${crypto.randomUUID()}`;
  }

  return `property-${Date.now()}`;
}
