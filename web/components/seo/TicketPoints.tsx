import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";
import { metresBetween } from "@/lib/walking-router";
import { ticketMapImage } from "@/lib/seo/ticket-map";
import { formatHours, type TicketPoint, type TicketPointsFile } from "@/lib/ticket-points";
import type { SeoLang } from "@/lib/seo/lang";
import styles from "./TicketPoints.module.css";

/** The physical ticket sales network, appended to the fares guide (`/dijszabas/`
 *  and its twins). A server component: the baked overview PNG plus a grouped
 *  list, no client JS. The live open/closed state belongs to the planner - a
 *  static page can only carry the schedule. */

const NEAR_STOP_M = 125;
const STOP_BASE: Record<SeoLang, string> = {
  hu: "/megallok/",
  ro: "/ro/statii/",
  en: "/en/stops/",
};

const T: Record<SeoLang, {
  h2: string; intro: string; kiosk: string; machine: string; shop: string;
  pass: string; stop: string; mapAlt: string;
}> = {
  hu: {
    h2: "Hol lehet jegyet venni – a helyszínek",
    intro:
      "Papírjegyet és bérletet az alábbi helyeken lehet venni, készpénzért. A Multi-Trans jegypénztárai csak munkanapokon nyitnak, a boltok többsége hétvégén is; a jegyautomata éjjel-nappal működik.",
    kiosk: "Multi-Trans jegypénztárak",
    machine: "Jegyautomata",
    shop: "Boltok és hírlapárusok",
    pass: "Bérlet:",
    stop: "megálló",
    mapAlt:
      "A sepsiszentgyörgyi jegypénztárak, a jegyautomata és a jegyet áruló boltok a térképen",
  },
  ro: {
    h2: "De unde se cumpără biletul – locațiile",
    intro:
      "Bilete pe hârtie și abonamente se cumpără cu numerar din locurile de mai jos. Casele de bilete Multi-Trans sunt deschise doar în zilele lucrătoare, majoritatea magazinelor și în weekend; automatul funcționează non-stop.",
    kiosk: "Case de bilete Multi-Trans",
    machine: "Automat de bilete",
    shop: "Magazine și puncte de presă",
    pass: "Abonament:",
    stop: "stația",
    mapAlt:
      "Casele de bilete, automatul și magazinele care vând bilete în Sfântu Gheorghe, pe hartă",
  },
  en: {
    h2: "Where to buy a ticket – the places",
    intro:
      "Paper tickets and passes are sold for cash at the places below. The Multi-Trans kiosks open on weekdays only, most shops at the weekend too; the machine runs around the clock.",
    kiosk: "Multi-Trans kiosks",
    machine: "Ticket machine",
    shop: "Shops and newsagents",
    pass: "Passes:",
    stop: "stop",
    mapAlt:
      "The kiosks, the ticket machine and the shops that sell tickets in Sfântu Gheorghe, on the map",
  },
};

export default function TicketPoints({ lang }: { lang: SeoLang }) {
  const { points }: TicketPointsFile = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/ticket-points.json"), "utf8"),
  );
  const places = buildPlaces(loadNetwork());
  const t = T[lang];
  const map = ticketMapImage();

  const nearStop = (p: TicketPoint) => {
    let best: (typeof places)[number] | null = null;
    let bestM = NEAR_STOP_M;
    for (const pl of places) {
      const m = metresBetween([p.lng, p.lat], pl.at);
      if (m < bestM) {
        bestM = m;
        best = pl;
      }
    }
    if (!best) return null;
    const slug = lang === "ro" ? best.slugRo : best.slug;
    return {
      name: lang === "ro" ? best.name.ro : best.name.hu,
      href: `${STOP_BASE[lang]}${slug}/`,
    };
  };

  const groups = [
    ["kiosk", t.kiosk],
    ["machine", t.machine],
    ["shop", t.shop],
  ] as const;

  return (
    <section className={styles.wrap}>
      <h2 className={styles.h2}>{t.h2}</h2>
      {map ? (
        // Zero client JS on this page; next/image would pull its runtime in, and
        // with `images: { unoptimized: true }` there is nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={map}
          alt={t.mapAlt}
          width={640}
          height={460}
          loading="lazy"
          decoding="async"
          className={styles.map}
        />
      ) : null}
      <p className={styles.intro}>{t.intro}</p>
      {groups.map(([kind, label]) => {
        const items = points.filter((p) => p.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind}>
            <h3 className={styles.h3}>{label}</h3>
            <ul className={styles.list}>
              {items.map((p) => {
                const st = nearStop(p);
                return (
                  <li key={p.id}>
                    <span className={styles.name}>{p.name[lang]}</span>
                    <span className={styles.addr}> — {p.address}</span>
                    <span className={styles.hours}>{formatHours(p.hours, lang)}</span>
                    {p.passHours ? (
                      <span className={styles.hours}>
                        {t.pass} {formatHours(p.passHours, lang)}
                      </span>
                    ) : null}
                    {st ? (
                      <a className={styles.stop} href={st.href}>
                        {lang === "ro" ? `→ ${t.stop} ${st.name}` : `→ ${st.name} ${t.stop}`}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
