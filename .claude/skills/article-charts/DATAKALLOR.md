# Datakällor för diagram på islam.se

**Varje post här är verifierad med ett live-anrop 2026-08-20.** Det som inte gick att
verifiera står utskrivet som *ej verifierad* i stället för att gissas bort. En endpoint
som tyst har flyttat ger antingen en död länk i en bildtext eller — värre — en påhittad.

> **En källa utan länk är korrekt; en påhittad länk är en förfalskning.**
> Anropa alltid källan innan du skriver `sourceUrl:`. Om anropet inte går igenom skriver
> du `source:` utan URL och säger det till människan.

---

## ⭐ Först: verktygen, inte webbläsaren

| Skript | Täcker |
|---|---|
| `scripts/pxweb.py` | SCB, Jordbruksverket och fem andra PxWeb-myndigheter — plus `probe` för att hitta nya |
| `scripts/worldbank.py` | WDI: indikatorsökning, aggregatfilter, tvåelementsarrayen |
| `scripts/check-datakallor.py` | Pingar varje URL i den här filen. Kör den innan du litar på filen |

De finns för att en rapportsida alltid ser lättare ut än ett API, och rapportsidan tappar
kategorier utan att säga det. Två gånger på en dag kostade det den här sajten en felaktig
uppgift.

### `scripts/pxweb.py`

SCB, Jordbruksverket och de flesta svenska myndighetsdatabaser talar PxWeb. Skriv inte
fyra curls i handen — de fyra curlarna är anledningen till att en agent ger upp och läser
rapportsidan i stället, och rapportsidan tappar kategorier utan att säga det.

```bash
python3 scripts/pxweb.py search "födelseland"                    # SCB, hitta tabellen
python3 scripts/pxweb.py ls   jordbruksverket                    # bläddra i trädet
python3 scripts/pxweb.py meta jordbruksverket "Konsumtion av livsmedel/JO1301K2.px"
python3 scripts/pxweb.py get  jordbruksverket "Konsumtion av livsmedel/JO1301K2.px" \
        --sel "Vara=8,10,5" --sel "Variabel=1" --sel "År=65"
```

Två dialekter, och de är inte utbytbara: SCB kör PxWebApi 2.0 (platta tabell-id, bara GET,
`valueCodes[Var]=`), medan Jordbruksverket kör klassisk PxWeb v1 (ett träd av mappar,
POST för data, och **positionella värdekoder** — »65« är det 66:e året, så kör alltid
`meta` först). Skriptet döljer skillnaden. `search` finns bara på SCB-sidan.

### PxWeb är regel i svensk förvaltning, inte undantag

**Gissa aldrig om en myndighet har PxWeb — proba.** Värdnamnet är oförutsägbart, sökvägen
är en av en handfull:

```bash
python3 scripts/pxweb.py probe pxweb.skogsstyrelsen.se statistik.konj.se
```

Registrerade och verifierade 2026-08-20: `scb`, `jordbruksverket`, `energimyndigheten`,
`tillvaxtanalys`, `skogsstyrelsen`, `konjunkturinstitutet`, `folkhalsomyndigheten`.
Listan ska **inte** vara uttömmande. `probe` gör det så billigt att lägga till en bas att
det är fel att försöka räkna upp dem i förväg — lägg till den du behöver, i samma pass.

⚠️ **Handprobning ger falska negativ.** Uppmätt 2026-08-20: en manuell curl-runda mot sex
värdar missade Skogsstyrelsen, som svarar på `/api/v1/sv` — en sökväg samma runda redan
hade provat. Av det drog jag slutsatsen att få svenska myndigheter kör PxWeb. Den
slutsatsen var fel, och den byggde på ett stickprov om fem. `probe` hittade Skogsstyrelsen
direkt. Sökvägar som inte träffar: Trafikanalys, UKÄ, Kulturanalys och Arbetsförmedlingen
svarade inte på något känt mönster — de kan ändå ha PxWeb bakom ett annat värdnamn.


## Vad som INTE gick att hämta — spara ett letande

Prövat 2026-08-20, utan resultat. Lägg till här när du bränner tid på en källa som inte
bär, i stället för att låta nästa session upprepa försöket.

| Sökt | Utfall |
|---|---|
| **Hajj-deltagande per år**, saudiska GASTAT | Statistiksidan renderar ingen data; `stats.gov.sa/api/v1/*` ger 404; `open.data.gov.sa` svarar inte alls. Siffrorna cirkulerar i andrahandskällor — **citera dem inte** utan att ha läst primärkällan |
| **Väntetid dödsfall → gravsättning**, SKKF | Ingen publicerad serie på webbplatsen. De tre punkter som finns (21,6 dagar 2012 · 23,2 dagar 2019 · 25,4 dagar 2023) är hämtade i andra hand och räcker inte till en `line` |
| **Vigslar efter vigseltyp**, SCB | `pxweb.py search "vigsel"` ger noll träffar. Giftermålsstatistiken ligger inte i den öppna tabellsökningen under det ordet |
| **Trossamfund / hatbrott**, SCB | Noll träffar, som väntat: trossamfund är MUCF:s och hatbrott är Brås område, och Brå har inget API alls |

⭐ **Det som däremot bar:** sajtens egna data. `moskeer-sverige.json` (234 moskéer med län)
och bönetidsmotorn i `src/lib/bonetider/` producerar underlag som ingen myndighet
publicerar — fastedygnets längd per latitud finns inte i någon källa, den räknas fram.
Leta där först när frågan är svensk och specifik.

## ⛔ Fem saker som slår sönder en agent som skriver ur minnet

Det här är inte petitesser. Var och en av dem ger tyst fel — tom lista, död länk eller
ett diagram som visar en klippa som inte finns.

1. **SCB:s v2 ligger på `statistikdatabasen.scb.se/api/v2/`, inte på `api.scb.se`.**
   Både `api.scb.se/OV0104/v2beta/…` och `…/v2/…` ger 404. Och **v1 lever fortfarande** —
   påstå aldrig att den är släckt.
2. **Kolada `/v2/` svarar HTTP 410 Gone.** Det ska vara `/v3/`, och parametern heter
   `municipality_id`, inte `municipality`. Fel namn ger **tom träfflista, inte ett fel**.
   Koladas egen dokumentation är inaktuell på den här punkten — tro på 410:an, inte på texten.
3. **SST finns inte längre.** Myndigheten för stöd till trossamfund gick upp i **MUCF den
   1 januari 2026**. `myndighetensst.se` 301:ar till `mucf.se` **utan att bevara sökvägen**,
   så varenda djuplänk till SST är död. Statistiken finns hos MUCF nu.
4. **Eurostats `wdds/rest/data/v2.1/` ger 404.** Använd
   `api/dissemination/statistics/1.0/data/` — och föredra den framför SDMX, som kan svara
   med ett asynkront jobb i stället för data.
5. **Brås hatbrottsstatistik kommer numera vartannat år.** Senaste referensår är **2024**,
   nästa publicering **2027**. En agent som antar årlig serie ritar ett glapp som inte finns.

---

# 1. Svenska myndigheter — statistik

## SCB — Statistiska centralbyrån ⭐

Den bästa källan i hela listan: CC0, inget krav på attribution, ingen nyckel, GET-anrop.

| | |
|---|---|
| **Endpoint** | `https://statistikdatabasen.scb.se/api/v2/` (**v2, aktuell**, apiVersion 2.3.2) |
| | `https://api.scb.se/OV0104/v1/doris/sv/ssd/` (v1, **lever fortfarande**, inget släckdatum satt) |
| **Anropsform** | PxWebApi 2.0. **GET räcker** — v2 slapp v1:s krav på POST-body |
| **Licens** | **CC0 (public domain).** SCB: *»du får använda och sprida sådana data utan krav på källhänvisning«*. Skriv ändå `Källa: SCB` |
| **Gränser** | 150 000 celler per fråga, **30 anrop per 10 sekunder**. Ingen nyckel, CORS på |

Fungerande GET (kört och verifierat):

```
https://statistikdatabasen.scb.se/api/v2/tables/TAB4822/data
  ?lang=sv&outputFormat=csv
  &valueCodes[Fodelseland]=SY,IQ,SO
  &valueCodes[Alder]=30
  &valueCodes[Kon]=*
  &valueCodes[ContentsCode]=*
  &valueCodes[Tid]=2024
```

Sök fram tabeller med `GET /api/v2/tables?query=<söktext>&lang=sv&pageSize=20`, läs
variablerna med `GET /api/v2/tables/{TABID}/metadata?lang=sv`.

### Tabeller som är värda att känna till

| ID | Tabell | Period |
|---|---|---|
| `TAB4822` | Folkmängd efter födelseland, ålder och kön | 2000–2024 |
| `TAB6642` | Samma, innevarande år | 2025 |
| `TAB6569` | Folkmängd per region efter medborgarskap och kön | 2010–2025 |
| `TAB1617` / `TAB6641` | In- och utvandringar efter födelseland och kön | 2000–2024 / 2025 |
| `TAB5189` / `TAB6658` | Utrikes födda efter födelseland och år sedan senaste invandring | 2000–2024 / 2025 |
| `TAB6383` / `TAB6384` | Arbetsmarknad efter kommun/län, kön, utbildningsnivå och bakgrund | 2022–2024 |
| `TAB6396` / `TAB6766` | Självförsörjning efter region, kön, ålder och födelseregion | 2013–2024 / 2025 |
| `TAB1125` | Ekonomisk standard efter region, sysselsättning och svensk/utländsk bakgrund | 2011–2024 |
| `TAB3257` / `TAB3255` | Partisympati efter utrikes/inrikes född respektive bakgrund | 2006–2026 |
| `TAB2019` / `TAB2171` | Röstberättigade efter region och medborgarskap | 1973–2024 |
| `TAB3429` | Försörjningshinder efter inrikes/utrikes född | 2010–2024 |

### ⚠️ Fallgropar

- **v1:s tabell-id fungerar inte i v2.** `BE0101N1` och `UtrikesFoddaR` ger båda 404 i v2 —
  v2 använder ogenomskinliga `TAB####`. Konvertera på `https://pxapiconverter.scb.se/`.
- **Obligatoriska variabler.** Utelämnad `ContentsCode` eller någon icke-eliminerbar
  variabel ger `{"title":"Missing selection for mandantory variable","status":400}`
  (stavfelet är SCB:s). Det här slår till gång på gång.
- **Två tabeller per serie.** SCB delar historik och innevarande år (TAB4822 = 2000–2024,
  TAB6642 = 2025). En tidsserie fram till i dag kräver båda och en hopslagning.
- **v1:s sökvägar glider.** `BE/BE0101/BE0101E/FolkmangdNov` ger numera `Bad Request`.
  Bläddra nivån först, hårdkoda aldrig en sökväg.

### ⛔ SCB har ingen religionsstatistik. Alls.

Verifierat empiriskt mot hela statistikdatabasen: `query=muslim` → **0 tabeller**.
`query=tro` → **0 tabeller**. `query=religion` → 5 träffar, samtliga falska (kursämnen i
vuxenutbildning 1999–2003). `query=trossamfund` → 5 träffar, samtliga falska (trossamfund
som arbetsgivarform i löneskattetabeller).

Sverige har inte registrerat trostillhörighet sedan skilsmässan mellan kyrka och stat år
2000, och SCB har offentligt sagt att ett förslag på 2020-talet att samla in
religionsstatistik *»inte är förenligt med lagen«*.

**Leta därför aldrig efter trossiffror hos SCB.** Använd födelseland eller medborgarskap
som en ofullkomlig approximation — och skriv i bildtexten att det är vad axeln mäter — eller
gå till SOM-institutet via Willanders rapporter, eller till Pew.

## Migrationsverket

| | |
|---|---|
| **Portal** | `https://www.migrationsverket.se/Om-Migrationsverket/Statistik/Oppna-data.html` |
| **Anropsform** | **Excel (.xlsx). Inget REST-API.** Men det finns en DCAT-AP-katalog |
| **Katalog** | `https://www.migrationsverket.se/download/18.2cd2e409193b84c506a20cee/1739882747870/Migrationsverket_dcat_ap_PSIDATA.rdf` |
| **Licens** | *»Inga villkor, innehåller inte personuppgifter«*. Skriv `Källa: Migrationsverket` |

Filer: inkomna asylansökningar, beviljade uppehållstillstånd, avgjorda asylärenden,
inskrivna i mottagningssystemet, beviljade arbetstillstånd, kommunmottagna. Plus historiska
serier — asylsökande per år och medborgarskap 1984–2021, uppehållstillstånd från 1980.

⚠️ **Hårdkoda aldrig en nedladdningslänk.** Sökvägarna
`/download/18.<hash>/<epoch-ms>/` bär en millisekundstämpel som **byts vid varje månatlig
publicering**. Hämta DCAT-filen, eller skrapa `href` från landningssidan. Uppdateras
månadsvis. Årets filer saknar ibland medborgarskapsuppdelning — den finns i de historiska.

## Brå — hatbrott

| | |
|---|---|
| **Sida** | `https://bra.se/statistik/statistik-om-rattsvasendet/hatbrottsstatistik` |
| **Anropsform** | **PDF + en Excel-tabellsamling. Inget API, ingen databas** för hatbrott |
| **Licens** | ⚠️ **Ingen angiven.** `© Brottsförebyggande rådet`. Svagast av de svenska källorna |

Senaste (verifierade) filer:

- Rapport 2025:19, *Polisanmälda hatbrott 2024* —
  `https://bra.se/download/18.51af66dd19afd016365378d/1783940682812/2025_19_Polisanm%C3%A4lda%20hatbrott%202024.pdf`
- **Tabellsamling 2020–2024 (den du vill ha för diagram)** —
  `https://bra.se/download/18.125e930a19b6e6f26ff4e23e/1783940787861/Tabellsamling%20Polisanm%C3%A4lda%20hatbrott%202020-2024.xlsx`
- Fördjupning: *Islamofobiska hatbrott*, rapport 2021:3

Siffror 2024: totalt **2 731** anmälningar med hatbrottsmarkering, varav **199
islamofobiska** (7 procent av de identifierade motiven). Motivfördelning: främlingsfientliga
50, religiösa 18, hbtqi 13, ospecificerat 20 procent.

### ⚠️ Tre fällor, och alla tre hör hemma i bildtexten

1. **Statistiken kommer vartannat år.** Senaste referensår 2024, nästa publicering 2027.
2. **Det är polisanmälningar med markering — inte domar och inte förekomst.** Förändringar
   speglar anmälningsbenägenhet och polisens rutiner lika mycket som verkligheten. Brås egen
   NTU-undersökning ger en helt annan, mycket större, bild av utsattheten.
3. **Tidsseriebrott kring 2018** när metoden ändrades. Därför börjar tabellsamlingen 2020.
   Jämför aldrig över den gränsen.

## Kolada — kommunala nyckeltal

| | |
|---|---|
| **Endpoint** | `https://api.kolada.se/v3/` — ⛔ **v2 ger HTTP 410 Gone** |
| **Spec** | `https://api.kolada.se/v3/openapi.json` · Swagger: `/v3/docs` |
| **Licens** | Fritt, ingen nyckel. `Källa: Kolada`. Kommersiell användning tillåten |

```
GET /v3/kpi?title=<text>
GET /v3/data/kpi/{kpi_id}/municipality/{municipality_id}/year/{year}
GET /v3/data/?kpi_id=&municipality_id=&year=&from_date=&region_type=
```

Verifierat: `/v3/data/kpi/N00217/municipality/1280/year/2024` → `0.86397284`.

Nyckeltal som rör webbplatsens ämnen:

| ID | Nyckeltal |
|---|---|
| `N00217` | Anställda utrikes födda, balanstal (1,0 = paritet mot befolkningen) |
| `N15818` | Utländsk bakgrund bland elever åk 1–9, andel |
| `N15822` / `N15826` | Samma, **kommunala** respektive **fristående** grundskolor |
| `N17830` / `N17833` / `N17836` | åk 1–3 · kommunal gymnasieskola · fristående gymnasieskola |

`N15822` mot `N15826` per kommun är ett genuint bra diagram: skolsegregation efter
utländsk bakgrund, kommunalt mot fristående.

⚠️ Parametern heter **`municipality_id`**. Skriver du `municipality=` får du en **tom
lista utan felmeddelande** — den värsta sortens fel för en agent. Kommunkod är den vanliga
fyrsiffriga (Malmö 1280, Stockholm 0180). Villkor: du får **inte** tillskriva Kolada din
egen bearbetning.

## Skolverket

`https://api.skolverket.se/skolenhetsregistret` — REST, JSON/XML via `Accept`. **v2 är
aktiv** (`apiVersion 2.0`, släppt 2024-12-13); v1 är »Retired« men svarar fortfarande 200.

⚠️ **v2:s sökvägar är engelska**, till skillnad från v1:s svenska. `/v2/school-units`,
`/v2/school-units/{schoolUnitCode}`, `/v2/organizers`, `/v2/education-providers`,
`/v2/api-info`. Gissade svenska sökvägar (`/v2/skolenhet`, `/v2/kommun`) ger 404.

Registret ger skolenhet, huvudman och skolform. **Ej verifierat:** om konfessionell
inriktning finns som fält i v2:s payload — kontrollera innan du lovar ett diagram om
konfessionella friskolor. För »utländsk bakgrund bland elever« är Kolada enklare.

## Socialstyrelsen

`https://sdb.socialstyrelsen.se/api/v1/sv` — REST, JSON. (Roten `sdb.socialstyrelsen.se/`
ger 403; gå direkt till `/api/`.) Bulkexport som CSV-i-ZIP, t.ex.
`https://sdb.socialstyrelsen.se/export/csv/statistikdatabasen-ekonomiskt%20bistand.zip`
(1990–2025) — observera **mellanslagen i filnamnet**, de måste URL-kodas.

Licens: *»tillgängliga för alla att använda utan restriktioner«*, men ingen formell
licensidentifierare — *ej verifierad* som CC0. Citera enligt deras form:
`Ekonomiskt bistånd [Socialstyrelsens statistikdatabas]. Stockholm: Socialstyrelsen.`

⚠️ Ekonomiskt bistånd saknar uppdelning på födelseland i den öppna databasen. Den finns
hos SCB, `TAB3429`.

⚠️⚠️ **`/api/v1/sv` innehåller fjorton ämnen, och abort är inte ett av dem.** Listan är
amning, diagnoser (tre varianter), DRG, dödsorsaker (två), graviditeter/förlossningar/
nyfödda, operationer (två), skador, tandhälsa och yttre orsaker. Kontrollerad 2026-08-20.
Söker du något annat — aborter, läkemedel, cancer — finns det i en egen PxWeb-instans
under `sdb.socialstyrelsen.se/if_<ämne>/val.aspx` (abort: `if_abo`), eller bara som
publikation. **Statistik om aborter** publiceras årligen med artikelnummer och en
bilaga med alla tabeller:

```
https://www.socialstyrelsen.se/publikationer/statistik-om-aborter-2025-2026-6-10342/
  → /contentassets/<hash>/2026-6-10342-tabeller.xlsx     ← tabell 3 = graviditetslängd
```

Den xlsx:en är ett fullgott primärunderlag: daterad, artikelnumrerad, med tabell 3
*Antal och andel aborter efter graviditetslängd, 1983–2025* i fem intervall
(`<7+0`, `7+1–9+0`, `9+1–12+0`, `12+1–18+0`, `>=18+1`). Läs den med `openpyxl`.
Att API:et saknar ämnet är alltså inte ett skäl att hoppa över källan — men det är ett
skäl att skriva ned var den faktiskt ligger, vilket är vad den här raden är till för.

## Jordbruksverket — mat, djur och slakt

**API-roten är `https://statistik.jordbruksverket.se/PXWeb/api/v1/sv`.** PxWeb, samma
frågeform som SCB: GET för metadata, POST med en `query` för data. Note the `/PXWeb/`
segment — `statistik.jordbruksverket.se/api/v1/sv` without it returns an IIS 404 page,
not JSON.

```bash
B="https://statistik.jordbruksverket.se/PXWeb/api/v1/sv/Jordbruksverkets%20statistikdatabas"
curl -s "$B"                                # ämnesområden
curl -s "$B/Konsumtion%20av%20livsmedel"     # tabeller
curl -s "$B/Konsumtion%20av%20livsmedel/JO1301K2.px"   # variabler + värdekoder
```

Licens: officiell statistik, fri användning med källangivelse.

**Tabeller som är värda att känna till**

- `JO1301K2.px` — *Totalkonsumtion av vara, 1960–2025.* Kilo per person och år, med
  griskött, fjäderfä, nöt, får, häst, ren, vilt och inälvor **var för sig**, plus
  `SUMMA KÖTT`. Variabel `1` är kilo per person; `0` är 1 000 ton.
- `JO1301K1.px` — *Direktkonsumtion*, samma form men ett annat mått (se nedan).
- *Animalieproduktion, års- och månadsstatistik* — antal slaktade djur och slaktvikt.

⚠️ **Fältarbetets fälla: hämta inte de här talen från rapportsidan.** Rapporterna under
`jordbruksverket.se/.../statistik/<ÅÅÅÅ-MM-DD>-<slug>` är daterade och stabila och
duger som `source:` — men de redovisar bara de största posterna. Uppmätt 2026-08-20:
rapportsidan för 2025 gav griskött, fjäderfä, nöt, vilt och inälvor, och de summerade
till 78,3 av totalen 79,9. Den saknade posten var **fårkött, 1,61 kilo**, som finns i
`JO1301K2.px` men inte i rapporttexten. Att gissa på en restpost hade gett fel svar på
en fråga som API:et besvarar exakt. **Anropa tabellen, citera rapporten.**

### ⚠️ »Totalkonsumtion« är inte vad någon äter

Detta är fällan, och den hör hemma i bildtexten varje gång. Totalkonsumtion mäter
**råvaran som går till livsmedel**, inklusive råvaruinnehållet i importerade förädlade
produkter och exklusive det som exporteras, och kött räknas som vara med ben. Det är ett
utbudsmått, inte ett tallriksmått, och det säger ingenting alls om vem som äter vad. Ett
diagram som rubriceras »så mycket kött äter svensken« på de här talen är ett falskt
påstående. `JO1301K1.px` (direktkonsumtion) mäter något annat och de två får aldrig
blandas i samma diagram.

## Valmyndigheten

Rådata på `https://data.val.se/` — filnedladdning (CSV, txt, xlsx, xml, json), **inget
API**. Kartdata som JSON i SWEREF99 TM. Licens: *»fri att använda, förutsatt att du anger
Valmyndigheten som källa«*.

Data ned till **valdistriktsnivå** — vilket är det som gör den användbar ihop med SCB:s
områdesstatistik (RegSO). Det är **val i september 2026**, så `data.val.se/val2026` är
aktiv medan detta skrivs.

⚠️ Valmyndigheten publicerar **röster**. Demografiska korstabeller (valdeltagande efter
födelseland) kommer från **SCB**, inte härifrån. Och valdistrikt ritas om mellan val —
en distriktsserie över flera val är inte säker.

## Sveriges dataportal — för att *hitta*, inte för att hämta

`https://www.dataportal.se/` (DIGG, DCAT-AP-SE). Maskinläsbart sök:

```
https://admin.dataportal.se/store/search?type=solr&query=<term>&limit=<n>
```

⚠️ `dataportal.se/api` ger 426, `www.dataportal.se/api/search` ger 404 — använd inte dem.
Store-endpointen fungerar men är **odokumenterad** och kan ändras. Licensen är **per
dataset** i `dct:license`; se upp för `…/licensecategories/nolicense`, som betyder att
ingen licens getts. Många poster är forskningsdata med `accessRights: NON_PUBLIC`.

---

# 2. Trossamfund och civilsamhälle

⛔ **Läs kategorifällan i SKILL.md innan du rör de här två.** Båda redovisar muslimska
församlingar uppdelade på inriktning. Aggregera till *muslimska samfund*, eller låt bli
diagrammet.

## MUCF — numera statens källa om trossamfund

SST gick upp i MUCF 2026-01-01 (se fälla 3 överst). Statistiken:

**`https://www.mucf.se/rapporter-och-statistik/trossamfund-antal-betjanade`** —
»Trossamfund, antal betjänade«, **2020–2024**.

⚠️ **Det är en HTML-tabell. Ingen CSV, ingen Excel, ingen PDF, inget API.** Den enda
realistiska officiella svenska källan om samfundsmedlemskap är också den minst
maskinläsbara i hela det här dokumentet. Licens: ingen angiven; som myndighet under
PSI-lagen är siffrorna återanvändbara. Skriv `Källa: MUCF (tidigare SST)`.

### ⛔ Definitionsbrottet 2025 — det som förstör ett diagram

Från 1 januari 2025 krävs **minst 2 500 betjänade bosatta i Sverige** för statsbidrag, och
antalet ska **revisorsintygas** med varje medlem som **aktivt bekräftar** sitt medlemskap.
Frikyrkosamfund rapporterar **50–80 procents fall** i räknade medlemmar — enbart av
räknesättet.

**Ett diagram som sträcker sig 2020–2024 → 2025 visar en klippa som är en artefakt, inte
en minskning.** Antingen slutar serien 2024, eller så står brottet i bildtexten.

### »Betjänade« är inte medlemmar

Juridiskt: en medlem **eller** någon som regelbundet deltar i samfundets verksamhet. Det
överskattar mot formellt medlemskap och underskattar kraftigt mot kulturell tillhörighet.
Betjänade-siffran för muslimer (storleksordningen 200 000) ligger långt under
undersökningsbaserade uppskattningar av antalet med muslimsk bakgrund (800 000+).

**Presentera aldrig betjänade som »antalet muslimer i Sverige«.** Och tänk på att bara
bidragssökande samfund räknas alls — fristående moskéer syns inte.

### ⭐ Willanders rapporter — det bästa svenska underlaget om trostillhörighet

- **`https://www.mucf.se/sites/default/files/2025/11/nr-8-sverigesreligiosalandskap_utskrift.pdf`**
  — Erika Willander, *Sveriges religiösa landskap* (2025). Bygger på **SOM-institutet**
  (Göteborgs universitet), alltså **självidentifierad** tillhörighet — precis det SCB inte
  kan ge. Engelsk version: `…/nr-8-eng-the-religious-landscape_laguppl.pdf`
- Willander & Stockman, *Ett mångreligiöst Sverige i förändring* —
  `https://www.mucf.se/sites/default/files/2025/11/rapport2020_mangrelifor.pdf`

Siffrorna sitter i PDF-tabeller och måste läsas ut för hand.

---

# 3. Internationellt

## Pew Research Center ⭐ — bäst om religion, krångligast om licens

| | |
|---|---|
| **Hubb** | `https://www.pewresearch.org/religion-datasets/` |
| **Anropsform** | **Inget API, ingen öppen bulknedladdning.** Gratis konto, sedan SPSS/Excel |
| **Praktisk väg** | Rapporternas bilagetabeller — det är dem du chartar |

- **»Dataset of Global Religious Composition Estimates for 2010 and 2020«**, DOI
  `10.58094/vhrw-k516`. 201 länder, sju kategorier, byggt på 2 700+ folkräkningar och
  register. **Ersätter Global Religious Landscape 2012 för de flesta ändamål.**
- *How the Global Religious Landscape Changed From 2010 to 2020* (juni 2025).
- **»Europe's Growing Muslim Population«** (2017) — den Sverigesiffra som citeras mest i
  svensk debatt: 8 procent 2016 → **11 procent (noll migration) / 21 (medel) / 31 (hög)**
  till 2050.

### ⛔ Licens och redistribution — läs det här innan du chartar Pew

Pew använder **ingen Creative Commons-licens**, utan ger en *»personal, revocable,
nonexclusive license«*. Du **får** publicera **utdrag** och härledda siffror med
källhänvisning. Du får **inte** återge innehåll *»in principal part, mirrored, catalogued,
framed … or otherwise republished in its entirety«* utan skriftligt tillstånd, och inte
använda det så att det antyder att Pew ställer sig bakom en politisk hållning.

- **Att rita några Pew-tal med korrekt hänvisning ryms i utdragsrätten. Att spegla
  datasetet, eller bygga »alla 201 länder« som en nedladdningsbar tabell på islam.se, gör
  det inte.**
- Form: `"Rapporttitel." Pew Research Center, Washington, D.C. (datum) URL.`
- **Använder du datasetet och inte bara rapporten måste även detta med, i bildtexten:**
  *»Pew Research Center bears no responsibility for the analyses or interpretations of the
  data presented here.«*
- ⚠️ **Särskild försiktighet för den här webbplatsen.** Siffran »31 procent till 2050«
  lösgörs rutinmässigt från sitt scenario i svensk debatt, och Pews villkor förbjuder
  uttryckligen en framställning som antyder att de stödjer en politisk hållning. **Ett
  diagram över en Pew-prognos visar alla tre scenarierna och kallar dem scenarier, inte
  prognoser.** Annars gör vi samma sak som debatten gör.

## UNICEF ⭐ — SDMX, och det bästa underlaget om sed och barn

`https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/UNICEF,GLOBAL_DATAFLOW,1.0/.{INDIKATOR}..?format=sdmx-json&lastNObservations=1`

⚠️ **Skicka rätt Accept-huvud, annars 406.** `-H "Accept: application/vnd.sdmx.data+json;version=1.0.0"`.
⚠️ **`data.unicef.org` svarar 403 på skript** (Cloudflare). API-roten `sdmx.data.unicef.org`
går bra och är den som ska stå som `sourceUrl`.

Använda och verifierade 2026-08-20:

| Indikator | Vad |
|---|---|
| `PT_F_15-49_FGM` | Andel kvinnor 15–49 år som utsatts för könsstympning |
| `PT_F_20-24_MRD_U18` | Andel kvinnor 20–24 år gifta före 18 års ålder |

Svaret är SDMX-JSON: `dataSets[0].series` har nycklar som är positionsindex in i
`structure.dimensions.series`. Filtrera bort regionala aggregat — `REF_AREA` innehåller
både länder och sammanslagningar, precis som hos Världsbanken. **Mätåren skiljer sig
kraftigt mellan länder** (2006–2025 i barnäktenskapsdata), vilket hör hemma i `note:`.

⭐ Båda indikatorerna bär samma argument: spännvidden mellan muslimska majoritetsländer är
så stor att seden omöjligt kan följa läran. Det är den enda formen där en jämförelse mellan
muslimska länder hör hemma på den här sajten — den visar att religionen *inte* förklarar
utfallet. Se `[[no-shia-content]]` för den angränsande regeln.

## WHO — Global Health Observatory

`https://ghoapi.azureedge.net/api/{INDIKATORKOD}` — OData, ren JSON, ingen nyckel.
Sök indikator: `GET /api/Indicator?$filter=contains(IndicatorName,'Tobacco')`.

⚠️ **Hämta aldrig en indikator utan filter** — alla år för alla länder tar över 20 sekunder
och timeoutar. Filtrera alltid: `?$filter=TimeDim eq 2019`.
⚠️ **`Dim1` heter `SEX_BTSX`/`SEX_MLE`, inte `BTSX`.** Fel värde ger noll rader och inget fel.
⚠️ Filtrera på `SpatialDimType eq 'COUNTRY'`; annars blandas WHO-regioner in bland länderna.
⚠️ Använd inte API-URL:en som `sourceUrl` — den timeoutar i länkkontrollen. Länka
`https://www.who.int/data/gho/...` i stället.

Använda 2026-08-20: `SA_0000001688` (alkohol per person 15+, liter ren alkohol),
`M_Est_tob_curr` (tobaksbruk, andel).

## Eurostat

**`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}`** —
JSON-stat 2.0, synkront svar. Katalog: `…/api/dissemination/catalogue/toc/txt`.
Licens: fri återanvändning inklusive kommersiell, `Källa: Eurostat`.

```
…/statistics/1.0/data/migr_asyappctza?format=JSON&geo=SE&time=2024&lang=EN
```

| Kod | Dataset | Täckning |
|---|---|---|
| `migr_pop3ctb` / `migr_pop1ctz` | Befolkning 1 jan efter födelseland / medborgarskap | 1998–2025 |
| `migr_pop4ctb` / `migr_pop2ctz` | Samma, grova grupper — lättare att rita | 1998–2025 |
| `migr_imm1ctz` / `migr_imm3ctb` | Invandring efter medborgarskap / födelseland | 1998–2024 |
| `migr_acq` | Förvärv av medborgarskap efter tidigare medborgarskap | 1998–2024 |
| `migr_asyappctza` | Asylsökande efter typ, medborgarskap, ålder, kön | → 2025 |
| `migr_asyapp1mpm` | Förstagångssökande per 100 000, **månadsvis** | 2008-01 → **2026-05** |

`migr_asyapp1mpm` fram till maj 2026 är det färskaste jämförbara migrationsdata som finns
i hela det här dokumentet.

⚠️ **SDMX kan svara med ett jobb i stället för data** — `<ns0:syncResponse><queued>…
<status>PROCESSING</status>` — som du sedan får polla. Använd JSON-endpointen.
⚠️ Ofiltrerade uttag är enorma (`migr_imm1ctz` = 12,2 miljoner värden). Filtrera alltid
`geo`, `time` och medborgarskaps-/födelselandsdimensionen.
⚠️ JSON-stats `value` är en **gles map med plattat index**, inte en array. Lätt att få
tyst fel.

## Världsbanken — WDI

`https://api.worldbank.org/v2/country/{iso}/indicator/{code}?format=json&date=2000:2024`
**v2 är aktuell; `/v3/` ger 404** (kontrollerat 2026-08-20). Licens **CC BY 4.0** —
attribution krävs, till skillnad från SCB. Ingen nyckel.

**Använd `scripts/worldbank.py`.** Den gör de tre sakerna man annars gör fel:

```bash
python3 scripts/worldbank.py search "refugee"                    # bland alla 1 498 koder
python3 scripts/worldbank.py get SP.POP.TOTL --iso SE,SY,IQ --years 2015:2024
python3 scripts/worldbank.py countries --aggregates              # de 78 som inte är länder
```

**Verifierade koder 2026-08-20** (anropade, med svar):

| Kod | Vad |
|---|---|
| `SP.POP.TOTL` | Folkmängd |
| `SM.POP.NETM` | Nettomigration |
| `SM.POP.RHCR.EA` / `.EO` | Flyktingar under UNHCR:s mandat, efter asylland / ursprungsland |
| `SM.POP.RRWA.EA` / `.EO` | Detsamma under UNRWA:s mandat (palestinier) |
| `SE.ADT.LITR.ZS` | Läskunnighet, vuxna |
| `SI.POV.GINI` | Gini |

⚠️⚠️ **Indikatorkoder pensioneras, och API:et säger det inte.** Den här filen listade
`SM.POP.REFG` och `SM.POP.REFG.OR` fram till 2026-08-20. Båda är borta — de finns inte
bland de 1 498 koderna och svarar med tom data, inte med ett fel. Flyktingmåttet är
uppdelat på UNHCR- och UNRWA-mandat i tabellen ovan. `check-datakallor.py` ser inte det
här: den provar URL:er, och `.../indicator/SM.POP.REFG` svarar 200 med noll rader.
**Kör `worldbank.py search` innan du litar på en kod du inte nyss anropat.**

⚠️ **`country/all` blandar länder och aggregat.** 295 poster, varav **78 aggregat** —
`ARB` (Arab World), `MEA`, `SSF`, inkomstgrupper, `WLD`. De har `region.id == "NA"`. Ett
diagram som rankar »länder« på den listan sätter Sverige bredvid Arabvärlden och
dubbelräknar varje land i sitt eget aggregat. `worldbank.py` filtrerar bort dem som
standard. Aggregatens namn ändras dessutom: `MEA` heter numera *Middle East, North
Africa, Afghanistan & Pakistan* — läs namnet ur svaret, översätt inte ur minnet.

⚠️ Svaret är en **tvåelementsarray** — `[metadata, data]`. Standard `per_page` är 50 och
trunkerar tyst; skriptet sätter 500 och paginerar.

### ⛔ WDI innehåller ingen religionsstatistik

Ingen av de 1 498 indikatorerna mäter tro. Att gruppera länder efter majoritetsreligion är
en analys du själv gör, inte en kategori som finns i källan — och det är sällan rätt drag
här: det gör religion till förklaringen till ett utfall som mäts i BNP eller läskunnighet,
vilket är precis den sortens påstående sajten inte ska framföra i en axeletikett. Ska
ursprungsländernas förhållanden visas, **namnge länderna**. Se `[[no-shia-content]]` för
den angränsande regeln om kategorier.

## UNHCR ⭐ — det renaste API:et i listan

`https://api.unhcr.org/population/v1/` — ingen nyckel, ingen auth, ren JSON.

```
/population/?yearFrom=2023&yearTo=2024&coa=SWE
  → Sverige 2023: flyktingar 237 632, asylsökande 11 271, statslösa 18 698
/asylum-applications/?yearFrom=2024&yearTo=2024&coa=SWE&coo=SYR
  → Syrien→Sverige 2024: 1 681 ansökningar
```

`coa` = asylland, `coo` = ursprungsland, ISO3-koder. `Källa: UNHCR Refugee Data Finder`.
Exakt CC-identifierare *ej verifierad*.

## FN:s befolkningsavdelning (WPP)

`https://population.un.org/dataportalapi/api/v1/` — `/indicators/`, `/locations/`, JSON
eller `?format=csv`. Aktuell utgåva **World Population Prospects 2024**. CC BY 3.0 IGO.

⚠️ De gamla bulknedladdningarna är **döda** (`/wpp/Download/Standard/MostUsed/` → 404).
Navigera från `https://population.un.org/wpp/`. Stabil direkt-CSV *ej verifierad*.

## Our World in Data

| | |
|---|---|
| **Chart-API** | `https://ourworldindata.org/grapher/{slug}.csv` och `.metadata.json` |
| **Sök** | `https://ourworldindata.org/api/search?q=…` |
| **Ej detta** | `api.ourworldindata.org` → 404 · `catalog.ourworldindata.org` → 404 |

⚠️ **`?country=SWE` filtrerar inte** om du inte också sätter **`csvType=filtered`**. Utan
den får du hela världen.

```
https://ourworldindata.org/grapher/life-expectancy.csv?csvType=filtered&country=SWE&time=2000..2020
```

Relevant fynd: `how-important-religion-is-in-your-life`.

⚠️ **OWID:s eget lager är CC BY 4.0 — underliggande källdata behåller sin egen licens.**
`.metadata.json` bär ett `citation`-fält. **Hämta metadatan och citera originalkällan**
(UN WPP, WVS …), inte bara »Our World in Data«.

## Undersökningar: WVS, ESS, ISSP, ARDA

| Källa | Läge | Redistribution |
|---|---|---|
| **ISSP** (GESIS) | ⭐ Den mest användbara. *Religion IV 2018*, ZA7570, 48 länder. Även en kumulation **1991–2018** — perfekt för långa trender. Gratis efter enkel registrering | Aggregat ja, mikrodata nej |
| **ESS** | Flyttat till `https://www.europeansocialsurvey.org/data-portal` (SIKT). Äldre `/data/download`-länkar är döda. Variabler: `rlgblg`, `rlgdnm`, `rlgdgr`, `imbgeco`, `imueclt`, `imwbcnt`. Sverige med i varje runda | Aggregat ja, mikrodata nej |
| **WVS** | **Våg 8 pågår 2024–2026**, så senaste kompletta är **våg 7 (2017–2022)**. Gratis efter registrering | ⚠️ Villkoren gick **inte att verifiera** (JS-driven sida). Aggregat = etablerad praxis, låg risk. Mikrodata: förmodat förbjudet. **Kontrollera på nedladdningssidan vid användning** |
| **ARDA** | `https://www.thearda.com/` — 1 000+ samlingar, SPSS/Stata/Excel. Inget API | ⚠️ Licens **ej verifierad**; ingen anges i deras FAQ. **Citera och länka, spegla inte** |
| **World Religion Database** | Betalvägg (Brill) | ⛔ Inte en öppen källa |
| **Gallup World Poll** | Mikrodata endast mot abonnemang | ⛔ Bara publicerade tal, med hänvisning |
| **Ipsos** | Fria topline-PDF:er, ingen bulkdata, inget API | Citera PDF:en |

---

# 4. Sammanfattning: får jag rita det här?

| Källa | Licens | Härledda tal i ett diagram? |
|---|---|---|
| **SCB** | **CC0** | **Ja, villkorslöst** |
| Migrationsverket | »Inga villkor« | Ja |
| Valmyndigheten | PSI, fri | Ja, med hänvisning |
| Kolada | Fri | Ja — men tillskriv inte Kolada din egen bearbetning |
| Skolverket | Fri | Ja |
| Socialstyrelsen | »utan restriktioner« | Ja *(ingen formell licens-id)* |
| **Brå** | ⚠️ **Ingen angiven** | Etablerad praxis ja, men **inget uttryckligt tillstånd finns** |
| MUCF | Ingen angiven | Förmodat ja (PSI). *Ej verifierat* |
| Världsbanken | CC BY 4.0 | Ja |
| Eurostat | Fri + attribution | Ja |
| OWID | CC BY 4.0 (eget lager) | Ja — **citera underliggande källa** |
| UN WPP | CC BY 3.0 IGO | Ja |
| UNHCR | Öppen | Ja |
| **Pew** | **Ingen CC. Återkallelig licens** | **Utdrag ja**, med full hänvisning **och** ansvarsfriskrivningen. Spegling nej |
| WVS / ESS / ISSP | Fri, icke-kommersiell | Aggregat ja, mikrodata nej |
| ARDA / WRD / Gallup / Ipsos | Oklar eller stängd | Bara publicerade tal, med hänvisning |

---

# 5. Vad ingen källa kan ge dig

Sverige har inte samlat religionsstatistik sedan 1930. **Varje siffra om »antalet muslimer
i Sverige« som cirkulerar är en uppskattning** — byggd antingen på födelseland, eller på
hur många ett samfund uppger sig betjäna, eller på en enkät om självidentifiering. De tre
ger olika svar därför att de mäter olika saker.

Regeln är enkel: **diagrammet säger vilken av dem det är, i bildtexten, på läsarens
språk.** »Födelseland, inte trosbekännelse.« »Betjänade enligt samfundens egen
redovisning.« »Självskattad tillhörighet i SOM-undersökningen.«

Det är inte en brasklapp. Det är vad siffran betyder.

---

**Systerfiler:** `SKILL.md` (arbetsgången och reglerna), `DIAGRAMFORMER.md` (formerna och
specgrammatiken).
