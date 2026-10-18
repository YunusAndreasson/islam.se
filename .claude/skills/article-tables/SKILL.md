---
name: article-tables
description: Add a table to ONE islam.se text — an essay (data/articles/*.md), a fördjupning (data/fordjupning/*.md) or ett svar (data/svar/*.md) — as a ```table fence that renders to a real sourced <figure> on the web and into the PDF and EPUB books. Use when asked to "lägga till en tabell", "jämföra rättsskolorna", "ställa upp ståndpunkterna", "visa skillnaderna", or when a passage enumerates parallel positions the reader is being asked to hold in their head. Not for numbers that compare as magnitudes: that is article-charts. Not for producing the text itself: that is svar-answer-page, fordjupning-page or `pnpm produce`. Not for the /moskeer or /bonetider page furniture, which owns its own components.
---

# Tabeller i artiklar (```table)

Korpusen hade noll tabeller i 136 filer när den här formen byggdes, och det var inte
för att den inte behövdes. `scripts/find-table-candidates.py` hittar **elva svarssidor
och tolv fördjupningar** där prosan redan räknar upp parallella ståndpunkter i löptext —
fyra rättsskolor i en enda mening, tre läsningar av en vers, sju frågor med var sitt svar.
Läsaren ombeds hålla dem i huvudet. En tabell ber inte om det.

Till jämförelse hittar `find-chart-candidates.py` **en** kandidat på samma svarssidor.
Diagrammet är fel verktyg för den här korpusen. Tabellen är rätt.

## ⭐ Det enda testet: bär tabellen jämförelsen?

**Kan du i en sats säga vad tabellen låter läsaren göra som prosan inte gör?**

Kan du inte det finns ingen tabell.

**Godkänt.** Prosan säger: »Hos shafiiter, malikiter och hanbaliter är avsikten ett villkor
för att tvagningen ska vara giltig. Hanafiterna säger något annat.« Läsaren måste själv
bygga uppställningen. Tabellen ger den — fyra rader, två kolumner, och skillnaden syns.

**Underkänt.** Prosan säger: »De lärda är eniga om att fötterna tvättas.« Det finns ingen
jämförelse att ställa upp. En tabell med en rad är en mening man ritat en ram runt.

## Välj text med spaningsskriptet, inte på känsla

```bash
python3 scripts/find-table-candidates.py                    # hela korpusen, rangordnad
python3 scripts/find-table-candidates.py --top 5
python3 scripts/find-table-candidates.py data/svar/*.md
python3 scripts/find-table-candidates.py --json --min 6 data/fordjupning/*.md
```

`⭐` betyder att stycket redan bär ett kontrastord — »medan«, »är oense«, »till skillnad
från«. Det är den starkaste signalen: skribenten jämför redan, formen finns men syns inte.

`⛔` betyder att stycket nämner shia eller sufism. Läs det innan du rör det — se
kategoriregeln nedan.

Skriptet är **spaning, inte grind.** Det fäller inget bygge och avgör ingenting.

## Arbetsgång — en text per session

1. Kör spaningsskriptet och välj **en** text.
2. Läs hela avsnittet, inte bara stycket. Tabellen ska svara på avsnittets fråga.
3. Kontrollera varje cell mot den källa sidan redan citerar. Hittar du inte belägget i
   sidans egen apparat ska tabellen inte byggas — se källregeln.
4. Skriv blocket. Håll dig till fem kolumner och gärna färre.
5. Kör de snabba grindarna: `pnpm chart:check <fil>` och
   `python3 scripts/check-chart-sources.py --offline <fil>`.
6. Läs bildtexten högt. Säger den vad tabellen inte kan säga?
7. **Bygg en gång**, till sist: `pnpm verify`. Grinden som bevisar att Shiki inte åt
   blocket finns bara i ett riktigt bygge.

**Aldrig batch. Aldrig commit, aldrig deploy** — människan kontrollerar varje cell mot sin
källa och levererar med `pnpm ship`.

## ⛔ Kategoriregeln — och varför den är en annan än diagrammets

**Shia och sufism får aldrig vara en rad, en kolumn, en serie eller en enhet.** Inte i en
tabell, inte i ett diagram, inte i bildtexten. En kategori som namnger en position och
lämnar den stående är precis det CLAUDE.md förbjuder. `check-chart-sources.py` fäller det
och bygget stannar.

**Rättsskolorna är tvärtom tillåtna i en tabell — och förbjudna i ett diagram.** Det är
ingen inkonsekvens:

- En **stapel** per rättsskola gör en trosfråga till marknadsandel. Formen påstår att
  skolorna är mängder som kan vara större eller mindre än varandra.
- En **tabellrad** per rättsskola påstår ingenting annat än att skolan har en ståndpunkt,
  vilket är sant och är precis den form CLAUDE.md föreskriver: *»On a pure doctrine page
  (»vad säger rättsskolorna om X«) you take the four and stop there.«*

Är de med ska **alla fyra** vara med — hanafi, maliki, shafii, hanbali. Tar du upp tre
utan att säga varför varnar grinden, och den har rätt: en ofullständig uppräkning läser
som om den fjärde saknade ståndpunkt. Aldrig en femte.

## Källan

`source:` är obligatorisk. Parsern vägrar ett block utan den, och det är inte en
formalitet: en tabell är lika auktoritativ för läsaren som en stapel. Den har inga
hedges, ingen »omkring«, ingen brasklapp.

- Källan ska också stå i **sidans egen apparat** — i `sources:` i frontmatter på en
  fördjupning eller ett svar, i en fotnot i en essä. Annars ser läsaren den bara i
  bildtexten och `check-source-urls.py` granskar den aldrig. Grinden varnar för det.
- `sourceUrl:` **bara om du har anropat den.** En källa utan länk är korrekt. En påhittad
  länk är en förfalskning.
- `note:` är ingen brasklapp utan den mening som gör tabellen sann: »Gäller endast
  avsiktens ställning. På de sex övriga frågorna går skiljelinjerna annorlunda.«

## Husets röst inne i blocket

- **Raka citattecken `"…"`.** Renderaren gör om dem till »…«. Skriver du guillemeter
  själv fälls filen av `check-house-style.py`.
- Spatierat tankstreck ` – `, aldrig `—`.
- Svenskt decimalkomma: `12,5`.
- Enheten hör hemma i kolumnrubriken — »Andel (%)«, inte `%` i varje cell.
- Ingen fotnotsmarkör `[^N]` inne i blocket: den renderas som literal text, samtidigt som
  `normalizeFootnotes()` räknar och numrerar om den. Fel åt båda hållen.
- Celler är korta. En cell som behöver en bisats hör hemma i prosan.

## Rubriken — en miss betyder att den inte går i tryck

- Den bär jämförelsen, inte prosan i annan form.
- Alla fyra rättsskolorna, om någon av dem är med.
- Högst fem kolumner. Den läses vid 375 px — **kontrollera det, anta det inte.**
- Varje cell går att belägga i sidans egen apparat.
- `note:` säger vad tabellen inte kan säga.
- Blocket följer det stycke som etablerar jämförelsen, före det som tolkar den.
- Prosan lämnar över till tabellen i stället för att upprepa den.

## ⚠️ Fällor

**Fensvetsning.** Fogas blocket in mitt i ett stycke hamnar prosa på den avslutande
```-raden, markdown stänger inte blocket, och läsaren får se specen. Ankra alltid på ett
styckeslut. `scripts/add-chart.py` finns för att den buggen har inträffat.

**Innehållscachen.** Ändrar du renderaren eller pluginet invalideras inte innehållet. Kör
`rm -f apps/web/.astro/data-store.json apps/web/node_modules/.astro/data-store.json`
(båda finns), annars granskar du gammal HTML.

**Chromium ljuger om mobilen.** Ett för brett figurblock fick en gång hela sidan att
scrolla i sidled vid 375 px — hittat i Zen, osynligt i headless Chromium. Tabellen ska
scrolla **i sin egen ruta**; sidan ska aldrig scrolla i sidled.

**En tabell som egentligen är ett diagram.** Är alla celler tal som jämförs som storheter
har du byggt en stapelrad i tabellform. Gå till `article-charts`.

## Grindar — i kod, inte bara här

| Grind | Var | Beteende |
|---|---|---|
| Felaktig spec | `src/lib/table/spec.ts` | ⛔ Kastar med radnumret. Bygget faller; en halv tabell renderas aldrig |
| `source:` saknas | samma | ⛔ Vägrar tolka blocket |
| Fler än fem kolumner | samma | ⛔ Vägrar — den läses inte på en telefon |
| En enda rad | samma | ⛔ Vägrar — det är en mening |
| Shia/sufism som etikett | `scripts/check-chart-sources.py` | ⛔ Slutkod 1 |
| Femte rättsskola | samma | ⛔ Slutkod 1 |
| Tre av fyra rättsskolor | samma | ⚠️ Varning — motivera eller komplettera |
| Död `sourceUrl:` | samma | ⛔ Slutkod 1 (hoppas över med `--offline`) |
| Källan saknas i sidans apparat | samma | ⚠️ Varning — läs den, den har oftast rätt |
| Blocket renderas inte / läcker som kod | `apps/web/scripts/assert-full-build.mjs` | ⛔ Stoppar leveransen |
| Husets typografi i bildtexten | `scripts/check-house-style.py` | ⛔ via `pnpm lint:house` |

### Den snabba loopen tar sekunder, bygget är en batchoperation

`pnpm chart:check <fil>` och `check-chart-sources.py` kör på ~1 sekund och fångar allt
utom pluginkopplingen. `pnpm verify` tar ~2 m 40 s eftersom det bygger om 2 473 sidor.
Skriv färdigt alla tabeller, bygg sedan **en** gång.

## Nyckelfiler

- `apps/web/src/lib/table/spec.ts` — grammatiken och varje vägran
- `apps/web/src/lib/table/render.ts` — markup, alt-text, GFM-tvillingen
- `apps/web/src/lib/figure/` — grammatiken och bildtexten som delas med ```chart
- `apps/web/src/plugins/rehype-table.ts` — fence → figur vid bygget
- `apps/web/src/styles/chart.css` — tabellreglerna ligger här, inte i egen fil
- `scripts/find-table-candidates.py` — spaningen; läser bara, avgör ingenting
- `scripts/check-chart-sources.py` — käll- och kategorigrinden för båda formerna
- `TABELLFORMER.md` — grammatiken i tabellform, med varje nyckel

**Systerskills:** `article-charts` för storheter som jämförs som längder.
`fordjupning-page` och `svar-answer-page` för att producera själva texten.
`language-pass` för språket omkring den.
