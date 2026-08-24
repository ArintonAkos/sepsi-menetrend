# Közös busz–SepsiBike útvonaltervezés és domborzat

**Dátum:** 2026-08-25  
**Állapot:** jóváhagyott tervezési irány; implementáció előtt

## Cél

Az alkalmazás ne két külön javaslatlistát hasonlítson össze (busz vagy tisztán
SepsiBike), hanem egyetlen, fizikai útvonalhálózaton keressen. Egy utazás
tetszőleges, értelmes sorrendben tartalmazhat gyaloglást, buszt és SepsiBike-ot:

```text
séta → busz → séta → bicikli → séta → busz → séta
```

A választásnak mindig valódi gyalogos/biciklis OSM útvonalon, a buszok tényleges
menetrendjén, dokk-készleten, nyitvatartáson és – biciklinél – domborzaton kell
alapulnia. Az alkalmazásnak a teljes tervezés után is internet nélkül kell
működnie.

Ezzel párhuzamosan a megállólistában és a RAPTOR-ban nem maradhat olyan
útvonal, amely ugyanazon vonal két iránya között csak azért fordul vissza egy
korábbi pontba, mert a rossz oldali peronhoz rövidebb a séta.

## Nem cél

- SepsiBike-foglalás, fizetés vagy GloBikes-fiókkezelés.
- Valós idejű buszpozíció; a buszok menetrend szerint járnak.
- Egyéni erőnlét, e-bike vagy időjárási modell. A becslés átlagos, kényelmes
  közösségi kerékpárosra készül.
- Új, légvonalas vagy kitalált gyalogos kapcsolat létrehozása.

## Források és offline adat

### Busz és peronok

A GTFS továbbra is fizikai peronokat tárol. Az út két oldala két külön `Stop`;
köztük csak a `walks.json`/OSM alapján előállított, tényleges átkelés jelent
kapcsolatot. Azonos név önmagában soha nem tesz lehetővé átszállást.

`Terminal` nem lesz peron vagy kereshető megálló: a régi vonaloldal hívása,
amelyhez nincs megerősített OSM-peron, kikerül a 3-as és 4-es hívási listából.
A tényleges `Calea Brașovului 1` peronok megmaradnak.

### Domborzat

Build közben egy helyi, 30 m-es magassági modellből mintát veszünk a biciklis
gráf minden csúcsára. A kiadott app nem nyers DEM-et, hanem csak:

- a csúcsonkénti magasságot;
- az irányfüggő biciklis élidőt;
- a kiválasztott út összes emelkedését és ereszkedését

tárolja. Így a kliens nem hív magassági API-t, és offline működik. A forrás és
annak verziója/checksumja a build-metaadatban szerepel, hogy az eredmény
megismételhető legyen.

Alapérték kényelmes SepsiBike-használó:

- síkon 15 km/h;
- emelkedőn fokozatos lassítás a helyi meredekség szerint;
- lejtőn gyorsítás, biztonságos felső sebességhatárral;
- a nagyon rövid, zajos magasságváltozások simítása.

Az él költsége másodperc, nem méter. Emiatt a kereső egy kissé hosszabb, de
jelentősen laposabb utat választhat, ha az valóban gyorsabb.

## Közös multimodális kereső

### Állapot és csomópontok

A kereső cím/ajtó, buszperon és SepsiBike-dokk csomópontok között dolgozik.
Egy cím csak az adott lekérdezésre ideiglenes csomópont. Az állapot megmondja,
hogy a felhasználó gyalog van-e, biciklizik-e, vagy egy buszjáraton utazik.

- **gyalogos élek:** a jelenlegi offline OSM gyalogos gráf;
- **biciklis élek:** az irány- és hozzáféréshelyes OSM biciklis gráf,
  domborzatfüggő idővel;
- **busz-élek:** a GTFS futamok időbélyeges peronhívásai;
- **dokk-felvétel:** csak online, legalább egy kerékpárral rendelkező állomáson,
  06:00 és 22:00 között;
- **dokk-leadás:** csak online, legalább egy üres hellyel rendelkező állomáson.

Egy biciklit csak dokkban lehet felvenni és leadni. A kereső nem enged buszra
felszállni kölcsönzött biciklivel, és nem hagy nyitva egy biciklikölcsönzést a
végállapotban. A készlet offline módban használható utoljára ismert adatként,
de az opció ezt láthatóan jelzi.

### Keresési stratégia

A jelenlegi RAPTOR a buszos rész időbeli optimalizálója marad. A köré egy
korlátozott multimodális réteg kerül:

1. valós gyalogos hozzáférés a közeli peronokhoz és dokkokhoz;
2. RAPTOR-buszszakaszok;
3. dokkonkénti kerékpáros elérés, leadás és újbóli gyalogos/buszos folytatás;
4. állapotdominancia `(idő, gyaloglás, átszállások, aktív bicikli)` szerint.

Ez lehetővé teszi az első/utolsó kilométert és két buszszakasz közötti
kerékpározást is, de korlátozza a címkék számát: ugyanazon csomópontban csak a
nem dominált, érdemben különböző opciók maradnak. A maximális buszszakaszok
száma továbbra is három; egy útban legfeljebb két SepsiBike-kölcsönzés lehet.
Ez valós felhasználói kombinációkat enged, de védi a telefont a kombinatorikus
robbanástól.

### Értelmetlen visszafordulás tiltása

A buszos és multimodális jelölt útvonal összeállítása után egy általános
"nem haladó visszafordulás" vizsgálat fut.

Egy korábbi buszszakasz eldobható, ha az:

1. ugyanazon vonal ellentétes irányú következő szakaszához vezet;
2. a kettő együtt egy korábban elérhető állomás/peron környékére visz vissza;
3. a második szakasz megfelelő peronja a kiindulási pontból valós gyalogos
   úton elérhető; és
4. a közvetlen, későbbi felszállás a fennmaradó útvonalat nem teszi későbbivé.

Ilyenkor a közvetlen felszállás helyettesíti a hurkot. Nem vonalazonosság
alapján tiltunk automatikusan átszállást: ugyanazon vonalra történő, valódi
előrehaladást adó váltás továbbra is megengedett.

## Eredmény és megjelenítés

Minden találat egységes `Journey`-ként jelenik meg. A kártya és részletnézet
nem kap külön SepsiBike-elrendezést: a közlekedési szakaszok sorrendben,
azonos idővonallal látszanak.

- busznál: peron, vonal, irány, indulás/érkezés;
- gyaloglásnál: valódi út hossza és ideje;
- biciklinél: induló/cél-dokk, bicikliút hossza, ideje, `↑`/`↓`, készlet,
  nyitvatartás és becsült díj.

A térkép csak a kiválasztott út szakaszait mutatja: kezdő pin, célzászló,
gyalogos szaggatott vonal, biciklis kék vonal és buszvonal-szakaszok. Nem marad
mögötte a teljes hálózat, amikor egy útvonal van kijelölve.

A SepsiBike-javaslat kapcsoló saját, teljes soros kapcsoló a Beállításokban;
nem böngésző-natív checkbox. Kikapcsolva csak a javaslatok és a multimodális
keresés marad ki, az állomásmarkerek és a kereső tovább működnek.

## Menetrendi popupok

Az egy állomáson azonos vonalra, azonos következő megálló felé és azonos
irányba futó becsült mintákat a popup egyetlen, időrendben rendezett sorba
egyesíti. Két körjárati áthaladás csak akkor marad külön, ha a következő
megálló vagy az irány különbözik. A `*` megmarad minden nem publikált időn.

## Díj és üzemidő

A SepsiBike ára csak a dokkolótól dokkolóig tartó biciklis időből számolódik:
0–30 perc 0 lej, 31–90 perc 2 lej, 91–150 perc 4 lej, utána minden megkezdett
óra 6 lej. A 22:00-ig felvett, később szabályosan dokkolt biciklit a rendszer
érvényesnek tekinti; 22:00 után új kölcsönzés nem indulhat.

## Tesztelés és elfogadási feltételek

1. **Platform-adat:** nincs `Terminal` keresési, térképi vagy GTFS-peron;
   `Calea Brașovului 1` megmarad.
2. **Menetrendi popup:** három azonos irányú 3-as időoszlop egy sorba olvad;
   eltérő körjárati áthaladások nem olvadnak össze.
3. **Visszafordulás:** a Virág utca → Szotyor regresszióban nem jelenhet meg
   `Domb utca → Megyei Kórház → Domb utca` ugyanazon 1-es vonalon. A direkt,
   megfelelő peronról induló alternatívának meg kell maradnia.
4. **Multimodalitás:** tesztelt esetek első/utolsó kilométeres, buszok közötti
   biciklis és tisztán biciklis útvonalra; készlethiány, dokkhiány és
   nyitvatartási tiltás kizárja a biciklis szakaszt.
5. **Domborzat:** azonos út emelkedő irányban lassabb, lejtő irányban gyorsabb,
   de nem lépi át a felső sebességhatárt; a lapos út időváltozatlan marad.
6. **Védelem:** teljes meglévő engine-, Planner-, SepsiBike- és buildteszt;
   offline manuális próba telefonon és desktopon.

