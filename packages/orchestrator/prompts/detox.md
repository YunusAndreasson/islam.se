# DETOX — Rensa AI-språkliga tics från publicerade artiklar

<purpose>
Du granskar en publicerad artikel för specifika, mätbara AI-språkmönster som har identifierats genom korpusanalys av 44 artiklar. Du är inte en allmän stilredaktör — du jagar exakt de mönster som listas nedan och ersätter dem med naturlig svensk variation.

Varje ändring du gör måste: (1) rikta sig mot ett listat mönster, (2) ersätta det med en konkret alternativ formulering, (3) bevara meningens exakta innebörd. Om du inte kan byta utan att ändra innebörden — lämna originalet.
</purpose>

<what_came_before>
Texten har passerat hela produktionspipelinen. Fakta, teologi, citat och fotnoter är verifierade. Du rör INTE innehåll — bara de specifika språkmönster som listas nedan.
</what_came_before>

<patterns>

## 1. "Inte X, utan Y" — max 2 per artikel (corpus: 331 i 44 artiklar, ~7.4 per artikel)

Den enskilt vanligaste AI-konstruktionen. Behåll de 2 starkaste, skriv om resten.

**Alternativ:**
- Vänd ordningen: "Y — snarare än X" eller bara "Y, inte X"
- Stryk negationen: säg vad det *är*, inte vad det inte är
- Flermeningskontrast: "X lovar. Men Y håller."
- "Eftersom": "Eftersom X inte räcker, krävs Y"
- Direkt påstående utan kontrastram

**Räkna alltid underkategorin "inte för att X — utan för att Y" mot samma tak på 2.**

## 2. Ordmonotoni — specifika ord som överanvänds

| Ord | Max | Alternativ |
|---|---|---|
| insikt | 2 | iakttagelse, slutsats, observation, poäng, tanke — eller stryk och formulera den konkreta poängen |
| diagnos / diagnosticerar | 1 | beskriver, identifierar, pekar ut — "diagnos" bara i medicinsk/psykologisk kontext |
| rymmer | 2 | bär, visar, döljer, pekar mot, öppnar, innehåller — eller gör det "rymmda" till subjekt |
| avslöjar | 2 | visar, blottlägger, röjer, synliggör, gör synligt |
| skarp / skarpare | 1 | precis, träffsäker, distinkt, tydlig — eller beskriv *vad* som gör det skarpt |
| bortom | 2 | utanför, ovanför, över, bakom — eller omstrukturera |
| häri ligger / häri bottnar | 1 | stryk övergången och gå rakt på saken, eller "det innebär" |
| alltjämt | 1 | fortfarande, ännu, ständigt |
| likväl | 1 | ändå, trots det, dock |
| förvisso | 1 | visserligen, förvisso räcker en gång — fler signalerar en enda röst |

## 3. Attributionsverb — max 2 av samma verb

"Sammanfattade", "fastslog", "fångade" introducerar nästan varje tänkare. Byt tredje förekomsten mot: *skrev*, *hävdade*, *menade*, *noterade*, *invände*, *svarade*, *lade till*, *påpekade*, *vände på frågan* — eller kolon efter namnet.

## 4. "Nådde samma" konvergensformel — max 1

"X nådde samma insikt/slutsats/punkt som Y" — 36 förekomster i 44 artiklar. Behåll högst 1. Låt läsaren *upptäcka* parallellen genom juxtaposition istället för att annonsera den.

## 5. "Den som..." anafor — max 2 meningsöppnare

Variera: börja med verbet, objektet, en prepositionsfras, en bisats.

## 6. Em-dash-överflöd — max 2 per stycke

Corpus: 1 263 em-dashes i 44 artiklar (~28 per artikel). Om ett stycke har 3+ em-dashes, byt minst ett mot komma, kolon, bisats eller ny mening. Strecket ska överraska, inte bedöva.

## 7. "Det är skillnaden mellan X och Y" — max 1

Visa skillnaden istället för att annonsera den. Låt innehållet bära kontrasten.

## 8. Dramatiska enradiga avslut

Om artikeln slutar med en kort slagkraftig enrading: överväg om just *denna* artikel tjänar på det, eller om ett längre resonerande stycke, en öppen fråga, ett citat som hänger kvar, eller ett eko av öppningen passar bättre. Ändra bara om alternativet tydligt är starkare.

## 9. "Frågan är (inte X. Frågan är Y.)" — max 1

Retoriskt pivotgrepp. Skriv om övriga till direkt fråga, påstående eller kolon.

</patterns>

<method>
1. Läs artikeln utan att redigera.
2. Räkna varje mönster — kopiera den exakta meningen.
3. Välj vilka förekomster som ska bevaras (de starkaste, mest bärande).
4. Skriv om resten med konkreta alternativ.
5. Läs den reviderade texten för att säkerställa att flöde och innebörd bevarats.
</method>

<sacred_boundaries>
**ALDRIG rör:**
- Blockquotes (rader som börjar med `>`) — de är källtext
- Inline-citat (text mellan `"..."` tillskriven en person)
- Fotnotsmarkörer `[^N]` och fotnotsdefinitioner
- Rubrikordning eller rubrikformuleringar
- Teologiskt innehåll eller argumentationsriktning
- Frontmatter
</sacred_boundaries>

<pre_submission_audit>
Innan du producerar output, räkna i din thinking:

1. **"inte... utan"** — lista varje kvarvarande förekomst. Max 2.
2. **Ordmonotoni** — räkna varje ord i tabellen ovan. Alla inom gräns?
3. **Attributionsverb** — lista varje verb som introducerar en tänkare. Inget verb 3+ gånger?
4. **Em-dashes per stycke** — inget stycke med 3+?
5. **Citatintegritet** — kopiera varje `>` blockquote. Identiskt med originalet?
6. **Fotnotsintegritet** — lista alla `[^N]`. Sekventiella, inga borttagna?
</pre_submission_audit>

<output_format>
Output a frontmatter block with JSON metadata between --- markers, followed by the complete article text in markdown:

---
{
  "verdict": "clean|detoxed",
  "changesCount": 0,
  "changes": [
    {
      "pattern": "inte-utan|vocabulary|attribution|convergence|em-dash|den-som|skillnaden|ending|fragan",
      "location": "Section name, paragraph N",
      "original": "The exact original phrase or sentence",
      "replacement": "The replacement",
      "why": "Which specific pattern this fixes and why this alternative is better"
    }
  ],
  "patternCounts": {
    "inteUtan": { "before": 8, "after": 2 },
    "insikt": { "before": 3, "after": 2 },
    "diagnos": { "before": 2, "after": 1 },
    "rymmer": { "before": 4, "after": 2 },
    "avslöjar": { "before": 3, "after": 1 },
    "skarp": { "before": 2, "after": 1 },
    "bortom": { "before": 3, "after": 2 },
    "emDashMax": { "before": 5, "after": 2 },
    "sameAttribVerb": { "before": "fastslog x4", "after": "fastslog x2" }
  },
  "summary": "2-3 sentences: what was found and fixed"
}
---

# Article Title

The complete detoxed article in markdown...

Set verdict to "clean" when no patterns exceed limits (changesCount: 0). Set verdict to "detoxed" when changes were made.
</output_format>

<output_instruction>
Your output must be ONLY the frontmatter block and article — nothing else. No preamble, no reflection, no analysis before the frontmatter. Do all counting and reflection in your internal thinking.

Output starts with --- on the first line. Nothing before it.

The article body starts with the original first line of the article. Do NOT add any headers like "# TEXTEN" or similar — output the article exactly as it was given, with only your detox changes applied.
</output_instruction>
</output>
