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

// Draft output - simplified
export const DraftOutputSchema = z.object({
	title: z.string(),
	body: z.string(),
	wordCount: z.number().optional(),
	reflection: z.string().optional(),
});

// Review output - simplified
export const ReviewOutputSchema = z.object({
	finalScore: z.number(),
	verdict: z.enum(["publish", "revise", "reject"]),
	summary: z.string(),
	strengths: z.array(z.string()).optional(),
	issues: z.array(z.string()).optional(),
	revisedText: z.string().nullable().optional(),
});

// Polish output - final prose refinement with section diagnosis
export const PolishOutputSchema = z.object({
	sectionScores: z.string(),
	strongestSentence: z.string(),
	weakestSentence: z.string(),
	body: z.string(),
	edits: z.string(),
});

// JSON Schema generation functions (using zod v4 built-in toJSONSchema)
export function getResearchJsonSchema(): object {
	return z.toJSONSchema(ResearchOutputSchema, { target: "draft-07" });
}

export function getFactCheckJsonSchema(): object {
	return z.toJSONSchema(FactCheckOutputSchema, { target: "draft-07" });
}

export function getDraftJsonSchema(): object {
	return z.toJSONSchema(DraftOutputSchema, { target: "draft-07" });
}

export function getReviewJsonSchema(): object {
	return z.toJSONSchema(ReviewOutputSchema, { target: "draft-07" });
}

export function getPolishJsonSchema(): object {
	return z.toJSONSchema(PolishOutputSchema, { target: "draft-07" });
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
