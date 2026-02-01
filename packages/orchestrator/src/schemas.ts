/**
 * Zod schemas for Claude output validation.
 * These schemas ensure that Claude's JSON responses conform to expected structures.
 */
import { z } from "zod";

// Source schema used in research output
const SourceSchema = z.object({
	id: z.string(),
	url: z.string(),
	title: z.string(),
	author: z.string().optional(),
	publication: z.string().optional(),
	date: z.string().optional(),
	credibility: z.enum(["high", "medium", "low"]),
	credibilityReason: z.string().optional(),
	keyFindings: z.array(z.string()),
});

// Quote schema used in research output
const QuoteSchema = z.object({
	id: z.string(),
	text: z.string(),
	author: z.string(),
	source: z.string().optional(),
	language: z.enum(["swedish", "arabic", "norse", "english"]),
	relevance: z.string(),
	standaloneScore: z.number().optional(),
});

// Perspective schema
const PerspectiveSchema = z.object({
	name: z.string(),
	description: z.string(),
	supportingSources: z.array(z.string()).optional(),
});

// Fact schema
const FactSchema = z.object({
	claim: z.string(),
	sources: z.array(z.string()),
	confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const ResearchOutputSchema = z.object({
	topic: z.string(),
	summary: z.string(),
	sources: z.array(SourceSchema).default([]),
	quotes: z.array(QuoteSchema).default([]),
	perspectives: z.array(PerspectiveSchema).default([]),
	facts: z.array(FactSchema).default([]),
	suggestedAngles: z.array(z.string()).optional(),
	warnings: z.array(z.string()).optional(),
});

export const FactCheckOutputSchema = z.object({
	overallCredibility: z.number(),
	verdict: z.enum(["pass", "revise", "reject"]),
	summary: z.string(),
	verifiedClaims: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("verified"),
				originalSource: z.string().optional(),
				confirmingSources: z.array(z.string()).optional(),
				notes: z.string().optional(),
			}),
		)
		.default([]),
	partiallyVerified: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("partial"),
				verified: z.string(),
				unverified: z.string(),
				recommendation: z.string().optional(),
			}),
		)
		.optional(),
	unverifiedClaims: z
		.array(
			z.object({
				claim: z.string(),
				status: z.literal("unverified"),
				reason: z.string(),
				severity: z.enum(["high", "medium", "low"]),
				recommendation: z.string().optional(),
			}),
		)
		.optional(),
	flaggedIssues: z
		.array(
			z.object({
				type: z.string(),
				description: z.string(),
				severity: z.enum(["high", "medium", "low"]),
				affectedSources: z.array(z.string()).optional(),
				recommendation: z.string().optional(),
			}),
		)
		.optional(),
	sourceAssessment: z.object({
		totalSources: z.number(),
		highCredibility: z.number(),
		mediumCredibility: z.number().optional(),
		lowCredibility: z.number().optional(),
		rejected: z.number().optional(),
	}),
	recommendations: z.array(z.string()).optional(),
});

export const DraftOutputSchema = z.object({
	title: z.string(),
	subtitle: z.string().optional(),
	body: z.string(),
	wordCount: z.number(),
	quotesUsed: z
		.array(
			z.object({
				quoteId: z.string(),
				position: z.string(),
				integrationNote: z.string().optional(),
			}),
		)
		.default([]),
	sourcesReferenced: z.array(z.string()).optional(),
	selfCritique: z
		.object({
			strengths: z.array(z.string()).optional(),
			concerns: z.array(z.string()).optional(),
			aiPatternCheck: z.string().optional(),
		})
		.optional(),
});

export const ReviewOutputSchema = z.object({
	scores: z.object({
		swedish: z.object({
			score: z.number(),
			issues: z
				.array(
					z.object({
						location: z.string(),
						issue: z.string(),
						suggestion: z.string(),
					}),
				)
				.optional(),
		}),
		islamic: z.object({
			score: z.number(),
			issues: z.array(z.unknown()).optional(),
		}),
		literary: z.object({
			score: z.number(),
			issues: z.array(z.unknown()).optional(),
		}),
		humanAuthenticity: z.object({
			score: z.number(),
			aiPatternsFound: z.array(z.string()).optional(),
			humanMarkersFound: z.array(z.string()).optional(),
		}),
	}),
	finalScore: z.number(),
	verdict: z.enum(["publish", "revise", "reject"]),
	summary: z.string(),
	strengths: z.array(z.string()).optional(),
	criticalIssues: z
		.array(
			z.object({
				severity: z.enum(["high", "medium", "low"]),
				category: z.string(),
				description: z.string(),
				location: z.string().optional(),
				fix: z.string().optional(),
			}),
		)
		.optional(),
	minorIssues: z
		.array(
			z.object({
				category: z.string(),
				description: z.string(),
				suggestion: z.string().optional(),
			}),
		)
		.optional(),
	revisedText: z.string().nullable().optional(),
});

// Type exports inferred from schemas
export type ResearchOutputValidated = z.infer<typeof ResearchOutputSchema>;
export type FactCheckOutputValidated = z.infer<typeof FactCheckOutputSchema>;
export type DraftOutputValidated = z.infer<typeof DraftOutputSchema>;
export type ReviewOutputValidated = z.infer<typeof ReviewOutputSchema>;
