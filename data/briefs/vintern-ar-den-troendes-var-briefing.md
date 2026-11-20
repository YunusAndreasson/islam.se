# Briefing: vintermörkret, den långa natten och nedstigandet i nattens sista tredjedel

Sammanställd 20 november 2026. Varje arabisk uppgift är kontrollerad mot korpusen
(`data/books.db`) med volym och sida enligt den utgåva OpenITI har digitaliserat.
Korantexten är Bernströms, hämtad ur `data/quran.db`. Översättningarna av arabiskan
nedan är arbetsöversättningar; författaren översätter själv ur originalet.
Statusmarkeringar:

- **BEKRÄFTAD** – belagd i korpusen eller beräknad med webbplatsens egen kod.
- **DELVIS** – belagd i en källa; får användas försiktigt och ska kontrolleras.
- **KONTROLLERA** – inte bekräftad; får inte stå som faktum.
- **ANVÄND INTE** – medvetet utesluten.

---

## 1. Natten i Sverige i siffror

Beräknat med islam.se:s egna bönetider (`apps/web/src/lib/bonetider/prayer-times.ts`,
standardinställningar, samma som `/bonetider/stockholm/`). Fajr räknas med
webbplatsens regel för höga breddgrader; andra kalendrar kan skilja några minuter.
Skriv därför »omkring« och ange att tiderna är islam.se:s. (BEKRÄFTAD.)

| Stockholm | 21 december 2026 | 21 juni 2026 |
| - | - | - |
| Fajr | 06.10 | 02.45 |
| Soluppgång | 08.43 | 03.31 |
| Maghrib (solnedgång) | 14.48 | 22.08 |
| ʿIshāʾ | 17.21 | 22.54 |
| Solen över horisonten | omkring 6 timmar | omkring 18,5 timmar |
| Fastan (fajr till maghrib) | omkring 8,5 timmar | omkring 19,5 timmar |
| Natten (maghrib till fajr) | omkring 15,5 timmar | omkring 4,5 timmar |
| Nattens sista tredjedel börjar | omkring kl. 01 | omkring kl. 01 |

- Poängen i tabellen: i december kan den som lägger sig efter ʿishāʾ sova en hel natt
  och ändå vakna i nattens sista tredjedel, långt före fajr kl. 06.10. I juni är hela
  natten från maghrib till fajr kortare än fem timmar.
- Malmö 21 december: solen uppe omkring 7 timmar, natten omkring 14,5 timmar.
  (BEKRÄFTAD, samma beräkning.)
- **Kiruna:** polarnatten varar omkring 27 dygn (SMHI, redan citerat i essän »Hur ber
  man maghrib när solen aldrig går ned?«). (BEKRÄFTAD i den essäns fotnot.) Kirunas
  beräknade bönetider i december bygger på regeln om närmaste breddgrad, inte på en
  verklig solnedgång. **ANVÄND INTE** som observerade tider; nämn Kiruna högst som
  ytterpunkten, med länk till den tidigare essän.

Uppgifter om vinterdepression, ljusterapi, D-vitamin eller trötthet under mörkertiden:
**KONTROLLERA** – hämta från 1177 eller Folkhälsomyndigheten; inga siffror utan källa.

---

## 2. Ibn Taymiyya om nedstigandet och nattens olika längd

Alla ställen ur *Majmūʿ al-fatāwā*, band 5, avsnittet som brukar kallas *Sharḥ ḥadīth
al-nuzūl*. (BEKRÄFTAD för samtliga, kontrollerade i korpusen.)

### 2.1 Frågan (5:320–321)
Två män tvistade om hadithen om nedstigandet; den ene bekräftade den, den andre
förnekade. Den som bekräftade sade att Herren stiger ned »utan att frågan hur ställs«
(بلا كيف). Den som förnekade sade att det bara är »Hans befallning och Hans barmhärtighet«
som stiger ned, och anförde sedan nattens längd:

> الليل لا يستوي وقته في البلاد فقد يكون الليل في بعض البلاد خمس عشرة ساعة ونهارها
> تسع ساعات ويكون في بعض البلاد ست عشرة ساعة والنهار ثمان ساعات وبالعكس [...] وقد يطول
> الليل في بعض البلاد حتى يستوعب أكثر الأربع وعشرين ساعة ويبقى النهار عندهم وقت يسير؛
> فيلزم على هذا أن يكون ثلث الليل دائما ويكون الرب دائما نازلا إلى السماء.

Arbetsöversättning: »Natten är inte lika lång i alla länder. I vissa länder kan natten
vara femton timmar och dagen nio, i andra sexton timmar och dagen åtta, och tvärtom
[...] och i vissa länder blir natten så lång att den tar upp större delen av dygnets
tjugofyra timmar, och dagen är bara en kort stund. Av detta skulle följa att det alltid
är nattens tredjedel och att Herren alltid stiger ned till himlen.«

**Viktigt:** invändningen kommer från den som FÖRNEKADE, och den användes för att tolka
bort hadithen. Ibn Taymiyya svarar på den; han ställer den inte själv.

### 2.2 Utgångspunkten (5:321–322)
Den som säger det Profeten ﷺ sade »har rätt«; hadithen är spridd i sunnan och
samfundets första generationer och imamer tog emot den. Men:

> لكن من فهم من هذا الحديث وأمثاله ما يجب تنزيه الله عنه كتمثيله بصفات المخلوقين
> ووصفه بالنقص المنافي لكماله الذي يستحقه؛ فقد أخطأ في ذلك

»Men den som av denna hadith och dess like förstår något som Gud måste hållas fri från,
som att likna Honom vid det skapades egenskaper eller tillskriva Honom en brist som
strider mot den fullkomlighet som tillkommer Honom, har tagit miste.« Nedstigandet är
som Hans övriga egenskaper, som *istiwāʾ* över tronen.

### 2.3 Var invändningen brister (5:467–468)

> وبهذا يحصل الجواب عما احتج به من قال: إن ثلث الليل يختلف باختلاف البلاد [...] وهذا
> الذي ذكروه إنما يصح إذا جعل نزوله من جنس نزول أجسام الناس من السطح إلى الأرض

»Därmed är svaret givet på det som anfördes av den som sade att nattens tredjedel
skiljer sig mellan länderna [...] Det de anför håller bara om man gör Hans nedstigande
av samma slag som när människors kroppar stiger ned från taket till marken.«

### 2.4 Sommaren och vintern väger upp varandra (5:474)

> فإنه إذا قيل ليل صيفهم قصير قيل وليل شتائهم طويل فيعادل هذا هذا وما نقص من ليل
> صيفهم زيد في ليل شتائهم ولهذا جاء في الأثر {الشتاء ربيع المؤمن: يصوم نهاره ويقوم ليله}

»Om man säger att deras sommarnatt är kort, så svarar man: och deras vinternatt är lång.
Det ena väger upp det andra, och det som fattas i deras sommarnatt läggs till deras
vinternatt. Därför kommer det i ett *athar*: 'Vintern är den troendes vår: han fastar
dess dag och står i bön om dess natt.'«

Han kallar ordet ett *athar*, inte en hadith med säker kedja (se 4.1).

### 2.5 Ju längre norrut (5:475) – essäns kärnställe

> وأيضا فكما أن ثلث الليل يختلف بطول البلد فهو يختلف بعرضها أيضا. فكلما كان البلد أدخل
> في الشمال؛ كان ليله في الشتاء أطول وفي الصيف أقصر. وما كان قريبا من خط الاستواء يكون
> ليله في الشتاء أقصر من ليل ذاك وليله في الصيف أطول من ليل ذاك؛ فيكون ليلهم ونهارهم
> أقرب إلى التساوي. وحينئذ فالنزول الإلهي لكل قوم هو مقدار ثلث ليلهم فيختلف مقداره
> بمقادير الليل في الشمال والجنوب كما اختلف في المشرق والمغرب.

»Och liksom nattens tredjedel skiljer sig efter landets läge i öster och väster, skiljer
den sig också efter hur långt norrut det ligger. Ju längre in mot norr ett land ligger,
desto längre är dess natt om vintern och desto kortare om sommaren. Det som ligger nära
ekvatorn har en kortare vinternatt och en längre sommarnatt än det, så att deras natt och
dag ligger närmare varandra i längd. Alltså är det gudomliga nedstigandet för varje folk
så långt som tredjedelen av deras natt, och dess längd skiljer sig efter nattens längd i
norr och söder, liksom den skiljer sig i öster och väster.«

### 2.6 Varje folk i sin natt (5:243)

> والليل يختلف فيكون ثلثه بالمشرق قبل أن يكون ثلثه بالمغرب ونزوله الذي أخبر به رسوله
> إلى سماء هؤلاء في ثلث ليلهم وإلى سماء هؤلاء في ثلث ليلهم لا يشغله شأن عن شأن

»Natten skiljer sig: dess tredjedel kommer i öster innan den kommer i väster. Och Hans
nedstigande, som Hans sändebud berättade om, är till dessas himmel i tredjedelen av deras
natt och till dessas himmel i tredjedelen av deras natt; ingen sak tar Honom från en
annan.« På samma sida: de första generationernas ord är att Han stiger ned och att tronen
inte blir tom på Honom.

### 2.7 Nära den som åkallar (5:478)
Nedstigandet, som inte är av samma slag som kropparnas, kan vara i samma stund för många,
och: فيقرب إلى هذا الذي دعاه دون هذا الذي لم يدعه – »Han kommer nära den som åkallade Honom,
inte den som inte åkallade Honom.« (BEKRÄFTAD. Använd sparsamt.)

---

## 3. Hadithen om nedstigandet

- al-Bukhārī, *Ṣaḥīḥ*, Kitāb al-tahajjud, nr 1145; Muslim, *Ṣaḥīḥ*, Kitāb ṣalāt
  al-musāfirīn, nr 758: »Vår Herre, välsignad och upphöjd, stiger varje natt ned till den
  närmaste himlen när den sista tredjedelen av natten återstår, och säger: Vem åkallar
  Mig, så att Jag kan svara honom? Vem ber Mig, så att Jag kan ge honom? Vem ber Mig om
  förlåtelse, så att Jag kan förlåta honom?« (BEKRÄFTAD; redan citerad med denna lydelse
  i essän »Kaffet kom från nattbönen«, fotnot 9. Upprepa inte den essäns utläggning.)
- Ibn Taymiyya (5:469–470): versionen med »den sista tredjedelen« är den som båda
  *Ṣaḥīḥ*-samlingarna har; at-Tirmidhī sade att den är den riktigaste från Abū Hurayra;
  hadithen är *mutawātir* hos de lärda i hadith. (BEKRÄFTAD.)

---

## 4. Vinterorden och deras ställning

### 4.1 »Vintern är den troendes vår«
- Aḥmad, *Musnad*, nr 11716, från Abū Saʿīd al-Khudrī: »الشتاء ربيع المؤمن«. Kedjan går
  genom Ibn Lahīʿa och Darrāj från Abū al-Haytham, som är en svag kedja. (BEKRÄFTAD för
  texten och kedjan i korpusen. Graderingen »svag kedja« ska faktagranskningen bekräfta;
  KONTROLLERA senare lärdas graderingar innan någon av dem nämns vid namn.)
- Ibn Taymiyya anför ordet som ett *athar* (5:474), med tillägget »han fastar dess dag och
  står i bön om dess natt«.
- **Skriv aldrig** »Profeten ﷺ sade: Vintern är den troendes vår« utan att säga att
  kedjan är svag. Säkert att skriva: »ett ord som de lärda förde vidare, och som Ibn
  Taymiyya anför«.

### 4.2 »Det kalla bytet«
- at-Tirmidhī, *Sunan*, nr 797 (3:152–153), kapitlet »Om att fasta om vintern«:
  »الغنيمة الباردة الصوم في الشتاء« – »Det kalla bytet är fastan om vintern.« at-Tirmidhī
  skriver själv: »Denna hadith är *mursal*; ʿĀmir ibn Masʿūd mötte inte Profeten ﷺ.«
  Samma ord finns i Aḥmads *Musnad*, nr 18959. (BEKRÄFTAD.)
- Ordets innebörd hos förklararna, ett byte som vinns utan strid och utan hetta:
  **KONTROLLERA** – ange vem som förklarar det så, annars förklara inte bilden utöver
  det självklara (vinterfastan är kort och sval).

### 4.3 Ibn Masʿūd och ʿUmar om vintern
»مرحبا بالشتاء« (Ibn Masʿūd) och »الشتاء غنيمة العابدين« (ʿUmar) citeras ofta, bland annat
via Ibn Rajabs *Laṭāʾif al-maʿārif*. Ingen av dem finns i korpusen (sökt 20 november
2026). **KONTROLLERA** – citera bara om forskningen hittar en primärkälla med sida;
annars **ANVÄND INTE**.

---

## 5. Koranen (Bernström, ordagrant)

- **25:62** – »Och det är Han som låter natten och dagen följa på varandra - [ett tecken]
  för den som vill begrunda [skapelsens under] eller tacka [Gud].«
- **25:64** – »Och under natten vakar de i bön - ömsom faller de ned inför sin Herre,
  ömsom står de upp.«
- **73:6** – »Den nattliga [bönen] går med stadigare steg och dess ord ljuder renare,«
- **73:4** – »eller förläng den - och läs högt ur Koranen i en lugn och jämn rytm, med
  klart uttal och tanken fäst vid dess mening.« (73:1–3 hämtas ur korpusen.)
- **32:16** – »de som avstår från sömn för att med fruktan och hopp åkalla sin Herre och
  som ger åt andra av det som Vi har skänkt dem för deras försörjning.«
- **28:71** – »Säg: "Vad tror ni? Om Gud lät natten råda över er utan avbrott till
  Uppståndelsens dag, vem är den gud - utom Gud - som kan skänka er ljus? [Varför]
  lyssnar ni inte [och försöker förstå]?"«
- **28:72** – »Säg: "Vad tror ni? Om Gud lät dagen råda över er utan avbrott till
  Uppståndelsens dag, vem är den gud - utom Gud - som kan ge er mörker, så att ni får
  vila? [Varför försöker] ni inte se klart?"«
- **25:47** – »Och det är Han som gör natten till en klädnad för er och gör sömnen till
  vila och gör [var] dag till en uppståndelse.«
- **76:26** – »och fall ned i tillbedjan inför Honom också under natten, och prisa och
  lova Honom utan avbrott en hel natt.«

Ibn Kathīr, *al-Bidāya wa-l-nihāya* 1:34, om 25:62 och 31:29 (Han låter natten gå in i
dagen och dagen i natten): natten och dagen tar av varandras längd tills de blir lika,
vid vårens början och höstens, »och så vidare«. (BEKRÄFTAD.)

---

## 6. Sova först, stå upp sist

- I al-Bukhārīs *Ṣaḥīḥ* följer kapitlet »Den som sov första delen av natten och vakade
  under den sista« direkt efter hadithen om nedstigandet, med Salmān al-Fārisīs ord till
  Abū al-Dardāʾ: »Sov«, och mot nattens slut: »Stå upp«. Hela berättelsen, med »din Herre
  har en rätt över dig, och din själ har en rätt över dig«, står i al-Bukhārī nr 1968.
  (BEKRÄFTAD för kapitlet: essän »Kaffet kom från nattbönen« redovisar det. KONTROLLERA
  nr 1968 mot korpusen innan numret skrivs.) Återberätta inte; en mening och en länk.

---

## 7. Sjukdom är sjukdom

al-Nawawī, *al-Majmūʿ sharḥ al-Muhadhdhab* 5:96–97, samlar hadither om läkemedel
(BEKRÄFTAD):
- al-Bukhārī, från Abū Hurayra: »Gud har inte sänt ned någon sjukdom utan att sända ned
  en bot för den.«
- Muslim, från Jābir: »För varje sjukdom finns ett botemedel; när botemedlet träffar
  sjukdomen blir den sjuke frisk med Guds tillåtelse.«
- Usāma ibn Sharīk: beduinerna frågade »Ska vi söka bot?« och han ﷺ sade: »Ja, sök bot,
  för Gud har inte lagt ned någon sjukdom utan att lägga ned en bot för den, utom en:
  ålderdomen.« Hos Abū Dāwūd, at-Tirmidhī, an-Nasāʾī och Ibn Māja; at-Tirmidhī: *ḥasan
  ṣaḥīḥ*. (Även Aḥmad, *Musnad*, nr 18454.)

Användning: i invändningsavsnittet. Den som har en vinterdepression har en sjukdom och
ska söka vård; traditionen befaller det. Essän ställer aldrig bön mot behandling och
påstår aldrig att nattbön botar depression.

---

## 8. Uteslutet

- Abū Yazīd al-Bisṭāmī, Rābiʿa al-ʿAdawiyya och andra som förknippas med sufismen, även
  där korpusen har dem i närheten av vintermotiv (t.ex. *Jāmiʿ al-ʿulūm* 2:519–520).
  **ANVÄND INTE.**
- Lucia, advent, jul och andra högtider. **ANVÄND INTE**: essän handlar inte om högtider.
- Uppgifter om asketer som fastade i veckor (*Jāmiʿ al-ʿulūm* 2:500). **ANVÄND INTE.**
