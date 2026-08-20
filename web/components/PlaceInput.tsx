"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { search, type IndexedPlace, type Place } from "@/lib/engine/search";
import { forward, type Area, type NamePair } from "@/lib/geocode";
import type { Recent } from "@/lib/history";
import type { Lang, Strings } from "@/lib/i18n";
import type { LngLat } from "@/lib/engine/types";
import styles from "./PlaceInput.module.css";

export interface Chosen { name: string; at: LngLat }

const ICON: Record<string, string> = {
  stop: "⬤", street: "⌁", shop: "◧", poi: "◎", place: "▣", address: "⌖",
};

export default function PlaceInput({
  label, value, index, pairs, area, lang, t, locating, active, keepOpen, recent,
  into, onChoose, onPick, onLocate, onActivate, onForget,
}: {
  label: string;
  value: Chosen | null;
  index: IndexedPlace[];
  /** Hungarian/Romanian name pairs, so an address typed in Hungarian can be
   *  re-asked in the form the geocoder actually indexes. */
  pairs: NamePair[];
  area: Area;
  lang: Lang;
  t: Strings;
  /** null when idle, "busy" while looking, otherwise what went wrong. */
  locating: null | "busy" | string;
  /** Places used before, newest first. Shown when nothing is typed yet. */
  recent: Recent[];
  onForget: (place: Recent) => void;
  /** True when this is the field being searched, so only one list shows. */
  active: boolean;
  /** On a phone the search screen stays until the reader leaves it. */
  keepOpen: boolean;
  /** Where to put the suggestions. Left unset they hang under the field, which
   *  is what a dropdown should do on a wide screen. On the phone search screen
   *  the parent passes a slot below both fields: rendered in place the list
   *  either covers the other field or pushes it off the bottom of the screen,
   *  and half the time the field you came to change is that other one. */
  into?: HTMLElement | null;
  onActivate: (open: boolean) => void;
  onChoose: (place: Chosen) => void;
  onPick: () => void;
  onLocate: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [remote, setRemote] = useState<{ query: string; hits: Place[] }>(
    { query: "", hits: [] });
  /* Whether this field is being searched is the parent's business: on a phone
     picking a place should leave you on the search screen to fill the other
     one, not drop you back to the map. */
  const open = active;
  const setOpen = (next: boolean) => onActivate(next);

  // adopt a name the parent set - from the pin, the locator or a suggestion -
  // without an effect. Whether the search should close is the parent's call,
  // so this does not touch it: closing here overrode that decision.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value?.name ?? "");
  }

  const query = text.trim();
  /* Tapping a field that already holds a place means "somewhere else", not
     "search for this again" - so the history shows until something new is
     typed, and the first keystroke replaces what was there. */
  const untouched = !query || query === (value?.name ?? "").trim();
  // the local index is pure, so it is derived rather than stored
  const local = useMemo(
    () => (open && !untouched && query.length >= 2 ? search(index, query) : []),
    [open, untouched, query, index],
  );

  /* Only the geocoder needs an effect, and only when the index came up short.
     The answer carries the query it belongs to, so a late reply to an older
     query is ignored on render rather than cleared by a synchronous setState. */
  useEffect(() => {
    // a query carrying a house number always goes out, however many local
    // places happen to match the street name
    const address = /\d/.test(query);
    if (!open || untouched || query.length < 3 || (local.length >= 3 && !address)) return;
    const stop = new AbortController();
    const timer = setTimeout(async () => {
      const found = await forward(query, lang, area, stop.signal, pairs);
      if (!stop.signal.aborted) setRemote({ query, hits: found });
    }, 250);
    return () => { clearTimeout(timer); stop.abort(); };
  }, [open, untouched, query, lang, local.length, pairs, area]);

  const known = new Set(local.map((p) => (lang === "hu" ? p.hu : p.ro).toLowerCase()));
  const fresh = remote.query === query ? remote.hits : [];
  const hits: Place[] = [...local, ...fresh.filter((r) => !known.has(r.ro.toLowerCase()))];

  const hoist = (node: React.ReactNode) => (into ? createPortal(node, into) : node);
  const name = (p: Place) => (lang === "hu" ? p.hu || p.ro : p.ro || p.hu);
  const under = (p: Place) => [
    p.detail || (lang === "hu" ? p.ro : p.hu),
    p.remote ? "Mapbox" : null,
    p.approximate ? t.noHouseNumber : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.wrap}>
      <label className={styles.field} htmlFor={id}>
        <span className={styles.label}>{label}</span>
        <input
          id={id} value={text} autoComplete="off" placeholder={t.placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          onBlur={() => { if (!keepOpen) setTimeout(() => setOpen(false), 150); }}
        />
      </label>
      {/* the pin sits outside the label on purpose: inside it, a tap near the
          right edge of the field opens the picker by accident */}
      <button type="button" className={styles.pin} title={t.pickOnMap} aria-label={t.pickOnMap}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onPick(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      </button>
      {/* always open once focused: an empty query still offers "my position",
          which is otherwise unreachable now the button is gone */}
      {open && hoist(
        <ul className={`${styles.list} ${into ? styles.inPage : ""}`} role="listbox">
          <li>
            <button type="button" className={styles.locate}
                    /* stays open: if locating fails, this row is where the
                       reason has to appear */
                    onMouseDown={(e) => { e.preventDefault(); onLocate(); }}>
              <span className={styles.icon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <circle cx="12" cy="12" r="3.4" />
                  <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22" strokeLinecap="round" />
                </svg>
              </span>
              <span className={styles.text}>
                <span className={styles.name}>
                  {locating === "busy" ? t.locating : t.myLocation}
                </span>
                {locating && locating !== "busy" &&
                  <span className={styles.detail}>{locating}</span>}
              </span>
            </button>
          </li>
          {untouched && recent.map((entry) => (
            <li key={`r-${entry.at.join()}`} className={styles.recentRow}>
              <button type="button" onMouseDown={(e) => {
                e.preventDefault();
                onChoose({ name: entry.name, at: entry.at });
              }}>
                <span className={styles.icon}>◷</span>
                <span className={styles.text}>
                  <span className={styles.name}>{entry.name}</span>
                  <span className={styles.detail}>{t.recent}</span>
                </span>
              </button>
              <button type="button" className={styles.forget} title={t.forgetOne}
                      aria-label={`${t.forgetOne}: ${entry.name}`}
                      onMouseDown={(e) => { e.preventDefault(); onForget(entry); }}>×</button>
            </li>
          ))}
          {hits.map((p, i) => (
            <li key={`${p.ro}-${i}`}>
              <button type="button" onMouseDown={(e) => {
                e.preventDefault();
                onChoose({ name: name(p), at: p.at });
              }}>
                <span className={styles.icon}>{ICON[p.kind] ?? "◎"}</span>
                <span className={styles.text}>
                  <span className={styles.name}>{name(p)}</span>
                  <span className={styles.detail}>{under(p)}</span>
                </span>
                {p.aliases?.length ? <span className={styles.alias}>{p.aliases[0]}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
