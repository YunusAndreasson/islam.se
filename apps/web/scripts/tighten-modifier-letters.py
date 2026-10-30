"""Literata's ʿ and ʾ, on the width of the mark instead of half an em.

Literata draws the transliteration's two modifier letters (U+02BF, U+02BE) as a narrow
tick of about 0.11 em on an advance of 0.5 em, so every »al-Baqīʿ och« and »ʿĀʾisha« had
a hole on both sides of the mark, in the running text, the headings and the notes alike.
Amiri draws the same letters on 0.19 em and Source Sans on 0.22 em. This moves the mark
to a small side bearing and cuts the advance to match; nothing else in the file changes,
and a variable font's deltas are relative, so every weight and optical size follows.

Run it on the parents, then cut again (scripts/subset-fonts.ts says how):

    uvx --from fonttools --with brotli python scripts/tighten-modifier-letters.py \
        src/assets/fonts/literata-roman.woff2 src/assets/fonts/literata-italic.woff2 \
        src/assets/fonts/literata-display.woff2 scripts/fonts/Literata-*.ttf

Running it twice changes nothing. fonts.test.ts holds the served files to the result.
"""

import sys

from fontTools.ttLib import TTFont

# U+02BE ʾ and U+02BF ʿ.
MODIFIER_LETTERS = (0x02BE, 0x02BF)
# On each side of the mark, in units of 1/1000 em: as close as the macron of a ī or an Ā
# before it allows.
SIDE_BEARING = 36


def tighten(path: str) -> None:
    font = TTFont(path)
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    changed = False
    for codepoint in MODIFIER_LETTERS:
        name = cmap.get(codepoint)
        if name is None:
            continue
        glyph = glyf[name]
        if glyph.isComposite():
            raise SystemExit(f"{path}: {name} is a composite; move its components by hand.")
        glyph.recalcBounds(glyf)
        advance = (glyph.xMax - glyph.xMin) + 2 * SIDE_BEARING
        if hmtx[name][0] <= advance:
            continue
        coordinates = glyph.coordinates
        coordinates.translate((SIDE_BEARING - glyph.xMin, 0))
        glyph.recalcBounds(glyf)
        hmtx[name] = (advance, glyph.xMin)
        changed = True
    if changed:
        font.save(path)
    print(f"{path}: {'tightened' if changed else 'already tight'}")


for target in sys.argv[1:]:
    tighten(target)
