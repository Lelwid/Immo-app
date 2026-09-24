import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiFeature = "copilot" | "document_ai";

export type AiQuotaResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeAiQuota(supabase: SupabaseClient, feature: AiFeature): Promise<AiQuotaResult> {
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_feature: feature });

  if (error) {
    console.error("[Nexbail AI] Quota indisponible.", { code: error.code, feature });
    throw new Error("AI_QUOTA_UNAVAILABLE");
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row.allowed !== "boolean") {
    console.error("[Nexbail AI] Réponse de quota invalide.", { feature });
    throw new Error("AI_QUOTA_INVALID_RESPONSE");
  }

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? 60)),
  };
}
