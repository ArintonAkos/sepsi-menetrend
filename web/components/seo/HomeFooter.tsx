import styles from "./HomeFooter.module.css";

/** The planner fills the viewport, so its links to the content pages live in
 *  the settings panel - which Googlebot never opens. This footer sits in the
 *  static markup of `/` and `/ro/`, below the app, so the line/stop/route
 *  pages are reachable from the homepage by a crawler (and by anyone who
 *  scrolls). Language-matched to the page it renders on. */
export default function HomeFooter({ lang }: { lang: "hu" | "ro" }) {
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
  const other = lang === "ro" ? { href: "/", label: "Magyar" } : { href: "/ro/", label: "Română" };

  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label={lang === "ro" ? "Pagini" : "Oldalak"}>
        {links.map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <p className={styles.meta}>
        <a href={other.href}>{other.label}</a>
        <span aria-hidden> · </span>
        {lang === "ro" ? "Nu este site-ul oficial Multi-Trans SA." : "Nem a Multi-Trans SA hivatalos oldala."}
        {" "}
        <a href="https://multitrans.ro/index.html" target="_blank" rel="noopener noreferrer">multitrans.ro</a>
      </p>
    </footer>
  );
}
