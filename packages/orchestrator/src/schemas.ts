/**
 * Zod schemas for Claude output validation.
 * Simplified schemas that give the LLM freedom while ensuring valid structure.
 */
import { z } from "zod";

// Research output - simplified
export const ResearchOutputSchema = z.object({
	topic: z.string(),
	summary: z
		.string()
		.describe(
			"The harder question this article answers, the central tension, a 2-3 sentence narrative arc, and why this angle would surprise a knowledgeable reader",
		),
	quranReferences: z
		.array(
			z.object({
				surah: z.string(),
				ayah: z.string(),
				// ⚠️ .optional() for the sibling producers that build this type by hand. The
				// orchestrator resolves a missing key from the surah name.
				verseKey: z
					.string()
					.optional()
					.describe('Numeric verse key, "4:85", or a range, "30:31-32"'),
				text: z.string().describe("Swedish translation of the verse"),
			}),
		)
		.default([]),
	quotes: z
		.array(
			z.object({
				id: z.string().describe("Database ID (e.g. quote-12345)"),
				text: z.string().describe("Original text in the source language"),
				textSv: z
					.string()
					.optional()
					.describe(
						"Swedish translation — REQUIRED for all non-Swedish quotes. The author stage cannot translate.",
					),
				author: z.string(),
				source: z.string().optional().describe("Work title"),
			}),
		)
		.default([]),
	bookPassages: z
		.array(
			z.object({
				id: z.string(),
				text: z.string(),
				bookTitle: z.string(),
				author: z.string(),
			}),
		)
		.default([]),
	sources: z
		.array(
			z.object({
				id: z.string(),
				url: z.string().describe("Must come from your WebSearch results — never fabricate URLs"),
				title: z.string(),
				keyFindings: z.array(z.string()).default([]),
			}),
		)
		.default([]),
	/**
	 * Numeric series, for the figures stage to draw a chart or a table from.
	 *
	 * ⚠️ WHY THIS LIVES IN RESEARCH AND NOT AT THE END. A figure added after the pipeline
	 * has finished is added AFTER the fact-check gate, where nothing verifies it — the
	 * position ground.md's Jokkmokk note describes, and a chart is worse there than a
	 * sentence because a reader takes a bar as a fact with no hedge. Data collected here
	 * passes the credibility gate before any figure can be built from it.
	 *
	 * Empty is the normal case. Most essays on this site are not quantitative, and an
	 * invented series is far worse than no figure.
	 */
	datasets: z
		.array(
			z.object({
				id: z.string(),
				question: z.string().describe("The question this series answers, in one sentence"),
				unit: z.string().describe('What the values measure — "procent", "personer"'),
				source: z
					.string()
					.describe("Citable name, exactly as it should read in the figure's caption"),
				sourceUrl: z
					.string()
					.optional()
					.describe(
						"Only if you actually called it. A source without a link is correct; a fabricated link is a forgery",
					),
				retrieved: z.string().describe("ISO date you called the endpoint"),
				note: z
					.string()
					.optional()
					.describe("What this data CANNOT say — the caveat that makes the figure true"),
				columns: z
					.array(z.string())
					.default([])
					.describe("Column headers when the series is a table rather than a single measure"),
				rows: z
					.array(z.object({ label: z.string(), values: z.array(z.string()) }))
					.default([])
					.describe("Values exactly as the source publishes them — never rounded or derived"),
			}),
		)
		// ⚠️ .optional(), not .default([]). A default makes the field REQUIRED in the inferred
		// output type, which then disagrees with the ResearchOutput interface that sibling
		// producers build by hand — the /fordjupning/ pipeline reuses this schema and would
		// no longer typecheck. Absent and empty mean the same thing here, and absent is the
		// normal case: most topics have no quantitative dimension at all.
		.optional(),
});

// Fact check output - adversarial verification
export const FactCheckOutputSchema = z.object({
	overallCredibility: z.number(),
	verdict: z.enum(["pass", "revise", "reject"]),
	summary: z.string(),
	verifiedClaims: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("verified"),
				method: z.string().optional(),
				notes: z.string().optional(),
			}),
		)
		.default([]),
	unverifiedClaims: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("unverified"),
				reason: z.string(),
			}),
		)
		.optional(),
	missingPerspectives: z.array(z.string()).optional(),
	sourceAssessment: z.object({
		totalSources: z.number(),
		highCredibility: z.number(),
	}),
	recommendations: z.array(z.string()).optional(),
	/**
	 * One verdict per dataset the research stage returned. Only datasets marked "verified"
	 * are allowed to become a figure — an unattested series is dropped in the orchestrator,
	 * the same way an unverified source URL is.
	 */
	datasetChecks: z
		.array(
			z.object({
				id: z.string(),
				status: z.enum(["verified", "unverified"]),
				notes: z.string().optional(),
			}),
		)
		// .optional() for the same reason ResearchOutputSchema.datasets is — a default makes
		// the field required in the inferred type and breaks the sibling producers that build
		// a FactCheckOutput by hand. Absent is read as "attested nothing", which is the safe
		// reading: an unattested dataset can never become a figure.
		.optional(),
});

// Draft output — full type (frontmatter + body combined in code)
export const DraftOutputSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	body: z.string(),
	wordCount: z.number().optional(),
	reflection: z.string().optional(),
	struggles: z.string().optional(),
	efficiencySuggestions: z.string().optional(),
});

// Draft frontmatter — validated from --- block (body comes from markdown)
export const DraftFrontmatterSchema = z.object({
	title: z.string(),
	/** The deck under the title. Optional so a draft without one still parses; the house
	 *  checks then flag it instead of the publisher cutting one from the lede. */
	description: z.string().optional(),
	reflection: z.string().optional(),
	struggles: z.string().optional(),
	efficiencySuggestions: z.string().optional(),
});

// Review frontmatter — validated from --- block (revisedText comes from markdown body)
export const ReviewFrontmatterSchema = z.object({
	finalScore: z.number(),
	verdict: z.enum(["publish", "revise", "reject"]),
	summary: z.string(),
	strengths: z.array(z.string()).optional(),
	issues: z.array(z.string()).optional(),
	/** Only when the reviewer rewrote the author's description. */
	description: z.string().optional(),
});

/** A verbatim replacement a post-review stage asks the code to apply (see text-patches.ts). */
const TextPatchSchema = z.object({
	original: z.string(),
	replacement: z.string(),
	reason: z.string().optional(),
});

/**
 * The essay review, as patches (the fördjupning producer keeps the rewriting review and
 * ReviewFrontmatterSchema above).
 *
 * ⚠️ Key order is deliberate: diagnosis, then edits, then the score. With the score first
 * the model commits to a number before it has written down what is wrong.
 */
export const ReviewPatchSchema = z.object({
	/** What is wrong with the text as it arrived, whether or not a patch fixes it. */
	issues: z.array(z.string()),
	patches: z.array(TextPatchSchema),
	/** Claims the reviewer could not confirm from the research. The verify stage checks each. */
	toVerify: z.array(
		z.object({
			claim: z.string(),
			/** The sentence in the article that carries it, verbatim. */
			sentence: z.string(),
			reason: z.string(),
		}),
	),
	/** What only a person can settle (a judgement of taste, a translation to confirm). */
	forEditor: z.array(z.string()),
	strengths: z.array(z.string()).optional(),
	/** Only when the reviewer rewrote the author's description. */
	description: z.string().optional(),
	summary: z.string(),
	finalScore: z.number(),
	verdict: z.enum(["publish", "revise", "reject"]),
});

/** What the verify stage found for each item it was handed. */
export const VerifyOutputSchema = z.object({
	items: z.array(
		z.object({
			/** The number the item had in the list the stage was given. */
			id: z.number(),
			status: z.enum(["confirmed", "corrected", "struck", "open"]),
			/** What was read and where: work and page, or URL. For `open`: what was tried. */
			evidence: z.string(),
			/** The edit, for `corrected` and `struck`; optional for `confirmed` (a better note). */
			patch: TextPatchSchema.optional(),
		}),
	),
	summary: z.string(),
});

export type ReviewPatch = z.infer<typeof ReviewPatchSchema>;
export type VerifyFindings = z.infer<typeof VerifyOutputSchema>;

export function getReviewPatchJsonSchema(): object {
	return z.toJSONSchema(ReviewPatchSchema, { target: "draft-07" });
}

export function getVerifyJsonSchema(): object {
	return z.toJSONSchema(VerifyOutputSchema, { target: "draft-07" });
}

// Polish frontmatter — validated from --- block (body comes from markdown)
export const PolishFrontmatterSchema = z.object({
	sectionScores: z.string(),
	strongestSentence: z.string(),
	weakestSentence: z.string(),
	patches: z.array(TextPatchSchema),
});

// Swedish voice review frontmatter — validated from --- block (body comes from markdown).
// This is the consolidated language pass: it folds in the former Language (word-level) and
// Detox (measured AI-pattern) stages, so its type union and optional patternCounts span all three.
export const SwedishVoiceFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	correctedTitle: z.string().optional(),
	correctedDescription: z.string().optional(),
	issuesFound: z.array(
		z.object({
			type: z.enum([
				// Swedish-voice (English-thinking) patterns
				"anglicism",
				"rhetoric",
				"repetition",
				"overexplain",
				"rhythm",
				"idiom",
				"hedging",
				"connector",
				"abstraction",
				// Word-level (former Language stage)
				"nonexistent-word",
				"gender",
				"preposition",
				"ai-phrase",
				// Measured AI-patterns (former Detox stage)
				"inte-utan",
				"vocabulary",
				"attribution",
				"convergence",
				"em-dash",
				"den-som",
				"koranen-subject",
				"modernity-strawman",
			]),
			location: z.string(),
			original: z.string(),
			correction: z.string(),
			reason: z.string(),
		}),
	),
	// Before/after counts for the measured patterns in section 18 (optional — only when relevant)
	patternCounts: z
		.record(
			z.string(),
			z.object({
				before: z.union([z.number(), z.string()]),
				after: z.union([z.number(), z.string()]),
			}),
		)
		.optional(),
	summary: z.string(),
});

// Ground frontmatter — grounding abstract concepts in concrete moments
/**
 * The figures stage returns a PATCH, not a rewritten essay.
 *
 * Every other post-review stage hands back the whole body, because every other stage edits
 * prose throughout. This one inserts about twelve lines. Returning the full text for that
 * would put a 3 000-word drift surface behind a twelve-line change, and there is no gate
 * downstream to catch what drifted. So the stage returns the fence and where it goes, and
 * the orchestrator does the splicing.
 */
export const FiguresFrontmatterSchema = z.object({
	verdict: z.enum(["none", "figure"]),
	/** Why this figure carries the argument — or why no figure does. Always required. */
	reasoning: z.string(),
	figure: z
		.object({
			kind: z.enum(["chart", "table"]),
			/** One clause: what the figure shows that the prose does not. */
			carriesArgument: z.string(),
			/** The last sentence of the paragraph to insert after, verbatim. */
			anchorText: z.string(),
			/** The fence BODY only — no ``` lines. */
			spec: z.string(),
			/** Where the numbers come from. "prose" reuses a footnote already on the page. */
			provenance: z.enum(["prose", "dataset"]),
			/** The footnote number whose source the figure reuses, when provenance is "prose". */
			footnoteId: z.string().optional(),
			/** The dataset id, when provenance is "dataset". */
			datasetId: z.string().optional(),
		})
		.nullable(),
	summary: z.string(),
});

export const GroundFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "grounded"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			location: z.string(),
			original: z.string(),
			addition: z.string(),
			why: z.string(),
		}),
	),
	summary: z.string(),
});

// Deepen frontmatter — argumentative deepening (illustration → argumentation)
export const DeepenFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "deepened"]),
	thesis: z.string(),
	argumentChain: z.array(z.string()),
	gaps: z.array(
		z.object({
			location: z.string(),
			type: z.string(),
			description: z.string(),
		}),
	),
	changes: z.array(
		z.object({
			location: z.string(),
			type: z.string(),
			before: z.string(),
			after: z.string(),
			reasoning: z.string(),
		}),
	),
	changesCount: z.number(),
	summary: z.string(),
});

// Eval-correction frontmatter — fixes the concrete issues flagged by
// scripts/evaluate-article.py (latinisms, anglicisms, AI-tic overuse, etc.)
export const EvalCorrectionFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			category: z.string(),
			original: z.string(),
			replacement: z.string(),
		}),
	),
	summary: z.string(),
});

// JSON Schema generation functions (using zod v4 built-in toJSONSchema)
export function getResearchJsonSchema(): object {
	return z.toJSONSchema(ResearchOutputSchema, { target: "draft-07" });
}

export function getFactCheckJsonSchema(): object {
	return z.toJSONSchema(FactCheckOutputSchema, { target: "draft-07" });
}

// Ideation schemas
export const IdeationOutputSchema = z.object({
	topic: z.string(),
	ideas: z.array(
		z.object({
			id: z.number(),
			title: z.string(),
			thesis: z.string(),
			angle: z.string(),
			keywords: z.array(z.string()),
			score: z.number().min(1).max(10),
			difficulty: z.enum(["standard", "challenging", "expert"]),
		}),
	),
	selectionGuidance: z.string(),
});

export type IdeationOutputValidated = z.infer<typeof IdeationOutputSchema>;

export function getIdeationJsonSchema(): object {
	return z.toJSONSchema(IdeationOutputSchema, { target: "draft-07" });
}

// Ideation critique schema (self-critique pass)
export const IdeationCritiqueSchema = z.object({
	analysis: z.string(),
	replacements: z.array(
		z.object({
			replacesId: z.number(),
			reason: z.string(),
			title: z.string(),
			thesis: z.string(),
			angle: z.string(),
			keywords: z.array(z.string()),
			score: z.number().min(1).max(10),
			difficulty: z.enum(["standard", "challenging", "expert"]),
		}),
	),
});

export type IdeationCritiqueValidated = z.infer<typeof IdeationCritiqueSchema>;

export function getIdeationCritiqueJsonSchema(): object {
	return z.toJSONSchema(IdeationCritiqueSchema, { target: "draft-07" });
}
