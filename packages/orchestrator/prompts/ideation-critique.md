# IDEATION CRITIQUE - Refine and Replace Weak Ideas

<context>
You are reviewing a batch of 10 article ideas generated for islam.se, a Swedish publication producing high-quality content about Islamic thought for educated Swedish readers. Your task is to identify the weakest ideas and generate stronger replacements that improve the batch's overall quality and diversity.
</context>

<task>
Review the ideas provided in the system prompt. Replace the 2-3 weakest with better alternatives. If the batch is already strong (all ideas score 6+ with good diversity), you may replace 0 ideas.
</task>

<replacement_criteria>
Replace an idea if it has ANY of these problems:
- Score below 6 AND no obvious way to strengthen it
- Thesis is really a topic announcement, not an arguable claim
- No concrete narrative anchor (specific text, historical event, person's biography, or place)
- Duplicates the structural pattern of a stronger idea in the batch
- "Diagnosis without system" tic: "Western/Swedish figure X had the experience but lacked the Islamic framework Y"
- Relies on the same scholar/thinker as 2+ other ideas in the batch
- Keywords that won't match the quote database (modern terms, Arabic script, generic terms)

Do NOT replace ideas just because their scores are moderate. A well-anchored 6 is better than an ambitious but unresearchable 8.
</replacement_criteria>

<batch_quality_checks>
After reviewing individual ideas, check the batch as a whole:
- **Pattern diversity:** Are 3+ ideas using the same structural technique? If so, replace one.
- **Scholar diversity:** Do 3+ ideas reference the same thinker? If so, replace one.
- **Swedish author diversity:** Is Strindberg or Swedenborg used more than once? Prefer less obvious Swedish thinkers.
- **Score distribution:** Does the batch have at least 1 idea scoring ≤5? If not, the scoring is inflated — lower some scores or replace an overscored idea with a more ambitious (riskier) attempt.
- **Difficulty mix:** Are there at least 2 "standard" ideas accessible to general readers?
</batch_quality_checks>

<replacement_rules>
- Replacement ideas must follow the same quality criteria as the original generation prompt.
- New IDs must match the replaced IDs (to maintain ordering).
- Keywords must use transliterated Latin (no Arabic script).
- Every replacement must name at least one concrete narrative anchor.
- Avoid patterns already well-represented in the surviving ideas.
- Include at least one Arabic term AND one Swedish/Norse term in keywords.
</replacement_rules>

<output_format>
{
  "analysis": "2-3 sentences analyzing the batch's overall quality, patterns, and gaps",
  "replacements": [
    {
      "replacesId": 9,
      "reason": "Why this idea is weak and should be replaced",
      "title": "Swedish title, 5-10 words",
      "thesis": "One provocative sentence stating a specific, arguable claim",
      "angle": "2-3 sentences explaining the unique approach and tension",
      "keywords": ["arabic_term", "comparison_concept", "scholar_name", "theme"],
      "score": 7,
      "difficulty": "standard|challenging|expert"
    }
  ]
}
</output_format>

<output_instruction>
Your response must be ONLY the JSON object—no preamble, no explanation, no markdown fences.
Start with { and end with }. Ensure valid, parseable JSON.
If no replacements are needed, return: {"analysis": "...", "replacements": []}
</output_instruction>
