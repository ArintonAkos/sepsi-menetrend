"use client";

import type { Strings } from "@/lib/i18n";
import styles from "./HouseAd.module.css";

/** Where it points. One place, so a typo cannot ship half-working.
 *
 *  The campaign tag is the only way anyone will ever know whether this block
 *  did anything: nothing here counts a click, and it should not - the whole
 *  app runs without tracking of any kind and needs no consent banner because
 *  of it. Attribution belongs on the other end, where the visitor lands. */
const HREF = "https://aperta-sync.com/"
  + "?utm_source=sepsibusz&utm_medium=app&utm_campaign=journey-detail";

/** The Aperta mark.
 *
 *  Traced from the supplied artwork, a 2048px JPEG that was mostly white
 *  padding: cropped to the mark, reduced to a fifteen-colour palette along the
 *  ramps between white and the two brand colours, and written as a 4-bit PNG.
 *  That removes the JPEG noise, which is what stopped a flat two-colour logo
 *  from compressing, and takes it from 1 MB to under a kilobyte.
 *
 *  It keeps its white ground on purpose. The navy is nearly black, and on the
 *  dark theme a keyed-out mark would disappear into the panel; a white tile
 *  reads the same either way, which is why app icons are built that way.
 */
function Mark() {
  return (
    // next/image has nothing to add here: the export is static, so there is no
    // optimiser behind it, and the file is already under a kilobyte. The name
    // is spelled out beside it, so the alt would only repeat it aloud.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.mark} src="/aperta.png" alt="" width={34} height={34}
         loading="lazy" decoding="async" />
  );
}

/**
 * A note about the other thing the same people build.
 *
 *  Placed after the fare, at the very bottom of a journey the reader has
 *  already got their answer from - not beside the times, where anything that
 *  is not a departure erodes trust in the ones that are. It says plainly whose
 *  it is and where it goes, because a transit app that slips promotion in
 *  unlabelled has spent something it cannot buy back.
 */
export default function HouseAd({ t }: { t: Strings }) {
  return (
    <aside className={styles.ad}>
      <p className={styles.label}>{t.fromTheMakers}</p>
      <a className={styles.card} href={HREF} target="_blank" rel="noopener noreferrer">
        <Mark />
        <span className={styles.text}>
          <span className={styles.name}>Aperta Sync</span>
          <span className={styles.pitch}>{t.apertaPitch}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round" className={styles.go} aria-hidden>
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
    </aside>
  );
}
