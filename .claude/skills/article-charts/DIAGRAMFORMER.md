# Diagramformerna och specgrammatiken

Fem former, och avsiktligt inte fler. Urvalet är stängt av en enda anledning: **en form
som inte går att läsa i en färg hör inte hemma på den här webbplatsen.** DESIGN.md tillåter
fyra färger på hela sajten och säger att mässingen förtjänar sin plats genom att koda något.
Ett diagram skiljer därför serier åt med direkta etiketter, med position och med mässing mot
dämpat — aldrig med kulör.

Om ett diagram behöver en tredje färg är diagrammet fel. Dela upp det.

---

## Välj form

| `type` | Formen | Ta den när | På mobil |
|---|---|---|---|
| **`bars`** | Rankade liggande staplar, värdet vid stapelns slut | **Grundformen.** Du jämför namngivna kategorier | Egen rad för etikett och värde, spåret under. Inget roterar |
| `columns` | Stående staplar på en ordnad axel | x-axeln är tid eller en ordnad hink (decennier, åldersgrupper) **och** etiketterna är korta | Lägre höjd, mindre etiketter |
| `line` | En eller två serier över tid, etiketterade vid linjens slut | En trend med minst sex punkter | Scrollar i sin egen ruta, glesare axel, serienamnen flyttar till en legend |
| `slope` | Två tidpunkter, N kategorier, förbindande streck | Före och efter över flera saker — en i mässing, resten dämpade | Scrollar i sin egen ruta |
| `stack` | En enda 100-procentsstapel, segmenten skilda av en hårfin springa | Delar av en helhet. **Ersätter cirkeldiagrammet**, som skulle kräva kulörer sajten inte har | Segmenten krymper, nyckeln står kvar under |

**`bars` ska vara de flesta diagram.** Den är mobilinfödd: långa svenska kategorinamn
(»Bosniakiska islamiska samfundet«) radbryts som riktig text, ingenting roteras, och
etiketten skalar med läsarens egen teckenstorlek. Räck efter något annat bara när den här
tabellen säger åt dig att göra det.

**Inte byggda, avsiktligt:** `dots` (lollipop) och `sverige` (länskarta ovanpå silhuetten i
`src/lib/bonetider/sweden-outline.ts`). Båda är billiga att lägga till. Ingendera behövdes
för de första diagrammen, och en form som ingen har använt är en form ingen har testat.

---

## Grammatiken

Ett block är rader av `nyckel: värde`. Skalärer står i vänsterkanten, dataraderna är
indragna under `data:`. Inget mer.

```chart
type: bars
unit: procent
source: Falchi et al., "The New World Atlas", Science Advances 2:6, 2016
sourceUrl: https://www.science.org/doi/10.1126/sciadv.1600377
note: Andelen som lever under en himmel där Vintergatan inte går att urskilja.
emphasis: Europa
data:
  Europa: 90
  Världen: 33
```

| Nyckel | Krav | Betydelse |
|---|---|---|
| `type` | ⛔ | En av de fem ovan |
| `source` | ⛔ | Källan, som den ska stå i bildtexten. Utan den vägrar parsern |
| `data:` | ⛔ | Indragna `etikett: värde`-rader |
| `unit` | | »personer«, »procent«, »moskéer«. Hamnar **en gång** i bildtexten — utom `%`, som står kvar på värdet |
| `sourceUrl` | | Bara om du har anropat den. Annars utelämnas den |
| `note` | | Vad underlaget **inte** kan säga. Se honnörsregeln i SKILL.md |
| `caption` | | Ersätter enhetsraden som bildtextens första mening |
| `emphasis` | | En etikett som behåller mässingen medan resten går dämpade |
| `series` | | `A \| B`. Högst två — parsern vägrar en tredje |
| `max` | | Tvingar axelns tak. Sällan rätt |
| `alt` | | Ersätter den genererade alt-texten. Skriv en hel svensk mening |

**Talformat.** Skriv talen som du skriver dem: `196000`, `196 000`, `12,5` eller `12.5`.
Renderaren formaterar till `196 000` och `12,5 %` med hårda mellanslag. Ett ensamt `-`
betyder lucka — den utelämnas ur linjen i stället för att ritas som noll.

**Citattecken.** Raka `"…"` i specen. Renderaren gör om dem till »…« precis som
remark-smartypants gör med prosan. Skriver du »…« själv fäller `check-house-style.py` filen.

**Flera serier.** `data`-radens värden delas på `|` och måste vara lika många som `series`:

```chart
type: line
series: Anmälda | Uppklarade
source: Brå, Polisanmälda hatbrott 2024 (rapport 2025:19)
data:
  2020: 100 | 20
  2022: 180 | 30
```

---

## Att framhäva utan en andra färg

Tre mönster, och de räcker.

**En serie.** Allt i mässing. Ordningen bär läsningen.

```
Stockholm        ████████████████████  44
Skåne            ████████████████      36
Västra Götaland  ████████████████      36
```

**En mot de andra** — `emphasis:`. Den framhävda raden behåller mässingen, resten går
dämpade. Det här är formen när artikeln argumenterar om *en* av posterna.

```
Europa    ████████████████████  90 %   ← mässing
Världen   ███████               33 %   ← dämpad
```

**Ordnad rampa** — `stack` utan `emphasis`. Segmenten tonar från mässing mot dämpat i
dataordning, så ljushet bär ordningen. Det är också den enda kodning som överlever en
gråskaleutskrift.

För `line` och `slope`: serie ett är mässing, serie två dämpad. Etiketten sitter vid
linjens slut, inte i en ruta — en legend tvingar läsaren att titta bort från kurvan och
tillbaka.

---

### `slope` med tätt liggande värden

Etiketterna sitter vid linjens ände och skjuts numera automatiskt isär när två kategorier
ligger för nära varandra på skalan — datapunkten står kvar, bara texten flyttas. Uppmätt
på `moske.md`: 73 och 67 på en axel som går till 328 hamnade på samma rad och smetade ihop.

Automatiken räcker för två eller tre krockar. Behöver ett `slope` fler än så, eller ligger
halva fältet i en klump längst ned, är formen fel: dela upp i två diagram, eller ta `bars`
för ett av åren och nämn det andra i `note:`.

### ⚠️ Mata `stack` med antal, aldrig med publicerade procenttal

`stack` normaliserar till hundra. Publicerade procenttal är redan avrundade och summerar
därför nästan aldrig till exakt 100 — och normaliseringen fördelar mellanskillnaden över
segmenten. Uppmätt 2026-08-20 på `abort.md`: Socialstyrelsens tabell 3 ger 64,6 / 22,3 /
7,0 / 5,0 / 1,0, som summerar till 99,9. Specen fick de talen och diagrammet skrev ut
**64,7**. Det är en siffra som inte står i källan, på en sida som citerar källan.

Ge i stället råtalen — 22011, 7608, 2384, 1704, 352 — och låt renderaren räkna andelarna.
Då blev utskriften 64,6 / 22,3 / 7 / 5 / 1, exakt som tabellen. Regeln är enkel: **antal
in, andelar ut.** Har du bara procenttal och de inte summerar till 100, säg det i `note:`
i stället för att låta koden jämna ut det åt dig.

## Antimönster

- **Ingen cirkel.** En tårtbit måste skiljas från nästa med kulör, och sajten har en
  datafärg. `stack` gör samma jobb och går dessutom att läsa.
- **Ingen avskuren baslinje.** `bars` och `columns` mäts alltid från noll. Att kapa axeln
  tredubblar en skillnad som inte är tredubbel; det är det äldsta sättet att ljuga med ett
  diagram. Renderaren mäter från noll och ett test vaktar det.
- **Ingen andra y-axel.** Två skalor i samma ruta betyder att förhållandet mellan kurvorna
  är godtyckligt valt av dig.
- **Högst två serier på en linje.** Parsern vägrar en tredje. Svaret är små multiplar.
- **Ingen legend där en direkt etikett får plats.** `line` har legend bara under 480 px,
  där etiketterna vid linjens slut inte längre ryms.
- **Ingen ram, ingen bakgrundsplatta, inget rutnät utöver noll och toppen.** DESIGN.md:
  inga linjer som inte kodar något.
- **Ingen animation.** Prosa rör sig inte på den här sajten och diagram gör det inte heller.
- **Inget som kräver JavaScript.** Allt renderas vid bygget. Ett diagram ska finnas där med
  skript avstängt, i utskriften och för en crawler.

---

## Genomarbetade exempel

### `bars` — grundformen, med framhävning

Från `data/articles/vintergatan-vi-slackte.md`. Essän öppnar med »En tredjedel av
mänskligheten har aldrig sett Vintergatan« och fortsätter »I Europa lever nittio procent
under himlar så genomlysta att stjärnhimlen krympt till ett fåtal punkter«. Klyftan mellan
de två talen är styckets poäng, och två staplar gör den till något man ser.

```chart
type: bars
unit: procent
source: Falchi et al., "The New World Atlas of Artificial Night Sky Brightness", Science Advances 2:6, 2016
note: Andelen som lever under en himmel där Vintergatan inte längre går att urskilja.
emphasis: Europa
data:
  Europa: 90
  Världen: 33
```

Lägg märke till: källan står ordagrant som essäns egen fotnot `[^1]` skriver den (»et al.«,
inte »m.fl.«) — `check-chart-sources.py` jämför de två och klagar när de glider isär.

### `columns` — ordnad axel

```chart
type: columns
unit: moskéer
source: islam.se moskédatabas, de 170 med känt grundningsår
note: Underlaget är ofullständigt och det pågående decenniet ännu inte fullt.
data:
  1970: 2
  1980: 11
  1990: 43
  2000: 35
  2010: 65
  2020: 14
```

`note:` gör två medgivanden på en rad. Båda behövs: utan det första läser stapeln för 1970
som »två moskéer fanns«, utan det andra läser 2020-talets som ett fall.

### `stack` — delar av en helhet

```chart
type: stack
source: Brå, Polisanmälda hatbrott 2024 (rapport 2025:19)
note: Polisanmälningar med hatbrottsmarkering, inte domar och inte förekomst.
data:
  Främlingsfientliga och rasistiska: 50
  Religiösa: 18
  Hbtqi: 13
  Ospecificerat: 20
```

Andelarna räknas om mot summan, så Brås egen avrundning till 101 blir 49,5 / 17,8 / 12,9 /
19,8. Det är ärligare än att skriva av procenttalen och låta dem summera till 101.

### `line` — två serier

```chart
type: line
series: Anmälda | Uppklarade
unit: ärenden
source: Brå, tabellsamling Polisanmälda hatbrott 2020–2024
data:
  2020: 100 | 20
  2021: 140 | 25
  2022: 180 | 30
  2023: 205 | 35
  2024: 240 | 40
```

⚠️ Just den här serien är påhittad som formprov. Brås statistik är **tvåårig** — en verklig
linje över hatbrott har inte en punkt per år.

### `slope` — före och efter

```chart
type: slope
series: 2010 | 2020
emphasis: Sverige
source: Pew Research Center, "How the Global Religious Landscape Changed From 2010 to 2020" (2025)
data:
  Sverige: 45 | 80
  Norge: 60 | 66
  Danmark: 70 | 52
```

`slope` är formen när riktningen skiljer sig mellan kategorierna — en stiger, en står still,
en faller. Går alla åt samma håll säger `bars` med två serier samma sak enklare.

---

## Mobil, mörkt läge och böcker

- **`bars`, `columns` och `stack` är HTML och CSS.** Etiketterna är riktig text: de
  radbryts, skalar med läsarens teckenstorlek, går att markera och söka i. SVG-text gör
  inget av det.
- **`line` och `slope` är SVG**, i en 560-enheters viewBox och inte 760. Text inuti en
  viewBox mäts i användarenheter, så den renderade storleken är `12 × (bredd / viewBox)`.
  Vid 560 landar en axeletikett på ~14 px i en 42rem-spalt och ~11 px vid golvet på 32rem.
  Vid 760 hade samma etikett blivit 5 px på en telefon.
- **Under 32rem scrollar de två SVG-formerna i sin egen ruta.** Sidan scrollar aldrig i
  sidled — det är skillnaden, och den är hela poängen.
- **Mörkt läge sköter sig självt.** Webbläget målar med `var(--color-brass)` och
  `light-dark()` löser om hela paletten. Skriv aldrig en hex i renderarens webbläge.
- **Böckerna får print-läget**, som byter in bokstavliga färger — Typst och EPUB har inga
  CSS-variabler. Bläcket är `currentColor` så att en läsare i nattläge inte får nästan svart
  text på svart sida.

Ett diagram som inte finns i `dist/samlingsvolym.pdf` är ett diagram prosan hänvisar till i
tomma luften. Kontrollera sidan, varje gång.

---

**Systerfiler:** `SKILL.md` (när ett diagram förtjänar sin plats, och grindarna),
`DATAKALLOR.md` (var siffrorna kommer ifrån).
