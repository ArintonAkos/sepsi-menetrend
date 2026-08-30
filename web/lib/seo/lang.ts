/** The languages the SEO surface is generated in. Hungarian is canonical and
 *  the hreflang x-default; Romanian and English are additive. */
export type SeoLang = "hu" | "ro" | "en";

export const SEO_LANGS: readonly SeoLang[] = ["hu", "ro", "en"];

/** Resolve a feed name object for a language. The feed carries `{ hu, ro }`
 *  only — every stop, street and headsign name. English reuses the Hungarian
 *  form: these are proper nouns, and the town's names are Hungarian first. */
export function pickName(names: { hu: string; ro: string }, lang: SeoLang): string {
  return lang === "ro" ? names.ro : names.hu;
}
