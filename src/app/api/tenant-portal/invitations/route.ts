import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  sendTenantInvitationEmail,
  TenantInvitationEmailConfigurationError,
} from "@/lib/server/tenantInvitationMailer";

export const runtime = "nodejs";

const maxBodyBytes = 4096;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InvitationRequest = {
  email?: unknown;
  tenantId?: unknown;
};

export async function POST(request: NextRequest) {
  if (isRequestTooLarge(request)) {
    return invitationError("INVALID_REQUEST", "La demande d'invitation est invalide.", 400);
  }

  const authenticated = await getAuthenticatedSupabase(request);

  if (!authenticated) {
    return invitationError("UNAUTHORIZED", "Session propriétaire invalide.", 401);
  }

  const body = await readJsonBody<InvitationRequest>(request);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!uuidPattern.test(tenantId) || email.length > 320 || !emailPattern.test(email)) {
    return invitationError("INVALID_REQUEST", "Le locataire ou le courriel est invalide.", 400);
  }

  const { data: tenant, error: tenantError } = await authenticated.supabase
    .from("tenants")
    .select("id,email")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return invitationError("TENANT_NOT_FOUND", "Locataire introuvable.", 404);
  }

  if (tenant.email?.trim() && tenant.email.trim().toLowerCase() !== email) {
    return invitationError("EMAIL_MISMATCH", "Le courriel doit correspondre au dossier du locataire.", 400);
  }

  const { error: revokeError } = await authenticated.supabase
    .from("tenant_portal_invitations")
    .update({ status: "revoked" })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  if (revokeError) {
    return invitationError("INVITATION_FAILED", "Impossible de préparer l'invitation au portail.", 500);
  }

  const { data: invitation, error: invitationErrorResult } = await authenticated.supabase
    .from("tenant_portal_invitations")
    .insert({
      email,
      invited_by: authenticated.user.id,
      owner_user_id: authenticated.user.id,
      tenant_id: tenantId,
    })
    .select("id,tenant_id,email,token,status,expires_at,accepted_at")
    .single();

  if (invitationErrorResult || !invitation) {
    return invitationError("INVITATION_FAILED", "Impossible de créer l'invitation au portail.", 500);
  }

  try {
    await sendTenantInvitationEmail({
      email,
      ownerName: getOwnerName(authenticated.user.user_metadata),
      token: invitation.token,
    });
  } catch (error) {
    await authenticated.supabase
      .from("tenant_portal_invitations")
      .update({ status: "revoked" })
      .eq("id", invitation.id);

    if (error instanceof TenantInvitationEmailConfigurationError) {
      return invitationError("EMAIL_NOT_CONFIGURED", "L'envoi des invitations par courriel doit être configuré.", 503);
    }

    return invitationError("EMAIL_DELIVERY_FAILED", "Le courriel d'invitation n'a pas pu être envoyé.", 502);
  }

  return NextResponse.json(
    {
      invitation: {
        acceptedAt: invitation.accepted_at,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        id: invitation.id,
        status: invitation.status,
        tenantId: invitation.tenant_id,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function getAuthenticatedSupabase(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ") || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();

  return error || !data.user?.id ? null : { supabase, user: data.user };
}

async function readJsonBody<T>(request: NextRequest): Promise<T | null> {
  const text = await request.text().catch(() => "");

  if (!text || new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isRequestTooLarge(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > maxBodyBytes;
}

function getOwnerName(metadata: Record<string, unknown>) {
  const fullName = metadata.full_name;
  const name = metadata.name;
  return typeof fullName === "string" && fullName.trim()
    ? fullName
    : typeof name === "string" && name.trim()
      ? name
      : "Nexbail";
}

function invitationError(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { headers: { "Cache-Control": "no-store" }, status });
}
