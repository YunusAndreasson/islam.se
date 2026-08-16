# /svar/ corrections backlog — orthodoxy & accuracy sweep

Generated **2026-08-16** from a full read of all 64 `data/svar/*.md` (~69 000 ord).

> ## Status: åtgärdad 2026-08-16
> **Allt under P1 och P2 är fixat, liksom C2–C6.** 21 filer redigerade, `updatedAt` satt på
> samtliga, bygget grönt (2 468 sidor), alla nya käll-URL:er verifierade med `curl`.
> **Öppet kvarstår:** `C1` (`vad-ar-kaba.md` är för tunn — en egen rescue-pass, en sida per
> session enligt `BACKLOG.md`).
>
> **En punkt drogs tillbaka: `F6` var falskt larm.** Eurobarometer-länken `detail/448` *är*
> rätt landningssida för Special Eurobarometer 225 — eurobarometer.europa.eu använder egna
> interna id:n som inte följer EB-numret. Ingen ändring behövdes; den jag hann göra är
> återställd. Lärdomen: verifiera en URL innan den döms ut, inte bara numret i den.
>
> Anteckningarna nedan står kvar som de skrevs, som motivering till varje ändring.
Companion to `BACKLOG.md`: that file is *demand-driven* (which pages to write), this one is
*correctness-driven* (which live pages say something wrong). Fixes here are rescue passes —
edit the existing file, no new page, no new ranking to earn.

Two axes, per `CLAUDE.md`:

- **D** = doctrinal — the page drifts off the sunni/salaf position the site commits to.
- **F** = factual — the page states something that is simply not so, or cites a source that
  does not say what the page claims.

Severity: **P1** = the page currently misleads on the thing it exists to answer. **P2** = real
but narrower. **P3** = consistency and hygiene.

**The corpus is in good shape overall.** Hadith numbering is accurate nearly everywhere I spot-
checked, Bernström is quoted faithfully, the Swedish legal material (könsstympningslagen,
hedersbrott, djurskyddslagen, abortlagen) is correct, and the shia/sufi handling in
`sunni-och-shia.md`, `vad-ar-sufism.md` and `de-rattledda-kaliferna.md` now does what the rule
asks — every mention is answered, none left standing. What follows is the exception list.

---

## P1 — fix before anything else

### D1. `vad-ar-hijab.md` — Ibn Bāz is quoted against his own position

The page establishes that the face need not be covered and cites **Ibn Bāz**:

> Enligt shaykh Ibn Bāz är "hela kvinnans kropp *ʿawra*, utom ansiktet"

Two problems, and they compound:

1. **The source is about prayer, not about men.** The cited page
   (`al-ibadah.com/bon/kladseln/bara-tunna-klader-...`) is filed under *bön* and rules on
   ʿawra **i bönen** — where the face is uncovered even when a woman prays alone. The article
   transplants it into the section "Är hijab obligatoriskt i islam?", which is about covering
   before non-mahram men. Different question, different ruling.
2. **Ibn Bāz held the opposite on the actual question.** On covering before non-mahram men his
   position — and the Permanent Committee's under his chairmanship — is that the face *is*
   ʿawra and must be covered, argued from Qur'an, sunna and ijmāʿ. He wrote a treatise on it.

The page then files that view under "en del lärda, särskilt inom *hanbalī*-traditionen" — so
the site's single most-cited living reference authority is first conscripted for a view he
rejected, then relegated to the minority for the view he actually held.

**Fix:** drop the Ibn Bāz attribution from the ʿawra-before-men claim and source the
face-uncovered position where it genuinely lives (Hanafi/Maliki, and the Shafiʿi position that
the face is not ʿawra in itself). Then state plainly that Ibn Bāz and the Permanent Committee
hold the face obligatory to cover. Keep the prayer citation, but in the prayer context.

### D2. `vad-ar-jihad.md` — jihad presented as defensive-only

> Koranen tillåter strid endast som svar på angrepp och förbjuder muslimer att själva inleda
> fientligheter

and the FAQ: "När är väpnad jihad tillåten? — Som svar på angrepp."

This is the modern apologetic reformulation, not the classical position. All four madhhabs
treat *jihād aṭ-ṭalab* — initiated jihad under a legitimate imam — as *fard kifāya*, and none
of them derives that from an act of aggression. The page states a contested modern reading as
though it were what the classical tradition holds, which is the exact move `CLAUDE.md` flags
under "liberal och modernist thought": it lets a modern frame close the section.

The honest version is already half-written on the page: the *purpose* is never to compel
belief (2:256 is correctly cited), the decision belongs to a legitimate authority and not to
individuals or groups, non-combatants are protected. That answers the reader's real question
without asserting something the four schools do not say.

**Also on this page:** "Endast en enda av de tretton graderna bär vapen" does not match Ibn
al-Qayyim's own enumeration in *Zād al-Maʿād* — jihad against the disbelievers runs *bi'l-qalb,
bi'l-lisān, bi'l-māl, bi'l-yad/badan*, and jihad against oppression is also *bi'l-yad*. The
count is doing rhetorical work the source doesn't support. "Bara en av fyra sorters jihad förs
med vapen" is true and enough.

### D3. `islam-deism-och-sekularism.md` — verdict applied to persons, not acts

> även den som behåller en skapare men förnekar att Han talar och stiftar lag har övergett
> *tawhīd al-ulūhiyya* och fallit i en form av *shirk*

This rules on **individuals**. *Ahl as-sunna* methodology — Ibn Taymiyya most explicitly —
separates the ruling on an act (*takfīr al-muṭlaq*) from the ruling on a named person
(*takfīr al-muʿayyan*), which requires *iqāmat al-ḥujja* and the removal of impediments
(ignorance, misinterpretation, coercion). This is the guardrail against the khārijī error —
and the site's own `tro-och-handling-i-islam.md` names that error and rejects it, while
`vad-sager-islam-om-agnosticism.md` handles the same problem correctly ("den slutliga domen
tillhör Gud allena"). Three pages, three different standards.

**Fix:** keep the ruling on the *doctrine* at full strength — that is the page's job — and add
the classical qualifier about the individual. That is not a softening; it is the position.

**Also:** *hākimiyya* is 20th-century Mawdudi/Qutb vocabulary, not classical *usūl*. On a page
that presents itself as the classical position, importing that term wears a badge — the thing
`CLAUDE.md` says never to do. »Rätten att stifta lag tillhör Gud« carries the meaning without
the freight.

### F1. `tvagning-wudu.md` — the madhhab distribution is backwards

> Att enbart röra vid en kvinna bryter däremot inte tvagningen enligt **majoriteten av de
> klassiska lärda**, däribland Ibn Taymiyya … medan **Shāfiʿī-skolan** menar att beröringen i
> sig räcker

FAQ: "Bryter det tvagningen att röra vid sin fru? — Enligt Ibn Taymiyya och majoriteten av de
klassiska lärda bryts den inte."

Verified against the four schools:

| skola | dom |
|---|---|
| Hanafī | bryts inte |
| Mālikī | bryts vid beröring **med begär** |
| Shāfiʿī | bryts av beröring i sig |
| Hanbalī (mashhūr) | bryts vid beröring **med begär** |

Three of four break wudu under some condition; only Hanafi matches the page. Casting Shafiʿi as
the lone dissenter is wrong, and the FAQ compounds it by dropping the *med begär* qualifier
entirely — a reader following this page would believe Maliki and Hanbali agree that touching
one's wife with desire leaves wudu intact. They do not.

**Fix:** "Beröring **utan begär** bryter inte tvagningen enligt hanafī, mālikī och hanbalī;
shāfiʿī håller att beröringen i sig räcker. Ibn Taymiyya läser *lāmastum* i 5:6 som samlag."
That is both accurate and still gives the reader the practical answer.

### F2. `vad-sager-islam-om-abort.md` — the 120-day conversion drops two weeks

> gränsen vid 120 dagar infaller kring **graviditetsvecka 17** – nästan exakt där den svenska
> abortlagens fria gräns vid vecka 18 går

120 ÷ 7 = 17.1 — but those are weeks **from conception**, and Swedish *graviditetsvecka* is
counted from senaste mens (LMP), roughly 14 days earlier. The site's own
`koranen-och-embryologi.md` says "omkring 120 dagar **efter befruktningen**", so the offset is
required: 120 + 14 = 134 dagar ≈ **graviditetsvecka 19**.

That inverts the paragraph's point. Ensoulment falls *after* the free-abortion limit, not at
it — the Swedish limit sits about two weeks **before** the line islam draws, not "nästan
exakt" on it. The comparison is still worth making, and arguably lands harder when stated
correctly, but the arithmetic as printed is wrong.

---

## P2 — real, narrower

### D4. `islams-fem-pelare.md` — the abandoned prayer is glossed over

> Om någon av de fyra sviktar hos en troende, av svaghet eller lättja, står huset ändå kvar.

For zakat, fasta and hajj this is the ahl as-sunna position against the khawārij. For **salāh**
it is the contested case: Ibn Bāz, al-ʿUthaymīn and the Hanbali position hold that deliberate
abandonment of prayer is *kufr* that takes one out of Islam — i.e. exactly the reference
tradition the site otherwise follows. The page states the murji'-leaning simplification without
a word about the dispute, on the page whose whole job is the pillars.

**Fix:** one clause. "…med undantag för bönen, där de lärda är oense om huruvida den som
medvetet överger den lämnar islam."

### D5. `islams-syn-pa-kvinnan.md` — two soft-focus formulations

- "Hustrun **förväntas samarbeta** i det som är rätt" — the classical position affirms *ṭāʿa*,
  obedience within what is lawful. "Samarbeta" is a euphemism that avoids naming the ruling.
  The page's own limits (never in sin, never overriding her rights, ansvaret ömsesidigt) are
  correct and can be stated *around* the actual word.
- FAQ: täckande klädsel "**får inte framtvingas**" — a modern apologetic framing, not a
  classical ruling; a guardian is in fact obliged to instruct. What the classical tradition
  says is that faith is not coerced, which is a different claim.
- 4:34 is quoted only for the *qiwāma* clause. Not an error — but a reader who has met the
  verse elsewhere will notice the page stops mid-verse, and unanswered omission reads as evasion.

### D6. `koranen-och-embryologi.md` — the Galen objection is left standing

The page raises the strongest objection (stage-wise embryology already existed in Galen) and
then declines to answer it: "Den klassiska hållningen behöver inte ta strid om den frågan."
Per `CLAUDE.md`, an objection stated and not answered is a concession. The rebuttal exists and
is concrete — Galen's sequence, terminology and content differ materially from *nutfa /ʿalaqa/
mudgha* — and the page can give it in two sentences while keeping its (good, correct) point
that the verses are *āyāt* and not a textbook.

### D7. `vad-ar-en-moske.md` — a "varav"-breakdown the rule says to drop

> Drygt två tredjedelar av Sveriges muslimer räknas som sunnimuslimer.

This is precisely the pattern `CLAUDE.md` names: a proportional breakdown that does no work for
the paragraph (which is counting mosque buildings) and exists only to invite the reader to ask
what the other third is. Cut the sentence; nothing on the page depends on it.

### D8. `manlig-omskarelse-i-islam.md` — term slip

> den är ett synligt tecken på att höra till *ahl as-sunna*, **muslimernas gemenskap**

*Ahl as-sunna* is glossed as a synonym for "the Muslim community". It is not — it is a specific
theological designation, and circumcision is not a marker of it. Write »muslimernas gemenskap«
and drop the Arabic here.

### D9. `islams-gudssyn.md` — the FAQ answers with a bare "Ja"

> Är Allah samma Gud som i kristendomen och judendomen? — **Ja.**

The body handles this well ("skillnaden ligger inte i *vem* Gud är, utan i *hur* Gud beskrivs",
followed by an unambiguous rejection of sonship and trinity), and the substance is defensible:
same referent, corrupted description. But the FAQ block is what gets lifted into search
snippets and voice answers, stripped of the paragraph that qualifies it. A bare "Ja" is not
what the classical tradition says on its own. Carry one clause of the qualification up into the
answer.

### F3. `vad-ar-en-moske.md` — the numbers contradict the cited source

> ett tiotal egentliga, ändamålsbyggda moskéer … antalet enklare bönelokaler … rör sig kring
> **300** (Wikipedia: Islam i Sverige)

The cited article says **sju** purpose-built mosques and **~120 källarmoskéer (2005)**. Neither
figure the page prints is in the source it credits. The 300 figure circulates elsewhere and may
well be defensible — but it needs its own citation, and "ett tiotal" needs to become "sju" or
find a newer source.

### F4. `vad-ar-halalslakt.md` — the contested claim is the uncited one

> De flesta samtida lärda godtar reversibel bedövning

This is the page's most consequential sentence for a Swedish reader and the only major claim on
it without a source. It is also the point where the site's principal reference (islamqa / the
Saudi Permanent Committee) is markedly more restrictive than "de flesta … godtar" implies.
Either cite it (JAKIM, European halal bodies, al-Azhar all take this line) or soften to "många
samtida lärda" and name whose ruling is being reported.

### F5. `islams-symboler.md` — Grokipedia as a source

```yaml
- name: "Grokipedia – Green in Islam"
  url: "https://grokipedia.com/page/Green_in_Islam"
```

Grokipedia is an AI-generated encyclopedia with documented accuracy problems and no editorial
review. It is the **only** citation of its kind in the corpus — this is a site that otherwise
cites Bukhārī, Muslim, islamqa, Pew, WHO, Jordbruksverket and a peer-reviewed BSOAS paper. It
undercuts the sourcing standard everywhere else. The claim it supports (green's association
with paradise, the weak chain behind the favourite-colour story) is fine and can be sourced to
18:31 plus any standard hadith-grading reference.

**Also on this page:** the crescent's arrival via Constantinople 1453 is stated as settled
("Symbolens väg in i den muslimska världen går genom en erövrad stad"). Historians dispute it —
crescent standards appear in Turkic and early Ottoman use before 1453. The page's actual point
(no basis in Qur'an or sunna; not a religious symbol) survives intact if the origin story is
hedged.

### F6. `vad-sager-islam-om-ateism.md` — citation points at the wrong survey

Source is labelled "Special Eurobarometer 225 – Social values, Science and Technology (2005)"
but the URL is `europa.eu/eurobarometer/surveys/detail/448` — a different survey. The 23 % /
53 % figures **are** correct for EB 225; only the link is wrong.

### F7. `sunni-och-shia.md` — two billion attached to the wrong noun

> utgör sunnimuslimerna omkring 87–90 procent av världens muslimer – i dag omkring **två
> miljarder människor**

Reads as *Sunnis* = 2 billion. Pew's ~2 billion is **all** Muslims (25.6 % of world population,
2020) — which is how `islams-gudssyn.md`, `vad-ar-ramadan.md`, `vem-var-profeten-muhammed.md`
and `trosbekannelsen-shahada.md` all use it. Sunnis are ≈ 1,75 miljarder. Recast so the two
billion stays attached to the total.

### F8. `vad-ar-hajj.md` — "de flesta lärda" on umra is 2-vs-2

> Till skillnad från pelaren hajj är umra enligt **de flesta lärda** en starkt rekommenderad
> handling snarare än en absolut plikt

Shāfiʿī and Hanbalī hold umra *wājib*; Hanafī and Mālikī hold it *sunna*. That is an even
split, not a majority. "Rättsskolorna är oense" is the accurate phrasing.

*(Checked and correct: the hajj date estimates. 8–13 dhū-l-hijja 1447 ≈ 25–30 maj 2026 and 1448
≈ 14–19 maj 2027, consistent with ʿīd al-adhā 1448 on 16 May 2027. No change needed.)*

### F9. `den-islamiska-guldaldern.md` — an ungraded hadith on a site that grades

> "Att söka kunskap är en plikt för varje muslim" (Sunan Ibn Mājah 224)

Quoted flat. This chain is graded weak by a substantial number of hadith scholars. The corpus
is otherwise careful and admirable about exactly this — it flags the Umm ʿAtiyya chain as
disputed, the "paradiset vid mödrarnas fötter" wording as weak, and the great/lesser-jihad
report as chainless. Same standard should apply here, or the point should lean on 96:1–5 and
39:9, which carry it anyway.

---

## P3 — consistency and hygiene

| # | fil | sak |
|---|---|---|
| C1 | `vad-ar-kaba.md` | 754 ord mot korpusens ~1 000; **1** `related` mot normalt 3; inga `essays`; färre källor. Saknar qiblabytet från Jerusalem (2:144), Qurayshs ombyggnad, *kiswan*. Tunnaste sidan på ett förstahandsämne — och kluster 8 i `BACKLOG.md` pekar redan hit. |
| C2 | `vad-ar-en-kadi.md` | 11 av 12 källor saknar `url`, inklusive Koranverser och hadithnummer som är länkade överallt annars. Enda sidan där `sources` bryter husets format. |
| C3 | `forsta-uppenbarelsen.md` | *Laylat al-Qadr* = "Allmaktens Natt"; `vad-ar-ramadan.md` och `vad-ar-koranen.md` säger "Maktens natt". Välj en. |
| C4 | `vad-sager-islam-om-ateism.md` | Samma *fitra*-hadith citeras som **Bukhārī 1358** här och **1385** i `finns-bevis-for-gud.md` och `vad-sager-islam-om-agnosticism.md`. Båda numren finns, men en sida bör inte peka på ett annat än de andra två. |
| C5 | `vad-ar-sufism.md` | Ingressen kallar sufism "islams mystiska, inåtvända strömning" medan FAQ:n säger "Sufism är ingen gren av islam". Ingressen beviljar en tillhörighet resten av sidan drar tillbaka. |
| C6 | `vad-sager-islam-om-vidskepelse.md` | Citerar hadithen att *ruqā* är shirk och säger sedan att *ruqya* är tillåten, utan att förklara att hadithens *ruqā* avser besvärjelser med shirk-innehåll. Läses som en självmotsägelse. En bisats löser det. |
| C7 | korpusen | 52 av 64 filer saknar `updatedAt`. Om fälten i C-listan rörs, sätt det. |

---

## Suggested order

1. **D1** (`vad-ar-hijab`) — a named authority is quoted against himself; worst single defect.
2. **F1** (`tvagning-wudu`) and **F2** (`vad-sager-islam-om-abort`) — flatly wrong, both cheap.
3. **D2** (`vad-ar-jihad`) and **D3** (`islam-deism-och-sekularism`) — the two doctrinal drifts,
   in opposite directions; they want thinking, not just editing.
4. **F5** (Grokipedia) — one line, removes the corpus's only unsound source.
5. Sweep the rest of P2, then P3 opportunistically when a page is open for other reasons.
