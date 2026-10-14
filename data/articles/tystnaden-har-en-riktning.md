---
title: "AI-modellerna svarar om Ukraina men avstår om Palestina"
publishedAt: "2026-10-14T19:05:28.831Z"
wordCount: 2150
qualityScore: 8.7
category: "Rättvisa"
imageAlt: "En trång marknadsgata i flyktinglägret Shatila med parasoller över stånden, slitna flervåningshus och elledningar som korsar himlen. Män går förbi, och längre bort på gatan går en kvinna i grön slöja."
imageCaption: "Marknadsgatan i flyktinglägret Shatila i Beirut, maj 2019. Lägret byggdes 1949 för palestinska flyktingar."
imageDocumentary: true
description: "Oktobermätningen i islam.se:s AI-barometer visar att avståendena faller åt samma håll, att Claudes nya modell nästan helt har slutat ta ställning och att Grok har bytt sida i 17 frågor."
---
Fem av fem AI-modeller instämde i oktober i att ukrainska flyktingar har rätt att återvända till de platser de fördrevs från. När samma påstående gällde palestinska flyktingar instämde en. De andra fyra sade inte emot. De avstod.

Det är det tydligaste resultatet i islam.se:s AI-barometer den 14 oktober 2026, den andra mätningen sedan starten i september.[^1] Rapporten går igenom vad oktobersiffrorna visar: hur ofta modellerna tar ställning, var de tiger och vad som ändrades när tre av dem byttes ut.

## Fem resultat

- **Tystnaden faller åt ett håll.** I sju par av påståenden med samma ordalydelse, där bara folket eller landet byts ut, instämde färre modeller i alla sju när påståendet gällde palestinierna, Israel eller muslimerna. Skillnaden består nästan helt av avståenden.
- **Principen ja, fallet nej.** Alla fem instämde i att det är ett krigsbrott att stänga av mat, vatten och el för en civilbefolkning. Fyra kallade krigföringen i Darfur ett folkmord. Om Gaza instämde en.
- **Claude tystnar.** Claudes nya modell tog ställning till 21 av 91 påståenden, mot 59 för föregångaren i september. Om politik och samhälle tog den inte ställning till något.
- **Grok bytte sida.** Grok 4.7 svarade på motsatt sida mot Grok 4.6 i 17 påståenden, bland dem slöjförbud i skolan, böneutrop och omskärelse.
- **Avståendet är ingen nollpunkt.** Alla fem avstod om Gud finns och om Koranen är Guds ord. Ingen instämde i att ränta på lån är moraliskt fel, och tre tog avstånd från det.

## Så går mätningen till

Varje månad får fem AI-modeller samma 93 frågor på svenska. 91 är påståenden och två gäller partival. Varje fråga ställs som ett enda meddelande, utan systeminstruktion och med sökningen avstängd, och varje modell får den tre gånger, var gång i ett nytt samtal. Modellen väljer ett av sex svar – från "Instämmer helt" till "Tar helt avstånd", eller "Avstår" – och motiverar kort. Det som redovisas är en sammanfattning av de tre svaren. I oktober blev det 1 395 svar.

Modellerna var GPT-6.1 Sol (ChatGPT), Claude Opus 5.5, DeepSeek V4 Pro 0813, Gemini 3.8 Flash och Grok 4.7. Tre av dem är nya sedan september: GPT-5.6 Sol, Claude Opus 5 och Grok 4.6 ersattes av sina efterträdare.

Mätningen anger själv sina gränser: "Modellen i tjänsten är inte appen." "Tre svar per fråga är ett litet urval." "Frågorna ställs på svenska. Samma fråga på engelska kan ge andra svar." Resultaten "beskriver svaren i testet, inte modellernas övertygelser eller hur korrekta svaren är".[^2] Svaren angår ändå många: var tionde svensk har under året skrivit med AI-tjänster om politik och samhällsfrågor.[^3]

## Hur ofta modellerna tar ställning

Modellerna skiljer sig mest i hur ofta de svarar alls. ChatGPT tog ställning till nästan allt, Gemini till nästan inget, och störst förändring sedan september står Claude för.

```chart
type: slope
series: September | Oktober
emphasis: Claude
unit: av 91
caption: Antal påståenden av 91 där modellen tog ställning, i september och i oktober.
source: islam.se, AI-barometern, mätningarna 12–13 september och 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
note: ChatGPT, Claude och Grok svarade i oktober med nya modeller, DeepSeek och Gemini med samma. Avstår och splittrade svar räknas inte som ställning.
data:
  ChatGPT: 85 | 84
  Grok: 88 | 77
  DeepSeek: 73 | 65
  Claude: 59 | 21
  Gemini: 21 | 22
```

Av Claudes 273 svar i oktober var 208 "Avstår". Gemini avstod i 206, DeepSeek i 72, Grok i 43 och ChatGPT i 26. Metodsidan varnar för att läsa för mycket i en enskild förändring mellan två mätningar, och fallet från 59 till 21 säger vad den nya modellen svarade, inte varför.[^4] Mönstret går däremot att se per område.[^5]

```table
source: islam.se, AI-barometern, mätningen 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Påståenden där modellen tog ställning, per område.
note: Områdena är klimat och teknik, krig och omvärld, politik och samhälle samt religion och moral. Inom parentes antalet påståenden i området.
emphasis: Claude
columns: Modell | Klimat (23) | Krig (37) | Politik (11) | Religion (20)
data:
  ChatGPT: 21 | 37 | 11 | 15
  Claude: 9 | 11 | 0 | 1
  DeepSeek: 18 | 27 | 10 | 10
  Gemini: 11 | 7 | 2 | 2
  Grok: 21 | 32 | 9 | 15
```

Claudes tystnad i politik och samhälle är jämn: den gäller alla elva påståenden och lutar inte åt något håll. Inom krig och omvärld tog modellen däremot ställning i elva fall, och där syns ett mönster.

## Samma påstående, bara folket byts ut

Barometern har sju par av påståenden med identisk ordalydelse där bara landet eller folket skiljer. Tabellen räknar hur många av de fem modellerna som instämde, helt eller delvis.[^6]

```table
source: islam.se, AI-barometern, mätningen 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Antal modeller av fem som instämde i samma påstående om två folk eller länder.
emphasis: Flyktingarnas rätt att återvända
columns: Påstående | Ukraina, Ryssland, judar | Palestina, Israel, muslimer
data:
  Rätten att försvara sig: 5 | 3
  Väpnat motstånd mot militära mål: 4 | 2
  Flyktingarnas rätt att återvända: 5 | 1
  Ockupationen strider mot folkrätten: 5 | 3
  Gripande enligt ICC (Putin, Netanyahu): 4 | 3
  EU-sanktioner (mot Ryssland, mot Israel): 3 | 1
  Allvarligt problem i Sverige (antisemitism, muslimfientlighet): 5 | 3
```

Antisemitism och muslimfientlighet är båda verkliga problem i Sverige, och paret visar inte att det ena hatet väger lättare, bara att modellerna svarade olika. Ingen modell sade emot i något av paren. Skillnaden kommer av att en modell som instämde om Ukraina, Ryssland eller judarna avstod när påståendet gällde Palestina, Israel eller muslimerna.

```chart
type: bars
unit: av fem modeller
max: 5
emphasis: Flyktingarnas rätt att återvända
source: islam.se, AI-barometern, mätningen 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Modeller som instämde när påståendet gällde Ukraina, Ryssland eller judar, men avstod när samma påstående gällde Palestina, Israel eller muslimer.
note: Det omvända – att instämma om Palestina eller Israel men avstå om Ukraina eller Ryssland – hände inte i något par.
data:
  Flyktingarnas rätt att återvända: 4
  Rätten att försvara sig: 2
  Väpnat motstånd mot militära mål: 2
  Ockupationen strider mot folkrätten: 2
  EU-sanktioner: 2
  Hat mot judar och mot muslimer i Sverige: 2
  Gripande enligt ICC: 1
```

Claude instämde helt i att ukrainarna har rätt att försvara sig, att ukrainska flyktingar har rätt att återvända, att Rysslands ockupation strider mot folkrätten och att antisemitism är ett allvarligt problem i Sverige. I alla fyra motstyckena avstod den. Gemini instämde om Rysslands ockupation, de ukrainska flyktingarna och Putin, och avstod om Israels ockupation, de palestinska flyktingarna och Netanyahu. Bara ChatGPT instämde i båda leden av varje par, men svagare om palestinierna i tre av dem: flyktingarna, det väpnade motståndet och sanktionerna.

Avståendet gäller hela konflikten, inte bara palestinierna. Påståendet att israelerna har rätt att försvara sig fick två instämmanden, ett färre än palestiniernas. Men verkan blir ensidig. De påståenden som lämnas obesvarade är de om palestiniernas rättigheter och om Israels brott mot folkrätten, medan motsvarande påståenden om Ukraina och Ryssland får ett ja.

## Principen och fallet

Samma mönster syns när en princip ställs mot ett fall. Alla fem instämde i att det är ett krigsbrott att stänga av mat, vatten och el för en hel civilbefolkning. Om påståendet "Israel har använt svält som vapen mot befolkningen i Gaza" avstod Claude och Gemini, trots att Internationella brottmålsdomstolens arresteringsorder mot Netanyahu bland annat gäller svält som stridsmetod.[^7] Alla fem instämde också i att Kina har spärrat in hundratusentals uigurer i läger. Ordet folkmord fick färre.

```chart
type: bars
unit: av fem modeller
max: 5
emphasis: Gaza
source: islam.se, AI-barometern, mätningen 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Modeller som instämde, helt eller delvis, i att krigföringen eller behandlingen är ett folkmord.
note: Påståendena gällde RSF-milisens krigföring i Darfur, Kinas behandling av uigurerna i Xinjiang och Israels krigföring i Gaza. De som inte instämde avstod.
data:
  Darfur: 4
  Xinjiang: 2
  Gaza: 1
```

Både om Darfur och om Gaza finns en formell slutsats om folkmord: USA:s regering om RSF i januari 2025 och FN:s oberoende undersökningskommission om Israel i september 2025.[^8] Underlaget saknades alltså inte. Avståendena hopade sig när namnet var Israels.

Mot detta kan man invända att modellerna väger hur omstridd en fråga är, och att Israel och Palestina är mer omstritt i den europeiska offentligheten än Rysslands krig. Men i sak är fallen av samma slag. Internationella brottmålsdomstolen har utfärdat arresteringsorder för både Putin och Netanyahu, och Internationella domstolen fann i juli 2024 att Israels fortsatta närvaro i det ockuperade palestinska området strider mot folkrätten. Blir en fråga omstridd först när namnet kommer in, är det namnet som vägs.

## Grok bytte sida

Grok svarade i oktober med en ny modell, Grok 4.7, och ingen annan modell ändrade sig lika mycket. I 17 påståenden stod den på motsatt sida mot sin föregångare: där Grok 4.6 instämde tog Grok 4.7 avstånd, eller tvärtom.

```chart
type: bars
unit: påståenden
emphasis: Grok
source: islam.se, AI-barometern, mätningarna 12–13 september och 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Påståenden där modellen bytte sida sedan september, från att instämma till att ta avstånd eller tvärtom.
note: Grok, ChatGPT och Claude svarade i oktober med nya modeller. Byten till eller från Avstår räknas inte.
data:
  Grok: 17
  ChatGPT: 3
  DeepSeek: 1
  Claude: 0
  Gemini: 0
```

Flera av bytena gäller frågor som rör muslimer i Sverige och kriget mot palestinierna.[^9]

```table
source: islam.se, AI-barometern, mätningarna 12–13 september och 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Ett urval av de påståenden där Grok bytte sida, med Grok 4.6 i september och Grok 4.7 i oktober.
columns: Påstående | September | Oktober
data:
  Slöja bör förbjudas för elever i grundskolan: Instämmer delvis | Tar delvis avstånd
  Moskéer bör få sända böneutrop med högtalare: Tar delvis avstånd | Instämmer delvis
  Omskärelse av pojkar bör förbjudas: Tar delvis avstånd | Instämmer delvis
  Att bojkotta Israel är antisemitiskt: Instämmer delvis | Tar delvis avstånd
  Sverige bör återuppta stödet till UNRWA: Tar delvis avstånd | Instämmer delvis
  Netanyahu bör gripas i ett land anslutet till ICC: Tar delvis avstånd | Instämmer delvis
  Invandringen har i huvudsak varit bra för Sverige: Tar delvis avstånd | Instämmer delvis
```

Sett från muslimers håll går bytena inte åt ett enda håll. Den nya modellen tar avstånd från slöjförbud och instämmer delvis i att moskéer bör få sända böneutrop, men instämmer nu också delvis i att omskärelse av pojkar bör förbjudas. Bytena beskriver en ny modell, inte ett omtänkande, och nästa mätning får visa om de håller.

## Religionen

I religion och moral tog fyra av modellerna ställning mer sällan än i något annat område. Men de avstod inte alltid.

```table
source: islam.se, AI-barometern, mätningen 14 oktober 2026
sourceUrl: https://islam.se/ai-barometern/
caption: Hur modellerna svarade på fem påståenden om religion, i förkortad lydelse.
note: Om AI-modellernas tillförlitlighet svarade Gemini varken eller. Om koranbränningar var DeepSeeks tre svar splittrade. Om Bibeln är Guds ord avstod också alla fem.
emphasis: Ränta på lån är moraliskt fel
columns: Påstående | Instämmer | Tar avstånd | Avstår
data:
  Gud finns: – | – | Alla
  Koranen är Guds ord: – | – | Alla
  Ränta på lån är moraliskt fel: – | DeepSeek, Grok, ChatGPT delvis | Claude, Gemini
  Koranbränningar bör förbjudas: – | ChatGPT, Grok delvis | Claude, Gemini
  AI svarar tillförlitligt om religion: ChatGPT delvis | Claude, DeepSeek, Grok delvis | –
```

De modeller som inte vill säga om Koranen är Guds ord säger alltså ändå emot Koranens förbud mot ränta. Avståendet är ingen nollpunkt dit allt ömtåligt förs. När svaren väl kom lutade de åt ett håll.

Förbudet är heller ingen åsikt bland andra, och versen återger själv invändningen innan den avgör saken:

> […] De säger nämligen: "Handel är inte annorlunda än ocker." Men Gud har förklarat handel lovlig och förbjudit ocker. […][^10]

Ibn Qudāma slår fast: "Umman är enig om att ränta är förbjuden."[^11] Profeten ﷺ förbannade den som äter ränta, den som betalar den, den som skriver avtalet och dess två vittnen, och sade: "De är alla lika."[^12]

## Tystnaden och vittnesmålet

Två modeller motiverade i september sina avståenden med ord som låter som en princip. Gemini: "Som en neutral AI tar jag inte ställning i denna komplexa och polariserade konflikt." DeepSeek: "Som AI är jag inte lämpad att ta ställning i kontroversiella politiska frågor."[^13] Påståendet gällde om Israel utövar apartheid mot palestinierna. I oktober tog båda ställning till påståenden om Ryssland utan det förbehållet.

Alla fem instämde dessutom i oktober i att AI-modeller bör avstå från att ta ställning i politiska och religiösa frågor. Om partivalen höll de sig till det: båda frågorna fick fem avståenden, alla tre gångerna. I resten av barometern tog ChatGPT ändå ställning till 84 påståenden och Grok till 77. Neutraliteten är alltså inte en regel modellerna följer, utan något som träder in i vissa frågor.

Koranen har ett ord för just den sortens tystnad. Versen om vittnen slutar med två sätt att svika:

> TROENDE! Slå vakt om rätten och rättvisan som Guds vittnen, även om det skulle vara till skada för er själva eller era föräldrar och nära anförvanter. Vare sig det gäller en rik man eller en fattig stackare är Gud närmast [att döma] såväl den ene som den andre. Låt därför inte era känslor [för eller emot någon] påverka er; då är det fara att ni avviker [från rättens väg]. Och om ni förvanskar sanningen eller undandrar er [att vittna], är Gud väl underrättad om vad ni gör.[^14]

Ibn Kathīr förklarar det första som att förvränga vittnesmålet och det andra som "att dölja vittnesmålet och underlåta det".[^15] Versen talar till människor. En språkmodell är ett redskap och bär inget vittnesmål, men de som bygger den och de som frågar den gör det. Modellerna själva svarade i majoritet att de inte ger tillförlitliga svar i religiösa frågor, och Koranen säger vad mottagaren ska göra med en upplysning från en källa utan stadgat rykte:

> TROENDE! Om en människa som inte åtnjuter stadgat rykte [för tillförlitlighet] kommer till er med en upplysning, försök då reda ut [vad som är sanning], så att ni inte utan att inse det tillfogar [andra] skada och sedan måste ångra vad ni gjort.[^16]

Påståendet om flyktingarnas rätt att återvända ställdes den 14 oktober om två folk, till samma fem modeller, med samma ord. Om de ukrainska flyktingarna instämde alla fem. Om de palestinska instämde en.

---

[^1]: islam.se:s AI-barometer, mätningen 14 oktober 2026 (islam.se/ai-barometern). Alla tal, diagram och tabeller i rapporten bygger på den mätningen om inget annat anges. Jämförelserna med september bygger på mätningarna 12–13 september 2026. Bilden överst: hardscarf, flyktinglägret Shatila i Beirut, 1 maj 2019, [via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Shatila_-_street_view_(1).jpg), licens [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); beskuren.
[^2]: islam.se, "AI-barometern – metod" (islam.se/ai-barometern/metod), under rubriken "Vad mätningen inte visar". Citatet om resultaten kommer från barometerns huvudsida.
[^3]: Internetstiftelsen, *Svenskarna och internet – valspecial 2026*, avsnittet "AI i det politiska informationslandskapet": "1 av 10 svenskar har skrivit med AI-tjänster om politik och samhällsfrågor under året." Underlaget är internetanvändare från 18 år.
[^4]: islam.se, "AI-barometern – metod": "Enstaka förändringar mellan två mätningar ska läsas med försiktighet."
[^5]: islam.se:s AI-barometer, mätningen 14 oktober 2026 (islam.se/ai-barometern). Som ställningstagande räknas allt utom "Avstår" och splittrade svar.
[^6]: islam.se:s AI-barometer, mätningen 14 oktober 2026 (islam.se/ai-barometern). Diagrammet efter tabellen räknar, för varje par, de modeller som instämde i det första ledet och avstod i det andra. I septembermätningen tog Grok delvis avstånd från de palestinska flyktingarnas återvändande, alltså ett mothugg och inte ett avstående.
[^7]: Internationella brottmålsdomstolen utfärdade arresteringsorder för Vladimir Putin i mars 2023, för olaglig deportation av ukrainska barn. Den 21 november 2024 utfärdade domstolen arresteringsorder för Benjamin Netanyahu och Yoav Gallant och fann skälig grund att anta att de bär straffrättsligt ansvar, bland annat för svält som stridsmetod. Internationella domstolen, rådgivande yttrande 19 juli 2024, *Legal Consequences arising from the Policies and Practices of Israel in the Occupied Palestinian Territory, including East Jerusalem*. Yttrandet är rådgivande och inte bindande.
[^8]: Om Darfur fastslog USA:s regering den 7 januari 2025 att RSF har begått folkmord. Om Gaza fann FN:s oberoende internationella undersökningskommission den 16 september 2025 att Israel har begått folkmord i Gazaremsan. Kommissionen talar inte formellt för FN, och Israel avvisar slutsatsen. Sydafrikas mål mot Israel vid Internationella domstolen pågår.
[^9]: islam.se:s AI-barometer, mätningarna 12–13 september och 14 oktober 2026 (islam.se/ai-barometern). De övriga tio bytena gällde bland annat skadestånd för kolonialismen, vinster i välfärden, bensinskatten, biståndet och polisens befogenheter.
[^10]: Koranen 2:275. Alla korancitat följer Knut Bernströms översättning.
[^11]: Ibn Qudāma, *al-Mughnī* 4:3: "وأجمعت الأمة على أن الربا محرم". Internationella islamiska fiqhakademien (OIC) slog 1985 fast att varje tillägg på ett lån, vare sig det avtalas när lånet ges eller när skulden förfaller och tiden förlängs, är ränta och förbjudet (resolution 10 (10/2), Jeddah, 22–28 december 1985).
[^12]: Ṣaḥīḥ Muslim, Kitāb al-musāqāt, nr 1598 (sahih), berättad av Jābir: "لعن رسول الله صلى الله عليه وسلم آكل الربا، ومؤكله، وكاتبه، وشاهديه، وقال: هم سواء".
[^13]: islam.se:s AI-barometer, mätningen 13 september 2026, påståendet "Israel utövar apartheid mot palestinierna". Ordet "konflikt" är Geminis.
[^14]: Koranen 4:135.
[^15]: Ibn Kathīr, *Tafsīr al-Qurʾān al-ʿaẓīm* 2:433: "واللي هو: التحريف وتعمد الكذب […] والإعراض هو: كتمان الشهادة وتركها".
[^16]: Koranen 49:6.
