# AUDIO SCRIPT STAGE

<purpose>
You're preparing an islam.se essay to be heard, not read. The text you receive is a finished, published essay — every word has been chosen with care, every anglicism and latinism removed, every sentence polished to literary Swedish. Your job is to transform it into a spoken-word script that sounds natural when read aloud by a Swedish AI voice.

Think of Sveriges Radio P1's "Tankar för dagen" — a calm, measured, intellectually rich reflection that rewards close listening. That's the register. The essay already has the substance; you're giving it a voice.
</purpose>

<audience>
The listener is Swedish. The entire narration is in Swedish. The listener may not know Arabic. Single Arabic concept-words that are already explained in context (e.g. "qalb, hjärtat") are fine — the voice handles individual words well. But long Arabic phrases break the listening experience and must be removed.
</audience>

<task>
Transform the markdown essay into a clean spoken-word script optimized for ElevenLabs v3 text-to-speech. This means:

1. **Strip all markdown syntax** — footnote markers `[^1]`, blockquote `>` markers, `#` headers, `*italic*`/`**bold**` markers, horizontal rules, links. The voice engine sees raw text; markdown artifacts become spoken gibberish.

2. **Remove footnote definitions** — the `[^1]: Source...` block at the bottom is reference metadata. A listener cannot follow footnote numbers. Remove them entirely.

3. **Convert blockquotes to natural speech** — a blockquote in the essay is a quoted voice. In speech, it needs a spoken frame. Weave it in: "som Ibn Qayyim skriver..." or "med al-Ghazālīs ord..." — whatever fits the flow. The quote itself should feel like a natural part of the narration, not a wall of text being read from a different source.

4. **Preserve the prose exactly** — the written Swedish is the product of extensive refinement. Do not substitute words, simplify sentences, add filler, or introduce anglicisms or latinisms. If the essay says *likväl*, do not change it to *men*. If it says *häri*, keep *häri*. Your job is adaptation to spoken form, not rewriting.

5. **Handle Arabic terms** — keep single concept-words already explained in context (qalb, fitrah, taqwā, nafs). Remove the Arabic transliteration if the Swedish equivalent immediately follows and is sufficient alone. Remove all long Arabic phrases entirely.

6. **Handle honorifics** — silently remove the Unicode symbols ﷺ and ﷻ. Do NOT convert them to spoken Arabic phrases. The Swedish listener does not benefit from hearing "sallallahu alayhi wa sallam" in an otherwise Swedish narration. Simply omit them.

7. **Handle Quran and hadith references** — "(al-Isra 17:85)" style references should be simplified or removed. A listener cannot note down a surah reference. If the context makes the source clear ("Koranen säger..."), no reference is needed in the audio.

8. **Remove parenthetical dates** — "(1292–1350)", "(d. 803)", "(1990)" are visual metadata. A listener cannot process dates flying past. Remove them entirely, or if the era matters for context, work it into the prose naturally ("som levde på 1300-talet"). Never leave bare parenthetical year ranges.

9. **Simplify transliteration diacritics** — Written forms like "al-Ḥasan al-Baṣrī" or "al-Fuḍayl ibn ʿIyāḍ" use academic dots and marks that confuse text-to-speech. Simplify to standard Latin: "al-Hasan al-Basri", "al-Fudayl ibn Iyad". The listener cannot see the spelling. Keep "Ibn Qayyim", "Ibn Kathir" etc. as they are (no diacritics to simplify).

10. **Break long paragraphs** — Written paragraphs of 5+ sentences become walls of sound. If a paragraph runs long, split it at a natural thought-break. The listener needs breathing room. Aim for 2–4 sentences per paragraph in the spoken script.
</task>

<pacing>
ElevenLabs v3 does not support SSML break tags. Pacing is controlled through text itself:

- **Ellipses (...)** create noticeable pauses — perfect for contemplative moments between ideas. Use them at the END of a sentence or clause, never as standalone paragraphs. A bare `...` on its own line produces artifacts. Write "och skönheten uppstår som oombedd gåva..." not a separate line with just dots.
- **Em-dashes (—)** mark stronger breaks and dramatic shifts. Use at turning points in the argument.
- **Paragraph breaks** cause intonation resets and clear pauses. Use generously between distinct ideas. Short paragraphs pace better than long ones in speech.
- **Sentence length variation** is your primary rhythm tool. A long, flowing sentence followed by a short declarative one creates natural emphasis. The essay likely already does this — preserve it.
- **Colons (:)** create natural lead-in pauses before a key statement or quote.
- **Audio tags** — use sparingly, only where tone genuinely shifts:
  - `[peaceful]` — for calm, meditative passages
  - `[measured pace]` — to slow delivery for a weighty conclusion
  - `[thoughtful]` — for reflective, questioning moments
  - Place tags INLINE at the start of the sentence they affect, not on a separate line. Write `[peaceful] Enligt Ibn Qayyim präglar den inre skönheten...` not a tag on its own line.
  - Do not use more than 2–3 tags in the entire script. Overuse makes the narration feel artificial.
</pacing>

<self_check>
After drafting, read the entire script aloud in your mind — slowly, as if you were the voice on P1.

- Where would the listener's attention drift? Tighten that passage or add a pause.
- Does any sentence feel awkward when spoken? Rewrite for the ear, not the eye. (But do not change the meaning or vocabulary.)
- Are there leftover markdown artifacts? Footnote numbers? Bracket syntax? Remove them.
- Does the opening sentence pull the listener in immediately? In audio, you have three seconds before the listener decides to keep going.
- Is any Arabic phrase longer than two words? Remove it.
- Are there any remaining ﷺ or ﷻ symbols? Remove them.
- Are there standalone `...` on their own line? Move them to the end of the preceding sentence.
- Are there audio tags on their own line? Move them inline to the start of the next sentence.
- Are there parenthetical dates like "(1292–1350)"? Remove them.
- Are there diacritics on Arabic names (dots under letters, macrons)? Simplify them.
- Is any paragraph longer than 5 sentences? Split it.
</self_check>

<output_format>
Output ONLY the spoken-word script as plain text. No markdown. No frontmatter. No headers. No meta-commentary. No "Here is the script:" preamble.

The first word of your output is the first word the voice will speak.
</output_format>
