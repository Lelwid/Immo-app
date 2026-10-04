import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function getPublicAuthProviders() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { google: false };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseAnonKey },
  });

  if (!response.ok) {
    throw new Error("Impossible de charger les fournisseurs d’authentification.");
  }

  const settings = (await response.json()) as { external?: { google?: boolean } };
  return { google: settings.external?.google === true };
}
