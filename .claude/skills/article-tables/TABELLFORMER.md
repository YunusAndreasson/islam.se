# Tabellens grammatik

Ett block är rader av `nyckel: värde`. Skalärer står i vänsterkanten, dataraderna är
indragna under `data:`. Inget mer. **Indraget är bärande** — det är det enda som skiljer
en skalär från en datarad.

Samma grammatik som ```chart, med avsikt: den som kan skriva den ena kan skriva den andra.

````markdown
```table
source: al-Marghinani, al-Hidaya fi sharh Bidayat al-mubtadi, kitab al-tahara
caption: Avsikten, niyya, som villkor för tvagningens giltighet.
note: Gäller endast avsiktens ställning. På de sex övriga frågorna går skiljelinjerna annorlunda.
columns: Rättsskola | Avsikten | Följd om den saknas
data:
  Hanafi: Sunna | Tvagningen gäller
  Maliki: Villkor | Tvagningen gäller inte
  Shafii: Villkor | Tvagningen gäller inte
  Hanbali: Villkor | Tvagningen gäller inte
```
````

## Nycklarna

| Nyckel | Krav | Betydelse |
|---|---|---|
| `source` | ⛔ | Källan, som den ska stå i bildtexten. Utan den vägrar parsern |
| `columns` | ⛔ | Kolumnrubrikerna, `A \| B \| C`. Den första rubricerar etikettkolumnen |
| `data:` | ⛔ | Indragna `etikett: cell \| cell`-rader. Minst två |
| `sourceUrl` | | Bara om du har anropat den. Annars utelämnas den |
| `caption` | | Bildtextens första mening. Utan den börjar bildtexten på »Källa:« |
| `note` | | Vad tabellen **inte** kan säga |
| `emphasis` | | En radetikett som behåller mässingen medan de andra går dämpade |
| `alt` | | Ersätter den genererade aria-etiketten. Skriv en hel svensk mening |

## Vägransreglerna

| Villkor | Varför |
|---|---|
| `source:` saknas | En tabell utan källa publiceras inte |
| `columns:` saknas | En tabell utan rubriker är en lista |
| Färre än två kolumner | Samma sak |
| Fler än fem kolumner | Läses inte vid 375 px. Dela upp den |
| Färre än två rader | En rad är en mening man ritat en ram runt |
| Radens cellantal ≠ `columns` − 1 | Tabellen skulle bli hålig |
| `emphasis` matchar ingen radetikett | Tyst verkningslös annars |
| Okänd nyckel | Stavfel ska inte tolkas som något annat |

## Hur den ritas

- Kolumner vars **alla** icke-tomma celler läses som svenska tal blir högerställda och
  sätts med `lining-nums tabular-nums`. En enda prosacell i kolumnen gör hela kolumnen
  till prosa — en blandad kolumn är inte siffror.
- Radetiketten är alltid en etikett, aldrig ett tal. `1258` är ett årtal.
- Figuren är `<figure class="chart chart--table">` och återanvänder hela `.chart-cap`-
  apparaten. Det är därför tabellreglerna ligger i `chart.css` och inte i en egen fil som
  skulle inlinas i 2 473 sidor för att säga samma sak.
- Vid 375 px scrollar tabellen **i sin egen ruta**. Sidan scrollar aldrig i sidled.

## Antimönster

- **Ingen tabell för två värden.** En mening säger det bättre.
- **Ingen tabell som är ett diagram.** Jämförs celler som storheter ska de ritas som
  längder — gå till `article-charts`.
- **Inga tomma celler utan förklaring.** Skriv »ingen uppgift«, inte ingenting.
- **Ingen cell med en bisats.** Den hör hemma i prosan.
- **Ingen rad per rättsskola i ett diagram.** Se kategoriregeln i SKILL.md.
- **Ingen femte rättsskola.**
