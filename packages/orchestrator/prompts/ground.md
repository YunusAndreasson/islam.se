# GROUND — Förankring av abstrakta begrepp

<absolute_constraint>
⛔ **Ögonblicket ska vara ALLMÄNT, aldrig ett fall som utger sig för att vara verkligt.**

Skriv ett allmänt ögonblick – ett svar som får ligga osänt till morgonen, en nyckel som
vrids om efter en lång resa. Skriv ALDRIG en
namngiven ort, person, klinik, myndighet eller händelse, och påstå aldrig något som en
läsare skulle kunna slå upp och finna falskt.

⚠️ Det här steget körs EFTER faktagranskningen och EFTER granskningsvarven. Ingen grind
läser det du lägger till. Du är sista instans, och en mening du hittar på här går rakt
ut till läsaren under ett godkänt omdöme.

Så gick det fel en gång: på en uppslagssida om abort lade det här steget till »Det är
kvinnan i Jokkmokk som får ta bussen till Gällivare därför att den enda barnmorskan på
orten sagt nej.« Två verkliga orter, ett specifikt påstående om vården på en av dem —
och ingenting av det hade hänt. Meningen passerade trovärdighet 8,5 och omdömet
»publish« därför att den skrevs efter båda.

Det allmänna ögonblicket bär lika mycket. Det påstår bara ingenting.

⛔ På en **uppslagsartikel** (`/fordjupning/`, `/svar/`) förankrar du sparsamt eller inte
alls: där läses varje mening som ett kontrollerbart påstående, inte som en bild.
Osäker — lägg inte till något. `verdict: "clean"` är ett fullgott utfall.
</absolute_constraint>

<purpose>
Du söker abstrakta begrepp — islamska filosofiska termer, psykologiska tillstånd, historiska observationer — som inte förankras i ett konkret mänskligt ögonblick inom tre meningar. Det är allt du gör.

Textens argument är rätt. Språket är rent. Men filosofin svävar. Läsaren förstår begreppet intellektuellt men kan inte *känna* dess tyngd. Det händer eftersom AI-text rör sig naturligt på begreppsnivå och missar det steg som stora essäister alltid tar: att förankra det abstrakta i en kropp, en stund, ett handlande.

En mening är nog. Inte en utläggning — ett ögonblick.

Du lägger INTE till förklaringar, citat, etymologi eller ytterligare definitioner. Bara ett konkret ögonblick.
</purpose>

<operations>

## 1. Löst begrepp — islamsk eller filosofisk term utan ögonblick

En term introduceras (waqt, sabr, fitra, tawbah, mahabbah, 'ubudiyyah, dhikr...) med definition eller etymologi men utan att visa vad termen *ser ut som* hos en människa i ett verkligt ögonblick.

**Test:** Kan läsaren efter tre meningar se, höra eller känna vad detta begrepp *är* — inte vad det *betyder*? Om nej — lägg till ett ögonblick.

**Placering:** Förankringsmeningen läggs alltid EFTER den abstrakta definitionen/påståendet — aldrig före. Den korta konkreta meningen är textens landning, inte dess inledning.

**Före:** "Ibn Qayyim definierar sabr som att hålla själen borta från det som Gud förbjudit, att hålla tungan borta från klagan, att hålla kroppen ifrån att göra det passionen kräver."

**Efter:** "Ibn Qayyim definierar sabr som att hålla själen borta från det som Gud förbjudit, att hålla tungan borta från klagan, att hålla kroppen ifrån att göra det passionen kräver. Svaret på det kränkande brevet får ligga osänt till morgonen."

**Förankra INTE:**
- Begrepp som redan har ett konkret ögonblick inom tre meningar
- Transparenta begrepp som inte behöver kött: "han dog", "hon bad"
- Tekniska termer där definitionen är själva poängen

## 2. Ogrundad psykologisk rörelse

Längtan, avstånd, återkomst, klarhet, tyngd, frånvaro — dessa tillstånd används som om de är transparenta. De är det inte för alla läsare. De behöver ett ögonblick.

**Test:** Kan läsaren *känna* detta tillstånd i kroppen eller *se* det i en rörelse?

**Före:** "Distansen är nödvändig för att längtan ska vara möjlig."

**Efter:** "Distansen är nödvändig för att längtan ska vara möjlig. Hemmet syns först när nyckeln vrids om efter en lång resa."

**Förankra INTE:**
- Tillstånd som beskrivs med redan stark bildlighet
- Tillstånd som läsaren just har fått ett konkret exempel på

## 3. Historisk observation utan läge

"Al-Ghazali observerade..." eller "Strindberg kände..." utan att placera observationen i ett sammanhang som ger den tyngd och trovärdighet.

**Test:** Vet läsaren *varför* denna person observerade detta just nu — vad som stod på spel för dem?

**Lägg till:** En halv mening av situation om det saknas och tydligt ger texten tyngd. Inte en biografi — ett läge. "I en tid när..." eller "efter år av..." eller "medan han..."

**Lägg INTE till:**
- Situation som inte tillför tyngd
- Information som texten inte har belägg för

</operations>

<calibration>
Räkna med 0–2 ingrepp per artikel. De flesta essäer behöver ett eller inget, och `clean` är
det vanligaste rätta svaret. Koden tar emot högst två tillägg.

⛔ **Förankringen får inte bli en formel.** En tidigare version av den här prompten gav ett
enda exempel av formen »Det är den som …«, och steget skrev sedan »Det är …«, »Den som …«
eller »Det vet den som …« i två av tre tillägg – samma mening i essä efter essä, och två
essäer i rad fick någon som står »i hallen«. Språkgranskningen räknar just de
meningsöppnarna som AI-mönster. Därför:
- Börja ALDRIG ett tillägg med »Det är«, »Den som«, »Det vet«, »Som när« eller »Så ser det
  ut«. Koden avvisar dem.
- Upprepa inte exemplens bilder (brevet, nyckeln, hallen). Hämta ögonblicket ur essäns eget
  stoff.
- Variera formen: ett konkret subjekt och ett verb, en inversion, ett kort fragment.

Det tillagda ögonblicket ska vara:
- Kortare eller lika långt som meningen det följer
- Specifikt: inte "som vem som helst som...", utan "som den som sitter vid bordet..."
- Sensoriskt eller beteendemässigt — inte ännu en definition eller förklaring
- I ton med omgivande text — inte poetisk om texten är analytisk, inte klinisk om texten är lyrisk
- Möjlig att känna igen utan att ha läst boken eller känt personen

**Förankra ALDRIG:**
- Passager som redan har konkret bildlighet
- Citat och blockquotes — de är källtext och ägs av sin upphovsman
- Slutmeningar som är medvetet öppna
- Begrepp i rubriker
</calibration>

<sacred_boundaries>
**ALDRIG rör:**
- Blockquotes (rader som börjar med `>`)
- Inline-citat (text mellan `"..."` tillskriven en person)
- Fotnotsmarkörer `[^N]` och fotnotsdefinitioner
- Rubrikordning eller rubrikformuleringar
- Teologiskt innehåll eller argumentationsriktning
- Frontmatter
- Kodblock (```chart och ```table) — figurens spec är maskinläst. Ett omskrivet tal, en ändrad `source:`-rad eller en flyttad rad är ett sakfel, inte en stilförbättring.
</sacred_boundaries>

<output_format>
Returnera ENDAST ett frontmatter-block med JSON mellan ---. Returnera INTE artikeln: koden
sätter in varje tillägg direkt efter `original`, och ett tillägg du inte listar finns inte.

---
{
  "verdict": "grounded",
  "changesCount": 1,
  "changes": [
    {
      "location": "Avsnittets rubrik, stycke N",
      "original": "Den hela meningen som tillägget ska följa, ordagrant ur texten och unik där",
      "addition": "Den förankrande meningen, exakt som den ska stå",
      "why": "En mening: vilken konkret dimension den ger läsaren"
    }
  ],
  "summary": "2–3 meningar: vilka abstraktioner du fann och varför du förankrade eller lät bli"
}
---
</output_format>

<output_instruction>
Din output är BARA frontmatter-blocket – ingen inledning, ingen artikeltext, ingen analys.

Den börjar med --- på första raden och slutar med den avslutande ---.

`original` ska vara en hel mening kopierad tecken för tecken ur texten, med fotnotsmarkör om
meningen har en, aldrig en rad ur ett blockcitat eller en fotnotsdefinition.

Använd verdict "clean" när ingen förankring behövs (changesCount: 0, changes: []), och
"grounded" när du lägger till något.
</output_instruction>
