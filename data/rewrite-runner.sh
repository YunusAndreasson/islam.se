#!/bin/bash
# Rewrite runner: combines author.md + brief + existing article → claude CLI
# Usage: ./data/rewrite-runner.sh <slug>

SLUG="$1"
if [ -z "$SLUG" ]; then echo "Usage: $0 <slug>"; exit 1; fi

BRIEF="data/rewrite-briefs/${SLUG}.md"
ARTICLE="data/articles/${SLUG}.md"
OUTPUT="data/rewrite-output/${SLUG}-v2.md"
TMPFILE="/tmp/rewrite-${SLUG}-prompt.md"

if [ ! -f "$BRIEF" ]; then echo "Brief not found: $BRIEF"; exit 1; fi
if [ ! -f "$ARTICLE" ]; then echo "Article not found: $ARTICLE"; exit 1; fi

echo "[$(date +%H:%M:%S)] Starting rewrite: $SLUG"

# Build combined prompt as temp file
cat packages/orchestrator/prompts/author.md > "$TMPFILE"
echo "" >> "$TMPFILE"
echo "---" >> "$TMPFILE"
echo "" >> "$TMPFILE"
cat "$BRIEF" >> "$TMPFILE"
echo "" >> "$TMPFILE"
echo "---" >> "$TMPFILE"
echo "" >> "$TMPFILE"
echo "## BEFINTLIG ARTIKEL ATT SKRIVA OM" >> "$TMPFILE"
echo "" >> "$TMPFILE"
echo "Behandla den som anteckningar — inte som mall. Alla faktuella påståenden och källor härifrån kan användas. Inga nya påståenden får tillföras." >> "$TMPFILE"
echo "" >> "$TMPFILE"
cat "$ARTICLE" >> "$TMPFILE"
echo "" >> "$TMPFILE"
echo "---" >> "$TMPFILE"
echo "" >> "$TMPFILE"
echo "Nu: skriv om denna essä enligt diagnosbrevet ovan. Ditt output börjar med --- på första raden. Inget annat före det." >> "$TMPFILE"

# Run through claude
cat "$TMPFILE" | claude --print --model claude-opus-4-6 --effort max --output-format text > "$OUTPUT" 2>/dev/null

if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    WORDS=$(wc -w < "$OUTPUT")
    echo "[$(date +%H:%M:%S)] Done: $SLUG ($WORDS words) → $OUTPUT"
else
    echo "[$(date +%H:%M:%S)] FAILED: $SLUG"
fi

rm -f "$TMPFILE"
