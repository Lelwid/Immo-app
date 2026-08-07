export type DataMode = "local" | "supabase";

export const DATA_MODE_KEY = "gestionnaire-immo-data-mode-v1";
export const DATA_MODE_CHANGED_EVENT = "gestionnaire-immo-data-mode-changed";

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
  window.dispatchEvent(new CustomEvent(DATA_MODE_CHANGED_EVENT, { detail: mode }));
}

export function shouldUseSupabase() {
  return getDataMode() === "supabase";
}
