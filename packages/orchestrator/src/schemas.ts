/**
 * Zod schemas for Claude output validation.
 * Simplified schemas that give the LLM freedom while ensuring valid structure.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

// Fact check output - keep as is, it's already focused
export const FactCheckOutputSchema = z.object({
	overallCredibility: z.number(),
	verdict: z.enum(["pass", "revise", "reject"]),
	summary: z.string(),
	verifiedClaims: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("verified"),
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

// Type exports
export type ResearchOutputValidated = z.infer<typeof ResearchOutputSchema>;
export type FactCheckOutputValidated = z.infer<typeof FactCheckOutputSchema>;
export type DraftOutputValidated = z.infer<typeof DraftOutputSchema>;
export type ReviewOutputValidated = z.infer<typeof ReviewOutputSchema>;

// JSON Schema generation functions
export function getResearchJsonSchema(): object {
	return zodToJsonSchema(ResearchOutputSchema, { target: "jsonSchema7" });
}

export function getFactCheckJsonSchema(): object {
	return zodToJsonSchema(FactCheckOutputSchema, { target: "jsonSchema7" });
}

export function getDraftJsonSchema(): object {
	return zodToJsonSchema(DraftOutputSchema, { target: "jsonSchema7" });
}

export function getReviewJsonSchema(): object {
	return zodToJsonSchema(ReviewOutputSchema, { target: "jsonSchema7" });
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
		}),
	),
	selectionGuidance: z.string(),
});

export type IdeationOutputValidated = z.infer<typeof IdeationOutputSchema>;

export function getIdeationJsonSchema(): object {
	return zodToJsonSchema(IdeationOutputSchema, { target: "jsonSchema7" });
}
