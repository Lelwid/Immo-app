import "server-only";

import { HabixaAnalysisError } from "@/lib/server/habixaAiErrors";
import type { AiField, LeaseExtraction, LeaseStructuredExtraction } from "@/lib/types";

type LeaseAnalyzerInput = {
  context?: {
    documentName?: string | null;
    propertyAddress?: string | null;
    tenantName?: string | null;
    unitName?: string | null;
  };
  images?: LeaseAnalyzerImageInput[];
  text: string;
};

export type LeaseAnalyzerImageInput = {
  dataUrl: string;
  fileName?: string | null;
  mimeType: string;
  pageNumber: number;
  qualityWarnings?: string[];
};

export type LeaseAnalyzerResult = {
  analysis: LeaseStructuredExtraction;
  extraction: LeaseExtraction;
  model: string;
};

export async function analyzeLeaseText(input: LeaseAnalyzerInput): Promise<LeaseAnalyzerResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HabixaAnalysisError("OPENAI_NOT_CONFIGURED", "OPENAI_NOT_CONFIGURED", { step: "ai_configuration" });
  }

  const model = process.env.HABIXA_AI_MODEL || "gpt-4.1-mini";
  const analysis = await analyzeWithOpenAi(input, model, apiKey);

  return {
    analysis,
    extraction: flattenLeaseAnalysis(analysis),
    model,
  };
}

async function analyzeWithOpenAi(input: LeaseAnalyzerInput, model: string, apiKey: string): Promise<LeaseStructuredExtraction> {
  const content: Array<Record<string, unknown>> = [
    {
      text: buildPrompt(input),
      type: "input_text",
    },
  ];

  for (const image of input.images ?? []) {
    content.push({
      detail: "high",
      image_url: image.dataUrl,
      type: "input_image",
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content,
          role: "user",
        },
      ],
      model,
      text: {
        format: {
          name: "habixa_lease_analysis",
          schema: leaseAnalysisJsonSchema,
          strict: true,
          type: "json_schema",
        },
      },
      temperature: 0,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const cause = await getOpenAiErrorCause(response);

    throw new HabixaAnalysisError(getOpenAiErrorCode(response.status, cause), "Nexbail AI n'a pas pu analyser ce document.", {
      cause,
      step: "openai_request",
    });
  }

  const payload = await response.json();
  const outputText = getOpenAiOutputText(payload);

  if (!outputText) {
    throw new HabixaAnalysisError("AI_SCHEMA_ERROR", "Nexbail AI n'a pas retourné de résultat exploitable.", { step: "openai_response" });
  }

  try {
    return normalizeLeaseAnalysis(JSON.parse(outputText));
  } catch (error) {
    throw new HabixaAnalysisError("AI_SCHEMA_ERROR", "Nexbail AI n'a pas retourné un JSON valide.", { cause: error, step: "ai_schema_validation" });
  }
}

function buildPrompt(input: LeaseAnalyzerInput) {
  const context = [
    input.context?.documentName ? `Nom du document: ${input.context.documentName}` : "",
    input.context?.propertyAddress ? `Adresse connue de l'immeuble: ${input.context.propertyAddress}` : "",
    input.context?.unitName ? `Logement connu: ${input.context.unitName}` : "",
    input.context?.tenantName ? `Locataire connu: ${input.context.tenantName}` : "",
  ].filter(Boolean);

  return [
    "Tu analyses des documents locatifs pour Nexbail.",
    input.images?.length
      ? `Le bail contient ${input.images.length} page${input.images.length > 1 ? "s" : ""} photo jointe${input.images.length > 1 ? "s" : ""}. Analyse-les dans l'ordre des pages.`
      : "",
    "Extrais uniquement les informations explicitement présentes dans le document.",
    "Ne déduis pas et n'invente jamais une valeur absente.",
    "Lorsqu'une information est ambiguë, utilise null ou diminue le niveau de confiance.",
    "Toutes les dates doivent être au format YYYY-MM-DD et les montants doivent être numériques.",
    "Chaque champ doit suivre le format { value, confidence, sourceText }.",
    input.images?.some((image) => image.qualityWarnings?.length)
      ? `Avertissements qualité photo:\n${input.images
          .filter((image) => image.qualityWarnings?.length)
          .map((image) => `Page ${image.pageNumber}: ${image.qualityWarnings?.join(", ")}`)
          .join("\n")}`
      : "",
    context.length ? `Contexte connu:\n${context.join("\n")}` : "",
    input.text ? "Texte extrait du bail:" : "",
    input.text ? trimForModel(input.text) : "",
  ].join("\n\n");
}

export function flattenLeaseAnalysis(analysis: LeaseStructuredExtraction): LeaseExtraction {
  const firstTenant = analysis.tenants[0];
  const tenantName = [firstTenant?.firstName.value, firstTenant?.lastName.value].filter(Boolean).join(" ").trim() || null;
  const confidenceByField = {
    bedroomCount: analysis.property.bedroomCount.confidence,
    dueDay: analysis.rent.paymentDay.confidence,
    importantNotes: analysis.rules.importantNotes.confidence,
    landlordAddress: analysis.landlord.address.confidence,
    landlordEmail: analysis.landlord.email.confidence,
    landlordName: analysis.landlord.name.confidence,
    landlordPhone: analysis.landlord.phone.confidence,
    leaseEndDate: analysis.lease.endDate.confidence,
    leaseStartDate: analysis.lease.startDate.confidence,
    paymentFrequency: analysis.rent.frequency.confidence,
    paymentMethod: analysis.rent.paymentMethod.confidence,
    monthlyRent: analysis.rent.amount.confidence,
    propertyAddress: analysis.property.address.confidence,
    propertyCity: analysis.property.city.confidence,
    propertyPostalCode: analysis.property.postalCode.confidence,
    propertyProvince: analysis.property.province.confidence,
    signedDate: analysis.lease.signedDate.confidence,
    tenantEmail: firstTenant?.email.confidence ?? 0,
    tenantName: Math.max(firstTenant?.firstName.confidence ?? 0, firstTenant?.lastName.confidence ?? 0),
    tenantPhone: firstTenant?.phone.confidence ?? 0,
    unitName: analysis.property.unit.confidence,
  };
  const sourceTextByField = {
    bedroomCount: analysis.property.bedroomCount.sourceText ?? null,
    dueDay: analysis.rent.paymentDay.sourceText ?? null,
    importantNotes: analysis.rules.importantNotes.sourceText ?? null,
    landlordAddress: analysis.landlord.address.sourceText ?? null,
    landlordEmail: analysis.landlord.email.sourceText ?? null,
    landlordName: analysis.landlord.name.sourceText ?? null,
    landlordPhone: analysis.landlord.phone.sourceText ?? null,
    leaseEndDate: analysis.lease.endDate.sourceText ?? null,
    leaseStartDate: analysis.lease.startDate.sourceText ?? null,
    monthlyRent: analysis.rent.amount.sourceText ?? null,
    paymentFrequency: analysis.rent.frequency.sourceText ?? null,
    paymentMethod: analysis.rent.paymentMethod.sourceText ?? null,
    propertyAddress: analysis.property.address.sourceText ?? null,
    propertyCity: analysis.property.city.sourceText ?? null,
    propertyPostalCode: analysis.property.postalCode.sourceText ?? null,
    propertyProvince: analysis.property.province.sourceText ?? null,
    signedDate: analysis.lease.signedDate.sourceText ?? null,
    tenantEmail: firstTenant?.email.sourceText ?? null,
    tenantName: firstTenant?.firstName.sourceText ?? firstTenant?.lastName.sourceText ?? null,
    tenantPhone: firstTenant?.phone.sourceText ?? null,
    unitName: analysis.property.unit.sourceText ?? null,
  };

  return {
    bedroomCount: analysis.property.bedroomCount.value,
    confidenceByField,
    documentType: analysis.documentType.value ?? "bail",
    dueDay: analysis.rent.paymentDay.value,
    importantNotes: analysis.rules.importantNotes.value,
    inclusions: {
      appliances: analysis.inclusions.appliances.value,
      electricity: analysis.inclusions.electricity.value,
      furniture: analysis.inclusions.furniture.value,
      heating: analysis.inclusions.heating.value,
      hotWater: analysis.inclusions.hotWater.value,
      internet: analysis.inclusions.internet.value,
      other: analysis.inclusions.other.value,
      parking: analysis.inclusions.parking.value,
      water: analysis.inclusions.water.value,
    },
    landlordAddress: analysis.landlord.address.value,
    landlordEmail: analysis.landlord.email.value,
    landlordName: analysis.landlord.name.value,
    landlordPhone: analysis.landlord.phone.value,
    leaseDuration: analysis.lease.duration.value,
    leaseEndDate: analysis.lease.endDate.value,
    leaseStartDate: analysis.lease.startDate.value,
    monthlyRent: analysis.rent.amount.value,
    parking: analysis.property.parking.value,
    paymentFrequency: analysis.rent.frequency.value,
    paymentMethod: analysis.rent.paymentMethod.value,
    propertyAddress: analysis.property.address.value,
    propertyCity: analysis.property.city.value,
    propertyPostalCode: analysis.property.postalCode.value,
    propertyProvince: analysis.property.province.value,
    signedDate: analysis.lease.signedDate.value,
    signerNames: tenantName ? [tenantName] : null,
    sourceTextByField,
    structuredFields: analysis,
    tenantEmail: firstTenant?.email.value ?? null,
    tenantName,
    tenantPhone: firstTenant?.phone.value ?? null,
    unitName: analysis.property.unit.value,
    unitNumber: analysis.property.unit.value,
  };
}

function normalizeLeaseAnalysis(value: unknown): LeaseStructuredExtraction {
  const source = isRecord(value) ? value : {};
  const property = isRecord(source.property) ? source.property : {};
  const landlord = isRecord(source.landlord) ? source.landlord : {};
  const lease = isRecord(source.lease) ? source.lease : {};
  const rent = isRecord(source.rent) ? source.rent : {};
  const inclusions = isRecord(source.inclusions) ? source.inclusions : {};
  const rules = isRecord(source.rules) ? source.rules : {};
  const tenants = Array.isArray(source.tenants) ? source.tenants : [];

  return {
    documentType: normalizeField(source.documentType, normalizeString),
    inclusions: {
      appliances: normalizeField(inclusions.appliances, normalizeBoolean),
      electricity: normalizeField(inclusions.electricity, normalizeBoolean),
      furniture: normalizeField(inclusions.furniture, normalizeBoolean),
      heating: normalizeField(inclusions.heating, normalizeBoolean),
      hotWater: normalizeField(inclusions.hotWater, normalizeBoolean),
      internet: normalizeField(inclusions.internet, normalizeBoolean),
      other: normalizeField(inclusions.other, normalizeString),
      parking: normalizeField(inclusions.parking, normalizeBoolean),
      water: normalizeField(inclusions.water, normalizeBoolean),
    },
    landlord: {
      address: normalizeField(landlord.address, normalizeString),
      email: normalizeField(landlord.email, normalizeString),
      name: normalizeField(landlord.name, normalizeString),
      phone: normalizeField(landlord.phone, normalizeString),
    },
    lease: {
      duration: normalizeField(lease.duration, normalizeString),
      endDate: normalizeField(lease.endDate, normalizeDate),
      signedDate: normalizeField(lease.signedDate, normalizeDate),
      startDate: normalizeField(lease.startDate, normalizeDate),
    },
    property: {
      address: normalizeField(property.address, normalizeString),
      bedroomCount: normalizeField(property.bedroomCount, normalizeNumber),
      city: normalizeField(property.city, normalizeString),
      parking: normalizeField(property.parking, normalizeString),
      postalCode: normalizeField(property.postalCode, normalizeString),
      province: normalizeField(property.province, normalizeString),
      unit: normalizeField(property.unit, normalizeString),
    },
    rent: {
      amount: normalizeField(rent.amount, normalizeMoney),
      frequency: normalizeField(rent.frequency, normalizeString),
      paymentDay: normalizeField(rent.paymentDay, normalizeDay),
      paymentMethod: normalizeField(rent.paymentMethod, normalizeString),
    },
    rules: {
      animals: normalizeField(rules.animals, normalizeString),
      importantNotes: normalizeField(rules.importantNotes, normalizeString),
      smoking: normalizeField(rules.smoking, normalizeString),
      subletting: normalizeField(rules.subletting, normalizeString),
    },
    tenants: tenants.length
      ? tenants.map((tenant) => {
          const tenantRecord = isRecord(tenant) ? tenant : {};

          return {
            email: normalizeField(tenantRecord.email, normalizeString),
            firstName: normalizeField(tenantRecord.firstName, normalizeString),
            lastName: normalizeField(tenantRecord.lastName, normalizeString),
            phone: normalizeField(tenantRecord.phone, normalizeString),
          };
        })
      : [
          {
            email: field<string>(null, 0, null),
            firstName: field<string>(null, 0, null),
            lastName: field<string>(null, 0, null),
            phone: field<string>(null, 0, null),
          },
        ],
  };
}

function normalizeField<T>(value: unknown, normalizer: (value: unknown) => T | null): AiField<T> {
  if (!isRecord(value)) {
    return field<T>(null, 0, null);
  }

  return field(normalizer(value.value), normalizeConfidence(value.confidence), normalizeString(value.sourceText));
}

function field<T>(value: T | null, confidence: number, sourceText: string | null): AiField<T> {
  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    sourceText,
    value,
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const number = Number(value.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));

  return Number.isFinite(number) ? number : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const number = Number(value.replace(/[^\d.-]/g, ""));

  return Number.isFinite(number) ? number : null;
}

function normalizeDay(value: unknown) {
  const number = normalizeNumber(value);

  if (number === null) {
    return null;
  }

  return Number.isInteger(number) && number >= 1 && number <= 31 ? number : null;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const clean = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (!match) {
    return null;
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];

  return `${year}-${month}-${day}`;
}

function normalizeConfidence(value: unknown) {
  const confidence = typeof value === "number" ? value : Number(value);

  return Number.isFinite(confidence) ? confidence : 0;
}

function trimForModel(text: string) {
  return text.slice(0, 80_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOpenAiOutputText(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = payload.output;

  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

async function getOpenAiErrorCause(response: Response) {
  const payload = await response.json().catch(() => null);

  if (isRecord(payload) && isRecord(payload.error)) {
    return {
      code: typeof payload.error.code === "string" ? payload.error.code : null,
      message: typeof payload.error.message === "string" ? payload.error.message : null,
      status: response.status,
      type: typeof payload.error.type === "string" ? payload.error.type : null,
    };
  }

  return {
    status: response.status,
  };
}

function getOpenAiErrorCode(status: number, cause: unknown) {
  const message = isRecord(cause) && typeof cause.message === "string" ? cause.message.toLowerCase() : "";
  const code = isRecord(cause) && typeof cause.code === "string" ? cause.code.toLowerCase() : "";

  if (status === 401 || status === 403) {
    return "OPENAI_AUTH_ERROR";
  }

  if (status === 404 || message.includes("model") || code.includes("model")) {
    return "OPENAI_MODEL_ERROR";
  }

  if (status === 429) {
    return "OPENAI_RATE_LIMIT";
  }

  if (message.includes("schema") || message.includes("json_schema")) {
    return "AI_SCHEMA_ERROR";
  }

  return "AI_ANALYSIS_ERROR";
}

const nullableStringField = createFieldSchema([{ type: "string" }, { type: "null" }]);
const nullableNumberField = createFieldSchema([{ type: "number" }, { type: "null" }]);
const nullableBooleanField = createFieldSchema([{ type: "boolean" }, { type: "null" }]);

function createFieldSchema(valueAnyOf: Array<Record<string, string>>) {
  return {
    additionalProperties: false,
    properties: {
      confidence: { maximum: 1, minimum: 0, type: "number" },
      sourceText: { anyOf: [{ type: "string" }, { type: "null" }] },
      value: { anyOf: valueAnyOf },
    },
    required: ["value", "confidence", "sourceText"],
    type: "object",
  };
}

const tenantSchema = {
  additionalProperties: false,
  properties: {
    email: nullableStringField,
    firstName: nullableStringField,
    lastName: nullableStringField,
    phone: nullableStringField,
  },
  required: ["firstName", "lastName", "phone", "email"],
  type: "object",
};

const leaseAnalysisJsonSchema = {
  additionalProperties: false,
  properties: {
    documentType: nullableStringField,
    inclusions: {
      additionalProperties: false,
      properties: {
        appliances: nullableBooleanField,
        electricity: nullableBooleanField,
        furniture: nullableBooleanField,
        heating: nullableBooleanField,
        hotWater: nullableBooleanField,
        internet: nullableBooleanField,
        other: nullableStringField,
        parking: nullableBooleanField,
        water: nullableBooleanField,
      },
      required: ["heating", "electricity", "hotWater", "water", "internet", "furniture", "appliances", "parking", "other"],
      type: "object",
    },
    landlord: {
      additionalProperties: false,
      properties: {
        address: nullableStringField,
        email: nullableStringField,
        name: nullableStringField,
        phone: nullableStringField,
      },
      required: ["name", "address", "phone", "email"],
      type: "object",
    },
    lease: {
      additionalProperties: false,
      properties: {
        duration: nullableStringField,
        endDate: nullableStringField,
        signedDate: nullableStringField,
        startDate: nullableStringField,
      },
      required: ["startDate", "endDate", "duration", "signedDate"],
      type: "object",
    },
    property: {
      additionalProperties: false,
      properties: {
        address: nullableStringField,
        bedroomCount: nullableNumberField,
        city: nullableStringField,
        parking: nullableStringField,
        postalCode: nullableStringField,
        province: nullableStringField,
        unit: nullableStringField,
      },
      required: ["address", "unit", "city", "province", "postalCode", "bedroomCount", "parking"],
      type: "object",
    },
    rent: {
      additionalProperties: false,
      properties: {
        amount: nullableNumberField,
        frequency: nullableStringField,
        paymentDay: nullableNumberField,
        paymentMethod: nullableStringField,
      },
      required: ["amount", "frequency", "paymentDay", "paymentMethod"],
      type: "object",
    },
    rules: {
      additionalProperties: false,
      properties: {
        animals: nullableStringField,
        importantNotes: nullableStringField,
        smoking: nullableStringField,
        subletting: nullableStringField,
      },
      required: ["animals", "smoking", "subletting", "importantNotes"],
      type: "object",
    },
    tenants: {
      items: tenantSchema,
      type: "array",
    },
  },
  required: ["property", "landlord", "tenants", "lease", "rent", "inclusions", "rules", "documentType"],
  type: "object",
};
