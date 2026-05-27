"use client";

// Place autocomplete powered by the LocationIQ Autocomplete API.
// Drops in next to existing address inputs; selecting a suggestion fires
// `onSelect` with a normalized, form-friendly shape so the parent can fill
// address / city / state without further parsing. Falls back to a plain text
// input when the API key isn't configured (or the request fails).
//
// Docs: https://docs.locationiq.com/docs/autocomplete
import { Loader2, MapPin, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { cn } from "@/lib/utils";

// Subset of the LocationIQ result shape we actually consume.
interface LocationIQAddress {
  name?: string;
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

interface LocationIQResult {
  place_id: string;
  lat: string;
  lon: string;
  display_name: string;
  display_place?: string;
  display_address?: string;
  address?: LocationIQAddress;
}

// Normalized payload handed to consumers via onSelect.
export interface PickedLocation {
  // Street-level address suitable for the "Address" field. Falls back to
  // display_address / display_name when the structured pieces are missing.
  address: string;
  city: string;
  state: string;
  // Provided for callers that want to persist / map the point later.
  lat: number | null;
  lon: number | null;
  // The full display string LocationIQ returned, useful for the search input.
  displayName: string;
  raw: LocationIQResult;
}

const AUTOCOMPLETE_URL = "https://api.locationiq.com/v1/autocomplete";
// Empirical sweet spot: long enough to avoid hammering on every keystroke,
// short enough to feel like real typeahead.
const DEBOUNCE_MS = 280;
const MIN_QUERY_LEN = 3;

function normalizeStreet(addr: LocationIQAddress | undefined): string {
  if (!addr) return "";
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ").trim();
  // Roads alone are often enough; fall back to the named POI / suburb when
  // there's no road (e.g. a building name selected from the suggestions).
  if (street) return street;
  return addr.name ?? addr.suburb ?? addr.neighbourhood ?? "";
}

function normalizeCity(addr: LocationIQAddress | undefined): string {
  if (!addr) return "";
  return (
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.county ??
    ""
  );
}

function normalizeState(addr: LocationIQAddress | undefined): string {
  if (!addr) return "";
  // Prefer the short state_code (e.g. "OR") since the form's State field is
  // typically a 2-letter input; otherwise fall back to the full state name.
  return addr.state_code ?? addr.state ?? "";
}

function toPicked(result: LocationIQResult): PickedLocation {
  const street = normalizeStreet(result.address);
  return {
    address: street || result.display_address || result.display_name,
    city: normalizeCity(result.address),
    state: normalizeState(result.address),
    lat: Number.isFinite(Number(result.lat)) ? Number(result.lat) : null,
    lon: Number.isFinite(Number(result.lon)) ? Number(result.lon) : null,
    displayName: result.display_name,
    raw: result,
  };
}

export interface LocationAutocompleteProps {
  // Controlled text inside the search input.
  value: string;
  onChange: (next: string) => void;
  // Fired when the user picks a suggestion (via click, Enter, or Tab).
  onSelect: (picked: PickedLocation) => void;
  placeholder?: string;
  disabled?: boolean;
  // Comma-separated ISO 3166-1 alpha-2 codes (e.g. "et" or "us,ca").
  // Defaults to NEXT_PUBLIC_LOCATIONIQ_COUNTRY_CODES, then "et".
  countryCodes?: string;
  // Optional id for label association.
  id?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search for a place, road, or address",
  disabled,
  countryCodes,
  id,
}: LocationAutocompleteProps) {
  const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY ?? "";
  const resolvedCountryCodes = useMemo(
    () =>
      countryCodes ??
      process.env.NEXT_PUBLIC_LOCATIONIQ_COUNTRY_CODES ??
      "et",
    [countryCodes],
  );

  const [results, setResults] = useState<LocationIQResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks whether the latest value change was caused by picking a suggestion;
  // if so, we suppress the next fetch effect run so we don't immediately
  // reopen the dropdown with results for the just-selected place.
  const justPickedRef = useRef(false);

  const reactId = useId();
  const inputId = id ?? `loc-autocomplete-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  // Close the dropdown on outside clicks / focus changes.
  useEffect(() => {
    function handlePointer(e: MouseEvent | TouchEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, []);

  // Debounced query effect. Re-runs whenever the user types; cancels any
  // in-flight request so older queries can't overwrite a newer response.
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (!apiKey || trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const handle = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          key: apiKey,
          q: trimmed,
          limit: "6",
          dedupe: "1",
          normalizecity: "1",
          // statecode=1 asks LocationIQ to include state_code (e.g. "OR")
          // alongside the long state name where supported.
          statecode: "1",
          "accept-language": "en",
        });
        if (resolvedCountryCodes.trim()) {
          params.set("countrycodes", resolvedCountryCodes.trim());
        }

        const response = await fetch(`${AUTOCOMPLETE_URL}?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`LocationIQ ${response.status}`);
        }
        const json = (await response.json()) as LocationIQResult[];
        setResults(Array.isArray(json) ? json : []);
        setOpen(true);
        setActiveIndex(json.length > 0 ? 0 : -1);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setResults([]);
        setError("Couldn't reach LocationIQ. You can enter the address manually.");
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [value, apiKey, resolvedCountryCodes]);

  const choose = useCallback(
    (result: LocationIQResult) => {
      const picked = toPicked(result);
      justPickedRef.current = true;
      onChange(picked.displayName);
      onSelect(picked);
      setOpen(false);
      setResults([]);
      setActiveIndex(-1);
    },
    [onChange, onSelect],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) =>
        prev <= 0 ? results.length - 1 : prev - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        choose(results[activeIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const showDropdown =
    open &&
    !disabled &&
    !!apiKey &&
    value.trim().length >= MIN_QUERY_LEN &&
    (isLoading || results.length > 0 || !!error);

  const activeOptionId =
    activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            apiKey
              ? placeholder
              : "Set NEXT_PUBLIC_LOCATIONIQ_API_KEY to enable search"
          }
          className={cn(fieldClass, "pl-9 pr-9")}
        />
        {isLoading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {error ? (
            <li
              role="option"
              aria-selected={false}
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              {error}
            </li>
          ) : results.length === 0 && !isLoading ? (
            <li
              role="option"
              aria-selected={false}
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              No matching places found.
            </li>
          ) : (
            results.map((result, index) => {
              const isActive = index === activeIndex;
              const heading = result.display_place ?? result.display_name;
              const sub =
                result.display_address ??
                (result.display_place ? result.display_name : "");
              return (
                <li
                  key={`${result.place_id}-${index}`}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isActive}
                  // Use mousedown so the click registers before the input's
                  // blur fires and collapses the dropdown.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(result);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-primary hover:bg-slate-50",
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{heading}</p>
                    {sub && sub !== heading && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {sub}
                      </p>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
