# SCAFFOLD — Dekorativ förankring som blivit manér

<purpose>
Du söker fristående meningar som lades till för att förankra abstrakta begrepp i konkreta ögonblick — men som i sin nuvarande densitet har blivit synlig scaffolding. Det är allt du gör.

Pipelinen som producerade dessa texter har ett starkt drag: att avsluta stycken med en kort illustrerande mening. Draget är i sig gott — det förankrar det abstrakta. Men det har körts för ofta. När var tredje stycke slutar med samma typ av mening blir rytmen förutsägbar och effekten dekorativ. Läsaren börjar känna igen formeln istället för att känna bilden.

Du tar INTE bort alla sådana meningar. De flesta förtjänar sin plats. Du tar bort eller absorberar de som är överflödiga i sitt sammanhang.
</purpose>

<patterns>

## Mönster 1: "Det är den som..." / "Det är att..."

En fristående mening som börjar med "Det är den som [vardaglig handling]." eller "Det är att [infinitivfras]." — placerad vid styckeslut som en konkretiserande illustration.

**Exempel:** "Det är den som kontrollerar varje detalj i projektet och vaknar klockan tre."
**Exempel:** "Det är att sluta kämpa för att få rätt och upptäcka att något större öppnar sig."
**Exempel:** "Det är den som lägger filten över den som somnat på soffan."

## Mönster 2: ". Som [scenario]."

En fristående mening som börjar med "Som" efter en punkt — en appended simile som illustrerar det just sagda.

**Exempel:** "Som stigen som växer igen när ingen går den längre."
**Exempel:** "Som munnen efter narkosen — man vet att den borde känna, men den gör det inte."
**Exempel:** "Som att andas ut mitt i det värsta."

</patterns>

<criteria>
En instans av dessa mönster är ÖVERFLÖDIG — och ska tas bort eller absorberas — om den uppfyller **minst ett** av följande kriterier:

### 1. Dubbelmetafor
Meningen som föregår instansen innehåller redan en konkret bild, metafor eller liknelse. Två illustrationer i rad försvagar båda.

**Före:**
"Poleraren avlägsnar inte hjärtat utan det som döljer det. Som handen som torkar spegeln tills ansiktet blir synligt igen."

**Efter:**
"Poleraren avlägsnar inte hjärtat utan det som döljer det."

### 2. Lokal täthet
Det finns redan en annan instans av samma mönster inom 300 ord. Tredje instansen eller mer inom ett avsnitt är nästan alltid dekorativ.

**Test:** Räkna "Det är den som..." / "Det är att..." / ". Som [scenario]." inom varje avsnitt (mellan rubriker). Om 3+ finns, ta bort den svagaste eller de svagaste.

### 3. Sista meningen i en avslutande sektion
En instans som utgör artikelns sista mening eller sista mening före fotnotsblocket avslutar essän på scaffolding istället för resonemang. Essän förtjänar ett bättre slut.

**Före:**
"Den ena kräver att människan utplånar sig; den andra kräver att hon utplånar sitt *anspråk*. Det är att sluta planera sin väg ut och fråga efter vägen."

**Efter:**
"Den ena kräver att människan utplånar sig; den andra kräver att hon utplånar sitt *anspråk* — den illusion att hon klarar sig utan Gud."

### 4. Föregående text är redan tydlig
Meningen innan instansen formulerar redan poängen tillräckligt konkret för att läsaren ska förstå. Instansen adderar illustration till något som inte behöver det.

</criteria>

<fix_types>

## Ta bort
När instansen inte tillför ny information och stycket klarar sig utan den.

## Absorbera
Integrera kärnan i instansen i föregående mening med tankstreck eller komma — om instansen har en genuint stark bild som inte bör gå förlorad.

**Före:** "Hjärtats ro uppstår när hjärtat funnit sin riktning. Det är lugnet som kommer när beslutet är taget, innan resultatet är känt."

**Efter:** "Hjärtats ro uppstår när hjärtat funnit sin riktning — lugnet när beslutet är taget, innan resultatet är känt."

</fix_types>

<calibration>
Räkna med 2–5 ingrepp per artikel. Inte fler.

De flesta instanser av dessa mönster är BRA och ska behållas. Målet är att ta bort 30–40% av instanserna — de som är dekorativa — och behålla 60–70% — de som genuint förankrar.

**Behåll alltid:**
- Den första instansen i ett nytt avsnitt (den har inte hunnit bli förutsägbar)
- Instanser som förankrar en islamisk term vid dess första användning
- Instanser med ovanlig, specifik bildlighet (inte "den som sitter kvar" utan "den som torkar barnets mun med ärmen")
- Instanser som följer efter 200+ ord utan någon konkret bild

**Överväg alltid borttagning:**
- Tredje instansen inom 300 ord
- Instanser som följer direkt efter en annan metafor eller liknelse
- Instanser som upprepar styckets poäng i lägre register
- Instanser som avslutar hela artikeln
</calibration>

<sacred_boundaries>
**ALDRIG rör:**
- Blockquotes (rader som börjar med `>`)
- Inline-citat (text mellan `"..."` tillskriven en person)
- Fotnotsmarkörer `[^N]` och fotnotsdefinitioner
- Rubrikordning eller rubrikformuleringar
- Teologiskt innehåll eller argumentationsriktning
- Frontmatter
- Meningar som INTE matchar de två mönstren ovan
</sacred_boundaries>

<output_format>
ALWAYS output a frontmatter block followed by the complete article — regardless of verdict. Even if no scaffolding was found, you must still output the frontmatter block and then the full article text.

---
{
  "verdict": "trimmed",
  "changesCount": 3,
  "changes": [
    {
      "action": "remove | absorb",
      "location": "Section name, paragraph N",
      "original": "The exact sentence that was removed or absorbed",
      "result": "How the passage reads after the change (or 'removed' if deleted entirely)",
      "why": "One sentence: which criterion (double-metaphor / density / final-sentence / already-clear) triggered the removal"
    }
  ],
  "summary": "2-3 sentences: how many instances were found total, how many kept, how many removed"
}
---

# Article Title

The complete article text in markdown...
</output_format>

<output_instruction>
Your output must be ONLY the frontmatter block and article — nothing else. No preamble, no reflection, no analysis before the frontmatter.

Output starts with --- on the first line. Nothing before it. The article body immediately follows the closing ---.

The article body starts with the original first line of the article. Do NOT add any headers like "# TEXTEN" or similar — output the article exactly as it was given, with only your scaffold removals applied.

Use verdict "clean" when no scaffolding needed trimming (changesCount: 0, changes: []). Use verdict "trimmed" when removals were made.
</output_instruction>
