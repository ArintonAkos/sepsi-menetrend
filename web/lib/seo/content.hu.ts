/** Hungarian prose for the guide pages. Canonical language of the site.
 *
 *  Facts here are pinned by `web/public/data/fares.json` and the Multi-Trans
 *  fare card dated 2026-02-01: city ticket 2,5 lej / 50 perc, Árkos (10-es)
 *  4 lej / 60 perc, a sofőrnél 5 lej, pénteken ingyenes. Buying methods and
 *  the sales-point list come from multitrans.ro/puncte_de_vanzare_a_biletelor.
 *  Prices are quoted "a multitrans.ro szerint" because the card may still drift. */
import type { GuideCopy, GuideKey } from "./content";

/** The twelve city lines with their end-to-end termini, primary direction.
 *  Shared by the pillar and Multi-Trans pages so the list never drifts. */
const LINES_HU: string[] = [
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

export const HU: Record<GuideKey, GuideCopy> = {
  pillar: {
    slug: "buszmenetrend",
    title: "Sepsiszentgyörgyi buszmenetrend – Multi-Trans vonalak",
    description:
      "A sepsiszentgyörgyi városi buszhálózat áttekintése: a Multi-Trans tizenkét vonala végállomásokkal, a jegyárak, az árkosi zóna és a pénteki ingyenes utazás.",
    body: [
      { h2: "Miről szól ez az oldal?" },
      {
        p: "Ez az oldal a sepsiszentgyörgyi buszmenetrend teljes áttekintése. Független projekt, amely a multitrans.ro-n közzétett menetrendet építi újra kereshető, térképes, útvonaltervezős formában. Nem a Multi-Trans hivatalos oldala.",
      },
      { h2: "A Multi-Trans és a városi buszhálózat" },
      {
        p: "Sepsiszentgyörgy (Kovászna megye) városi autóbusz-hálózatát a Multi-Trans S.A. üzemelteti. A cég tizenkét városi vonalat közlekedtet a városban és a szomszédos Árkos felé. A Multi-Trans menetrend vonalanként és megállónként is elérhető ezen az oldalon.",
      },
      { h2: "Vonalak és végállomások" },
      {
        p: "A tizenkét vonal és a fő irány két végállomása. A „D” jelzésű járatok kiegészítő indulások, amelyeket az üzemeltető külön számoz.",
      },
      { ul: LINES_HU },
      { h2: "Jegyek és az árkosi zóna" },
      {
        p: "A városi jegy a multitrans.ro szerint 2,5 lej, és felszállástól számítva 50 percig érvényes. Jegyet a 24pay mobilalkalmazásban, jegyautomatából, a Multi-Trans jegypénztáraiban és több boltban lehet venni; a sofőrnél is, de drágábban (5 lej). A 10-es vonal átmegy Árkosra, amely külön község és külön díjzóna: oda a jegy 4 lej, és 60 percig érvényes. Városi jeggyel nem lehet felszállni az árkosi buszra; árkosi jeggyel viszont át lehet szállni a városi buszokra.",
      },
      { h2: "Ingyenes péntek" },
      {
        p: "A Multi-Trans közlése szerint pénteken ingyenes a városi buszozás minden vonalon, az árkosi járatot is beleértve; a sepsiszentgyörgyi önkormányzat finanszírozza. Ez visszatérő kedvezmény, nem állandó garancia, ezért érdemes időnként ellenőrizni a Multi-Trans Facebook-oldalán.",
      },
      { h2: "Menetrend vonalanként és megállónként" },
      {
        p: "A részletes menetrendet az egyes vonalak és megállók oldalán találod. A csillaggal jelölt időpontokat a szomszédos megállókból számítottuk – az üzemeltető csak a végállomási és a fő megállói indulásokat teszi közzé.",
      },
    ],
  },

  fares: {
    slug: "dijszabas",
    title: "Jegyárak és jegyvásárlás a sepsiszentgyörgyi buszokon",
    description:
      "Mennyibe kerül a városi buszjegy Sepsiszentgyörgyön, hol lehet jegyet venni (24pay, automata, jegypénztár, sofőr), és mikor ingyenes az utazás.",
    body: [
      { h2: "A városi jegy" },
      {
        p: "A városi buszjegy a multitrans.ro szerint 2,5 lej. Felszállástól számítva 50 percig érvényes, ezen belül átszállással is lehet utazni. A jegy a városban, valamint Szotyorban, Kilyénben és Szépmezőn érvényes; Árkosra külön jegy kell.",
      },
      { h2: "Hogyan veszek jegyet?" },
      {
        p: "Több módon lehet jegyet venni, és a legtöbbhöz nem kell bankkártya:",
      },
      {
        ul: [
          "Jegyautomatából – 2,5 lej. Az egyik automata a Stadion utcában, a sportcsarnoknál éjjel-nappal működik.",
          "A Multi-Trans jegypénztáraiban – bódé a Szemerja végállomásnál, a vasútállomásnál és a Lábasháznál –, valamint több hírlapárusnál és boltban. A teljes lista a multitrans.ro-n van.",
          "A sofőrnél, de csak egy útra és drágábban: a multitrans.ro szerint 5 lej a 2,5 helyett.",
          "A 24pay mobilalkalmazásban, bankkártyával – 2,5 lej.",
        ],
      },
      {
        p: "A 24pay-hez töltsd le az alkalmazást, adj hozzá egy bankkártyát, válaszd ki Sepsiszentgyörgyöt, és a jegyet felszálláskor váltsd meg – az érvényessége ekkor indul.",
      },
      { h2: "Az árkosi járat (10-es vonal)" },
      {
        p: "Árkos külön község, ezért a 10-es vonal díjhatárt lép át. Az árkosi jegy a multitrans.ro szerint 4 lej, és 60 percig érvényes. A 2,5 lejes városi jeggyel nem lehet felszállni az árkosi buszra. Fordítva viszont igen: érvényes árkosi jeggyel át lehet szállni a városi buszokra új jegy vásárlása nélkül.",
      },
      { h2: "Bérletek" },
      {
        p: "A Multi-Trans 2026. februári díjtáblázata szerint a havi bérlet minden vonalra 84 lej. A nyugdíjasok a nyugdíjuk összegétől függően ingyenes vagy kedvezményes bérletet kapnak, a sepsiszentgyörgyi iskolák diákjainak pedig ingyenes. A bérletet a Multi-Trans jegypénztáraiban lehet igényelni.",
      },
      { h2: "Ingyenes péntek" },
      {
        p: "A Multi-Trans közlése szerint pénteken minden városi vonalon ingyenes az utazás, az árkosi járatot is beleértve. Az önkormányzat finanszírozza. Visszatérő kedvezmény, nem állandó garancia – indulás előtt érdemes ellenőrizni a Multi-Trans Facebook-oldalán.",
      },
      { h2: "Az árak pontossága" },
      {
        p: "Az árakat és az értékesítési pontokat a multitrans.ro-ról és a Multi-Trans 2026. februári díjtáblázatából vettük át; ezek változhatnak. A pontos, aktuális árat a 24pay alkalmazásban vagy a jegypénztárban látod.",
      },
    ],
  },

  multiTrans: {
    slug: "multi-trans",
    title: "Multi-Trans S.A., a sepsiszentgyörgyi buszüzemeltető",
    description:
      "Ki üzemelteti a sepsiszentgyörgyi városi buszokat, hol található a hivatalos menetrend, és milyen viszonyban áll ezzel a nem hivatalos oldallal.",
    body: [
      { h2: "Az üzemeltető" },
      {
        p: "A sepsiszentgyörgyi városi autóbusz-hálózatot a Multi-Trans S.A. üzemelteti. Hivatalos honlapja a multitrans.ro, ahol a menetrendek és a hivatalos közlemények megjelennek.",
      },
      { h2: "A vonalak" },
      {
        p: "A Multi-Trans tizenkét városi vonalat közlekedtet Sepsiszentgyörgyön. A 10-es vonal átmegy Árkosra, amely külön község és külön díjzóna. A teljes vonallista végállomásokkal a menetrend áttekintő oldalán található.",
      },
      { h2: "Ez az oldal nem hivatalos" },
      {
        p: "Ez a webhely egy független projekt. A multitrans.ro-n közzétett menetrendet dolgozza fel és építi újra kereshető, útvonaltervezős formában. Nem hivatalos oldal: nem áll kapcsolatban a Multi-Trans S.A.-val, és a cég nem hagyta jóvá.",
      },
      { h2: "Miért készült?" },
      {
        p: "A hivatalos menetrend PDF-ekben és megállói táblákon érhető el. Ez az oldal ezt géppel kereshetővé teszi, térképpel és útvonaltervezővel egészíti ki. Az adatok forrása változatlanul a Multi-Trans.",
      },
      { h2: "Hol találom a hivatalos információt?" },
      {
        p: "Árakat, menetrend-módosításokat és hivatalos híreket a multitrans.ro oldalon és a Multi-Trans Facebook-oldalán érdemes ellenőrizni. Eltérés esetén az üzemeltető közlése az irányadó.",
      },
    ],
  },

  bike: {
    slug: "sepsibike",
    title: "SepsiBike – kerékpármegosztás Sepsiszentgyörgyön",
    description:
      "Hogyan működik a SepsiBike kerékpármegosztás, mennyibe kerül, meddig ingyenes, és mikor lehet kerékpárt felvenni és leadni.",
    body: [
      { h2: "Mi a SepsiBike?" },
      {
        p: "A SepsiBike Sepsiszentgyörgy közösségi kerékpármegosztó rendszere, amelyet a GloBikes-szal közösen működtetnek. A dokkolókból kerékpárt lehet kölcsönözni, és bármelyik másik dokkolóban le lehet adni.",
      },
      { h2: "Regisztráció" },
      {
        p: "A használathoz SepsiBike / GloBikes fiók kell. A regisztráció és a kerékpár feloldása a szolgáltató alkalmazásában történik.",
      },
      { h2: "Mennyibe kerül?" },
      {
        p: "Az első 0–30 perc ingyenes. A hosszabb kölcsönzés díjköteles; az aktuális díjszabást a SepsiBike alkalmazásában látod. A díjat a kerékpár feloldása és leadása közötti időre számolják – a dokkolóhoz gyaloglás nem számít bele.",
      },
      { h2: "Mikor lehet kerékpárt felvenni?" },
      {
        p: "Kerékpárt 06:00 és 22:00 között lehet felvenni. 22:00 után már csak leadni lehet.",
      },
      { h2: "SepsiBike és a busz együtt" },
      {
        p: "Az útvonaltervező a busz mellett SepsiBike-os szakaszt is javasolhat, ha az gyorsabb. Ezt a tervező beállításai közt lehet ki- és bekapcsolni.",
      },
    ],
  },

  faq: {
    slug: "gyik",
    title: "Gyakori kérdések a sepsiszentgyörgyi buszokról",
    description:
      "Válaszok a leggyakoribb kérdésekre: jegyárak, ingyenes péntek, hol lehet jegyet venni, éjszakai járatok és a fontosabb úti célok.",
    body: [
      { h2: "Gyakori kérdések a sepsiszentgyörgyi buszokról" },
      {
        p: "Az alábbi válaszok a jegyárakról, a pénteki ingyenes utazásról, a jegyvásárlásról és a gyakran keresett úti célokról szólnak.",
      },
      {
        p: "A válaszok a multitrans.ro menetrendjén és a Multi-Trans nyilvános közlésein alapulnak. Hivatalos, naprakész információért nézd meg a multitrans.ro oldalt.",
      },
    ],
    faq: [
      {
        q: "Mennyibe kerül a buszjegy Sepsiszentgyörgyön?",
        a: "A városi jegy a multitrans.ro szerint 2,5 lej (a sofőrnél 5 lej), és felszállástól számítva 50 percig érvényes. A 10-es vonalon Árkosig a jegy 4 lej, és 60 percig érvényes.",
      },
      {
        q: "Hogyan veszek buszjegyet?",
        a: "Jegyet vehetsz a 24pay mobilalkalmazásban (bankkártyával), jegyautomatából, a Multi-Trans jegypénztáraiban – bódé a Szemerja végállomásnál, a vasútállomásnál és a Lábasháznál – és több boltban, illetve a sofőrnél, utóbbinál drágábban (5 lej). A 24pay-ben a jegyet felszálláskor kell megváltani.",
      },
      {
        q: "Kell-e bankkártya a jegyvásárláshoz?",
        a: "Nem. Bankkártya csak a 24pay alkalmazáshoz kell. A jegyautomatában, a jegypénztárakban, a boltokban és a sofőrnél készpénzzel is lehet fizetni.",
      },
      {
        q: "Ingyenes-e a busz pénteken?",
        a: "A Multi-Trans közlése szerint pénteken minden városi vonalon ingyenes az utazás, az árkosi járatot is beleértve. Ez visszatérő, önkormányzat által finanszírozott kedvezmény, de nem állandó garancia.",
      },
      {
        q: "Melyik busz megy a vasútállomáshoz?",
        a: "A vasútállomás az 1-es, a 2-es, a 7-es és a 9-es vonal egyik végállomása. A pontos indulási időket az adott vonal menetrend-oldalán találod.",
      },
      {
        q: "Melyik busz megy a Megyei Kórházhoz?",
        a: "A 2-es vonal egyik végállomása a Megyei Kórház. Az induló járatok időpontjai a 2-es vonal oldalán olvashatók.",
      },
      {
        q: "Van-e éjszakai járat?",
        a: "Nincs külön éjszakai járat. Az utolsó járatok jellemzően este indulnak; az adott vonal utolsó indulását a vonaloldalon nézd meg.",
      },
      {
        q: "Ez a Multi-Trans hivatalos oldala?",
        a: "Nem. Ez egy független projekt, amely a multitrans.ro-n közzétett menetrendet építi újra. Az oldal nem áll kapcsolatban a Multi-Trans S.A.-val.",
      },
      {
        q: "Miért van csillag néhány időpont mellett?",
        a: "A csillaggal jelölt időpontokat a szomszédos megállók adataiból számítottuk. Az üzemeltető csak a végállomási és a fő megállói indulásokat teszi közzé, a köztes megállókét nem.",
      },
    ],
  },
};
