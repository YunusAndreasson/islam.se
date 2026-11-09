# islam.se

Swedish-language publishing on Islam: a website, a mobile app, and the pipeline that
produces the texts. The three share this file and nothing else.

## The site's position — non-negotiable

**islam.se is a Sunni site. It is not shia and it is not sufi.** Every page that
states doctrine states it from the position of *ahl as-sunna wa'l-jamāʿa* and the
four classical rättsskolor — hanafi, maliki, shafii, hanbali. Presenting shia or
sufi doctrine as co-normative with that is **a clear violation**, not a stylistic
preference, and it must be fixed before anything ships.

**A shia reference is only tolerated when it serves to show the position wrong.**
Naming shia is allowed when the classical ruling answers it — that is the job of
`/svar/sunni-och-shia` and `/svar/de-rattledda-kaliferna`, where every shia claim
is followed by what *ahl as-sunna* holds and why. A neutral, descriptive mention
that just reports what shia do, and leaves it standing, does not belong on the
site. Concretely, never:

- slot jaʿfaritisk rätt in beside the four madhhabs, or write "de fem skolorna" —
  there are four;
- write a heading like »Rättsskolorna **och shia** om X«;
- add "…och enligt shiitisk rätt" to a statement of the classical ruling;
- claim the difference is only historical ("klyftan löper aldrig genom
  trosbekännelsen") — the imamate and the stance on the *sahāba* are trosfrågor;
- cite a shia or sufi authority as the thing that settles a question, or link out
  to shia sites (al-islam.org, sistani.org and the like);
- present sufism as a path alongside sunni islam rather than a fromhetsströmning
  judged by Koranen and sunna.

On a pure doctrine page (»vad säger rättsskolorna om X«) you take the four and
stop there.

**The producer does not know this rule.** Grep every draft before validating:

```bash
grep -niE "shia|shiit|jaʿfar|jafarit|tolvshi|imamit|khamsa|marja|sufi|tariqa|tasawwuf" <fil>
```

Then ask of each hit: does this show the position wrong? If not, it goes. That
applies to neutral name-drops in otherwise factual lists too — an illustrative
list of Swedish samfund or a "varav"-breakdown of MUCF-statistik does not need
the shia entry to stay accurate, so leave it out.

### Creed: the salaf's understanding, without wearing the label

Where the site states ʿaqīda it follows *ahl as-sunna* as the *salaf* understood
it: the names and attributes affirmed as revealed, without *taʾwīl*, *taʿtīl* or
*tamthīl*; *istiwāʾ* is real and the "how" is not asked; Ibn Taymiyya, Ibn
al-Qayyim and the fatwa tradition after them are the reference points. This is
already the voice of `/svar/vad-ar-tawhid`, `/svar/islams-gudssyn` and
`/svar/vad-ar-odet-qadar` — match it.

**But never name the school.** Do not write "salafi", "wahhabi", "athari" or
"sunnitisk" in reader-facing copy; write »klassisk«, »islamisk«, »de lärda«,
»ahl as-sunna«. The position must be visible in what the page *says*, never worn
as a badge. A page that announces its madhhab has already lost the reader it was
written for.

### Liberal and modernist thought is the third violation

It is the easiest one to miss, because it arrives as fairness rather than as a
claim. The objection sections are where it gets in. Stating an objection at full
strength is required — »ingen halmgubbeparad« — but an objection left standing is
a concession, and these sentence-shapes are how a page concedes without noticing:

- "svaret är riktigt men inte fullständigt", "går inte att förklara bort", "kan
  inte avfärdas" — attached to a ruling that in fact has an answer;
- treating hadith as optional ("det är just traditionens ställning som är
  omtvistad") — sunnan is the second source, not a contested add-on;
- letting a revisionist's frame set the question (Kecia Ali, Ayesha Chaudhry,
  Zahra Ayubi, Amina Wadud, Fazlur Rahman and the like). Cite them where they
  establish a historical fact; never let their normative conclusion close a
  section;
- "de lärda är oense" used to dissolve a ruling rather than to report a genuine
  *ikhtilāf*;
- delegitimising a ruling by the jurists' gender or era ("medeltida manliga
  jurister") — a norm is tested against its evidence, not its transmitter;
- conceding that classical fiqh cannot simply be followed today.

**The rule: the objection may be stated in full, but the classical position gets
the last word.** If no answer is given, the objection has won on the page. When a
genuine practical problem remains — no islamic court in the diaspora, waiting
times under begravningslagen — say so plainly; that is honesty about Sweden, not
a concession about the religion.

## Where the rest of the instructions live

| Area | Instructions |
| - | - |
| `apps/web` — the site | `apps/web/CLAUDE.md` |
| `apps/mobile` — the app | `apps/mobile/AGENTS.md` |
| `packages/` and `apps/{cli,content-producer,tui,mcp-quotes,mcp-articles}` — the quote database and the article pipeline | `packages/CLAUDE.md` |

An area's file loads only once the agent works in that directory. Before working in
another area, read its file.

## Open source

The repository is public. MIT covers the code; `NOTICE.md` lists the texts, the brand
and the third-party material it doesn't.

- Anything brought in from elsewhere (text, data, images, fonts, code) needs a licence
  that lets it be redistributed here, and a line in `NOTICE.md`. Nothing under the GPL
  in MIT-licensed files.
- No key, token or phone number in a commit: they come from the environment (the app's
  review phone number is `APP_REVIEW_PHONE`).
- The app and the site promise what leaves the device. Before adding an SDK or a
  request that sends anything off it, update the privacy policy
  (`apps/web/src/pages/integritetspolicy.astro`) and the store answers in
  `apps/mobile/docs/`.
- Dependabot opens grouped pull requests weekly. `.github/dependabot.yml` says what it
  holds back and why. A native update to the app goes out with a release; the
  runtime check refuses it otherwise.

## Versions

Every part of the stack tracks the latest release, often newer than your training data.
`package.json` says what is installed. Look up current documentation before relying on a
remembered API, and keep version numbers out of these instruction files.

## Tests

- Assert the contract through the public interface. A test that re-derives the
  implementation's own logic verifies nothing.
- No network calls and no sleeps. The suites run in seconds; keep them there.
- CI runs an older Node than this machine (see `.github/workflows/`). When CI fails and
  the same suite passes here, run it under CI's version first (`mise exec node@<version>
  -- pnpm test`): the wash shader suite once failed only there.
- A failure message says which invariant broke and why it matters. The next session reads
  the failure output, not the test name.
- A regression test carries a comment describing the bug it pins, so nobody "improves" the
  code back into it.
