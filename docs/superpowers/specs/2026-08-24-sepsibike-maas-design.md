# SepsiBike multimodális tervező – tervezési specifikáció

**Dátum:** 2026-08-24
**Branch:** `feat/sepsibike-maas`

## Cél

A Sepsi Menetrend maradjon egy gyors, offline használható busztervező, de
egészítse ki a SepsiBike rendszerrel: a felhasználó ugyanarra az A → B kérdésre
lássa a használható buszos és a közvetlen, dokkolós kerékpáros alternatívát.
Ez *nem* teljes MaaS még: nem adunk el SepsiBike-hozzáférést vagy buszjegyet,
és nem ígérünk élő készletet offline állapotban.

Az alkalmazás meglévő magyar és román felületét teljes angol nyelvvel egészítjük
ki. Az új funkció és a meglévő tervező minden felhasználói szövege HU/RO/EN
fordítást kap.

## Döntések és határok

### Beleértett V1

1. A 17 dokkolóállomás statikus katalógusa, élő készletszámokkal kiegészítve.
2. Zöld, számozott SepsiBike-réteg a Mapbox térképen és akadálymentes,
   alkalmazáson belüli állomáskártya.
3. Helyi, offline keresés: `bicikli`, `kerékpár`, `dokkoló`, illetve egy állomás
   neve vagy környéke is találatot ad.
4. Közvetlen kerékpáros útvonal: séta az induló dokkhoz → tekerés → séta a
   célhoz. A séta és a tekerés is OSM-gráfon számolódik, nem légvonalban.
5. Busz és kerékpár összehasonlító kártyák, egyértelmű feltételekkel és
   útvonal-kiemeléssel a térképen.
6. Telepítési ("kezdőképernyőre") felület Androidon és iOS-en, a Beállításokban
   másodlagos belépési ponttal.
7. Valódi offline viselkedés: a statikus állomáskatalógus, keresés, biciklis
   útvonal és a tervező működik első sikeres megnyitás után. Az élő készlet,
   címkeresés és új térképcsempék továbbra is internetet igényelnek.

### Kifejezetten nem része ennek a branchnek

- **Busz + SepsiBike kombinált utak.** Elsőként a közvetlen „busz vagy bicikli”
  döntést oldjuk meg. Vegyes utaknál a dokkoló-készlet, átszállási puffer,
  menetjegy és visszatekerési kockázat együtt új optimalizálási problémát ad;
  külön, mért használat után indítandó funkció.
- **7474 / `SEPSI1` SMS gomb.** A számot és üzenetformátumot nem támasztja alá
  ellenőrzött, aktuális Multi-Trans-forrás. Hibás jegyvásárlási instrukciót nem
  teszünk ki. Később, az üzemeltető írásos megerősítésével valósítható meg.
- **Meccs- és rendezvénynapi sáv, partnerek.** Ezekhez megbízható eseményfeed,
  tartalomgazda, megjelenítési szabály és üzleti jóváhagyás kell. Adat nélkül
  csak elavuló vagy félrevezető felület lenne.
- **Fizetés, foglalás, SepsiBike-fiók kezelése.** A GloBikes szolgáltatás
  feladata. A felület csak a használat előfeltételét jelzi és a hivatalos
  szolgáltatás felé terel.

## Adatmodell és frissítés

`web/public/data/sepsibike.json` lesz az egyetlen, verziózott állomáskatalógus.
Minden rekordnak van stabil azonosítója, neve, címe, koordinátája és kapacitása.
A buildben rögzített készletszám **pillanatkép**, ezért `snapshotAt` mezőt kap és
soha nem kap "élő" feliratot.

Az API-válasz egy burkolt objektum:

```ts
type BikeAvailability = {
  stations: BikeStation[];
  source: "live" | "snapshot";
  fetchedAt: string;
  stale: boolean;
};
```

Az Edge Function az official SepsiBike térképlap strukturált `items` tömbjét
olvassa, szigorúan validálja (17 egyedi id, véges koordináta, nemnegatív
kapacitás), és csak teljes, érvényes választ fogad el. Sikertelen hálózat,
HTML-változás vagy hibás adat esetén 502 helyett a statikus pillanatképet adja
vissza `source: "snapshot"` és `stale: true` jelzéssel.

Az élő válasz 60 másodperces Netlify-CDN cache-t kap, 5 perc
stale-while-revalidate idővel. Ez kíméli a forrást, de nem állítjuk, hogy a
globális CDN *matematikailag* pontosan egyetlen upstream-kérést tud garantálni:
párhuzamos cold miss vagy régiós cache több hívást okozhat. A UI a frissességet
mutatja, az app pedig nem válik használhatatlanná ettől.

Mivel a Netlify site base-je `web`, a function forrása is
`web/netlify/edge-functions/sepsibike.ts` alá kerül. Így a Netlify alapértelmezett
Edge Function könyvtára valóban tartalmazza, és a `/api/sepsibike` endpoint a
deploy része lesz.

## Offline útvonaltervezés

A gyalogos routerből nem számolunk biciklis utat. Ugyanabból a helyi OSM
kivonatból egy külön `bicycle-graph.json` készül:

- kihagyja a lépcsőket, tiltott és magánutakat;
- figyelembe veszi a `bicycle=*`, `access=*`, `oneway=*` és `oneway:bicycle=*`
  címkéket;
- a közlekedhető utakon a megengedett irányokat veszi fel;
- a böngészőben Workerben futó Dijkstra a tényleges úthossz alapján ad útvonalat.

A kerékpáros sebesség 15 km/h (250 m/perc) becslés, nem élő forgalmi adat.
A hozzáférő és elvezető gyaloglás a meglévő 80 m/perc gyalogos gráfot használja.
Ha bármelyik pont nem csatlakoztatható biztonságos közelségben a megfelelő
gráfra, a biciklis alternatíva nem jelenik meg, ahelyett hogy légvonalas hamis
időt írna ki.

Egy kerékpáros javaslat feltételei:

- induló állomás `Online` és legalább 1 kerékpár;
- célállomás `Online` és legalább 1 szabad dokk;
- az élő adat legfeljebb ötperces; offline/snapshot esetben az útvonal
  megmutatható, de az elérhetőség "utoljára ismert";
- a tényleges tekerés legfeljebb 25 perc a díjmentes 30 perc konzervatív
  kommunikációjához. Ekkor jelenhet meg a „várhatóan 0 RON” szöveg;
  hosszabb útnál nem találgatunk árat.

Az ajánlat jelzi, hogy SepsiBike/GloBikes-fiók szükséges, és nem foglal biciklit.

## Felület és interakció

### Térkép

`TransitMap` kap egy külön GeoJSON source/réteget. A dokkok zöld kerékpárjelölők,
a rendelkezésre álló kerékpárok száma Mapbox szövegréteg, ezért nem 17 külön DOM
marker terheli a térképet. Kattintásra vagy billentyűzetes fókuszra a Planner
állapotában kiválasztott állomás lesz, és egy React állomáskártya jelenik meg.

Az állomáskártya tartalma: név, cím, frissesség, online/figyelmeztetés/offline
állapot, kerékpárok és üres dokkok száma, arányos kapacitássáv. Nem Mapbox HTML
popupot használunk, hogy a fordítás, fókuszkezelés és mobil nézet egységes
maradjon.

### Keresés

Az állomások `PlaceKind = "bikeStation"` típust kapnak, a régi helyi indexbe
kerülnek, és megkapják a magyar/román/angol kategórianevet, helyi környék- és
"bicikli / kerékpár / bike / dock / stație" aliasokat. Egy dokk kiválasztható
indulásként vagy célként; normál tervezéskor ugyanúgy koordinátás hely marad.

### Tervezőeredmény

A jelenlegi buszos utak maradnak a kanonikus időzített opciók. Ha teljesülnek a
fenti feltételek, egy SepsiBike alternatíva jelenik meg mellettük: teljes idő,
induló/cél dokk, séta–tekerés–séta bontás, távolság, készletbizalom és díjjelzés.
Rákattintáskor az útvonal szakaszonként (szürke gyalog, zöld bicikli) látszik a
térképen. Nem kerül bele a RAPTOR buszos optimumkeresésbe, így nem torzíthatja a
menetrendi rangsorolást vagy a már javított átszállási logikát.

## Nyelvek

`Lang` háromértékű (`hu | ro | en`) lesz. Az angol azonos jogú alkalmazásnyelv:
a meglévő Planner, kereső, beállítások, jogi és új SepsiBike-szöveg is lefordul.
Az adatszolgáltatói állomásneveket nem fordítjuk mesterségesen; helyette a címke
és kategória fordul, a hivatalos név változatlan marad.

## Telepítés a kezdőképernyőre

A manifest és service worker már megvan, de hiányzik a felhasználói út:

- Android/Chromium: a `beforeinstallprompt` eseményt eltároló, egyszeri
  „Telepítés” CTA; siker esetén eltűnik.
- iOS/Safari: nincs programozható prompt, ezért rövid, lokalizált útmutató:
  Megosztás → „Főképernyőhöz adás”.
- Már standalone módban futó appban sem banner, sem beállítási CTA nem látszik.
- A Beállításokban mindig van egy diszkrét „Alkalmazás telepítése” sor, ha az
  adott böngészőben értelmes; a fő CTA csak egyszer, nem tolakodóan jelenik meg.

## Tesztelés és elfogadási feltételek

1. Unit tesztek a SepsiBike HTML-feldolgozóra, sémára és fallbackre.
2. Keresési tesztek mind a 17 állomásra és az aliasokra.
3. A kerékpáros gráf fordítójának szabálytesztjei (lépcső, tiltott út, egyirány).
4. Router tesztek tényleges, nem légvonalas úthosszra és hiányzó kapcsolatra.
5. Planner tesztek: készlet nélküli opció rejtett; élő adatnál korrekt bontás;
   snapshot figyelmeztetés; 25 perc felett nincs 0 RON ígéret.
6. Térképréteg és billentyűzetes állomáskártya tesztje.
7. Install UI tesztek Android prompttal, iOS útmutatóval és standalone móddal.
8. Teljes `npm test`, `npm run lint`, `npm run build`; telefonos manuális
   ellenőrzés online és cache-ből offline módban.

## Megvalósítási sorrend

1. Adatszerződés, Netlify Edge Function deploy-útvonal és fallback tesztekkel.
2. Állomás-típusok, teljes EN i18n és helyi kereső.
3. OSM kerékpáros gráf, Worker és router tesztekkel.
4. Planner biciklis alternatíva és szakaszos útvonal-rajzolás.
5. Térképréteg, állomáskártya, élő adat frissítése.
6. Install UX, offline cachelista és végső minőségellenőrzés.
