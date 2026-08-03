# Validering av en färdig `/fordjupning/`-sida

Kör den här listan uppifrån och ned när producenten har skrivit klart. Den förutsätter
ingenting om vad du gjorde tidigare i sessionen.

Varje punkt finns därför att den har misslyckats minst en gång. Raderna som börjar med
⚠️ beskriver verkliga defekter som passerade alla automatiska grindar och nådde en
publicerad eller nästan publicerad sida.

**Grundregeln:** sidan är YMYL-innehåll om en omtvistad religiös fråga. Ett trovärdigt
felaktigt påstående är värre än en klumpig mening. Prosan är sällan problemet.

## Innehåll

0. Vad du har att arbeta med — stegutdatafilerna och vad var och en duger till
1. Läs grindrapporten först — vilka siffror som betyder vad, och `STEG SOM ALDRIG KÖRDE`
2. De fem mekaniska kontrollerna — kommandona, före all läsning
3. ⭐ Diffa författarens utkast mot slutfilen — fångar vad ett SENARE steg förstörde
4. Läs `review-N.json` åt båda hållen — påstådda rättelser och otillåtna ändringar
5. ⛔ Korantext får aldrig skrivas om — Bernström ordagrant; kända falsklarmsklasser
6. Arabiska korpuspassager — positivt kontrollfall KRÄVS, annars är kontrollen värdelös
7. Källor — bortom URL-kontrollen; redaktörslappar i noterna
8. Svenska rätts- och sifferuppgifter — processteg, undantag, siffrans räckvidd
9. Korspelarkonsistens och `related`-ägande — den nya sidan stjäl spokes alfabetiskt
10. Bygg och granska den renderade sidan — ankare, noter, spelare, 390 px
11. Mänsklig granskning — obligatorisk
12. Avstämning före leverans — kryssrutorna

---

## 0. Vad du har att arbeta med

| Fil | Var | Vad den är bra för |
|---|---|---|
| `data/fordjupning/<slug>.md` | repo | den levererade sidan |
| `corpus-brief.md` | stegutdata | vad korpusen faktiskt erbjöd |
| `research.json` | stegutdata | `bookPassages` (arabiska id) och `quotes` (svenska id) |
| `factcheck.json` | stegutdata | trovärdighetsbedömningen |
| `draft-raw-1.md` | stegutdata | **författarens text innan senare steg rörde den** |
| `review-1.json`, `review-2.json` | stegutdata | granskarens fynd *och* dess egna ändringar |

Stegutdatakatalogen är den som angavs med `-o`. Utan den kan du inte göra steg 3 och 4,
som är de två mest givande kontrollerna.

---

## 1. Läs grindrapporten först — före ett enda ord prosa

```
── Gates ──
   Credibility: 8.2 / threshold 7.5
   Review:      8.6/10 »publish« after 1 revision(s)
   Korpuscitat: 5 verifierade av 20 i briefen
   Prose issues: 14 → 10
```

| Rad | Bra | Misstänkt |
|---|---|---|
| Credibility | ≥ 7,5 | precis på tröskeln |
| Review | ≥ 8 med »publish« | »publish« med låg poäng — grinden tvingar revision under 8 |
| **Korpuscitat** | **N > 0 verifierade** | **`0 av M` ⇒ id-grinden är OBEVÄPNAD** |
| Prose issues | siffran sjönk | oförändrad ⇒ rättelsepasset gav inget |

⚠️ **Leta aktivt efter `STEG SOM ALDRIG KÖRDE`.** Ground, svensk röst och prosarättelsen
är alla *skip-on-failure*. På ramadan dog två av tre tyst och rapporten såg ren ut.
Saknas rubriken har allt körts — men kontrollera ändå att artefakterna i tabellen ovan
finns, med rimliga storlekar.

⚠️ **`Korpuscitat: 0 av M` betyder att inget svenskt korpuscitat i texten är kontrollerat.**
Grinden var overksam på de fyra första sidorna och gav `0 av 19` på halal. Den fungerar
numera (`5 av 20` på griskött), men läs alltid siffran. Är den noll: hämta de lagliga
id:na med `grep -oP '(?<=citat-id )\d+' corpus-brief.md` och betrakta allt i texten som
inte finns bland dem som påhittat.

---

## 2. De fem mekaniska kontrollerna — innan du läser texten

```bash
python3 scripts/check-source-urls.py   data/fordjupning/<slug>.md   # ⛔ blockerande
python3 scripts/check-quran-quotes.py  data/fordjupning/<slug>.md   # ⛔ blockerande
python3 scripts/check-house-style.py   data/fordjupning/<slug>.md
python3 scripts/check-language-tics.py data/fordjupning/<slug>.md
python3 scripts/check-claim-sourcing.py data/fordjupning/<slug>.md
```

De kostar en sekund och fångar det prompterna bevisligen inte klarar på egen hand.

**`check-source-urls.py`** är avsiktligt modellfri — den hämtar varje URL och läser
statusraden. Rätt åtgärd vid träff är alltid `--fix` (tar bort `url:`, behåller `name:`),
**aldrig** att gissa ett nytt id.

**`check-quran-quotes.py`** kollationerar varje blockcitat mot Bernström.
`ORDAGRANT` och `FÖRKORTAT` är båda godkända; `OMSKRIVET` fäller.

---

## 3. ⭐ Diffa författarens utkast mot den levererade filen

Den enskilt mest givande kontrollen, och den som ingen grind gör.

```bash
diff <(grep '^> ' <stegutdata>/draft-raw-1.md) <(grep '^> ' data/fordjupning/<slug>.md)
```

Tomt utfall = blockcitaten är orörda. Allt annat är högsignal. Vidga sedan till hela
diffen och fråga om varje ändring ett senare steg gjort: fick det göra den?

⚠️ **Detta hände på griskött.** Författaren skrev Bernströms 2:173 rätt. *Granskningssteget*
skrev om den — med hänvisning till husregeln om gemena gudspronomen, och med påståendet
att den nya lydelsen låg »närmare Bernström«. Den gjorde inte det. En läsning av bara
slutfilen ser en flytande mening och går vidare.

---

## 4. Läs `review-N.json` åt BÅDA hållen

Sista varvets issue-lista är körningens rikaste defektkälla.

```bash
python3 -c "import json;[print(i+1,x if isinstance(x,str) else json.dumps(x,ensure_ascii=False),'\n') for i,x in enumerate(json.load(open('review-2.json'))['issues'])]"
```

1. **Rättelser som påstås vara gjorda men inte är det.** Granskaren beskriver ändringar
   den bara övervägt, i formuleringar nästan identiska med dem den faktiskt gjort.
   ⚠️ Fram till 2026-08-01 kastades sista varvets ändringar alltid bort; det är lagat
   (`revisedTextChars` ska finnas i JSON:en, även på det godkännande varvet), men
   **läs listan mot filen ändå**.
2. **Ändringar den gjorde som den inte borde ha gjort.** Dessa redovisas öppet och läses
   aldrig. Koranomskrivningen ovan var punkt 7 av 9.
3. **Frontmatterfynd.** Granskaren *kan inte* redigera frontmatter, så problem med
   `sources`, `keywords` och `about` finns bara som prosa i den här listan.

---

## 5. ⛔ Korantext får aldrig skrivas om

Ett blockcitat ur Koranen är Knut Bernströms publicerade översättning, ordagrant.
Hakparenteser, versaler och gudspronomen är översättarens.

**Ingen husregel gäller innanför ett citat** — inte gemena gudspronomen, inte
streckbudgeten, inte meningsrytmen. De reglerna gäller artikelns egen prosa.
Korta vid en meningsgräns är tillåtet; formulera om är det inte.

Sanningskällan är `quran.com/<sura>/<vers>?translations=48`. ⚠️ Sidan är en SPA — hämta
via API:t, inte genom att läsa HTML:en:

```bash
curl -s "https://api.quran.com/api/v4/quran/translations/48?verse_key=2:173" \
 | python3 -c "import sys,json,html,re;t=json.load(sys.stdin)['translations'][0]['text'];print(html.unescape(re.sub(r'<[^>]+>','',t)))"
```

⛔ **Citera aldrig en vers ur `corpus-brief.md`.** `quran.db` är en skanning av
tryckutgåvan: ord är brutna vid originalets radbrytningar (»dött rar«, »kläd nad«) och
Bernströms gloser är inklistrade i verskroppen.

### Kända falsklarmsklasser i `check-quran-quotes.py`

Kontrollen tolererar dessa avsiktligt — de är typografi eller klippgränser, inte ändrad
lydelse. Ser du dem rapporterade är det ett fel i kontrollen, inte i texten:
attributionsraden `— Koranen 21:107`; växling mellan `'…'`, `"…"` och `»…«`;
utelämningstecken först eller sist; utdrag som slutar med punkt där Bernström har
tankstreck; flerversciat där fotnoten bara namnger första versen.

⚠️ **Rör du kontrollens logik: kör `pnpm test:checkers` efteråt** (0,2 s, inget nät).
Den kör nio kända fall — den äkta omskrivningen plus var och en av falsklarmsklasserna
ovan — och bär en metagrind som fäller om normaliseringen börjar returnera tomma
strängar. Utan den ser en trasig kontroll ut precis som en som passerar.

⚠️ **Legacy-läget (2026-08-03, otriagerat):** `data/fordjupning` 0 omskrivna,
`data/svar` 22, `data/articles` **81 av 84**. Essäerna citerar nästan aldrig Bernström —
»Allah« där han har »Gud«, »sänka sin blick och skyla sitt« där han har »de bör sänka
blicken och lägga band på sin sinnlighet«. Mönstret ser ut som en översättning från
engelska. **Rör dem inte** förrän användaren avgjort om essäer måste hålla Bernström
eller får använda en annan översättning om den attribueras.

---

## 6. Arabiska korpuspassager — ingen grind rör dem

`getQuote()` slår bara mot `quotes.db`. `bookPassages`-id:n i `research.json` kontrolleras
av **ingenting**. Gör det själv.

### ⛔ Bevisa först att kontrollen kan misslyckas

⚠️⚠️ **Literala arabiska tecken i ett bash-heredoc kastas om (bidi).** Teckenklassen
`[^ء-ي]` blir trasig, normaliseringen returnerar **tom sträng för allt**, och
`needle in haystack` blir sant för varje citat — 13 av 13 »verifierade« utan att något
jämförts. Det hände två gånger i rad och såg ut som ett grönt resultat.

1. **Skriv skriptet till en FIL** med Write-verktyget, aldrig i ett heredoc.
2. `assert len(norm(<känd passage>)) > 50` innan något jämförs.
3. Kör ett **positivt kontrollfall**: mata in något du vet är fel och bekräfta att det
   fälls. Passerar ett medvetet trasigt indata är kontrollen värdelös.

Färdigt mönster finns i `scripts/check-quran-quotes.py` (kodpunkter, inga literaler).

### Normalisering

`books.db` är OCR: `~~`, sidmarkörer (`PageV09P076`), handskriftsmarkörer (`ms4120`),
saknad hamza mitt i meningar. En naiv delsträngsjämförelse **underkänner allt**.
Strippa diakritiker, slå ihop `أإآ→ا`, `ىی→ي`, `ة→ه`, ta bort all interpunktion och
jämför bara konsonantskelettet. Att skanningens egen stavning (`شىء` med alef maqṣūra)
överlever in i citatet är ett **äkthetsbevis**.

### Två frågor, inte en

Kontrollen bevisar att citatet **finns**, aldrig att **läsningen stämmer**. En äkta,
ordagrann passage kan läsas bakvänt: faktakollen fångade en gång Ibn Kathīr framställd
som motståndare till en position som passagen tvärtom bekräftar.

⚠️ **Attributionsfällan:** `author` är **bokens** författare, inte talaren. En hadith
citerad av Ibn Qudāma hör till hadithsamlingen.

---

## 7. Källor — bortom `check-source-urls.py`

Skriptet bevisar att en URL svarar, inte att den säger det artikeln påstår.
**Öppna varje källa som bär ett bärande påstående** och läs meningen som citerar den.

⛔ **Skriv aldrig en URL du inte öppnat.** Fyra av fem klassiska fiqh-länkar på de tidiga
sidorna var påhittade, och **två svarade 200 på fel bok** — vilket ingen liveness-kontroll
kan fånga. En källa utan länk är korrekt; en påhittad länk är en förfalskning.

⚠️ **Läs fotnoterna som läsartext, inte som apparat.** Allt som lyder »bör anges här«,
»referensen bör kontrolleras« eller »se standardlitteraturen« är en lapp till redaktören
som blivit publicerad. Tre sådana låg i griskött-utkastet. Ingen grind ser dem: det är
varken död länk eller påhittat id, och prosan är oklanderlig.

---

## 8. Svenska rätts- och sifferuppgifter

Sverigeavsnittet är sidans existensberättigande och där de självsäkra felen bor. Öppna
lagtexten, avgörandet, pressmeddelandet, statistiksidan.

⚠️ **Beskriv det processteg som faktiskt inträffat.** »Meddelade att myndigheten avsåg
att stämma« är inte »stämde«, och ett ärende som gjordes upp före stämningsansökan har
aldrig varit i domstol. Båda felen fanns i griskött-utkastet.

⚠️ **Läs undantag i lagtext själv.** En AI-sammanfattning läste djurskyddslagens undantag
som ett undantag för religiös slakt; de gäller fisk och nödavlivning. Hade det gått in i
texten vore sidan osann i sin bärande punkt.

⚠️ **Kontrollera siffrans räckvidd.** Beskriver talet den sak meningen fäster det vid,
eller en vidare population? Kungsbackas »249 elever« gällde samtliga skolformer medan
beslutet bara omfattade gymnasiet.

---

## 9. Korspelarkonsistens och `related`-ägande

**Säger en annan pelare samma sak annorlunda?** Två sidor som citerar en vers i två
lydelser är en defekt oavsett vilken som är rätt.

⚠️⚠️ **En ny pelare stjäl spokes från de gamla.** `svar/[slug].astro` bygger indexet med
`if (!pillarBySvar.has(slug))` över en **alfabetiskt ordnad** kollektion — först i
bokstavsordning vinner. Listar den nya sidan svar som hör till en annan pelare flyttas
de tyst, och bygget går igenom eftersom varje slug finns.

```bash
python3 - <<'PY'
import re,glob,collections
claims=collections.defaultdict(list)
for p in sorted(glob.glob('data/fordjupning/*.md')):
    lines=open(p).read().split('\n')
    i=lines.index('---'); j=lines.index('---',i+1)
    fm='\n'.join(lines[i+1:j])
    m=re.search(r'^related:\n((?:  - .*\n?)+)',fm,re.M)
    if m:
        for s in re.findall(r'"([^"]+)"',m.group(1)): claims[s].append(p.split('/')[-1])
for k,v in sorted(claims.items()):
    if len(v)>1: print(f"{k:40s} vinnare={sorted(v)[0]:16s} {v}")
PY
```

Trimma den nya sidans `related` till det den faktiskt äger. ⚠️ `related` är dubbelt
bokfört — både sidans »Relaterade frågor« och dess anspråk i indexet — så en bred lista
kostar andra sidor deras rätta pelare.

⚠️ Redan trasigt av samma orsak, äldre än griskött: `vad-ar-hijab` → **aktenskap.md**
(inte hijab.md), `vad-sager-islam-om-livet-efter-doden` → abort.md (inte doden.md).

---

## 10. Bygg och granska den renderade sidan

```bash
pnpm --filter @islam-se/web build
```

En hängande `related`/`essays`-slug fäller bygget med flit. Kontrollera sedan:

- alla sju `##` har ankare som går att nå
- fotnoterna hamnar under »Noter«, källorna under »Källor«
- **recitationsspelaren står under korancitaten och namnger suran**
  (`grep -o 'qv-cite label">[^<]*' dist/fordjupning/<slug>/index.html`)
- svarssidan visar »Fördjupning: <Term>« och pekar på **rätt** pelare
- 390 px-vyn håller

⚠️ Spelaren kommer av **fotnoten** (`Koranen, al-Nūr 24:31.`), inte av en
attributionsrad `— Koranen 24:31` under citatet; attributionsvägen ger en spelare utan
suranamn.

⚠️ **Astro cachar renderad markdown per filinnehåll, och `rm node_modules/.astro/data-store.json`
invaliderar det INTE.** Ändrar du ett rehype/remark-plugin behåller varje orörd sida sin
gamla HTML, så en korrekt rättelse ser ut att inte ha gjort något. Verifiera en
pluginändring genom att röra innehållet, eller med ett enhetstest mot pluginet.

---

## 11. Mänsklig granskning — obligatorisk

Ortodoxi och sakinnehåll ska godkännas av användaren innan sidan skickas. Detta är
YMYL-innehåll om en omtvistad fråga; essäer och uppslagssidor ska hålla ortodox
sunnitisk (athari) linje — men **skriv aldrig ordet »athari« i läsartext**, namnge de
lärda i stället.

Redovisa i din rapport, ärligt:
- vad du kontrollerade och **vad du inte kunde kontrollera**
- varje kvarstående osäkerhet, med vad som skulle avgöra den
- allt du rättade för hand efter körningen

---

## 12. Avstämning före leverans

| | |
|---|---|
| ☐ | Grindrapporten läst; inga hoppade steg; `Korpuscitat` > 0 |
| ☐ | Fem mekaniska kontroller rena |
| ☐ | Diff `draft-raw-1.md` → slutfil granskad (särskilt blockcitat) |
| ☐ | Sista `review-N.json` läst åt båda hållen |
| ☐ | Varje korancitat kollationerat mot Bernström |
| ☐ | Varje arabisk passage belagd — **med positivt kontrollfall** |
| ☐ | Varje bärande källa öppnad; inga redaktörslappar i noterna |
| ☐ | Svenska rätts- och sifferuppgifter lästa vid källan |
| ☐ | `related`-ägande kontrollerat; ingen annan pelare bestulen |
| ☐ | Bygget rent; ankare, noter, spelare, svarslänk, 390 px |
| ☐ | Prosakritikern körd; avslutningsformer räknade (högst 2 av 7) |
| ☐ | Lärdomar återförda till `fordjupning-author.md` / `SKILL.md` |
| ☐ | Sidan **inte** commitad eller deployad före mänskligt godkännande |

**En sida per session.** Massproducera aldrig: Googles regler mot skalat innehåll 2026
straffar det, och detta är YMYL-material därtill.
