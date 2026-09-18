import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { copilotToolDefinitions, createCopilotToolRunner, type CopilotEntityContext } from "@/lib/ai/copilotTools";
import type { LocalStore } from "@/lib/types";

export const runtime = "nodejs";

type CopilotMessage = {
  content: string;
  role: "assistant" | "user";
};

type CopilotRequestBody = {
  context?: CopilotEntityContext | null;
  dataMode?: "local" | "supabase";
  localSnapshot?: LocalStore | null;
  messages?: CopilotMessage[];
};

type OpenAiFunctionCall = {
  arguments: string;
  call_id: string;
  name: string;
  raw: Record<string, unknown>;
};

const maxToolRounds = 4;
const maxToolCalls = 8;
const maxRequestBytes = 64 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (isRequestTooLarge(request, maxRequestBytes)) {
    return NextResponse.json({ error: "La requête est trop volumineuse." }, { status: 413 });
  }

  const authenticated = await getAuthenticatedSupabase(request);

  if (!authenticated) {
    return NextResponse.json({ error: "Session requise pour le Copilot." }, { status: 401 });
  }

  const body = await readJsonBody<CopilotRequestBody>(request, maxRequestBytes);

  if (!body) {
    return NextResponse.json({ error: "Requête invalide ou trop volumineuse." }, { status: 400 });
  }

  const messages = normalizeMessages(body?.messages);

  if (messages.length === 0) {
    return NextResponse.json({ error: "Posez une question pour démarrer le Copilot." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Nexbail Copilot n'est pas encore configuré." }, { status: 503 });
  }

  try {
    const dataSource = getCopilotDataSource(body, authenticated);
    const runTool = createCopilotToolRunner(dataSource, normalizeContext(body?.context));
    let toolCallCount = 0;
    let input: unknown[] = [
      {
        content: [
          {
            text: buildConversationPrompt(messages, body?.context),
            type: "input_text",
          },
        ],
        role: "user",
      },
    ];

    for (let round = 0; round < maxToolRounds; round += 1) {
      const response = await callOpenAi(input);
      const functionCalls = getFunctionCalls(response);

      if (functionCalls.length === 0) {
        return NextResponse.json({ message: getOutputText(response) || "Je n'ai pas trouvé assez d'information pour répondre." });
      }

      const toolOutputs = [];

      for (const functionCall of functionCalls) {
        toolCallCount += 1;

        if (toolCallCount > maxToolCalls) {
          return NextResponse.json({ message: "J'ai besoin de préciser la question pour éviter de consulter trop de données à la fois." });
        }

        const args = parseFunctionArguments(functionCall.arguments);
        const output = await runTool(functionCall.name, args);

        toolOutputs.push(functionCall.raw);
        toolOutputs.push({
          call_id: functionCall.call_id,
          output: JSON.stringify(output),
          type: "function_call_output",
        });
      }

      input = [...input, ...toolOutputs];
    }

    return NextResponse.json({ message: "Je n'ai pas pu finaliser la réponse avec les données disponibles. Reformulez la question ou précisez l'entité." });
  } catch (error) {
    console.error("[Nexbail Copilot] Requête échouée.", sanitizeError(error));
    return NextResponse.json({ error: "Impossible d'interroger Nexbail Copilot." }, { status: 500 });
  }
}

function getCopilotDataSource(
  body: CopilotRequestBody,
  authenticated: { supabase: SupabaseClient; userId: string },
) {
  if (body.dataMode === "supabase") {
    return {
      mode: "supabase" as const,
      supabase: authenticated.supabase,
      userId: authenticated.userId,
    };
  }

  if (body.localSnapshot) {
    return {
      localStore: body.localSnapshot,
      mode: "local" as const,
      userId: authenticated.userId,
    };
  }

  throw new Error("Source de données Copilot invalide.");
}

async function getAuthenticatedSupabase(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ") || !isSupabaseServerConfigured()) {
    return null;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();

  return error || !data.user?.id ? null : { supabase, userId: data.user.id };
}

async function readJsonBody<T>(request: NextRequest, maxBytes: number): Promise<T | null> {
  const text = await request.text().catch(() => "");

  if (!text || new TextEncoder().encode(text).byteLength > maxBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isRequestTooLarge(request: NextRequest, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

async function callOpenAi(input: unknown[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input,
      instructions: buildSystemPrompt(),
      max_output_tokens: 900,
      model: process.env.HABIXA_COPILOT_MODEL || process.env.HABIXA_AI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      tools: copilotToolDefinitions,
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("[Nexbail Copilot] OpenAI error.", sanitizeError(payload));
    throw new Error("OpenAI request failed.");
  }

  return payload;
}

function buildSystemPrompt() {
  return [
    "Tu es Nexbail Copilot, un assistant contextuel read-only pour un SaaS de gestion immobilière.",
    `Date actuelle: ${new Date().toISOString().slice(0, 10)}.`,
    "Réponds en français canadien, de façon concise et utile.",
    "Tu dois utiliser les outils fournis pour consulter les données du portefeuille avant de répondre à une question factuelle.",
    "Ne prétends jamais avoir créé, modifié, supprimé, payé, téléversé ou terminé une donnée. Le MVP est strictement en lecture seule.",
    "Ne demande pas à l'utilisateur de vérifier une page si un outil peut répondre.",
    "Si une personne, un immeuble, un logement ou un bail est ambigu, demande une précision et liste brièvement les candidats.",
    "Pour les paiements et statuts de loyer, utilise uniquement le registre des loyers, les transactions et les allocations. Ignore les statuts legacy du bail ou du logement comme source de vérité.",
    "Pour tout total dû, reçu, restant ou en retard d'un mois, utilise get_rent_ledger_summary. L'activité récente n'est jamais une source de vérité financière.",
    "Pour le montant total dû par un locataire, utilise rentStatus.totalBalance et rentStatus.outstandingCharges de get_tenant_summary. Ne réponds jamais avec une seule charge si plusieurs charges sont impayées.",
    "Distingue clairement les faits calculés, les hypothèses et les recommandations.",
    "Si une donnée manque, dis-le simplement au lieu d'inventer.",
    "",
    "STYLE DE RÉPONSE",
    "- Réponds en français naturel.",
    "- Sois concis par défaut.",
    "- Commence directement par la réponse.",
    "- Pour plusieurs résultats, donne d'abord un résumé, puis une courte liste.",
    "- Utilise les montants déjà formatés par les outils quand ils sont disponibles, par exemple 1 236 $. N'écris pas $1 236.",
    "- Utilise les dates naturelles déjà formatées par les outils quand elles sont disponibles, par exemple 14 août 2026.",
    "- N'affiche jamais les IDs techniques, noms de tables, champs snake_case, structures JSON ou résultats bruts d'outils.",
    "- N'explique pas les détails internes des outils sauf si l'utilisateur le demande.",
    "- Préfère les noms des locataires, immeubles et logements aux numéros techniques.",
    "- N'utilise pas de Markdown complexe. Utilise seulement des paragraphes, du gras léger et des listes simples lorsque cela améliore la lisibilité.",
    "- Pour un loyer sans paiement reçu, écris « aucun paiement reçu » plutôt que « aucune allocation ».",
    "- Ne termine pas systématiquement par une proposition de suivi.",
  ].join("\n");
}

function buildConversationPrompt(messages: CopilotMessage[], context: CopilotEntityContext | null | undefined) {
  const conversation = messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "Utilisateur" : "Copilot"}: ${message.content}`)
    .join("\n");
  const contextLine = context?.type && context.id ? `Contexte de page fourni: ${context.type} ${context.id}` : "Aucun contexte de page fourni.";

  return `${contextLine}\n\nConversation récente:\n${conversation}`;
}

function normalizeMessages(messages: CopilotRequestBody["messages"]) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message): message is CopilotMessage => {
      return (message?.role === "assistant" || message?.role === "user") && typeof message.content === "string" && message.content.trim().length > 0;
    })
    .slice(-12)
    .map((message) => ({
      content: message.content.trim().slice(0, 4000),
      role: message.role,
    }));
}

function normalizeContext(context: CopilotEntityContext | null | undefined): CopilotEntityContext | null {
  if (!context?.type || !context.id || !uuidPattern.test(context.id)) {
    return null;
  }

  if (context.type !== "property" && context.type !== "unit" && context.type !== "tenant" && context.type !== "lease") {
    return null;
  }

  return {
    id: context.id,
    type: context.type,
  };
}

function getFunctionCalls(response: unknown): OpenAiFunctionCall[] {
  if (!response || typeof response !== "object" || !Array.isArray((response as { output?: unknown }).output)) {
    return [];
  }

  return ((response as { output: unknown[] }).output as Record<string, unknown>[])
    .filter((item) => item.type === "function_call" && typeof item.name === "string" && typeof item.arguments === "string" && typeof item.call_id === "string")
    .map((item) => ({
      arguments: item.arguments as string,
      call_id: item.call_id as string,
      name: item.name as string,
      raw: item,
    }));
}

function getOutputText(response: unknown) {
  if (!response || typeof response !== "object") {
    return "";
  }

  const direct = (response as { output_text?: unknown }).output_text;

  if (typeof direct === "string") {
    return direct.trim();
  }

  const output = (response as { output?: unknown }).output;

  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) {
        return [];
      }

      return ((item as { content: unknown[] }).content as Record<string, unknown>[])
        .filter((contentItem) => contentItem.type === "output_text" && typeof contentItem.text === "string")
        .map((contentItem) => contentItem.text as string);
    })
    .join("\n")
    .trim();
}

function parseFunctionArguments(argumentsJson: string) {
  try {
    const parsed = JSON.parse(argumentsJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sanitizeError(error: unknown) {
  if (process.env.NODE_ENV === "production") {
    if (!error || typeof error !== "object") {
      return { type: "unknown" };
    }

    const source = error as Record<string, unknown>;
    return { code: source.code, status: source.status, type: error instanceof Error ? error.name : "error" };
  }

  if (!error || typeof error !== "object") {
    return error instanceof Error ? { message: error.message } : { message: String(error) };
  }

  const source = error as Record<string, unknown>;
  return {
    code: source.code,
    details: source.details,
    error: source.error,
    hint: source.hint,
    message: source.message,
    status: source.status,
  };
}

function isSupabaseServerConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
