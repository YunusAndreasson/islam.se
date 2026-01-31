# Testing & Verification Guide

## System Overview

The content production pipeline has 4 stages:
```
Quote Search → Research → Fact-Check → Author → Review → Final Article
(local)        (Claude)   (Claude)     (Claude)  (Claude)
```

## Quick Verification Commands

### 1. Quote Database Health
```bash
# Check database stats
pnpm cli stats

# Expected: ~20,500 quotes, 3 languages (sv, ar, en)
```

### 2. Quote Search Function
```bash
# Test semantic search
pnpm cli search "tålamod"

# Expected: 5+ quotes with scores > 0.8
```

### 3. Comprehensive Quote Service
```bash
cd packages/orchestrator && node --no-warnings -e "
import { searchQuotesComprehensive } from './dist/quote-service.js';
const r = await searchQuotesComprehensive({ topic: 'barmhärtighet', includeArabic: true });
console.log('Semantic:', r.semanticMatches.length);
console.log('Paired SE:', r.pairedQuotes.swedish.length);
console.log('Paired AR:', r.pairedQuotes.arabic.length);
"
```

### 4. Full Pipeline Test (Dry Run)
```bash
# This will attempt to run the full pipeline
pnpm produce article "Tålamod i islamisk tradition" --model sonnet

# Note: Requires Claude CLI to be configured and working
```

---

## Test Case: "Barmhärtighet i islam"

### Expected Flow

1. **Quote Search** (2-5 seconds)
   - Should find 10-15 semantic matches
   - Should find 3+ Swedish quotes about mercy
   - Should find 3+ Arabic quotes about رحمة (rahma)
   - All quotes should have `standalone >= 4`

2. **Research Stage** (Claude)
   - Input: Topic + pre-fetched quotes
   - Should use WebSearch for Swedish sources (dn.se, svd.se, lu.se)
   - Should NOT search Wikipedia or blogs
   - Output: `research.json` with sources, quotes, perspectives

3. **Fact-Check Stage** (Claude)
   - Should verify claims against 2+ sources
   - Should score `overallCredibility >= 7` to pass
   - Output: `fact-check.json`

4. **Author Stage** (Claude)
   - Should write 2000-3000 words in Swedish
   - Should integrate 6-10 quotes naturally
   - Should avoid AI patterns (see prompts/author.md)
   - Output: `draft.md`

5. **Review Stage** (Claude)
   - Should score Swedish language, Islamic accuracy, literary quality
   - Should detect AI patterns
   - Verdict: `publish` if score >= 8.0
   - Output: `final.md`, `references.md`

---

## What to Verify

### Quote Integration
- [ ] Quotes appear in the research prompt (check logs)
- [ ] Quote IDs are preserved through pipeline
- [ ] Arabic quotes have correct RTL formatting
- [ ] Bibliography includes quote sources

### Source Validation
- [ ] No Wikipedia URLs in sources
- [ ] Swedish academic sources marked as "high" credibility
- [ ] Tabloid sources (expressen.se) marked as "medium"

### Quality Gates
- [ ] Fact-check fails if credibility < 7
- [ ] Review fails if score < 8 (returns "revise")
- [ ] Max 2 revision attempts before stopping

### Output Files
```
output/<topic-slug>/
├── research.json      # Has quotes array with IDs
├── fact-check.json    # Has overallCredibility score
├── draft.md           # 2000-3000 words
├── draft-meta.json    # Has quotesUsed array
├── review.json        # Has scores and verdict
├── final.md           # Final article
├── references.md      # Swedish bibliography
└── metadata.json      # Production stats
```

---

## Common Issues & Fixes

### Issue: Quote search returns 0 results
**Cause:** Database not found or embeddings not indexed
**Fix:**
```bash
ls -la data/quotes.db  # Check file exists (~40MB)
pnpm cli stats         # Should show 20,500 quotes
```

### Issue: Claude CLI fails to spawn
**Cause:** `claude` not in PATH or not authenticated
**Fix:**
```bash
which claude           # Should return path
claude --version       # Should work
claude auth status     # Check authentication
```

### Issue: Research stage has no quotes
**Cause:** Quote service not integrated or threw error
**Fix:** Check orchestrator logs for "Quote search failed" message

### Issue: All sources marked "low" credibility
**Cause:** URL validation too strict
**Fix:** Check `config/credible-sources.json` has correct domains

### Issue: Article too short or too long
**Cause:** Word count not enforced in author prompt
**Fix:** Check `targetWordCount` in system prompt

### Issue: AI patterns detected in final article
**Cause:** Author prompt not strict enough
**Fix:** Review `prompts/author.md` anti-AI rules

---

## Improvement Ideas

### Short-term
1. Add retry logic for Claude API failures
2. Cache quote search results to avoid re-fetching
3. Add progress bar for long-running stages
4. Save intermediate state for resume capability

### Medium-term
1. Add human-in-the-loop checkpoint between stages
2. Implement A/B testing for different prompts
3. Add cost tracking per article
4. Create web UI for monitoring

### Long-term
1. Fine-tune local model for Swedish Islamic content
2. Build quote suggestion API for external use
3. Implement multi-article series planning
4. Add audio/podcast generation stage

---

## Manual Testing Checklist

Before running production:

- [ ] `pnpm build` succeeds
- [ ] `pnpm check` has no errors in orchestrator/
- [ ] `pnpm cli stats` shows quotes
- [ ] `pnpm cli search "test"` returns results
- [ ] Claude CLI is authenticated (`claude auth status`)
- [ ] API keys set in `.env` (ANTHROPIC_API_KEY, OPENAI_API_KEY)

---

## Log Locations

- Quote search: stdout during research stage
- Claude responses: captured in stage result
- Errors: stderr and `result.error` field
- Final outputs: `output/<topic-slug>/`
