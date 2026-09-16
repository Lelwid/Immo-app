"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchAddresses, type AddressSuggestion, type NormalizedAddress } from "@/lib/data/addressService";
import { AppIcon } from "@/components/AppIcon";

type AddressAutocompleteProps = {
  countryCode?: string;
  disabled?: boolean;
  label?: string;
  manualMode?: boolean;
  onChange: (value: string) => void;
  onManualModeChange?: (manualMode: boolean) => void;
  onSelect: (address: NormalizedAddress) => void;
  placeholder?: string;
  value: string;
};

const minQueryLength = 3;
const debounceDelay = 400;
const genericError = "Impossible de charger les suggestions d'adresse. Vous pouvez saisir l'adresse manuellement.";

export function AddressAutocomplete({
  countryCode = "ca",
  disabled = false,
  label = "Adresse",
  manualMode = false,
  onChange,
  onManualModeChange,
  onSelect,
  placeholder = "117 51e rue...",
  value,
}: AddressAutocompleteProps) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (manualMode || disabled || value.trim().length < minQueryLength) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      searchAddresses(value, { countryCode, limit: 5, signal: controller.signal })
        .then((nextSuggestions) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setSuggestions(nextSuggestions);
          setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
          setIsOpen(nextSuggestions.length > 0);
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted || requestIdRef.current !== requestId) {
            return;
          }

          console.error("Impossible de charger les suggestions d'adresse.", searchError);
          setSuggestions([]);
          setActiveIndex(-1);
          setIsOpen(false);
          setError(genericError);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsLoading(false);
          }
        });
    }, debounceDelay);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [countryCode, disabled, manualMode, value]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.address.formattedAddress);
    onSelect(suggestion.address);
    setSuggestions([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setError(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex] ?? suggestions[0];
      if (suggestion) {
        selectSuggestion(suggestion);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative grid gap-1 text-sm font-medium text-[var(--muted)]">
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <AppIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" name="map-pin" size={17} />
        <input
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${inputId}-suggestions`}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] py-2 pl-9 pr-3 text-[var(--foreground)] outline-none transition focus:border-[color:var(--accent)]"
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            onChange(event.target.value);
            setError(null);
            if (event.target.value.trim().length < minQueryLength || manualMode) {
              setSuggestions([]);
              setActiveIndex(-1);
              setIsOpen(false);
            }
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={value}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <button
          className="text-left font-semibold text-[color:var(--accent)] transition hover:text-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => {
            onManualModeChange?.(!manualMode);
            setSuggestions([]);
            setIsOpen(false);
            setIsLoading(false);
            setError(null);
          }}
          type="button"
        >
          {manualMode ? "Utiliser les suggestions" : "Adresse introuvable ? Saisir manuellement"}
        </button>
        {isLoading ? <span>Recherche...</span> : null}
      </div>
      {error ? <p className="text-xs font-medium text-[color:var(--yellow)]">{error}</p> : null}
      {isOpen && suggestions.length > 0 ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
          id={`${inputId}-suggestions`}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              aria-selected={activeIndex === index}
              className={`grid w-full gap-1 px-4 py-3 text-left transition ${
                activeIndex === index ? "bg-[color:var(--accent)]/12 text-[var(--foreground)]" : "text-[var(--foreground)] hover:bg-[var(--surface-2)]"
              }`}
              key={suggestion.id}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              role="option"
              type="button"
            >
              <span className="text-sm font-semibold">{suggestion.label}</span>
              {suggestion.secondaryLabel ? <span className="text-xs text-[var(--muted)]">{suggestion.secondaryLabel}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
