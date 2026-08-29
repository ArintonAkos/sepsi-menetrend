/** Romanian prose for the guide pages. Additive translation served under `/ro/`.
 *
 *  Same pinned facts as the Hungarian file: bilet urban 2,5 lei / 50 min prin
 *  24pay, Arcuș (linia 10) 4 lei / 60 min, vinerea gratuit "conform anunțurilor
 *  Multi-Trans". Prețurile sunt citate "conform multitrans.ro" pentru că pagina
 *  de tarife poate fi neactualizată. */
import type { GuideCopy, GuideKey } from "./content";

/** Cele douăsprezece linii urbane cu capetele de traseu, direcția principală.
 *  Aceleași linii ca în varianta maghiară, cu denumirile românești ale stațiilor. */
const LINES_RO: string[] = [
  "1 · Cap Linie Simeria – Gara CFR",
  "1D · Cap Linie Simeria – Multi-Trans",
  "2 · Spitalul Județean – Gara CFR",
  "2D · Multi-Trans – Str. Bartók Béla",
  "3 · Str. Țigaretei 1 – Coșeni 2",
  "4 · Str. Țigaretei 1 – Multi-Trans",
  "5 · Str. Dózsa György – Arena Sepsi",
  "5D · Str. József Attila 2 – Multi-Trans",
  "6 · Arena Sepsi – Str. Bartók Béla",
  "7 · Cap Linie Simeria – Gara CFR",
  "9 · Șugaș Băi – Gara CFR",
  "10 · Centru Arcuș – Casa cu Arcade",
];

export const RO: Record<GuideKey, GuideCopy> = {
  pillar: {
    slug: "orar-autobuz",
    title: "Orar autobuz Sfântu Gheorghe – liniile Multi-Trans",
    description:
      "Prezentare a rețelei de autobuz din Sfântu Gheorghe: cele douăsprezece linii Multi-Trans cu capete de traseu, tarifele, zona Arcuș și vinerea gratuită.",
    body: [
      { h2: "Despre acest site" },
      {
        p: "Acest site este o prezentare completă a orarului de autobuz din Sfântu Gheorghe. Este un proiect independent care reconstruiește orarul publicat pe multitrans.ro într-o formă căutabilă, cu hartă și planificator de traseu. Nu este site-ul oficial Multi-Trans.",
      },
      { h2: "Multi-Trans și rețeaua urbană" },
      {
        p: "Rețeaua de autobuz urban din Sfântu Gheorghe (Sepsiszentgyörgy), reședința județului Covasna, este operată de Multi-Trans S.A. Compania are douăsprezece linii de autobuz, în oraș și spre comuna vecină Arcuș. Aici găsești mersul autobuzelor Multi-Trans pe fiecare linie și stație.",
      },
      { h2: "Liniile și capetele de traseu" },
      {
        p: "Cele douăsprezece linii și cele două capete ale direcției principale. Cursele marcate cu „D” sunt curse suplimentare, numerotate separat de operator.",
      },
      { ul: LINES_RO },
      { h2: "Bilete și zona Arcuș" },
      {
        p: "Biletul urban costă 2,5 lei conform multitrans.ro și este valabil 50 de minute de la urcare, inclusiv dacă schimbi autobuzul. Se cumpără prin aplicația 24pay. Linia 10 trece în comuna Arcuș, o zonă tarifară separată: acolo biletul este 4 lei și este valabil 60 de minute.",
      },
      { h2: "Vinerea gratuită" },
      {
        p: "Conform anunțurilor Multi-Trans, vinerea este gratuit transportul urban pe toate liniile, inclusiv cursa spre Arcuș; este finanțat de primăria din Sfântu Gheorghe. Este o reducere recurentă, nu o garanție permanentă, așa că merită verificat periodic pe pagina de Facebook Multi-Trans.",
      },
      { h2: "Orarul pe linii și stații" },
      {
        p: "Orarul detaliat se găsește pe pagina fiecărei linii și a fiecărei stații. Orele marcate cu asterisc sunt calculate din stațiile vecine – operatorul publică doar plecările din capete și din stațiile principale.",
      },
    ],
  },

  fares: {
    slug: "tarife",
    title: "Tarife și bilete pentru autobuzele din Sfântu Gheorghe",
    description:
      "Cât costă biletul urban în Sfântu Gheorghe, cum se cumpără prin aplicația 24pay și când călătoria este gratuită.",
    body: [
      { h2: "Biletul urban" },
      {
        p: "Biletul de autobuz urban costă 2,5 lei conform multitrans.ro. Este valabil 50 de minute de la urcare, iar în acest interval poți călători și cu schimbare. Durata de valabilitate este comunicată de operator; prețul este preluat de pe pagina de tarife multitrans.ro.",
      },
      { h2: "Cum cumpăr biletul?" },
      {
        p: "Biletul urban se cumpără din aplicația mobilă 24pay.",
      },
      {
        ul: [
          "Instalează aplicația 24pay și adaugă un card bancar.",
          "Alege Sfântu Gheorghe și biletul urban.",
          "Cumpără biletul la urcarea în autobuz; valabilitatea începe în acel moment.",
        ],
      },
      { h2: "Cursa spre Arcuș (linia 10)" },
      {
        p: "Arcuș este o comună separată, deci linia 10 traversează o graniță tarifară. Biletul spre Arcuș costă 4 lei conform multitrans.ro și este valabil 60 de minute. Pentru porțiunea din Arcuș este nevoie de biletul de 4 lei, valabil 60 de minute.",
      },
      { h2: "Vinerea gratuită" },
      {
        p: "Conform anunțurilor Multi-Trans, vinerea este gratuit pe toate liniile urbane, inclusiv cursa spre Arcuș. Este finanțat de primărie. Este o reducere recurentă, nu o garanție permanentă – înainte de plecare merită verificat pe pagina de Facebook Multi-Trans.",
      },
      { h2: "Cât de exacte sunt prețurile" },
      {
        p: "Prețurile provin de pe pagina de tarife multitrans.ro și este posibil să nu mai fie de actualitate. Durata de valabilitate (50, respectiv 60 de minute) este comunicată de operator. Prețul exact, actualizat, apare în aplicația 24pay înainte de cumpărare.",
      },
    ],
  },

  multiTrans: {
    slug: "multi-trans",
    title: "Multi-Trans S.A., operatorul de autobuz din Sfântu Gheorghe",
    description:
      "Cine operează autobuzele urbane din Sfântu Gheorghe, unde este orarul oficial și ce legătură are cu acest site neoficial.",
    body: [
      { h2: "Operatorul" },
      {
        p: "Rețeaua de autobuz urban din Sfântu Gheorghe este operată de Multi-Trans S.A. Site-ul oficial este multitrans.ro, unde apar orarele și comunicatele oficiale.",
      },
      { h2: "Liniile" },
      {
        p: "Multi-Trans operează douăsprezece linii de autobuz urbane în Sfântu Gheorghe. Linia 10 trece în Arcuș, care este o comună separată și o zonă tarifară separată. Lista completă a liniilor cu capete de traseu se află pe pagina de prezentare a orarului.",
      },
      { h2: "Acest site este neoficial" },
      {
        p: "Acest site este un proiect independent. Preia orarul publicat pe multitrans.ro și îl reconstruiește într-o formă căutabilă, cu planificator de traseu. Este un site neoficial: nu este afiliat cu Multi-Trans S.A. și nu este aprobat de aceasta.",
      },
      { h2: "De ce există?" },
      {
        p: "Orarul oficial este disponibil în PDF-uri și pe panourile din stații. Acest site îl face căutabil automat și adaugă o hartă și un planificator de traseu. Sursa datelor rămâne Multi-Trans.",
      },
      { h2: "Unde găsesc informația oficială?" },
      {
        p: "Pentru tarife, modificări de orar și anunțuri oficiale, verifică multitrans.ro și pagina de Facebook Multi-Trans. În caz de diferență, comunicarea operatorului este cea valabilă.",
      },
    ],
  },

  bike: {
    slug: "sepsibike",
    title: "SepsiBike – bike-sharing în Sfântu Gheorghe",
    description:
      "Cum funcționează bike-sharingul SepsiBike, cât costă, cât timp este gratuit și când se poate ridica sau preda o bicicletă.",
    body: [
      { h2: "Ce este SepsiBike?" },
      {
        p: "SepsiBike este sistemul de bike-sharing al orașului Sfântu Gheorghe, operat împreună cu GloBikes. Bicicletele se iau dintr-o stație (dock) și se pot preda la oricare altă stație.",
      },
      { h2: "Înregistrare" },
      {
        p: "Pentru utilizare este necesar un cont SepsiBike / GloBikes. Înregistrarea și deblocarea bicicletei se fac în aplicația operatorului.",
      },
      { h2: "Cât costă?" },
      {
        p: "Primele 0–30 de minute sunt gratuite. Închirierea mai lungă se tarifează; tariful actual apare în aplicația SepsiBike. Se taxează timpul dintre deblocarea și predarea bicicletei – mersul pe jos până la stație nu este inclus în tarif.",
      },
      { h2: "Când se poate ridica o bicicletă?" },
      {
        p: "Bicicletele se pot ridica între 06:00 și 22:00. După ora 22:00 este posibilă doar predarea.",
      },
      { h2: "SepsiBike împreună cu autobuzul" },
      {
        p: "Planificatorul poate propune un segment cu SepsiBike pe lângă autobuz, dacă este mai rapid. Opțiunea se activează sau se dezactivează din setările planificatorului.",
      },
    ],
  },

  faq: {
    slug: "intrebari-frecvente",
    title: "Întrebări frecvente despre autobuzele din Sfântu Gheorghe",
    description:
      "Răspunsuri la cele mai frecvente întrebări: tarife, vinerea gratuită, cumpărarea biletului în 24pay, curse de noapte și destinații importante.",
    body: [
      { h2: "Întrebări frecvente despre autobuzele din Sfântu Gheorghe" },
      {
        p: "Răspunsurile de mai jos privesc tarifele, călătoria gratuită de vineri, cumpărarea biletului și destinațiile căutate frecvent.",
      },
      {
        p: "Răspunsurile se bazează pe orarul de pe multitrans.ro și pe anunțurile publice Multi-Trans. Pentru informații oficiale și actuale, consultă multitrans.ro.",
      },
    ],
    faq: [
      {
        q: "Cât costă biletul de autobuz în Sfântu Gheorghe?",
        a: "Biletul urban costă 2,5 lei conform multitrans.ro și este valabil 50 de minute de la urcare. Pe linia 10, spre Arcuș, biletul este 4 lei și este valabil 60 de minute.",
      },
      {
        q: "Cum cumpăr biletul de autobuz?",
        a: "Biletul se cumpără din aplicația 24pay. Instalează aplicația, adaugă un card bancar, alege Sfântu Gheorghe și cumpără biletul la urcarea în autobuz.",
      },
      {
        q: "Este autobuzul gratuit vinerea?",
        a: "Conform anunțurilor Multi-Trans, vinerea este gratuit pe toate liniile urbane, inclusiv spre Arcuș. Este o reducere recurentă finanțată de primărie, nu o garanție permanentă.",
      },
      {
        q: "Ce autobuz merge la gară?",
        a: "Gara CFR este cap de linie pentru liniile 1, 2, 7 și 9. Orele exacte de plecare sunt pe pagina fiecărei linii.",
      },
      {
        q: "Ce autobuz merge la Spitalul Județean?",
        a: "Spitalul Județean este unul dintre capetele liniei 2. Orele curselor se găsesc pe pagina liniei 2.",
      },
      {
        q: "Există curse de noapte?",
        a: "Nu există curse de noapte separate. Ultimele plecări sunt de obicei seara; verifică ora ultimei curse pe pagina liniei respective.",
      },
      {
        q: "Acesta este site-ul oficial Multi-Trans?",
        a: "Nu. Este un proiect independent care reconstruiește orarul publicat pe multitrans.ro. Site-ul nu este afiliat cu Multi-Trans S.A.",
      },
      {
        q: "De ce au unele ore un asterisc?",
        a: "Orele marcate cu asterisc sunt calculate din datele stațiilor vecine. Operatorul publică doar plecările din capete și din stațiile principale, nu și din cele intermediare.",
      },
    ],
  },
};
