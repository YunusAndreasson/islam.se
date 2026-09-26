#!/usr/bin/env bash
# rita.sh — a new drawing in the site's series: generate, translate to chalk, save.
#
#   rita.sh ljus  <namn> <format> <motiv-fil> [antal=2]   light variants + a contact sheet
#   rita.sh mork  <namn> <variant>                         the chosen variant in chalk on black
#   rita.sh spara <namn> [höjd=900]                        both into apps/web/src/assets/ritningar
#
# format:    liggande (3:2, openings) | kvadrat (1:1) | staende (2:3, the band's 10rem column)
# motiv-fil: two lines, e.g.
#              Subject: an old wall barometer … on a panelled wall beside a small-paned window …
#              The only ochre: the barometer's main needle.
#
# Work files live in $RITNING_WORK (default ~/.cache/islam-se-ritningar/<namn>/) and are
# never committed. Codex's image tool runs on the user's plan; each image is one call.
# Why each step is as it is: src/assets/ritningar/README.md.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
ASSETS=$ROOT/apps/web/src/assets/ritningar
WORK=${RITNING_WORK:-$HOME/.cache/islam-se-ritningar}
REF=$WORK/_ref
TURNER_URL=https://kooness.com/wp-content/uploads/2025/05/unnamed-39.jpg

die() { echo "rita: $*" >&2; exit 1; }
command -v codex >/dev/null || die "codex CLI saknas"
command -v magick >/dev/null || die "ImageMagick (magick) saknas"

# The references: a page of Turner's sketchbook (style) and the series' own podcast pair
# (the hand, in graphite and in chalk). Turner is fetched once; without it the series
# pair alone carries the hand.
refs() {
	mkdir -p "$REF"
	[ -s "$REF/turner.jpg" ] || curl -sfL -o "$REF/turner.jpg" "$TURNER_URL" || rm -f "$REF/turner.jpg"
	[ -s "$REF/hand.png" ] || magick "$ASSETS/podden.webp" "$REF/hand.png"
	[ -s "$REF/krita.png" ] || magick "$ASSETS/podden-mork.webp" "$REF/krita.png"
}

# One image from Codex. Prompt on stdin with `-` (-i takes several files and would
# swallow a trailing prompt); the file lands under ~/.codex/generated_images/<session>/.
codex_bild() { # <prompt-file> <log> <images…>
	local prompt=$1 log=$2; shift 2
	local args=(); for i in "$@"; do args+=(-i "$i"); done
	timeout 420 codex exec --skip-git-repo-check -s read-only -C "$WORK" "${args[@]}" - <"$prompt" >"$log" 2>&1 || true
	local id; id=$(grep -oE "session id: [0-9a-f-]+" "$log" | awk '{print $3}' | head -1)
	[ -n "$id" ] && ls "$HOME/.codex/generated_images/$id/"*.png 2>/dev/null | head -1
}

komposition() {
	case $1 in
		liggande) echo "LANDSCAPE 3:2, one drawing with generous white margin all around." ;;
		kvadrat) echo "square 1:1, one drawing centred with generous white margin all around." ;;
		staende) echo "PORTRAIT 2:3, one drawing centred with generous white margin all around." ;;
		*) die "format: liggande | kvadrat | staende" ;;
	esac
}

ljus() { # <namn> <format> <motiv-fil> [antal]
	local namn=$1 format=$2 motiv=$3 antal=${4:-2} dir=$WORK/$1
	[ -s "$motiv" ] || die "motiv-filen saknas: $motiv"
	komposition "$format" >/dev/null # dies here, not inside the $(…) below
	refs; mkdir -p "$dir"; echo "$format" >"$dir/format"
	local turner=""; [ -s "$REF/turner.jpg" ] && turner=$REF/turner.jpg
	{
		echo "Create exactly one image with your image generation tool, then stop and reply with one short line."
		echo "Use case: illustration-story"
		if [ -n "$turner" ]; then
			echo "Input images: Image 1 is a STYLE reference — a page of J. M. W. Turner's pencil sketchbook. Image 2 is an existing drawing from the SAME SERIES this one belongs to — match its hand exactly: its loose, searching, redrawn contours, its soft hatching only where form needs weight, its amount of detail, its restraint and its single ochre accent. Do not copy either image's subject."
		else
			echo "Input images: Image 1 is an existing drawing from the SAME SERIES this one belongs to — match its hand exactly: loose, searching, redrawn contours, soft hatching only where form needs weight, its amount of detail, its restraint and its single ochre accent. Do not copy its subject."
		fi
		echo "Asset type: a spot illustration for a Swedish literary website about Islam, set beside a section's words on a warm paper-coloured page. The paper must be pure white so it can be multiplied away."
		echo "Style/medium: graphite pencil in the manner of J. M. W. Turner's sketchbook studies, quick and observed, unfinished at the edges, lots of open paper. Graphite only, plus exactly ONE warm ochre-gold coloured pencil used only where stated. Pure white paper, no texture, no paper edge, no border, no rectangle: the drawing fades out into the white. No people, no human figures, hands or faces, no animals or birds anywhere — only things, buildings, landscape and plants. No text, letters, numbers, signature or logos; any writing only suggested by soft hatching, never imitation letters."
		echo "Composition: $(komposition "$format")"
		cat "$motiv"
	} >"$dir/ljus.txt"
	local pids=()
	for i in $(seq 1 "$antal"); do
		( f=$(codex_bild "$dir/ljus.txt" "$dir/ljus-$i.log" $turner "$REF/hand.png")
		  [ -n "$f" ] && magick "$f" -background white -alpha remove -alpha off "$dir/ljus-$i.png" ) &
		pids+=($!)
	done
	for p in "${pids[@]}"; do wait "$p" || true; done
	ls "$dir"/ljus-*.png >/dev/null 2>&1 || die "ingen bild kom tillbaka — se $dir/ljus-*.log"
	magick "$dir"/ljus-*.png -resize 600x600 -background white +append "$dir/kontakt.png"
	echo "ljus: $(ls "$dir"/ljus-*.png | tr '\n' ' ')"
	echo "kontaktark: $dir/kontakt.png  (varianterna i ordning, vänster till höger)"
}

mork() { # <namn> <variant>
	local namn=$1 v=$2 dir=$WORK/$1
	[ -s "$dir/ljus-$v.png" ] || die "ingen ljus variant $v för $namn"
	refs; echo "$v" >"$dir/vald"
	local format; format=$(cat "$dir/format")
	{
		echo "Create exactly one image with your image generation tool, then stop and reply with one short line."
		echo "Use case: style-transfer"
		echo "Input images: Image 1 is the EDIT TARGET — a graphite pencil drawing. Image 2 is a drawing from the same series already translated to chalk on black — match its hand and its translation exactly."
		echo "Primary request: redraw Image 1 as the same drawing in white and light-grey chalk on pure black paper, by the same hand, in the same loose, searching sketchbook manner. Keep the composition, every object, its position, size and angle as in Image 1."
		echo "How to translate: with chalk on black paper you draw the LIGHT, not the shadow. Lit surfaces, edges catching the light, the sky's light and highlights are white chalk; shadows and dark areas are left as the black paper. The tonal relationships stay natural — this is NOT a photographic negative."
		echo "Colour: the same single warm ochre-gold pencil as in Image 1, on exactly the same thing, and nowhere else."
		echo "Paper: pure flat black (#000000), no texture, no paper edge, no border, no glow; the drawing simply fades out into the black at its edges. No people, no animals. No text, letters, numbers, signature or logos."
		echo "Composition: $(komposition "$format" | sed 's/, one drawing.*//'), exactly as Image 1."
	} >"$dir/mork.txt"
	local f; f=$(codex_bild "$dir/mork.txt" "$dir/mork.log" "$dir/ljus-$v.png" "$REF/krita.png")
	[ -n "$f" ] || die "ingen mörk bild — se $dir/mork.log"
	magick "$f" -background black -alpha remove -alpha off "$dir/mork.png"
	magick "$dir/ljus-$v.png" "$dir/mork.png" -resize 600x600 +append "$dir/par.png"
	echo "mörk: $dir/mork.png   paret sida vid sida: $dir/par.png"
}

spara() { # <namn> [höjd]
	local namn=$1 h=${2:-900} dir=$WORK/$1
	local v; v=$(cat "$dir/vald" 2>/dev/null) || die "kör 'mork' först"
	[ -s "$dir/mork.png" ] || die "ingen mörk bild för $namn"
	# Graphite: only pure white trimmed (a wider fuzz shaves the vignette into a straight
	# edge); the paper haze to pure white (multiplied, it showed as a square) and the
	# midtones deepened. Chalk: the haze to pure black (screened, the same square) and the
	# midtones lifted (thin strokes read dimmer than text).
	magick "$dir/ljus-$v.png" -fuzz 1% -trim +repage -channel RGB -level 0%,95%,0.8 +channel \
		-bordercolor white -border 32 -resize "x${h}>" -quality 86 -define webp:method=6 "$ASSETS/$namn.webp"
	magick "$dir/mork.png" -fuzz 1% -trim +repage -channel RGB -level 4%,100%,1.35 +channel \
		-bordercolor black -border 32 -resize "x${h}>" -quality 86 -define webp:method=6 "$ASSETS/$namn-mork.webp"
	for f in "$namn" "$namn-mork"; do
		echo "$f.webp $(magick identify -format '%wx%h %b' "$ASSETS/$f.webp") hörn $(magick "$ASSETS/$f.webp" -crop 6x6+0+0 -format '%[fx:round(mean*255)]' info:)"
	done
	echo "(hörnen ska vara 255 för ljus och 0 för mörk)"
}

case ${1:-} in
	ljus) shift; [ $# -ge 3 ] || die "rita.sh ljus <namn> <format> <motiv-fil> [antal]"; ljus "$@" ;;
	mork) shift; [ $# -eq 2 ] || die "rita.sh mork <namn> <variant>"; mork "$@" ;;
	spara) shift; [ $# -ge 1 ] || die "rita.sh spara <namn> [höjd]"; spara "$@" ;;
	*) sed -n '2,16p' "$0"; exit 1 ;;
esac
