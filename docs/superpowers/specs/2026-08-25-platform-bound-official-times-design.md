# Peronhoz kötött hivatalos időpontok

## Cél

A Multi-Trans letöltött megállói oszlopai csak arra a fizikai peronra és
menetirányra legyenek használhatók, amelyhez a vonal sorrendje bizonyíthatóan
köti őket. Ugyanaz a megállónév két szemközti peronját nem szabad összevonni.

## Jelenlegi hiba

Az `OfficialBoard` azonosítója jelenleg `(stopRo, lineId, destination)`. A
`StopBoard` emiatt csak `stopRo` alapján szűr: két külön `stopId`-jú, de
azonos nevű peron ugyanazt az összes oszlopot látja. A tervező ettől külön
rekonstruált mintából kaphat becsült időt akkor is, amikor az operátor az
adott peronra pontos időt közöl.

## Kanonikus azonosítás

Minden letöltött oszlop egy `OfficialBoardCall` hivatkozást kap:

```text
(line, sourceDirection, destination, stopRo) ->
  (pattern/direction, callIndex, stopId)
```

A hozzárendeléshez mind az öt elem szükséges: publikus vonal, forrásirány,
kijelzett cél, megállónév és az útvonaloldal megállósorrendje. A végső
`stopId` a `platforms.json` hívás-peron feloldásából származik. Egy
oszlophoz pontosan egy célhívás tartozhat; ellenkező esetben a generálás
auditált hibával megáll.

## Viselkedés

1. A megállói popup `stopId` szerint szűr, ezért csak az adott oldalon
   ténylegesen megálló irányokat mutatja.
2. A menettervezőből származó felszállás ugyanarra a `stopId`-ra kötött
   horgonyból készül. Letöltött horgony nem lehet `published=false` és nem
   írható felül interpolált idővel.
3. Becsült `*` csak olyan fizikai hívásra maradhat, amelyhez nincs
   illesztett hivatalos oszlop.
4. Ha a forrás csak állomásnevet közöl, de a vonalsorrend/cél nem dönt el
   egyetlen peront, a build hibázik; nem másoljuk az oszlopot mindkét oldalra.

## Konkrét elfogadás

- A `Str. Constructorilor 2` két 4-es oszlopa a megfelelő, különálló fizikai
  peronon jelenik meg, nem mindkettőn.
- A 04:21-es `Str. Fabricii / Gyár utca` oszlophoz tartozó tervezői felszállás
  pontosan 04:21, jelölés nélkül jelenik meg; nem 04:23*.
- Egy ugyanazon nevű ellenirányú peron nem kaphatja meg ezt a 04:21-es
  oszlopot.
- A 3-as Coșeni-szegmentálás továbbra is megtartja az előző,
  `2026-08-25-terminal-trip-segmentation-design.md` dokumentum szabályait.

## Offline működés és ellenőrzés

Minden hozzárendelés a generáláskor történik; a böngésző továbbra is csak a
statikus `network.json`-t olvassa. Az audit géppel ellenőrzi, hogy minden
publikus oszlop egyszer kötődik, vagy a build leáll. Python és Vitest tesztek
rögzítik azonos nevű két peron és hivatalos-vs-becsült idő eseteit.
