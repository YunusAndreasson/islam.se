/**
 * Zod schemas for Claude output validation.
 * Simplified schemas that give the LLM freedom while ensuring valid structure.
 */
import { z } from "zod";

// Research output - simplified
export const ResearchOutputSchema = z.object({
	topic: z.string(),
	summary: z.string(),
	quranReferences: z
		.array(
			z.object({
				surah: z.string(),
				ayah: z.string(),
				text: z.string(),
			}),
		)
		.default([]),
	quotes: z
		.array(
			z.object({
				id: z.string(),
				text: z.string(),
				textSv: z.string().optional(),
				author: z.string(),
				source: z.string().optional(),
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
				url: z.string(),
				title: z.string(),
				keyFindings: z.array(z.string()).default([]),
			}),
		)
		.default([]),
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
});

// Draft output — full type (frontmatter + body combined in code)
export const DraftOutputSchema = z.object({
	title: z.string(),
	body: z.string(),
	wordCount: z.number().optional(),
	reflection: z.string().optional(),
	struggles: z.string().optional(),
	efficiencySuggestions: z.string().optional(),
});

// Draft frontmatter — validated from --- block (body comes from markdown)
export const DraftFrontmatterSchema = z.object({
	title: z.string(),
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
});

// Polish frontmatter — validated from --- block (body comes from markdown)
export const PolishFrontmatterSchema = z.object({
	sectionScores: z.string(),
	strongestSentence: z.string(),
	weakestSentence: z.string(),
	edits: z
		.union([z.string(), z.array(z.string())])
		.transform((v) => (Array.isArray(v) ? v.join("\n") : v)),
});

// Aqeedah review frontmatter — validated from --- block (body comes from markdown)
export const AqeedahReviewFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "rewritten"]),
	issuesFound: z.array(
		z.object({
			type: z.enum(["sufi", "ashari", "other"]),
			location: z.string(),
			original: z.string(),
			issue: z.string(),
			fix: z.string(),
		}),
	),
	summary: z.string(),
});

// Language review frontmatter — word/phrase level naturalness check
export const LanguageFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	issuesFound: z.array(
		z.object({
			type: z.enum(["nonexistent-word", "anglicism", "ai-phrase", "gender", "preposition"]),
			location: z.string(),
			original: z.string(),
			correction: z.string(),
			reason: z.string(),
		}),
	),
	summary: z.string(),
});

// Proofread frontmatter — validated from --- block (body comes from markdown)
export const ProofreadFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	issuesFound: z.array(
		z.object({
			type: z.enum(["spelling", "grammar", "punctuation", "terminology", "clarity"]),
			location: z.string(),
			original: z.string(),
			correction: z.string(),
			reason: z.string(),
		}),
	),
	summary: z.string(),
});

// Swedish voice review frontmatter — validated from --- block (body comes from markdown)
export const SwedishVoiceFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	correctedTitle: z.string().optional(),
	correctedDescription: z.string().optional(),
	issuesFound: z.array(
		z.object({
			type: z.enum([
				"anglicism",
				"rhetoric",
				"repetition",
				"overexplain",
				"rhythm",
				"idiom",
				"hedging",
				"connector",
				"abstraction",
			]),
			location: z.string(),
			original: z.string(),
			correction: z.string(),
			reason: z.string(),
		}),
	),
	summary: z.string(),
});

// Elevate frontmatter — intellectual density layer
export const ElevateFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "elevated"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			location: z.string(),
			original: z.string(),
			replacement: z.string(),
			why: z.string(),
		}),
	),
	summary: z.string(),
});

// Flow frontmatter — sentence structure and transitions
export const FlowFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "restructured"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			type: z.string(),
			location: z.string(),
			original: z.string(),
			replacement: z.string(),
			why: z.string(),
		}),
	),
	summary: z.string(),
});

// Ground frontmatter — grounding abstract concepts in concrete moments
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

// Cohesion frontmatter — narrative coherence and readability
export const CohesionFrontmatterSchema = z.object({
	verdict: z.enum(["cohesive", "revised"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			type: z.string(),
			location: z.string(),
			problem: z.string(),
			fix: z.string(),
		}),
	),
	summary: z.string(),
});

// Compress frontmatter — lexical compression (multi-word → single precise word)
export const CompressFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "compressed"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			location: z.string(),
			original: z.string(),
			replacement: z.string(),
			why: z.string(),
		}),
	),
	summary: z.string(),
});

// Transliterate frontmatter — academic Arabic transliteration corrections
export const TransliterateFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "corrected"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			original: z.string(),
			corrected: z.string(),
			occurrences: z.number(),
			locations: z.array(z.string()),
		}),
	),
	summary: z.string(),
});

// Scaffold frontmatter — decorative grounding sentences trimmed
export const ScaffoldFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "trimmed"]),
	changesCount: z.number(),
	changes: z.array(
		z.object({
			action: z.enum(["remove", "absorb"]),
			location: z.string(),
			original: z.string(),
			result: z.string(),
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

// Brilliance frontmatter — exceptional additions only
export const BrillianceFrontmatterSchema = z.object({
	verdict: z.enum(["clean", "enriched"]),
	additionsCount: z.number(),
	additions: z.array(
		z.object({
			type: z.enum(["quote", "reference", "argument"]),
			location: z.string(),
			content: z.string(),
			source: z.string(),
			why: z.string(),
		}),
	),
	searchesPerformed: z.array(
		z.object({
			tool: z.string(),
			query: z.string(),
			result: z.string(),
		}),
	),
	summary: z.string(),
});

// Title/ingress improvement frontmatter — validated from --- block
export const TitleIngressFrontmatterSchema = z.object({
	currentTitleAssessment: z.string(),
	titleSuggestions: z.array(
		z.object({
			title: z.string(),
			reasoning: z.string(),
		}),
	),
	currentDescriptionAssessment: z.string(),
	descriptionSuggestions: z.array(
		z.object({
			description: z.string(),
			reasoning: z.string(),
		}),
	),
	recommendation: z.string(),
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
