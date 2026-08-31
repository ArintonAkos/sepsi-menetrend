"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { readLang, writeLang, LANG_CHANGE_EVENT } from "@/lib/lang";
import type { Lang } from "@/lib/i18n";
import { Back } from "../common/icons";
import styles from "./LegalPage.module.css";

function subscribeLang(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LANG_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LANG_CHANGE_EVENT, onChange);
  };
}

function getLangSnapshot(): Lang {
  return readLang(globalThis.localStorage ?? null);
}

function getLangServerSnapshot(): Lang {
  return "hu";
}

interface LegalPageProps {
  type: "terms" | "privacy";
  /** Fixes the language of the `/ro/` and `/en/` route twins: the server render
   *  and the first client render must be that language so a crawler and the
   *  initial paint agree. Once the visitor uses the in-page switch, their stored
   *  preference takes over. Omitted on `/felhasznalasi-feltetelek/` and
   *  `/adatvedelem/`, which stay store-driven. */
  lang?: "hu" | "ro" | "en";
}

export default function LegalPage({ type, lang: forcedLang }: LegalPageProps) {
  const storedLang = useSyncExternalStore(subscribeLang, getLangSnapshot, getLangServerSnapshot);
  const [switched, setSwitched] = useState(false);
  const lang = forcedLang && !switched ? forcedLang : storedLang;

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("sepsi.theme");
      if (storedTheme === "dark" || storedTheme === "light") {
        document.documentElement.dataset.theme = storedTheme;
      }
    } catch {
      /* ignore */
    }
  }, []);

  const changeLang = (newLang: Lang) => {
    if (forcedLang) setSwitched(true); // let the visitor leave the forced language
    writeLang(globalThis.localStorage ?? null, newLang);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <Link
              href="/"
              className={styles.backButton}
              aria-label={lang === "ro" ? "Înapoi" : lang === "en" ? "Back" : "Vissza"}
            >
              <Back />
            </Link>
            <div className={styles.brand}>
              <span className={styles.brandName}>Sepsi Menetrend</span>
              <span className={styles.brandSub}>
                {type === "terms"
                  ? (lang === "ro" ? "Termeni și condiții" : lang === "en" ? "Terms of use" : "Felhasználási feltételek")
                  : (lang === "ro" ? "Confidențialitate" : lang === "en" ? "Privacy" : "Adatkezelési tájékoztató")}
              </span>
            </div>
          </div>

          <div className={styles.seg} role="group" aria-label="Nyelvválasztó">
            <button
              aria-pressed={lang === "hu"}
              onClick={() => changeLang("hu")}
            >
              Magyar
            </button>
            <button
              aria-pressed={lang === "ro"}
              onClick={() => changeLang("ro")}
            >
              Română
            </button>
            <button
              aria-pressed={lang === "en"}
              onClick={() => changeLang("en")}
            >
              English
            </button>
          </div>
        </header>

        <main className={styles.card}>
          <div className={styles.badge}>
            {type === "terms"
              ? (lang === "ro" ? "JURIDIC" : lang === "en" ? "LEGAL" : "JOGI NYILATKOZAT")
              : (lang === "ro" ? "CONFIDENȚIALITATE & COOKIE-URI" : lang === "en" ? "PRIVACY & COOKIES" : "ADATVÉDELEM & SÜTIK")}
          </div>

          {type === "terms" ? (
            lang === "ro" ? <TermsContentRo /> : lang === "en" ? <TermsContentEn /> : <TermsContentHu />
          ) : (
            lang === "ro" ? <PrivacyContentRo /> : lang === "en" ? <PrivacyContentEn /> : <PrivacyContentHu />
          )}

          <nav className={styles.footerNav}>
            <div className={styles.footerLinks}>
              {type === "terms" ? (
                <Link href="/adatvedelem/" className={styles.otherPageLink}>
                  {lang === "ro"
                    ? "→ Politica de confidențialitate și cookie-uri"
                    : lang === "en"
                      ? "→ Privacy & cookie policy"
                      : "→ Adatkezelési és süti tájékoztató"}
                </Link>
              ) : (
                <Link href="/felhasznalasi-feltetelek/" className={styles.otherPageLink}>
                  {lang === "ro"
                    ? "→ Termeni și condiții de utilizare"
                    : lang === "en"
                      ? "→ Terms of use"
                      : "→ Felhasználási feltételek"}
                </Link>
              )}
              <a
                href="https://multitrans.ro/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.operatorLink}
              >
                Multi-Trans S.A. (multitrans.ro) ↗
              </a>
            </div>
            <Link href="/" className={styles.homeButton}>
              {lang === "ro" ? "Înapoi la căutare" : lang === "en" ? "Back to search" : "Vissza a tervezőhöz"}
            </Link>
          </nav>
        </main>
      </div>
    </div>
  );
}

function TermsContentHu() {
  return (
    <>
      <h1 className={styles.title}>Felhasználási Feltételek és Jogi Nyilatkozat</h1>
      <div className={styles.lastUpdated}>Hatályos: 2026. augusztus 22.</div>

      <div className={styles.alertBox}>
        <p>
          <strong>Kifejezett felelősségkizárás:</strong> A Sepsi Menetrend egy független, nem hivatalos tájékoztató eszköz. 
          A készítők <strong>semmilyen felelősséget nem vállalnak</strong> a menetrendi adatok pontatlanságából, elírásából, 
          járatkésésekből vagy kimaradásokból eredő közvetlen vagy közvetett károkért.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. A szolgáltatás jellege és függetlensége</h2>
        <p className={styles.paragraph}>
          A Sepsi Menetrend egy magánkezdeményezésre készült, ingyenesen használható webes alkalmazás, 
          amelynek célja a sepsiszentgyörgyi helyi közösségi közlekedés menetrendjeinek átláthatóbb, 
          gyorsabb és kényelmesebb böngészése és útvonaltervezése.
        </p>
        <p className={styles.paragraph}>
          Az oldal <strong>nem minősül a helyi közlekedési szolgáltató (Multi-Trans S.A.) vagy 
          Sepsiszentgyörgy Polgármesteri Hivatalának hivatalos felületének</strong>.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Az adatok forrása és a becsült menetidők</h2>
        <p className={styles.paragraph}>
          Az alkalmazásban szereplő menetrendek, vonalak, díjszabások és megállónevek a Multi-Trans S.A. 
          hivatalos weboldalán (<em>multitrans.ro</em>) nyilvánosan közzétett menetrendi hirdetmények feldolgozásán alapulnak.
        </p>
        <p className={styles.paragraph}>
          <strong>Fontos tudnivaló:</strong> Az üzemeltető nyilvánosan kizárólag a végállomások és egyes kiemelt 
          megállók indulási időpontjait teszi közzé. Az alkalmazásban a köztes megállóknál megjelenő, 
          csillaggal (<strong>*</strong>) jelölt időpontok <em>számított matematikai becslések</em> (interpolációk), 
          amelyek a valós forgalmi viszonyoktól, útviszonyoktól vagy az időjárástól függően eltérhetnek.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Teljes körű felelősségkorlátozás és felelősségkizárás</h2>
        <p className={styles.paragraph}>
          A szolgáltatást a fejlesztők <em>„megtekintett állapotban” („AS IS”)</em> és <em>„elérhetőség szerint” („AS AVAILABLE”)</em> biztosítják. 
          Sem a készítők, sem a közreműködők nem vállalnak sem kifejezett, sem hallgatólagos szavatosságot vagy garanciát:
        </p>
        <ul className={styles.list}>
          <li>a menetrendek, átszállási idők és díjszabások hibátlanságáért, teljességéért vagy naprakészségéért;</li>
          <li>a helyi forgalmi torlódásokból, időjárási körülményekből, terelésekből vagy balesetekből adódó járatkésésekért vagy kimaradásokért;</li>
          <li>az üzemeltető által bevezetett előzetes vagy rendkívüli menetrend-módosításokért;</li>
          <li>bármilyen közvetlen, közvetett, véletlenszerű vagy következményes kárért, elmaradt haszonért, elkésett csatlakozásért (pl. vonat, repülő, munka, vizsga, orvosi időpont);</li>
          <li>az oldal esetleges szerver- vagy hálózati elérhetetlenségéből adódó kellemetlenségekért.</li>
        </ul>
        <p className={styles.paragraph}>
          Kritikus vagy halaszthatatlan utazás esetén kérjük, tájékozódjon a megállóhelyeken kihelyezett hivatalos táblákról vagy a Multi-Trans S.A. hivatalos elérhetőségein.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Harmadik felek szolgáltatásai és hivatkozások</h2>
        <p className={styles.paragraph}>
          Az alkalmazás működéséhez térképi alapadatként az OpenStreetMap és a Mapbox térképszolgáltatását veszi igénybe. 
          Az oldalon található külső hivatkozásokért (pl. Aperta Sync, hivatalos weboldalak) és azok adatvédelmi gyakorlatáért a fejlesztők nem vállalnak felelősséget.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Szellemi tulajdon</h2>
        <p className={styles.paragraph}>
          A webalkalmazás forráskódja, felhasználói felülete és egyedi tervezése a fejlesztők szellemi tulajdona. 
          A menetrendi alapadatok a nyilvánosság számára hozzáférhető közérdekű információk.
        </p>
      </section>
    </>
  );
}

function TermsContentRo() {
  return (
    <>
      <h1 className={styles.title}>Termeni și Condiții de Utilizare & Declinarea Răspunderii</h1>
      <div className={styles.lastUpdated}>În vigoare din: 22 august 2026</div>

      <div className={styles.alertBox}>
        <p>
          <strong>Declinare expresă a răspunderii:</strong> Sepsi Menetrend este un instrument informativ independent și neoficial. 
          Dezvoltatorii <strong>nu își asumă nicio responsabilitate</strong> pentru eventualele inexactități din orare, 
          întârzieri ale curselor, anulări sau daune directe ori indirecte rezultate din utilizarea aplicației.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Caracterul serviciului și statutul neoficial</h2>
        <p className={styles.paragraph}>
          Sepsi Menetrend este o aplicație web gratuită, realizată ca proiect independent, pentru a facilita consultarea 
          orarelor și planificarea călătoriilor cu transportul public în municipiul Sfântu Gheorghe și localitățile învecinate.
        </p>
        <p className={styles.paragraph}>
          Această aplicație <strong>nu reprezintă pagina oficială a operatorului de transport (Multi-Trans S.A.) și nici a Primăriei Municipiului Sfântu Gheorghe</strong>.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Sursa datelor și orele estimate</h2>
        <p className={styles.paragraph}>
          Datele referitoare la trasee, linii, tarife și orare se bazează pe informațiile publicate oficial de către Multi-Trans S.A. pe site-ul <em>multitrans.ro</em>.
        </p>
        <p className={styles.paragraph}>
          <strong>Notă importantă:</strong> Operatorul publică doar orele de plecare de la capetele de linie și din anumite stații principale. 
          Orele marcate cu asterisc (<strong>*</strong>) pentru stațiile intermediare sunt <em>estimări matematice calculate prin interpolare</em>, 
          care pot varia în funcție de condițiile reale de trafic, starea carosabilului sau vreme.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Limitarea și declinarea completă a răspunderii</h2>
        <p className={styles.paragraph}>
          Serviciul este furnizat <em>„ca atare” („AS IS”)</em> și <em>„în funcție de disponibilitate” („AS AVAILABLE”)</em>. 
          Dezvoltatorii nu oferă nicio garanție expresă sau implicită cu privire la:
        </p>
        <ul className={styles.list}>
          <li>exactitatea, exhaustivitatea sau actualitatea datelor din orare și a tarifelor;</li>
          <li>întârzierile sau anulările de curse cauzate de trafic aglomerat, lucrări, devieri de traseu sau accidente;</li>
          <li>modificările de orar operate intempestiv de către transportator;</li>
          <li>orice prejudiciu direct, indirect, accidental sau subsecvent, pierdere de venit, pierderea unei legături (tren, avion, serviciu, examen, programare medicală);</li>
          <li>eventualele întreruperi tehnice temporare ale funcționării site-ului.</li>
        </ul>
        <p className={styles.paragraph}>
          Pentru călătorii urgente sau de importanță critică, vă recomandăm să verificați afișajele din stații sau canalele oficiale ale Multi-Trans S.A.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Servicii terțe și link-uri externe</h2>
        <p className={styles.paragraph}>
          Aplicația folosește hărți furnizate de OpenStreetMap și Mapbox. 
          Dezvoltatorii nu sunt răspunzători pentru conținutul și practicile site-urilor externe la care se face trimitere (ex. Aperta Sync, multitrans.ro).
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Proprietate intelectuală</h2>
        <p className={styles.paragraph}>
          Codul sursă, designul și interfața utilizator sunt proprietatea dezvoltatorilor. 
          Datele privind transportul public constituie informații de interes public utilizate conform legislației în vigoare.
        </p>
      </section>
    </>
  );
}

function TermsContentEn() {
  return (
    <>
      <h1 className={styles.title}>Terms of Use and Legal Disclaimer</h1>
      <div className={styles.lastUpdated}>In force from: 22 August 2026</div>

      <div className={styles.alertBox}>
        <p>
          <strong>Express disclaimer of liability:</strong> Sepsi Menetrend is an independent, unofficial
          information tool. The creators <strong>accept no liability whatsoever</strong> for any direct or
          indirect damage arising from inaccuracies or typographical errors in the schedule data, or from
          service delays or cancellations.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. The nature of the service and its independence</h2>
        <p className={styles.paragraph}>
          Sepsi Menetrend is a free-to-use web application built as a private initiative. Its aim is to make
          browsing the local public transport schedules of Sfântu Gheorghe — and planning journeys with
          them — clearer, faster and more convenient.
        </p>
        <p className={styles.paragraph}>
          This site <strong>is not an official platform of the local transport operator (Multi-Trans S.A.)
          or of the Sfântu Gheorghe Mayor&rsquo;s Office</strong>.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. The source of the data and estimated travel times</h2>
        <p className={styles.paragraph}>
          The schedules, lines, fares and stop names in the application are based on processing the timetable
          notices published publicly on the official website of Multi-Trans S.A. (<em>multitrans.ro</em>).
        </p>
        <p className={styles.paragraph}>
          <strong>Important:</strong> The operator publishes only the departure times at the termini and at
          certain principal stops. The times shown at intermediate stops in the application, marked with an
          asterisk (<strong>*</strong>), are <em>calculated mathematical estimates</em> (interpolations) that
          may differ depending on actual traffic conditions, road conditions or the weather.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Full limitation and exclusion of liability</h2>
        <p className={styles.paragraph}>
          The developers provide the service <em>&ldquo;as is&rdquo; (&ldquo;AS IS&rdquo;)</em> and
          <em>&ldquo;as available&rdquo; (&ldquo;AS AVAILABLE&rdquo;)</em>. Neither the creators nor the
          contributors give any warranty or guarantee, whether express or implied, as to:
        </p>
        <ul className={styles.list}>
          <li>the accuracy, completeness or timeliness of the schedules, transfer times and fares;</li>
          <li>service delays or cancellations caused by local traffic congestion, weather conditions, road diversions or accidents;</li>
          <li>advance or extraordinary timetable changes introduced by the operator;</li>
          <li>any direct, indirect, incidental or consequential damage, lost profit, or missed connection (e.g. train, flight, work, exam, medical appointment);</li>
          <li>any inconvenience caused by the site&rsquo;s server or network becoming temporarily unavailable.</li>
        </ul>
        <p className={styles.paragraph}>
          For a critical or time-sensitive journey, please check the official signs posted at the stops or
          the official channels of Multi-Trans S.A.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Third-party services and links</h2>
        <p className={styles.paragraph}>
          For its map base data the application uses the mapping services of OpenStreetMap and Mapbox. The
          developers accept no responsibility for the external links on the site (e.g. Aperta Sync, official
          websites) or for their data-protection practices.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Intellectual property</h2>
        <p className={styles.paragraph}>
          The source code, user interface and bespoke design of the web application are the intellectual
          property of the developers. The underlying schedule data is public-interest information accessible
          to everyone.
        </p>
      </section>
    </>
  );
}

function PrivacyContentHu() {
  return (
    <>
      <h1 className={styles.title}>Adatkezelési és Süti (Cookie) Tájékoztató</h1>
      <div className={styles.lastUpdated}>Hatályos: 2026. augusztus 22.</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Adatvédelmi alapelveink</h2>
        <p className={styles.paragraph}>
          A Sepsi Menetrend készítői elkötelezettek a látogatók magánéletének védelme mellett. 
          Alkalmazásunk az <strong>adatminimalizálás elvét</strong> követi: nincs felhasználói regisztráció, 
          nincs jelszókezelés, és nem tartunk fenn központi adatbázist a személyes adatok tárolására.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Kizárólag a készüléken tárolt adatok (LocalStorage)</h2>
        <p className={styles.paragraph}>
          Az alkalmazás a kényelmes működés érdekében kizárólag az Ön böngészőjének helyi tárhelyén (LocalStorage) tárol néhány alapvető beállítást:
        </p>
        <ul className={styles.list}>
          <li><strong>Nyelvi beállítás (<code>sepsi.lang</code>):</strong> A választott nyelv (magyar vagy román).</li>
          <li><strong>Téma (<code>sepsi.theme</code>):</strong> A kiválasztott megjelenés (világos, sötét vagy rendszerkövető).</li>
          <li><strong>Süti hozzájárulási állapot (<code>sepsi.consent</code>):</strong> A Google Analytics statisztikák elfogadásának vagy elutasításának ténye.</li>
          <li><strong>Keresési előzmények (<code>sepsi:history</code>):</strong> Az Ön által a közelmúltban kiválasztott kiindulási és célállomások listája.</li>
        </ul>
        <p className={styles.paragraph}>
          <em>Ezek az adatok kizárólag az Ön eszközén maradnak, soha semmilyen központi szerverre nem kerülnek továbbításra, 
          és az előzmények a „Előzmények törlése” gombbal bármikor egyetlen kattintással véglegesen törölhetők.</em>
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Helymeghatározás (Geolocation)</h2>
        <p className={styles.paragraph}>
          Ha Ön engedélyezi a helymeghatározást (GPS), a böngészője kizárólag a készülékén belül határozza meg a legközelebbi buszmegállót és a gyaloglási útvonalat. 
          Az Ön pontos földrajzi koordinátái semmilyen külső szerverre nem kerülnek elküldésre és nem kerülnek mentésre.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Google Analytics 4 és analitikai sütik</h2>
        <p className={styles.paragraph}>
          Az oldal a Google Analytics (GA4) szolgáltatást használja a látogatottság és az alkalmazáshasználat anonim statisztikai mérésére:
        </p>
        <ul className={styles.list}>
          <li><strong>Kizárólag előzetes beleegyezéssel:</strong> A mérőkód és a hozzá tartozó sütik (<code>_ga</code>, <code>_ga_*</code>) <em>kizárólag akkor és csak akkor töltődnek be</em>, ha Ön a kezdő képernyőn az <strong>„Elfogadom”</strong> gombra kattint.</li>
          <li><strong>Elutasítás esetén:</strong> Ha az „Elutasítom” gombot választja (vagy még nem nyilatkozott), semmilyen süti nem kerül elhelyezésre, és semmilyen adat nem jut el a Google szervereihez.</li>
          <li><strong>Szolgáltató:</strong> Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA).</li>
          <li><strong>Élettartam:</strong> Az analitikai sütik legfeljebb 2 évig érvényesek, hacsak nem törli őket korábban.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. A hozzájárulás visszavonása</h2>
        <p className={styles.paragraph}>
          Bármikor visszavonhatja a süti hozzájárulást az alkalmazás Beállítások (fogaskerék) menüjében a 
          <strong>„Süti beállítások módosítása”</strong> gombra kattintva, vagy a böngészője helyi adatainak törlésével.
        </p>
      </section>
    </>
  );
}

function PrivacyContentRo() {
  return (
    <>
      <h1 className={styles.title}>Politică de Confidențialitate și Cookie-uri</h1>
      <div className={styles.lastUpdated}>În vigoare din: 22 august 2026</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Principiile noastre de confidențialitate</h2>
        <p className={styles.paragraph}>
          Aplicația Sepsi Menetrend respectă pe deplin viața privată a utilizatorilor și aplică 
          <strong>principiul minimizării datelor</strong>: nu există formulare de înregistrare, nu există conturi de utilizator 
          și nu stocăm date cu caracter personal într-o bază de date centrală.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Date stocate exclusiv pe dispozitiv (LocalStorage)</h2>
        <p className={styles.paragraph}>
          Pentru o experiență optimă, aplicația păstrează direct în memoria browserului dumneavoastră (LocalStorage) câteva preferințe:
        </p>
        <ul className={styles.list}>
          <li><strong>Limba (<code>sepsi.lang</code>):</strong> Limba selectată (română sau maghiară).</li>
          <li><strong>Tema (<code>sepsi.theme</code>):</strong> Aspectul vizual (luminos, întunecat sau automat).</li>
          <li><strong>Opțiunea pentru cookie-uri (<code>sepsi.consent</code>):</strong> Decizia dumneavoastră privind statisticile Google Analytics.</li>
          <li><strong>Istoricul căutărilor (<code>sepsi:history</code>):</strong> Stațiile și adresele căutate recent.</li>
        </ul>
        <p className={styles.paragraph}>
          <em>Aceste informații nu părăsesc niciodată dispozitivul dumneavoastră și pot fi șterse definitiv în orice moment prin butonul „Șterge istoricul”.</em>
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Localizare (Geolocație)</h2>
        <p className={styles.paragraph}>
          Dacă permiteți accesul la locație (GPS), browserul determină exclusiv local pe telefonul/calculatorul dumneavoastră cea mai apropiată stație și traseul pe jos. 
          Coordonatele GPS nu sunt trimise către niciun server extern.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Google Analytics 4 și cookie-uri analitice</h2>
        <p className={styles.paragraph}>
          Site-ul utilizează Google Analytics (GA4) exclusiv pentru a măsura statistic traficul și funcționarea tehnică a serviciului:
        </p>
        <ul className={styles.list}>
          <li><strong>Doar cu acordul dumneavoastră:</strong> Scriptul și modulele cookie (<code>_ga</code>, <code>_ga_*</code>) sunt încărcate <em>numai dacă ați apăsat butonul „Accept”</em>.</li>
          <li><strong>În caz de refuz:</strong> Dacă selectați „Refuz”, nu este plasat niciun modul cookie și nu se transmit cereri de urmărire către Google.</li>
          <li><strong>Furnizor:</strong> Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA).</li>
          <li><strong>Durată:</strong> Modulele cookie expiră după maximum 2 ani, dacă nu sunt șterse manual mai devreme.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Retragerea consimțământului</h2>
        <p className={styles.paragraph}>
          Vă puteți retrage consimțământul în orice moment din meniul Setări al aplicației („Modifică opțiunile cookie”) 
          sau prin ștergerea datelor de navigare din setările browserului.
        </p>
      </section>
    </>
  );
}

function PrivacyContentEn() {
  return (
    <>
      <h1 className={styles.title}>Privacy and Cookie Notice</h1>
      <div className={styles.lastUpdated}>In force from: 22 August 2026</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Our privacy principles</h2>
        <p className={styles.paragraph}>
          The creators of Sepsi Menetrend are committed to protecting the privacy of visitors. Our
          application follows the <strong>principle of data minimisation</strong>: there is no user
          registration, no password handling, and we do not maintain a central database for storing personal
          data.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Data stored only on your device (LocalStorage)</h2>
        <p className={styles.paragraph}>
          For a convenient experience, the application stores only a few basic settings in your
          browser&rsquo;s local storage (LocalStorage):
        </p>
        <ul className={styles.list}>
          <li><strong>Language setting (<code>sepsi.lang</code>):</strong> the selected language (Hungarian, Romanian or English).</li>
          <li><strong>Theme (<code>sepsi.theme</code>):</strong> the chosen appearance (light, dark or follow-the-system).</li>
          <li><strong>Cookie consent status (<code>sepsi.consent</code>):</strong> whether the Google Analytics statistics were accepted or rejected.</li>
          <li><strong>Search history (<code>sepsi:history</code>):</strong> the list of origin and destination stops you have recently selected.</li>
        </ul>
        <p className={styles.paragraph}>
          <em>This data stays solely on your device, is never transmitted to any central server, and the
          history can be permanently deleted at any time, with a single click, using the
          &ldquo;Clear history&rdquo; button.</em>
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Location (Geolocation)</h2>
        <p className={styles.paragraph}>
          If you allow location access (GPS), your browser works out the nearest bus stop and the walking
          route entirely on your own device. Your precise geographic coordinates are neither sent to nor
          stored on any external server.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Google Analytics 4 and analytics cookies</h2>
        <p className={styles.paragraph}>
          The site uses Google Analytics (GA4) to measure visitor numbers and app usage as anonymous
          statistics:
        </p>
        <ul className={styles.list}>
          <li><strong>Only with prior consent:</strong> the measurement code and its cookies (<code>_ga</code>, <code>_ga_*</code>) <em>load if and only if</em> you click the <strong>&ldquo;Accept&rdquo;</strong> button on the start screen.</li>
          <li><strong>If you decline:</strong> if you choose the &ldquo;Reject&rdquo; button (or have not yet decided), no cookie is placed and no data reaches Google&rsquo;s servers.</li>
          <li><strong>Provider:</strong> Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA).</li>
          <li><strong>Lifetime:</strong> the analytics cookies last at most 2 years, unless you delete them sooner.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Withdrawing consent</h2>
        <p className={styles.paragraph}>
          You can withdraw your cookie consent at any time from the application&rsquo;s Settings (gear) menu
          by clicking the <strong>&ldquo;Change cookie settings&rdquo;</strong> button, or by clearing your
          browser&rsquo;s local data.
        </p>
      </section>
    </>
  );
}
