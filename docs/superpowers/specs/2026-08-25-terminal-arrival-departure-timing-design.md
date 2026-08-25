# Hivatalos érkezési és indulási idők a fordulópontokon

## Cél

A generált GTFS és az offline útvonaltervező a Multi-Trans által közzétett
megállói időket elsődleges adatként kezelje. A fordulóponton egy megállóhoz
tartozó érkezés és az onnan való későbbi indulás két külön esemény legyen;
a köztük lévő várakozást nem szabad a köztes megállók becslésével eltüntetni.

A megoldás minden vonalra alkalmazható. Nem 3-as- vagy Szotyor-specifikus
kivétel.

## Kiinduló probléma

A jelenlegi `trips.json` egyetlen `calls[i]` időt tárol minden megállóhívásra.
Ennek következtében a tervező ugyanazt az időt használja érkezéshez és a
következő elinduláshoz. A rekonstrukció a mért menetidőből képzett szomszédos
becslést érvényesíti, ezért egy későbbi, hivatalos fordulóponti idő hibásan
„visszafelé menőnek” tűnhet és kieshet.

Példa a 3-as vonalon:

| Esemény | Forrás szerinti idő | Jelentése |
| --- | ---: | --- |
| Coșeni 2, `Coșeni / Szotyor` | 04:56 | érkezés a végállomásra |
| Coșeni 2, `Str. Fabricii / Gyár utca` | 05:16 | következő, visszainduló járat indulása |

Ez húsz perc tényleges végállomási tartózkodás. A `04:40*` nem helyettesítheti
a publikált `04:56`-ot, és a `05:16` sem lehet korábbi, mint az érkezés.

## Források és bizonyíthatóság

| Forrás | Mire használjuk |
| --- | --- |
| Multi-Trans megállói menetrend | publikált óraidő, vonal, irányjelzés/headsign és szolgáltatási nap |
| Multi-Trans vonaloldal + ellenőrzött peron-topológia | fizikai megállósorrend, geometria és az ismételt hívások helye |
| mért menetidők | csak hiányzó, nem publikált idő kitöltése |

A közzétett időnek nincs becslési felülírója. Ha nem lehet egy publikált
időpontot egy bizonyított fizikai híváshoz hozzárendelni, a generálás auditált
hibával áll meg; nem készít hihető, de kitalált útvonaltervező-időt.

## Adatmodell

Minden futam minden hívásához két idő tartozik:

```json
{
  "arrival": 296,
  "departure": 316,
  "publishedArrival": true,
  "publishedDeparture": true
}
```

Az átlagos megállónál az `arrival` és a `departure` azonos lehet. A
fordulópontnál eltérhetnek. A belső idő továbbra is percben értendő; a
`00:00–03:59` a szolgáltatási nap végén `24:00–27:59` tartományba kerül.

Az app offline `Network.Trip` típusa teljes, futamonkénti érkezési és indulási
vektorokat kap. A `Pattern` csak a közös topológiát, geometriát és a becsült
alap-időeltolásokat tartja meg. Így egyazon útvonalgeometria nem szakad szét
csupán azért, mert két tényleges futam között eltér a végállomási várakozás.

GTFS-ben minden `stop_times.txt` sor a saját `arrival_time` és
`departure_time` értékét kapja. A `timepoint=1` csak azon eseményhez tartozik,
amelyet a kezelő publikált; becsült idő nem nevezhető hivatalosnak.

## Rekonstrukció

1. A normalizált megállói táblákból a hívásnak megfelelő, szolgáltatási napi
   publikus eseményeket gyűjtjük össze.
2. A futamokat monoton időrendben párosítjuk. A publikus esemény először a
   megfelelő `arrival` vagy `departure` mezőt tölti ki, soha nem egy relatív
   becslést módosít „vakon”.
3. Egy végállomási fordulónál az odafelé mutató kijelző az érkezési, a
   visszainduló kijelző az indulási eseményhez horgonyoz. A két érték között
   a futam vár; invariáns: `arrival <= departure`.
4. Két horgony között az üres mezőket a mért menetidő-arány szerint
   interpoláljuk. Az első/utolsó ismert horgonyon kívül csak a mért
   menetidőt használjuk. Az így keletkező esemény `published=false` marad.
5. Minden publikált eseménynek pontosan egyszer kell a futamok valamelyik
   érkezési vagy indulási mezőjéhez kapcsolódnia. Dupla hozzárendelés,
   nem-monoton eseménysor vagy feloldatlan oszlop generálási hiba.

Az ismételt megállóhívásokat a fizikai peronazonosító és a hívási sorszám
különbözteti meg. Nem a név alapján vonjuk össze őket.

## Tervező és megjelenítés

- Felszálláshoz a futam `departure[index]`, leszálláshoz az `arrival[index]`
  értéke tartozik.
- A járaton belüli következő megállóra a korábbi megálló indulása után lehet
  továbbhaladni, ezért a fordulóponti várakozás része marad a menetnek.
- A részletezőn és az összefoglalón egy szomszédos gyaloglás nem bontható több
  megállónév-köztes szakaszra. Ez a menetrendi időváltozás mellett megőrzi a
  korábbi normalizálási szabályt is.
- `*` kizárólag akkor látszik, ha az adott kijelzett érkezési vagy indulási
  esemény becslés. A megállói popup saját, szó szerinti hivatalos táblája
  változatlanul elsődleges ellenőrzési nézet marad.

## Hiba- és frissítési viselkedés

- Hiányos vagy megváltozott hivatalos letöltés: leállás az előző generált adat
  felülírása előtt.
- Publikus időhöz nem illő hívási sorrend: leállás részletes auditjelentéssel
  (vonal, szolgáltatási nap, peron, hívási sorszám, idő és ok).
- Ismeretlen név: csak dokumentált kanonikus névfeloldással folytatható.
- Egyetlen publikus idő sem módosítható automatikusan becsléssé a build
  „sikeressége” érdekében.

## Elfogadási feltételek és tesztek

1. Két futam eltérő köztes hivatalos időpontja mindkét futamban szó szerint
   megmarad, nem egy közös offset lesz belőle.
2. A 3-as `Coșeni 2` futamán az érkezés `04:56`, az indulás `05:16`; mindkettő
   publikált, a köztük lévő 20 perc pedig az útvonaltervezőben is megjelenik.
3. A tervező 04:34-kor Szotyor felé nem szállhat fel egy nem létező `04:40*`
   indulásra; csak valóban elérhető hivatalos indulást választhat.
4. A `stop_times.txt` a 3-as példában `arrival_time=04:56:00` és
   `departure_time=05:16:00` értéket tartalmaz ugyanahhoz a megállóhíváshoz.
5. A teljes feedben minden publikus horgony egyszer szerepel a megfelelő
   generált futam érkezési vagy indulási eseményében; nincs háttérben
   eldobott oszlop.
6. Python egységtesztek, GTFS-validáció, TypeScript planner-tesztek,
   `npm test`, `npm run build` és `git diff --check HEAD` sikeres.

## Nem cél

- Nem találunk ki új vonalgeometriát vagy új megállót.
- Nem változtatjuk meg a hivatalos megállói popupok szövegét.
- Nem teszünk hálózati kérést az útvonaltervezéshez; minden eredmény a
  kiadáskor legenerált, offline adatból készül.
