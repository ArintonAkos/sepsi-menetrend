/** English prose for the guide pages. Additive: Hungarian is the site's
 *  canonical language. Facts are pinned by the task brief and fares.json:
 *  city ticket 2.5 lei / 50 min via 24pay, Arcuș (line 10) 4 lei / 60 min,
 *  free on Fridays per Multi-Trans. Prices are quoted "per multitrans.ro". */
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
      { p: "The city ticket is 2.5 lei per multitrans.ro, valid for 50 minutes from boarding, transfers included. Buy it in the 24pay mobile app. Line 10 crosses into Arcuș, a separate commune and a separate fare zone: that ticket is 4 lei and valid for 60 minutes." },
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
      "How much a city bus ticket costs in Sfântu Gheorghe, how to buy one with the 24pay app, and when travel is free.",
    body: [
      { h2: "The city ticket" },
      { p: "The city bus ticket is 2.5 lei per multitrans.ro. It is valid for 50 minutes from boarding, and you can transfer within that time. The validity is stated by the operator; the price is taken from the multitrans.ro fares page." },
      { h2: "How do I buy a ticket?" },
      { p: "Buy the city ticket in the 24pay mobile app." },
      { ul: [
        "Install the 24pay app and add a bank card.",
        "Select Sfântu Gheorghe and the city bus ticket.",
        "Activate the ticket as you board; its validity starts then.",
      ] },
      { h2: "The Arcuș line (line 10)" },
      { p: "Arcuș is a separate commune, so line 10 crosses a fare boundary. The Arcuș ticket is 4 lei per multitrans.ro and valid for 60 minutes." },
      { h2: "Free Fridays" },
      { p: "Per Multi-Trans, travel is free on Fridays on every city line, the Arcuș service included. The municipality funds it. It is a recurring arrangement, not a permanent guarantee — worth checking the Multi-Trans Facebook page before you travel." },
      { h2: "How accurate are the prices?" },
      { p: "Prices come from the multitrans.ro fares page and may be out of date. The validity windows (50 and 60 minutes) are the operator's. You see the exact current price in the 24pay app before you buy." },
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
      "Answers to the most common questions: ticket prices, free Fridays, buying a ticket in the 24pay app, night services and the main destinations.",
    body: [
      { h2: "Frequently asked questions about the Sfântu Gheorghe buses" },
      { p: "The answers below cover ticket prices, free Friday travel, buying a ticket and the destinations people search for most." },
      { p: "The answers are based on the multitrans.ro timetable and Multi-Trans's public notices. For official, up-to-date information check multitrans.ro." },
    ],
    faq: [
      { q: "How much is a bus ticket in Sfântu Gheorghe?", a: "The city ticket is 2.5 lei per multitrans.ro, valid for 50 minutes from boarding. On line 10 to Arcuș the ticket is 4 lei and valid for 60 minutes." },
      { q: "How do I buy a bus ticket?", a: "Buy the ticket in the 24pay mobile app. Install the app, add a bank card, select Sfântu Gheorghe, and activate the ticket as you board." },
      { q: "Is the bus free on Fridays?", a: "Per Multi-Trans, travel is free on Fridays on every city line, the Arcuș service included. It is a recurring, municipality-funded arrangement, not a permanent guarantee." },
      { q: "Which bus goes to the railway station?", a: "The Railway Station (Vasútállomás) is a terminus of lines 1, 2, 7 and 9. The exact departure times are on each line's schedule page." },
      { q: "Which bus goes to the County Hospital?", a: "The County Hospital (Megyei Kórház) is a terminus of line 2. Departure times are on the line 2 page." },
      { q: "Is there a night service?", a: "There is no separate night service. The last departures are typically in the evening; check the last departure on the line's own page." },
      { q: "Is this the official Multi-Trans site?", a: "No. This is an independent project that rebuilds the timetable published on multitrans.ro. The site is not affiliated with Multi-Trans S.A." },
      { q: "Why is there an asterisk next to some times?", a: "Times marked with an asterisk are interpolated from the neighbouring stops. The operator only publishes departures from the termini and the main stops, not the intermediate ones." },
    ],
  },
};
