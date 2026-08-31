import { Fragment } from "react";
import type { SeoLang } from "@/lib/seo/lang";
import styles from "./HomeFooter.module.css";

/** The planner fills the viewport, so its links to the content pages live in
 *  the settings panel - which Googlebot never opens. This footer sits in the
 *  static markup of `/`, `/ro/` and `/en/`, below the app, so the line/stop/
 *  route pages are reachable from the homepage by a crawler (and by anyone who
 *  scrolls). Language-matched to the page it renders on. */
export default function HomeFooter({ lang }: { lang: SeoLang }) {
  const links =
    lang === "ro"
      ? [
          ["/ro/orar-autobuz/", "Orar autobuz Sfântu Gheorghe"],
          ["/ro/linii/", "Linii de autobuz"],
          ["/ro/statii/", "Stații"],
          ["/ro/trasee/", "Trasee"],
          ["/ro/tarife/", "Prețuri bilete"],
          ["/ro/multi-trans/", "Despre Multi-Trans"],
          ["/ro/intrebari-frecvente/", "Întrebări frecvente"],
          ["/ro/termeni/", "Termeni și condiții"],
          ["/ro/confidentialitate/", "Confidențialitate"],
        ]
      : lang === "en"
        ? [
            ["/en/bus-schedule/", "Sfântu Gheorghe bus schedule"],
            ["/en/lines/", "Bus lines"],
            ["/en/stops/", "Bus stops"],
            ["/en/routes/", "Routes"],
            ["/en/fares/", "Ticket prices"],
            ["/en/multi-trans/", "About Multi-Trans"],
            ["/en/faq/", "FAQ"],
            ["/en/terms/", "Terms of use"],
            ["/en/privacy/", "Privacy"],
          ]
        : [
            ["/buszmenetrend/", "Sepsiszentgyörgyi buszmenetrend"],
            ["/vonalak/", "Buszvonalak"],
            ["/megallok/", "Megállók"],
            ["/utvonal/", "Útvonalak"],
            ["/dijszabas/", "Jegyárak"],
            ["/multi-trans/", "A Multi-Transról"],
            ["/gyik/", "Gyakori kérdések"],
            ["/felhasznalasi-feltetelek/", "Felhasználási feltételek"],
            ["/adatvedelem/", "Adatkezelési tájékoztató"],
          ];

  // One plain sentence of what the site is - the static homepage is otherwise
  // almost all planner UI, so this is the only crawlable prose on `/`. Sits
  // below the viewport-tall planner, in the footer, so nothing above the fold
  // moves.
  const intro =
    lang === "ro"
      ? "Orarul autobuzelor urbane din Sfântu Gheorghe și un planificator de rute, pe baza datelor publicate de Multi-Trans."
      : lang === "en"
        ? "The city bus timetable and route planner for Sfântu Gheorghe, built from the schedule data Multi-Trans publishes."
        : "Sepsiszentgyörgy városi buszmenetrendje és járattervezője a Multi-Trans által közzétett menetrendi adatok alapján.";

  const disclaimer =
    lang === "ro"
      ? "Nu este site-ul oficial Multi-Trans SA."
      : lang === "en"
        ? "Not the official Multi-Trans SA website."
        : "Nem a Multi-Trans SA hivatalos oldala.";

  // Both other languages, in a fixed order, so a reader on any homepage can
  // reach the other two. Dynamic `href` (as with `links` above) - a bare
  // literal `/` would trip `no-html-link-for-pages`, and `next/link` would
  // pull client JS into this otherwise-static footer.
  const langLinks = ([
    ["hu", "/", "Magyar"],
    ["ro", "/ro/", "Română"],
    ["en", "/en/", "English"],
  ] as const).filter(([code]) => code !== lang);

  return (
    <footer className={styles.footer}>
      <p className={styles.intro}>{intro}</p>
      <nav className={styles.links} aria-label={lang === "ro" ? "Pagini" : lang === "en" ? "Pages" : "Oldalak"}>
        {links.map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <p className={styles.meta}>
        {langLinks.map(([code, href, label]) => (
          <Fragment key={code}>
            <a href={href}>{label}</a>
            <span aria-hidden> · </span>
          </Fragment>
        ))}
        {disclaimer}
        {" "}
        <a href="https://multitrans.ro/index.html" target="_blank" rel="noopener noreferrer">multitrans.ro</a>
      </p>
    </footer>
  );
}
