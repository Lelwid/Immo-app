export type DataMode = "local" | "supabase";

export const DATA_MODE_KEY = "gestionnaire-immo-data-mode-v1";

export function getDataMode(): DataMode {
  if (typeof window === "undefined") {
    return "local";
  }

  return window.localStorage.getItem(DATA_MODE_KEY) === "supabase" ? "supabase" : "local";
}

export function setDataMode(mode: DataMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DATA_MODE_KEY, mode);
}

export function shouldUseSupabase() {
  return getDataMode() === "supabase";
}
