# SepsiBike mint egyenrangú útvonal-opció

**Dátum:** 2026-08-24  
**Branch:** `feat/sepsibike-maas`

## Cél és határ

A SepsiBike ne külön zöld kártya legyen, hanem a buszos útvonalak mellett
megjelenő, ugyanúgy kiválasztható és részletezhető közvetlen A → B opció.

Ez a változtatás **nem** tervez busz + SepsiBike vegyes utakat. A RAPTOR
menetrendi motor és a közvetlen, OSM-gráfon számolt SepsiBike-útvonal külön
számolódik; a bemutatásuk és a kiválasztásuk lesz közös.

## Üzemeltetési szabályok

A [SepsiBike hivatalos szabályzata](https://sepsibike.ro/regulament) szerint a
kerékpár-kölcsönzés naponta 06:00–22:00 között elérhető. 22:00 után csak a
kerékpárok visszaadása/zárolása lehetséges.

Ezért egy biciklis opció akkor érvényes, ha:

- az induló és célállomás `Online` és az indulón van legalább egy kerékpár,
  a célnál legalább egy szabad dokk;
- mindhárom OSM-gráfos szakasz (séta → bicikli → séta) megtalálható;
- a **kölcsönzés pillanata** (a tervezett indulás plusz az induló dokkhoz vezető
  gyaloglás) 06:00 vagy későbbi és 22:00 előtti.

A célállomásra történő visszadokkolás 22:00 után is érvényes. Érkezés szerinti
tervezésnél az indulási időt a kívánt érkezésből visszaszámolt szakaszidők
adják. A gyaloglás lehet az üzemidőn kívül is, maga a biciklikölcsönzés nem.

A hideg időszakra nem kerül fix naptári tiltás: a szabályzat csak közelítő,
időjárás- és üzemeltetésfüggő november–februári leállást ír. Az élő állomás-
státusz és készlet a döntő jel; snapshot/offline módban a lehetőség csak
„utoljára ismert” figyelmeztetéssel látszik.

## Közös eredménymodell

A UI új, diszkriminált `PlannerOption` típust használ:

```ts
type PlannerOption =
  | { kind: "transit"; journey: Journey }
  | { kind: "bike"; journey: TimedBikeJourney };
```

`TimedBikeJourney` a meglévő `BikeJourneyOption` mellett hordozza a tervezett
indulást, érkezést, kölcsönzési időt és árbecslést. A buszos route-ok nem
változnak, a SepsiBike pedig nem kerül a RAPTOR bemenetébe.

Depart-at módban a közvetlen biciklis opció a kért időpontban kezdődő teljes
útra kap indulás/érkezés értéket. Arrive-by módban a kívánt érkezésből indulunk
vissza. Az opciók ugyanabban a listában, az adott mód szerinti hasznossággal
jelennek meg, de a buszos URL-ben tárolt `journey` index továbbra is csak a
buszos útvonalra vonatkozik.

## Felület és interakció

A lista minden eleme azonos kattintási mintát kap:

- rövid kártya: módikon, teljes idő, indulás → érkezés, releváns címkék;
- SepsiBike-nál a rövid sorban a séta–bicikli–séta időbontás és a két állomás
  neve látszik;
- a kiválasztás közös részletnézetre visz és a megfelelő útvonalat emeli ki a
  térképen.

A biciklis részletnézet kiírja a tényleges OSM-út alapján:

1. az induló dokkig vezető séta méterét és percét;
2. a dokkok közötti biciklizés méterét és percét;
3. a célhoz vezető séta méterét és percét;
4. az induló bicikli- és cél-dokk készletét, frissességét, illetve az esetleges
   snapshot-figyelmeztetést;
5. a GloBikes-fiók előfeltételét, valamint a SepsiBike ügyfélszolgálat elérhetőségét.

## Díjbecslés

Az ár csak a kölcsönzött bicikli idejére vonatkozik, a két gyalogos szakaszra
nem. A megadott díjszabás:

- 0–30 perc: 0 lej;
- 31–90 perc: 2 lej;
- 91–150 perc: 4 lej;
- 151 perctől: minden megkezdett további óra 6 lej a visszaadásig.

Az alkalmazás ezt „becsült díj” felirattal adja meg; nem végez fizetést,
foglalást vagy fiókkezelést. Ha a szabályzat vagy az alkalmazás díjtáblája
megváltozik, a tarifa-konstansokat egyetlen, tesztelt modulban kell frissíteni.

## Hibák és offline viselkedés

Az opció nem jelenik meg hiányzó útvonal, használhatatlan állomás vagy tiltott
kölcsönzési idő esetén. Offline/snapshot adat mellett megjelenhet, de mindig
figyelmezteti a felhasználót, hogy a készlet utoljára ismert és indulás előtt a
GloBikes alkalmazásban ellenőrizendő.

## Ellenőrzés

- Unit teszt az üzemidőre: 06:00-kor kölcsönözhető, 22:00-kor már nem;
  22:00 utáni visszaadás engedett.
- Unit teszt az érkezés szerinti visszaszámításra és a díjsávokra.
- Planner-teszt: a bicikli és busz egy közös listában jelenik meg;
  kiválasztáskor a megfelelő részlet és térképi útvonal látszik.
- Regressziós teszt: a biciklis opció nem változtatja a RAPTOR inputjait,
  a buszos URL-indexet vagy az átszállási logikát.
- Teljes `npm test`, `npm run build`, majd telefonos és desktopos manuális ellenőrzés.
