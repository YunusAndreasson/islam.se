#!/usr/bin/env bash
# bild.sh — feature images with Codex, as the feature-image skill describes.
#
#   bild.sh refs  <run>                          the approved pictures, as PNG references in the run
#   bild.sh gen   <run> <name> …                 <run>/<name>.txt → <run>/<name>.png, references attached
#   bild.sh edit  <run> <in.png> <brief.txt> <out-name>   change one thing, keep the picture
#   bild.sh sheet <run> <name> …                 card-size contact sheet + bottom-right corners
#
# A run is a folder under $BILD_WORK (default ~/.cache/islam-se-bilder/feature), never /tmp:
# /tmp is a tmpfs that other projects fill. Nothing here is committed.
set -euo pipefail

WORK=${BILD_WORK:-$HOME/.cache/islam-se-bilder/feature}
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
IMG=$REPO/apps/web/src/assets/images
# The pictures the user approved as the register to match (2026-11-07). Change the list
# when they approve others; four is enough, more pulls Codex towards copying.
REFS=(nattbonens-ansikte.webp fordjupning/aktenskap.webp samma-stjarnhimmel.webp fordjupning/doden.webp)
PARALLEL=5

run_dir() { mkdir -p "$WORK/$1"; echo "$WORK/$1"; }

# Codex writes the picture under ~/.codex/generated_images/<session id>/; copy it out.
codex_one() { # <dir> <out.png> <brief.txt> [-i file …]
	local dir=$1 out=$2 brief=$3; shift 3
	local log="${out%.png}.log"
	timeout 900 codex exec --skip-git-repo-check -s read-only -C "$dir" "$@" - <"$brief" >"$log" 2>&1 || true
	local id
	id=$(grep -oE "session id: [0-9a-f-]+" "$log" | awk '{print $3}' | head -1)
	if [ -n "$id" ] && ls "$HOME/.codex/generated_images/$id/"*.png >/dev/null 2>&1; then
		cp "$(ls -t "$HOME/.codex/generated_images/$id/"*.png | head -1)" "$out"
		echo "$(date +%T) ok   $(basename "$out")"
	else
		echo "$(date +%T) FAIL $(basename "$out") (see $log)"
	fi
}

ref_args() { # the -i flags for every reference in the run
	local dir=$1 r
	for r in "$dir"/ref-*.png; do [ -e "$r" ] && printf '%s\n' -i "$r"; done
}

case "${1:-}" in
refs)
	dir=$(run_dir "$2")
	for r in "${REFS[@]}"; do
		name=$(basename "${r%.*}")
		magick "$IMG/$r" -alpha off "$dir/ref-$name.png"
		echo "ref-$name.png"
	done
	;;
gen)
	dir=$(run_dir "$2"); shift 2
	mapfile -t refs < <(ref_args "$dir")
	[ ${#refs[@]} -gt 0 ] || { echo "no references in $dir — run: bild.sh refs <run>" >&2; exit 1; }
	n=0
	for name in "$@"; do
		[ -f "$dir/$name.txt" ] || { echo "missing $dir/$name.txt" >&2; continue; }
		[ -s "$dir/$name.png" ] && { echo "have $name.png"; continue; }
		codex_one "$dir" "$dir/$name.png" "$dir/$name.txt" "${refs[@]}" &
		n=$((n + 1)); sleep 3
		if [ $((n % PARALLEL)) -eq 0 ]; then wait; fi
	done
	wait
	;;
edit)
	dir=$(run_dir "$2")
	codex_one "$dir" "$dir/$5.png" "$4" -i "$3"
	;;
sheet)
	dir=$(run_dir "$2"); shift 2
	cards=() corners=()
	for name in "$@"; do
		magick "$dir/$name.png" -alpha off -resize 373x249^ -gravity center -extent 373x249 "$dir/$name-card.png"
		magick "$dir/$name.png" -alpha off -gravity southeast -crop 220x150+0+0 +repage "$dir/$name-corner.png"
		cards+=("$dir/$name-card.png"); corners+=("$dir/$name-corner.png")
	done
	magick montage "${cards[@]}" -tile 3x -geometry +12+12 -background '#fff6e8' "$dir/sheet.png"
	magick montage "${corners[@]}" -tile 6x -geometry +4+4 -background '#fff6e8' "$dir/corners.png"
	echo "$dir/sheet.png"
	echo "$dir/corners.png"
	;;
*)
	sed -n '2,10p' "$0"
	exit 1
	;;
esac
