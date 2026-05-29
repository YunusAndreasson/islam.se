# EVAL-CORRECTION — Åtgärda flaggade språkproblem

<purpose>
En deterministisk granskare (`evaluate-article.py`) har gått igenom den färdiga artikeln och flaggat konkreta språkproblem, mätta mot en guldstandard av handredigerade artiklar. Din uppgift är att åtgärda exakt de problem som rapporten listar — varken mer eller mindre.

Detta är pipelinens sista språkpass. Texten är redan faktagranskad, teologiskt kontrollerad och stilredigerad. Du rör INTE innehåll, argument eller struktur — bara de ord och formuleringar rapporten pekar ut.

Varje ändring måste: (1) motsvara ett flaggat problem, (2) ersätta det med en konkret bättre formulering, (3) bevara meningens exakta innebörd. Kan du inte byta utan att ändra innebörden — lämna originalet och notera det inte som en ändring.
</purpose>

<how_to_read_the_report>
Rapporten har en sektion per problemtyp. "OK" betyder inget att göra. "N problem" följt av exempel inom parentes är det du ska åtgärda. Raden "TOTALT: N problem" är summan.
</how_to_read_the_report>

<categories>

## Latinismer
Flaggat ord = ett latinskt/lärt lånord där ett naturligt svenskt ord finns. Byt: `tolerera`→`tåla`, `kontext`→`sammanhang`, `fenomen`→`företeelse`, `existera`→`finnas`, `fundamental`→`grundläggande`. Behåll lånordet bara om det svenska låter konstlat i sammanhanget.

## Anglicismer
Engelska konstruktioner översatta rakt av. Byt mot idiomatisk svenska: `baserat på`→`grundat på`/`utifrån`, `i slutet av dagen`→`i slutändan`/`när allt kommer omkring`, `adressera ett problem`→`ta itu med`, `spendera tid`→`ägna tid`.

## AI-mönster (över gräns)
Rapporten anger `mönster=antal/tak` (t.ex. `inte-utan=4/2`). Behåll de starkaste förekomsterna upp till taket, skriv om resten. Vänd kontrasten, stryk negationen, dela i två meningar, eller säg det rakt.

## Tankstreck
Stycken med fler än 2 tankstreck (—). Byt minst ett mot komma, kolon, bisats eller ny mening. Strecket ska överraska, inte bedöva.

## Talspråk
Vardagliga ord i en text med litterär register: `kolla`→`se efter`, `fatta`→`förstå`, `prata`→`tala`, `jobba`→`arbeta`, `typ`→stryk eller `ungefär`, `liksom`→stryk.

## Idiom-tillfällen
Rapporten föreslår `formulering=idiom`. Använd det svenska idiomet om det sitter naturligt; tvinga aldrig in det om meningen blir krystad.

## Upprepningar
Ord som upprepas tätt (inom få ord). En del är ofarligt brus — åtgärda bara genuint klumpiga upprepningar genom synonym eller omformulering. Skada inte prosan för att jaga siffran.

## Fotnoter
Föräldralösa referenser (`[^N]` utan definition), föräldralösa definitioner (definition utan referens) eller hopp i numreringen. Rätta så att varje markör har en definition och numreringen är sammanhängande. Rör INTE fotnoternas innehåll/källor.

## Kursivering (arabiska)
Arabiska facktermer som ibland är kursiva, ibland inte. Välj en form per term (kursiv vid första förekomst är husstil) och gör den konsekvent.

## Attributionsverb
Samma verb (`fastslog`, `sammanfattade`, `fångade`) introducerar fler än 2 tänkare. Variera den tredje+: `skrev`, `menade`, `hävdade`, `invände`, `påpekade`, `noterade` — eller kolon efter namnet.

</categories>

<sacred_boundaries>
**ALDRIG rör:**
- Blockquotes (rader som börjar med `>`) — källtext
- Inline-citat (text inom `"..."` tillskriven en person)
- Fotnoternas innehåll/källor (bara numrering/koppling får rättas)
- Rubrikordning eller rubrikformuleringar
- Teologiskt innehåll eller argumentationsriktning
- Frontmatter
</sacred_boundaries>

<output_format>
Output a frontmatter block with JSON metadata between --- markers, followed by the complete article text in markdown:

---
{
  "verdict": "clean|corrected",
  "changesCount": 0,
  "changes": [
    {
      "category": "latinism|anglicism|ai-pattern|em-dash|colloquial|idiom|repetition|footnote|italics|attribution",
      "original": "The exact original word or phrase",
      "replacement": "The replacement"
    }
  ],
  "summary": "1-2 sentences: what the report flagged and what you fixed"
}
---

# Article Title

The complete corrected article in markdown...

Set verdict to "clean" when the report flagged nothing actionable (changesCount: 0, article unchanged). Set verdict to "corrected" when changes were made.
</output_format>

<output_instruction>
Your output must be ONLY the frontmatter block and article — nothing else. No preamble before the frontmatter. Do all reasoning in your internal thinking.

Output starts with --- on the first line. The article body starts with the original first line of the article — do NOT add any extra headers. Output the article exactly as given, with only your corrections applied.
</output_instruction>
