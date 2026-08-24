# OSM-alapú megállóperon-topológia

## Cél

A menetrendtervező minden felszállási és leszállási helyet valódi, külön
peronként kezeljen. Az azonos megállónév ne olvasszon össze két eltérő
helyet, és az alkalmazás ne gyártson becsült, nem bizonyított peronokat.

Ez javítja a körjáratok sorrendjét, az átszállási sétákat és a térképi
megjelenítést. A hivatalos Multi-Trans vonaloldal marad a megállósorrend
forrása; az OSM a fizikai peronok geometriájának forrása.

## Források és prioritás

1. **Multi-Trans vonaloldal:** a járat megállósorrendje, a hívások sorrendje
   és a közölt távolságok.
2. **Multi-Trans megállói menetrend:** az egyes megállóhelyeken közölt
   indulási idők.
3. **OpenStreetMap `public_transport=platform` / `highway=bus_stop`:** a
   valóban létező peronok neve és koordinátája.
4. **Verziózott helyi felülírás:** kizárólag dokumentált forrásütközés vagy
   OSM-hiány esetén. Minden bejegyzéshez indok, hivatkozott forrás és teszt
   tartozik.

Sem a név, sem a menetirány önmagában nem hozhat létre új peront.

## Kanonikus adatok

`platforms.json` lesz a generálás köztes, ellenőrizhető adata.

Minden peron tartalmazza:

- stabil azonosító;
- megjelenítési nevek;
- pontos koordináta;
- eredet (`osm`, `source-fallback`, `override`);
- OSM-azonosító vagy a fallback/override magyarázata;
- a hozzá kötött vonalhívások.

A vonalminta minden állomáshívása egy platformazonosítóra hivatkozik. A
hurokban ugyanaz a platform többször is előfordulhat, de minden előfordulás
megőrzi a saját sorszámát és idejét.

## Peronfeloldás

1. A nyers vonalhíváshoz a közelben lévő, név szerint is egyező OSM-peront
   választjuk legfeljebb 35 méteren belül. Ez a határ kizárja a szomszédos,
   azonos nevű, de különálló peronok véletlen összevonását.
2. Egyetlen OSM-peronhoz több hívás kapcsolódhat, ha ugyanazt a fizikai
   felszállóhelyet használják.
3. Ha nincs egyértelmű OSM-egyezés, a forrás koordinátájából egyetlen
   `source-fallback` peron lesz. Nem készül vele szemközti, eltolással
   létrehozott pár.
4. Több valós OSM-peron vagy több eltérő forráskoordináta több peront jelent,
   még akkor is, ha mindegyik neve azonos.
5. Bizonytalan vagy egymásnak ellentmondó egyezés nem kerül automatikusan
   összevonásra: bekerül az auditjelentésbe és szükség esetén felülírást kap.

## Átszállás és útvonaltervezés

- Peronok között csak a `walks.json` OSM-alapú útvonalán lehet átmenni.
- Azonos nevű, de külön peronok között nincs nulla perces átszállás.
- A részletező képernyőn a gyaloglási szakasz mindig megnevezi a célperont és
  kirajzolja az útját.
- A körjárat egyetlen járat marad: nem keletkezik belőle fiktív oda-vissza
  vonal vagy átszállás. A hurokban későbbi hívás ugyanazon busz folytatása.
- A ciklusvédelmet nem megállónév-csoport alapján végezzük; a tényleges
  platform- és utazássorrendet használjuk.

## Konkrét elfogadási esetek

1. **Erzsébet park / Lábasház:** az OSM-ben egy Erzsébet park és egy
   Lábasház peron van; a generált hálózatban is pontosan ennyi lesz. Nem
   jelenhet meg becsült második Erzsébet park.
2. **Cigarettagyár:** két külön koordinátájú, eltérő vonalcsoport által
   használt peron marad. A 3/4 és az 5/5D nem cserélődhet fel.
3. **Szemerja / Gólya utca:** a két fizikai terminál-peron külön marad;
   megjelenítési név felülírása csak ellenőrzött irány-hozzárendeléssel
   kerülhet be.
4. **2-es és 6-os körjárat:** a teljes út egy járművön követhető át;
   ismételt peronhívás nem keletkeztet átszállást és nem lesz érvénytelenítve.
5. **Terminál:** külön, hivatalosan közölt hívás marad, amíg bizonyított
   forrás nem mondja ki az ellenkezőjét.

## Változó fájlok és ellenőrzés

- új peronfeloldó modul és `platforms.json`;
- `build_map.py`, `build_gtfs.py`, `build_web_data.py` a név-alapú,
  eltolással peront gyártó út eltávolításához;
- útvonaltervező ciklusvédelme;
- auditoldal, hogy koordinátát, peronazonosítót és forrást is mutasson;
- Python egységtesztek a peronfeloldásra;
- TypeScript tesztek a tényleges peronok, gyalogos átszállások és körjáratok
  viselkedésére;
- teljes GTFS-validálás, webes tesztek és production build.

## Nem cél

Nem írjuk át a hivatalos vonalsorrendet, nem találunk ki menetrendi időket,
és nem törlünk bizonytalan megállóhívást csak egy sematikus térkép alapján.
