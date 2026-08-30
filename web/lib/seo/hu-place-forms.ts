/** Hand-written Hungarian case forms for the notable places the route pages
 *  pair up.
 *
 *  A route page is only ever "how do I get from A to B" between the 14 notable
 *  places, so the A→B phrase needs the ablative ("-tól/-től", from) form of A
 *  and the terminative ("-ig", to) form of B. The templated join gets vowel
 *  harmony, the hyphen and the final-vowel lengthening all wrong
 *  ("Sugásfürdő-tól" for "Sugásfürdőtől"), and the pair set is closed - so the
 *  correct forms are simply tabulated, keyed by the place slug. */

import type { Place } from "@/lib/seo/places";

/** "from X" - Hungarian ablative, keyed by the HU place slug. */
export const HU_FROM: Record<string, string> = {
  "arkos-kozpont": "Árkos központtól",
  "autoliv": "Autolivtól",
  "bevasarlokozpont": "Bevásárlóközponttól",
  "kalvin-ter": "Kálvin tértől",
  "labashaz": "Lábasháztól",
  "megyei-korhaz": "Megyei Kórháztól",
  "multi-trans": "Multi-Transtól",
  "plugor-sandor-liceum": "Plugor Sándor Líceumtól",
  "sepsi-arena": "Sepsi Arénától",
  "sugasfurdo": "Sugásfürdőtől",
  "szemerja-vegallomas": "Szemerja Végállomástól",
  "szepmezo": "Szépmezőtől",
  "vasutallomas": "Vasútállomástól",
  "vitez-mihaly-liceum": "Vitéz Mihály Líceumtól",
};

/** "to X" - Hungarian terminative, keyed by the HU place slug. */
export const HU_TO: Record<string, string> = {
  "arkos-kozpont": "Árkos központig",
  "autoliv": "Autolivig",
  "bevasarlokozpont": "Bevásárlóközpontig",
  "kalvin-ter": "Kálvin térig",
  "labashaz": "Lábasházig",
  "megyei-korhaz": "Megyei Kórházig",
  "multi-trans": "Multi-Transig",
  "plugor-sandor-liceum": "Plugor Sándor Líceumig",
  "sepsi-arena": "Sepsi Arénáig",
  "sugasfurdo": "Sugásfürdőig",
  "szemerja-vegallomas": "Szemerja Végállomásig",
  "szepmezo": "Szépmezőig",
  "vasutallomas": "Vasútállomásig",
  "vitez-mihaly-liceum": "Vitéz Mihály Líceumig",
};

/** "Vasútállomástól Megyei Kórházig" - the grammatical A→B phrase for a
 *  Hungarian route page (h1, breadcrumb, share card). The 14 notable places are
 *  a closed set; the templated "-tól/-ig" join is a defensive fallback that
 *  should never fire. */
export function huRoutePhrase(a: Place, b: Place): string {
  const from = HU_FROM[a.slug] ?? `${a.name.hu}-tól`;
  const to = HU_TO[b.slug] ?? `${b.name.hu}-ig`;
  return `${from} ${to}`;
}
