# Fordulópontok külön menetrendi futamként

> Ez a dokumentum felülírja a
> `2026-08-25-terminal-arrival-departure-timing-design.md` azon feltételezését,
> hogy a fordulópont két időpontja bizonyítottan ugyanahhoz a járműfutamhoz
> tartozik.

## Bizonyított tény és cél

A Multi-Trans megállói tábla a 3-asnál ezt közli:

```text
Coșeni felé:      Motel Calypso 04:55 → Coșeni 2 04:56
Gyár utca felé:   Coșeni 1 05:15 → Coșeni 2 05:16 → Motel Calypso 05:18
```

Az 05:16-os futam már 05:15-kor a Coșeni 1-nél van. Ezért nem állítható,
hogy azonos azzal a járművel, amely 04:56-kor a Coșeni 2-höz érkezett. A cél
nem a járműazonosság feltételezése, hanem minden közzétett időpont pontos
használata és a két futam közti valós várakozás tervezése.

## Modell

A visszaforduló, ismételt peronokat tartalmazó hosszú útvonal nem egyetlen
menetrendi minta. Deklaratív, ellenőrzött szegmensekre bomlik:

| Minta | A 3-as eredeti hívási indexei | Hivatalos kijelző |
| --- | --- | --- |
| Coșeni felé | `0…17` | `Coșeni / Szotyor` |
| Gyár utca felé | `16…31` | `Str. Fabricii / Gyár utca` |

Az átfedés szándékos: a Gyár utca felé tartó külön futam a Coșeni 1-nél
05:15-kor, majd a Coșeni 2-nél 05:16-kor áll meg. A két minta ugyanazt a
vonalazonosítót (`3`) használja, de külön `pattern_id`-t és külön futamokat
kap.

## Források és szabályok

1. A közzétett megállói időpont kemény horgony a hozzá tartozó szegmensben.
2. A horgonyokat a vonal, az irány, a fizikai peronhívás, a kijelző szövege és
   a szolgáltatási nap együtt azonosítja.
3. Egy `*` csak olyan szegmenshívásnál marad, amelyhez a kezelő nem közöl
   időpontot. Becsült idő nem ír felül horgonyt.
4. Ha egy horgony nem illeszthető monoton a kijelölt szegmenshez, a generálás
   auditált hibával megáll. Nem kerül át egy másik hurokátfutásra.
5. A tervező a Coșeni 2-höz 04:56-kor megérkező és az onnan 05:16-kor induló
   külön futam között 20 perc várakozást számol; nem szállhat fel 04:40*-kor.

## Adatfolyam

`turnarounds.json` a hosszú forrásirány kulcsához rögzíti a szegmensek
eredeti kezdő- és végindexét, valamint a kizárólag hozzájuk tartozó
`destination` értéket. A generátor ebből szegmensirányokat hoz létre, majd
mindegyikhez önállóan futtatja a már meglévő, monoton horgonyillesztést.

Egy futamon belül a megálló időpontja továbbra is egyetlen `calls[i]` érték:
az adott futam a peronnál megáll. Külön érkezési/indulási érték csak akkor
kellene, ha hivatalos járműblokk-azonosító igazolná az ugyanazon jármű
végállomási tartózkodását; ilyen forrás nincs.

`build_gtfs.py` szegmensenként ír `trips.txt` és `stop_times.txt` sorokat.
`build_web_data.py` a GTFS-szegmensekből külön térképi mintákat készít, a
geometriát az első és utolsó szegmensmegálló közé vágva. A vonaljelvény és a
díjlogika változatlanul 3-as vonalként kezeli őket.

## Tervező és felület

- Az egyik szegmensből a másikba való váltás valódi, azonos peronon történő
  várakozás. A `MIN_TRANSFER` továbbra is érvényes.
- A részletező ezt „Várakozás a 3-as következő futamára” szöveggel mutatja,
  nem új jegyet vagy nem bizonyított járműcserét sugalló átszállásként.
- A térkép csak a választott futamszegmensek geometriáját emeli ki.
- A megállói popup szó szerint a letöltött hivatalos táblát mutatja; ettől a
  szegmensbontás nem vesz el időpontot.

## Elfogadási feltételek

1. A 3-as Coșeni felé mintája a Coșeni 2-nél hivatalos `04:56` hívással ér
   véget.
2. A Gyár utca felé minta a Coșeni 1 `05:15`, Coșeni 2 `05:16`, Motel Calypso
   `05:18` horgonyokat ebben a sorrendben tartalmazza.
3. A Coșeni 2-nél 04:34-kor érkező utas nem kaphat 04:40* indulást; a
   következő megfelelő, hivatalos 05:16-os futamot kapja.
4. A GTFS és az offline `network.json` ugyanazokat a szegmensidőket használja.
5. A teljes audit minden hivatalos időpontot pontosan egyszer talál meg a
   kijelölt szegmensben, vagy buildhibát jelent.
6. A teljes Python-, Vitest-, GTFS-validációs és production build sikeres.
