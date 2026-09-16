export type NormalizedAddress = {
  formattedAddress: string;
  streetNumber: string;
  street: string;
  city: string;
  district: string;
  province: string;
  provinceCode: string;
  postalCode: string;
  country: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  provider: "geoapify" | "manual";
  providerPlaceId: string | null;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  secondaryLabel: string;
  address: NormalizedAddress;
};

type GeoapifyAddressResult = {
  formatted?: string;
  address_line1?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  municipality?: string;
  county?: string;
  suburb?: string;
  district?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
};

type GeoapifyAutocompleteResponse = {
  results?: GeoapifyAddressResult[];
};

const endpoint = "https://api.geoapify.com/v1/geocode/autocomplete";
const quebecCityBias = "-71.20798,46.81388";

export function isAddressAutocompleteConfigured() {
  return Boolean(getGeoapifyApiKey());
}

export async function searchAddresses(
  query: string,
  options: { countryCode?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<AddressSuggestion[]> {
  const apiKey = getGeoapifyApiKey();
  const text = query.trim();

  if (!apiKey || text.length < 3) {
    return [];
  }

  const countryCode = (options.countryCode ?? "ca").toLowerCase();
  const params = new URLSearchParams({
    text,
    format: "json",
    lang: "fr",
    limit: String(options.limit ?? 5),
    filter: `countrycode:${countryCode}`,
    apiKey,
  });

  if (countryCode === "ca") {
    params.set("bias", `proximity:${quebecCityBias}`);
  }

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error("Impossible de charger les suggestions d'adresse.");
  }

  const payload = (await response.json()) as GeoapifyAutocompleteResponse;

  return (payload.results ?? [])
    .map(normalizeGeoapifyResult)
    .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
}

export function createManualNormalizedAddress(input: {
  address: string;
  city: string;
  province?: string;
  postalCode: string;
  country?: string;
}): NormalizedAddress {
  return {
    formattedAddress: input.address.trim(),
    streetNumber: "",
    street: input.address.trim(),
    city: input.city.trim(),
    district: "",
    province: input.province?.trim() || "Québec",
    provinceCode: input.province?.trim() || "QC",
    postalCode: input.postalCode.trim(),
    country: input.country?.trim() || "Canada",
    countryCode: "ca",
    latitude: null,
    longitude: null,
    provider: "manual",
    providerPlaceId: null,
  };
}

function normalizeGeoapifyResult(result: GeoapifyAddressResult): AddressSuggestion | null {
  const formattedAddress = result.formatted || result.address_line1 || "";

  if (!formattedAddress) {
    return null;
  }

  const address: NormalizedAddress = {
    formattedAddress,
    streetNumber: result.housenumber || "",
    street: result.street || "",
    city: result.city || result.municipality || "",
    district: result.suburb || result.district || result.county || "",
    province: result.state || "",
    provinceCode: result.state_code || "",
    postalCode: result.postcode || "",
    country: result.country || "",
    countryCode: (result.country_code || "").toLowerCase(),
    latitude: typeof result.lat === "number" ? result.lat : null,
    longitude: typeof result.lon === "number" ? result.lon : null,
    provider: "geoapify",
    providerPlaceId: result.place_id || null,
  };

  return {
    id: address.providerPlaceId || formattedAddress,
    label: formattedAddress,
    secondaryLabel: [address.city, address.provinceCode, address.postalCode].filter(Boolean).join(" "),
    address,
  };
}

function getGeoapifyApiKey() {
  return process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY?.trim() || "";
}
