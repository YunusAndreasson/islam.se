#!/usr/bin/env bash
# rita.sh — a new drawing in the site's series: generate, cut the dark twin, save.
#
#   rita.sh ljus  <namn> <format> <motiv-fil> [antal=2]   light variants + a contact sheet
#   rita.sh mork  <namn> <variant>                         the chosen variant as a white-line engraving on black
#   rita.sh spara <namn> [höjd=900] [fot]                  both into apps/web/src/assets/ritningar
#
# format:    liggande (3:2, openings) | kvadrat (1:1) | staende (2:3)
# motiv-fil: two lines, e.g.
#              Subject: a Swedish farmhouse banjo barometer on a plank wall beside a small-paned window …
#              The only brass: the barometer's needle.
# fot:       stand the drawing on a square of its own paper, on its foot — the front page's
#            closing band, where four drawings share one 10rem box and one foot line.
#
# The hand is wood engraving after Bewick's tailpieces and Swedish book xylography, in the
# type's own ink with one flat brass tint (DESIGN.md »The Drawings«). Work files live in
# $RITNING_WORK (default ~/.cache/islam-se-ritningar/<namn>/, on disk: /tmp is a tmpfs that
# fills) and are never committed. Codex's image tool runs on the user's plan; each image
# is one call. Why each step is as it is: src/assets/ritningar/README.md.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
ASSETS=$ROOT/apps/web/src/assets/ritningar
WORK=${RITNING_WORK:-$HOME/.cache/islam-se-ritningar}
REF=$WORK/_ref
INK='#1a1914'    # --color-text, light
CHALK='#e8e5e0'  # --color-text, dark
PAPER='#fff6e8'  # --color-bg, light
NIGHT='#1d1912'  # --color-bg, dark

die() { echo "rita: $*" >&2; exit 1; }
command -v codex >/dev/null || die "codex CLI saknas"
command -v magick >/dev/null || die "ImageMagick (magick) saknas"

# The reference: a sheet of the series itself, four of the repo's drawings in a 2×2 grid,
# light and dark. Built from the files in the repo, so it follows the series if it changes
# (delete $REF to rebuild).
refs() {
	mkdir -p "$REF"
	local n
	for v in "" "-mork"; do
		local out=$REF/gravyr-ark$v.png bg=white
		[ -n "$v" ] && bg=black
		[ -s "$out" ] && continue
		local cells=()
		for n in essaer svar aret fordjupning; do
			magick "$ASSETS/$n$v.webp" -resize 700x460 -background "$bg" -gravity center -extent 768x512 "$REF/_cell-$n$v.png"
			cells+=("$REF/_cell-$n$v.png")
		done
		magick \( "${cells[0]}" "${cells[1]}" +append \) \( "${cells[2]}" "${cells[3]}" +append \) -append "$out"
	done
}

# One image from Codex. Prompt on stdin with `-` (-i takes several files and would
# swallow a trailing prompt); the file lands under ~/.codex/generated_images/<session>/.
codex_bild() { # <prompt-file> <log> <images…>
	local prompt=$1 log=$2; shift 2
	local args=(); for i in "$@"; do args+=(-i "$i"); done
	timeout 480 codex exec --skip-git-repo-check -s read-only -C "$WORK" "${args[@]}" - <"$prompt" >"$log" 2>&1 || true
	local id; id=$(grep -oE "session id: [0-9a-f-]+" "$log" | awk '{print $3}' | head -1)
	[ -n "$id" ] && ls "$HOME/.codex/generated_images/$id/"*.png 2>/dev/null | head -1
}

komposition() {
	case $1 in
		liggande) echo "LANDSCAPE 3:2, one vignette with generous white margin all around." ;;
		kvadrat) echo "square 1:1, one vignette centred with generous white margin all around." ;;
		staende) echo "PORTRAIT 2:3, one vignette centred with generous white margin all around." ;;
		*) die "format: liggande | kvadrat | staende" ;;
	esac
}

# The drawing re-inked in the type's own colour, the brass laid back over it unchanged.
# ljus: grey → INK..white; mork: grey → black..CHALK. The brass is every pixel with real
# saturation, opened and feathered.
inka() { # <ljus|mork> <in> <out> <höjd>
	local mode=$1 in=$2 out=$3 h=$4
	if [ "$mode" = ljus ]; then
		magick "$in" -background white -alpha remove -alpha off -write mpr:o +delete \
			mpr:o -colorspace gray -channel RGB -level 0%,93%,0.95 +channel +level-colors "$INK",white -write mpr:g +delete \
			mpr:o -colorspace HSL -channel G -separate +channel -threshold 24% -morphology Open disk:1 -blur 0x0.6 -write mpr:m +delete \
			mpr:g mpr:o mpr:m -composite \
			-fuzz 3% -trim +repage -bordercolor white -border 32 -resize "x${h}>" -quality 86 -define webp:method=6 "$out"
	else
		magick "$in" -background black -alpha remove -alpha off -write mpr:o +delete \
			mpr:o -colorspace gray -channel RGB -level 6%,100%,1.15 +channel +level-colors black,"$CHALK" -write mpr:g +delete \
			mpr:o -colorspace HSL -channel G -separate +channel -threshold 30% \( mpr:o -colorspace gray -threshold 12% \) \
			-compose multiply -composite -compose over -morphology Open disk:1 -blur 0x0.6 -write mpr:m +delete \
			mpr:g mpr:o mpr:m -composite \
			-fuzz 3% -trim +repage -bordercolor black -border 32 -resize "x${h}>" -quality 86 -define webp:method=6 "$out"
	fi
}

# Stand a drawing on a square of its own paper, on its foot.
fot() { # <file> <white|black>
	local f=$1 bg=$2 w h s
	read -r w h < <(magick identify -format '%w %h\n' "$f")
	s=$((w > h ? w : h))
	magick "$f" -background "$bg" -gravity south -extent "${s}x${s}" -quality 86 -define webp:method=6 "$f"
}

ljus() { # <namn> <format> <motiv-fil> [antal]
	local namn=$1 format=$2 motiv=$3 antal=${4:-2} dir=$WORK/$1
	[ -s "$motiv" ] || die "motiv-filen saknas: $motiv"
	komposition "$format" >/dev/null # dies here, not inside the $(…) below
	refs; mkdir -p "$dir"; echo "$format" >"$dir/format"
	{
		echo "Create exactly one image with your image generation tool, then stop and reply with one short line."
		echo "Use case: illustration-story"
		echo "Input images: Image 1 is a SHEET OF THIS SERIES — match its hand exactly: the same crisp wood-engraved line of even, deliberate weight, the same fine parallel-line tone, the same clean white lights, the same soft irregular oval in which each scene dissolves into the paper, the same single flat brass accent. Do not repeat its subjects."
		echo "Asset type: one more small engraved vignette in the same series, for a calm Swedish literary website about Islam, set in a warm serif typeface — the kind of tailpiece a fine book prints at the end of a chapter, so the picture belongs to the typography. Shown between 130 and 230 pixels tall."
		echo "Style/medium: wood engraving in the manner of Thomas Bewick's tailpiece vignettes and 19th-century Swedish book xylography. Black ink on pure white paper. Crisp engraved lines of even weight; tone by fine parallel lines and short flicks; the lightest areas left clean white; simple, clear masses that read when small."
		echo "Restraint (important): engraved tone covers at most about half of the vignette. Skies, walls, table tops and backgrounds are left white or carry only a few widely spaced lines — never a dense hatched field behind an object. The vignette dissolves on ALL sides into the white paper in a soft irregular oval: no straight cut edge, no rectangle, no border, no drawn oval line."
		echo "Accent: exactly ONE flat muted brass-ochre (#b8862f) laid as a flat tint under the engraved lines, like a hand-coloured print, on the one small thing named below — not metallic, no shine, no highlight, no glow, no light rays, never a solid block — and nowhere else."
		echo "Everywhere: no people, no figures, hands or faces, no animals, birds or insects. No text, letters, numbers, signature, monogram or logos; anything that would carry writing is suggested by plain even strokes only, never imitation letters or script. No paper texture, no paper edge."
		echo "Composition: $(komposition "$format")"
		cat "$motiv"
	} >"$dir/ljus.txt"
	local pids=()
	for i in $(seq 1 "$antal"); do
		( f=$(codex_bild "$dir/ljus.txt" "$dir/ljus-$i.log" "$REF/gravyr-ark.png")
		  [ -n "$f" ] && magick "$f" -background white -alpha remove -alpha off "$dir/ljus-$i.png" ) &
		pids+=($!)
	done
	for p in "${pids[@]}"; do wait "$p" || true; done
	ls "$dir"/ljus-*.png >/dev/null 2>&1 || die "ingen bild kom tillbaka — se $dir/ljus-*.log"
	# Each variant full, and under it at the 135px a hub opening gives it, on the page's
	# paper: the size it is judged at.
	local cols=() i
	for i in "$dir"/ljus-*.png; do
		magick \( "$i" -resize 600x600 \) \
			\( -size 600x170 xc:"$PAPER" \( "$i" -resize x135 \) -gravity center -compose multiply -composite \) \
			-background white -append "$i.kol.png"
		cols+=("$i.kol.png")
	done
	magick "${cols[@]}" -background white +append "$dir/kontakt.png"
	rm -f "$dir"/ljus-*.png.kol.png
	echo "ljus: $(ls "$dir"/ljus-*.png | tr '\n' ' ')"
	echo "kontaktark: $dir/kontakt.png  (varianterna vänster till höger; under var och en i sidans storlek)"
}

mork() { # <namn> <variant>
	local namn=$1 v=$2 dir=$WORK/$1
	[ -s "$dir/ljus-$v.png" ] || die "ingen ljus variant $v för $namn"
	refs; echo "$v" >"$dir/vald"
	local format; format=$(cat "$dir/format")
	{
		echo "Create exactly one image with your image generation tool, then stop and reply with one short line."
		echo "Use case: style-transfer"
		echo "Input images: Image 1 is the EDIT TARGET — a wood-engraved book vignette in black ink on white paper. Image 2 is a sheet of the same series already cut as white-line engravings on black — match its translation exactly."
		echo "Primary request: redraw Image 1 as the same vignette engraved as a WHITE-LINE engraving printed in warm white ink on pure black paper, by the same hand: the same crisp, even, deliberate engraved lines, the same restraint, the same soft irregular oval in which the scene dissolves into the paper. Keep the composition, every object, its position, size and angle as in Image 1."
		echo "How to translate: the engraved lines now carry the LIGHT, not the shadow. Lit surfaces are fine white lines laid close; shadows are left as black paper; open doorways, shaded undersides and dark screens stay black; open pages and lit faces are the brightest things; the sky is dark and quiet. This is NOT a photographic negative."
		echo "Colour: the same single flat brass-ochre tint as in Image 1, on exactly the same thing, under its lines, and nowhere else."
		echo "Paper: pure flat black (#000000), no texture, no paper edge, no border, no glow. No people, no animals. No text, letters, numbers, signature or logos."
		echo "Composition: $(komposition "$format" | sed 's/, one vignette.*//'), exactly as Image 1."
	} >"$dir/mork.txt"
	local f; f=$(codex_bild "$dir/mork.txt" "$dir/mork.log" "$dir/ljus-$v.png" "$REF/gravyr-ark-mork.png")
	[ -n "$f" ] || die "ingen mörk bild — se $dir/mork.log"
	magick "$f" -background black -alpha remove -alpha off "$dir/mork.png"
	# The pair as the page blends it, at the size it is shown.
	magick \( -size 420x170 xc:"$PAPER" \( "$dir/ljus-$v.png" -resize 400x135 \) -gravity center -compose multiply -composite \) \
		\( -size 420x170 xc:"$NIGHT" \( "$dir/mork.png" -resize 400x135 \) -gravity center -compose screen -composite \) \
		+append "$dir/par.png"
	echo "mörk: $dir/mork.png   paret i sidans storlek, ljust och mörkt: $dir/par.png"
}

spara() { # <namn> [höjd] [fot]
	local namn=$1 h=${2:-900} pa=${3:-} dir=$WORK/$1
	local v; v=$(cat "$dir/vald" 2>/dev/null) || die "kör 'mork' först"
	[ -s "$dir/mork.png" ] || die "ingen mörk bild för $namn"
	inka ljus "$dir/ljus-$v.png" "$ASSETS/$namn.webp" "$h"
	inka mork "$dir/mork.png" "$ASSETS/$namn-mork.webp" "$h"
	if [ "$pa" = fot ]; then fot "$ASSETS/$namn.webp" white; fot "$ASSETS/$namn-mork.webp" black; fi
	local f fx
	for f in "$namn" "$namn-mork"; do
		fx='(1-mean)*100'; [ "$f" = "$namn-mork" ] && fx='mean*100'
		echo "$f.webp $(magick identify -format '%wx%h %b' "$ASSETS/$f.webp")" \
			"hörn $(magick "$ASSETS/$f.webp" -crop 6x6+0+0 -format '%[fx:round(mean*255)]' info:)" \
			"bläck $(magick "$ASSETS/$f.webp" -resize 600x600 -colorspace gray -format "%[fx:round($fx*10)/10]" info:) %"
	done
	echo "(hörnen ska vara 255 för ljus och 0 för mörk; bläcket i seriens band, 9.7–18.9 % i november 2026)"
	[ "$namn" = aret ] && echo "aret: gör om aret-tryck.jpg (README)"
	true
}

case ${1:-} in
	ljus) shift; [ $# -ge 3 ] || die "rita.sh ljus <namn> <format> <motiv-fil> [antal]"; ljus "$@" ;;
	mork) shift; [ $# -eq 2 ] || die "rita.sh mork <namn> <variant>"; mork "$@" ;;
	spara) shift; [ $# -ge 1 ] || die "rita.sh spara <namn> [höjd] [fot]"; spara "$@" ;;
	*) sed -n '2,19p' "$0"; exit 1 ;;
esac
