/** English prose for the guide pages. Additive: Hungarian is the site's
 *  canonical language. Facts are pinned by fares.json and the Multi-Trans fare
 *  card dated 2026-02-01: city ticket 2.5 lei / 50 min, Arcuș (line 10) 4 lei /
 *  60 min, 5 lei from the driver, free on Fridays. Buying methods and the
 *  sales-point list come from multitrans.ro/puncte_de_vanzare_a_biletelor.
 *  Prices are quoted "per multitrans.ro". */
import type { GuideCopy, GuideKey } from "./content";

/** The twelve city lines with their end-to-end termini, primary direction.
 *  Stop names are pinned to the Hungarian feed name (no EN display-name table
 *  this phase), so this list never contradicts the feed-rendered `PillarLines`
 *  block right below it on `/en/bus-schedule/`. Mirrors `LINES_HU`. */
const LINES_EN: string[] = [
  "1 · Szemerja Végállomás – Vasútállomás",
  "1D · Szemerja Végállomás – Multi-Trans",
  "2 · Megyei Kórház – Vasútállomás",
  "2D · Multi-Trans – Bartók Béla utca",
  "3 · Cigaretta utca 1 – Szotyor 2",
  "4 · Cigaretta utca 1 – Multi-Trans",
  "5 · Dózsa György utca – Sepsi Aréna",
  "5D · József Attila utca 2 – Multi-Trans",
  "6 · Sepsi Aréna – Bartók Béla utca",
  "7 · Szemerja Végállomás – Vasútállomás",
  "9 · Sugásfürdő – Vasútállomás",
  "10 · Árkos központ – Lábasház",
];

export const EN: Record<GuideKey, GuideCopy> = {
  pillar: {
    slug: "bus-schedule",
    title: "Sfântu Gheorghe bus schedule – Multi-Trans lines",
    description:
      "An overview of the Sfântu Gheorghe city bus network: the twelve Multi-Trans lines with their termini, ticket prices, the Arcuș zone and the free Friday travel.",
    body: [
      { h2: "What is this page?" },
      { p: "This page is a complete overview of the Sfântu Gheorghe bus schedule. It is an independent project that rebuilds the timetable published on multitrans.ro into a searchable, map-based, route-planning form. It is not the official Multi-Trans site." },
      { h2: "Multi-Trans and the city bus network" },
      { p: "The city bus network of Sfântu Gheorghe (Sepsiszentgyörgy, Covasna County) is operated by Multi-Trans S.A. The company runs twelve city lines in and around the town, including one to the neighbouring commune of Arcuș. The Multi-Trans timetable is available here by line and by stop." },
      { h2: "Lines and termini" },
      { p: "The twelve lines and the two end points of the main direction. The \"D\" services are supplementary departures the operator numbers separately." },
      { ul: LINES_EN },
      { h2: "Tickets and the Arcuș zone" },
      { p: "The city ticket is 2.5 lei per multitrans.ro, valid for 50 minutes from boarding, transfers included. Buy it in the 24pay app, from a ticket machine, at a Multi-Trans kiosk or in one of several shops; also from the driver, but at 5 lei. Line 10 crosses into Arcuș, a separate commune and a separate fare zone: that ticket is 4 lei and valid for 60 minutes. A city ticket does not let you board the Arcuș bus; an Arcuș ticket does let you transfer onto the city buses." },
      { h2: "Free Fridays" },
      { p: "Per Multi-Trans, city bus travel is free on Fridays on every line, the Arcuș service included; the Sfântu Gheorghe municipality funds it. This is a recurring arrangement, not a permanent guarantee, so it is worth checking the Multi-Trans Facebook page from time to time." },
      { h2: "Timetable by line and by stop" },
      { p: "The detailed timetable is on each line's and each stop's page. Times marked with an asterisk are interpolated from the neighbouring stops — the operator only publishes departures from the termini and a few main stops." },
    ],
  },

  fares: {
    slug: "fares",
    title: "Ticket prices and how to pay on the Sfântu Gheorghe buses",
    description:
      "How much a city bus ticket costs in Sfântu Gheorghe, where to buy one (24pay, machine, kiosk, driver), and when travel is free.",
    body: [
      { h2: "The city ticket" },
      { p: "The city bus ticket is 2.5 lei per multitrans.ro. It is valid for 50 minutes from boarding, and you can transfer within that time. It is valid in the city and in Coșeni (Szotyor), Chilieni (Kilyén) and Câmpu Frumos (Szépmező); Arcuș needs a separate ticket." },
      { h2: "How do I buy a ticket?" },
      { p: "There are several ways, and most do not need a bank card:" },
      { ul: [
        "From a ticket machine – 2.5 lei. One machine, on str. Stadionului by the sports hall, runs around the clock.",
        "At a Multi-Trans kiosk – at the Simeria line terminus, the railway station and Casa cu Arcade – and at several newsagents and shops. The full list is on multitrans.ro.",
        "From the driver, but for one trip only and dearer: 5 lei instead of 2.5, per multitrans.ro.",
        "In the 24pay mobile app, with a bank card – 2.5 lei.",
      ] },
      { p: "For 24pay: install the app, add a bank card, select Sfântu Gheorghe, and activate the ticket as you board — its validity starts then." },
      { h2: "The Arcuș line (line 10)" },
      { p: "Arcuș is a separate commune, so line 10 crosses a fare boundary. The Arcuș ticket is 4 lei per multitrans.ro and valid for 60 minutes. A 2.5 lei city ticket does not let you board the Arcuș bus. The other way round it does: with a valid Arcuș ticket you can transfer onto the city buses without buying a new ticket." },
      { h2: "Passes" },
      { p: "Per the Multi-Trans fare table of February 2026, a monthly pass for all lines is 84 lei. Pensioners get a free or reduced pass depending on their pension, and students at schools in Sfântu Gheorghe get one for free. Passes are issued at the Multi-Trans kiosks." },
      { h2: "Free Fridays" },
      { p: "Per Multi-Trans, travel is free on Fridays on every city line, the Arcuș service included. The municipality funds it. It is a recurring arrangement, not a permanent guarantee — worth checking the Multi-Trans Facebook page before you travel." },
      { h2: "How accurate are the prices?" },
      { p: "Prices and sales points are taken from multitrans.ro and the Multi-Trans fare table of February 2026; they can change. You see the exact current price in the 24pay app or at a kiosk." },
    ],
  },

  multiTrans: {
    slug: "multi-trans",
    title: "Multi-Trans S.A., the Sfântu Gheorghe bus operator",
    description:
      "Who operates the Sfântu Gheorghe city buses, where the official timetable is, and how it relates to this unofficial site.",
    body: [
      { h2: "The operator" },
      { p: "The Sfântu Gheorghe city bus network is operated by Multi-Trans S.A. Its official site is multitrans.ro, where timetables and official notices are published." },
      { h2: "The lines" },
      { p: "Multi-Trans runs twelve city lines in Sfântu Gheorghe. Line 10 crosses into Arcuș, a separate commune and a separate fare zone. The full line list with termini is on the schedule overview page." },
      { h2: "This site is not official" },
      { p: "This website is an independent project. It processes the timetable published on multitrans.ro and rebuilds it in a searchable, route-planning form. It is not official: it is not affiliated with Multi-Trans S.A., and the company has not endorsed it." },
      { h2: "Why it was built" },
      { p: "The official timetable is available as PDFs and on stop signs. This site makes it machine-searchable and adds a map and a route planner. The data still comes from Multi-Trans." },
      { h2: "Where do I find official information?" },
      { p: "Check prices, timetable changes and official news on multitrans.ro and the Multi-Trans Facebook page. In case of a discrepancy, the operator's notice prevails." },
    ],
  },

  bike: {
    slug: "sepsibike",
    title: "SepsiBike – bike sharing in Sfântu Gheorghe",
    description:
      "How SepsiBike bike sharing works, what it costs, how long it is free, and when you can pick up and drop off a bike.",
    body: [
      { h2: "What is SepsiBike?" },
      { p: "SepsiBike is Sfântu Gheorghe's public bike-sharing system, run together with GloBikes. You borrow a bike from a dock and return it at any other dock." },
      { h2: "Registration" },
      { p: "You need a SepsiBike / GloBikes account. Registration and unlocking a bike happen in the provider's app." },
      { h2: "What does it cost?" },
      { p: "The first 0–30 minutes are free. Longer rentals are charged; you see the current rates in the SepsiBike app. The charge is for the time between unlocking and returning the bike — walking to the dock does not count." },
      { h2: "When can I pick up a bike?" },
      { p: "Bikes can be picked up between 06:00 and 22:00. After 22:00 you can only return one." },
      { h2: "SepsiBike together with the bus" },
      { p: "The route planner may suggest a SepsiBike leg alongside the bus when it is faster. You can turn this on and off in the planner's settings." },
    ],
  },

  faq: {
    slug: "faq",
    title: "Frequently asked questions about the Sfântu Gheorghe buses",
    description:
      "Answers to the most common questions: ticket prices, free Fridays, where to buy a ticket, night services and the main destinations.",
    body: [
      { h2: "Frequently asked questions about the Sfântu Gheorghe buses" },
      { p: "The answers below cover ticket prices, free Friday travel, buying a ticket and the destinations people search for most." },
      { p: "The answers are based on the multitrans.ro timetable and Multi-Trans's public notices. For official, up-to-date information check multitrans.ro." },
    ],
    faq: [
      { q: "How much is a bus ticket in Sfântu Gheorghe?", a: "The city ticket is 2.5 lei per multitrans.ro (5 lei from the driver), valid for 50 minutes from boarding. On line 10 to Arcuș the ticket is 4 lei and valid for 60 minutes." },
      { q: "How do I buy a bus ticket?", a: "Buy it in the 24pay app (with a bank card), from a ticket machine, at a Multi-Trans kiosk – at the Simeria terminus, the railway station and Casa cu Arcade – or in one of several shops, or from the driver, where it is dearer (5 lei). In 24pay you buy the ticket as you board." },
      { q: "Do I need a bank card to buy a ticket?", a: "No. A bank card is only needed for the 24pay app. At the machine, the kiosks, the shops and the driver you can also pay cash." },
      { q: "Is the bus free on Fridays?", a: "Per Multi-Trans, travel is free on Fridays on every city line, the Arcuș service included. It is a recurring, municipality-funded arrangement, not a permanent guarantee." },
      { q: "Which bus goes to the railway station?", a: "The Railway Station (Vasútállomás) is a terminus of lines 1, 2, 7 and 9. The exact departure times are on each line's schedule page." },
      { q: "Which bus goes to the County Hospital?", a: "The County Hospital (Megyei Kórház) is a terminus of line 2. Departure times are on the line 2 page." },
      { q: "Is there a night service?", a: "There is no separate night service. The last departures are typically in the evening; check the last departure on the line's own page." },
      { q: "Is this the official Multi-Trans site?", a: "No. This is an independent project that rebuilds the timetable published on multitrans.ro. The site is not affiliated with Multi-Trans S.A." },
      { q: "Why is there an asterisk next to some times?", a: "Times marked with an asterisk are interpolated from the neighbouring stops. The operator only publishes departures from the termini and the main stops, not the intermediate ones." },
    ],
  },
};
