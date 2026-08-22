import type { Lang } from "./i18n";

export const LANG_KEY = "sepsi.lang";
export const LANG_CHANGE_EVENT = "sepsi:lang";

export function readLang(store: Pick<Storage, "getItem"> | null): Lang {
  try {
    const raw = store?.getItem(LANG_KEY);
    if (raw === "hu" || raw === "ro") return raw;
  } catch {
    /* private browsing, or no storage at all */
  }

  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const param = urlParams.get("lang");
      if (param === "hu" || param === "ro") return param;
    } catch {
      /* ignore */
    }

    try {
      const browserLang = (typeof navigator !== "undefined" ? navigator.language : "")?.toLowerCase() ?? "";
      if (browserLang.startsWith("ro")) return "ro";
    } catch {
      /* ignore */
    }
  }

  return "hu";
}

export function writeLang(store: Pick<Storage, "setItem"> | null, value: Lang) {
  try {
    store?.setItem(LANG_KEY, value);
  } catch {
    /* private browsing, quota, or no storage at all */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
  }
}
