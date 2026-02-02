#!/usr/bin/env node
/**
 * MCP Server for Quote Database
 *
 * Exposes quote search tools so Claude can search intelligently
 * based on the specific angle it's developing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  findQuotesLocal,
  findQuotesByFilter,
  searchQuotesText,
  getInventory,
  getCategories,
  preloadLocalModel,
  type FormattedQuoteWithId,
} from '@islam-se/quotes';
import * as z from 'zod';

// Preload embedding model at startup (don't block server start)
preloadLocalModel().catch(console.error);

const server = new McpServer({
  name: 'quote-database',
  version: '1.0.0',
});

// Helper to format quotes for output
function formatQuotes(quotes: FormattedQuoteWithId[]): string {
  if (quotes.length === 0) {
    return 'No quotes found matching your criteria.';
  }

  return quotes.map((q, i) => {
    return `[${i + 1}] ID: ${q.id}
"${q.text}"
${q.attribution}
Category: ${q.category}`;
  }).join('\n\n');
}

// Tool 1: Semantic search - finds quotes by meaning
server.registerTool(
  'search_quotes',
  {
    title: 'Semantic Quote Search',
    description: `Search quotes by meaning using AI embeddings. Best for finding quotes about concepts, themes, or ideas.

Examples:
- "patience in adversity" → finds quotes about sabr, endurance, trials
- "death and mortality" → finds quotes about death, afterlife, impermanence
- "knowledge and wisdom" → finds quotes about ilm, learning, understanding

Tips:
- Use descriptive phrases, not single words
- Combine concepts for more specific results
- Works across all languages (Swedish, Arabic, English)`,
    inputSchema: {
      query: z.string().describe('Descriptive search query (e.g., "patience during hardship", "the nature of the soul")'),
      language: z.enum(['sv', 'ar', 'en']).optional().describe('Filter by language: sv=Swedish, ar=Arabic, en=English/Norse'),
      limit: z.number().min(1).max(20).optional().describe('Number of results (default: 5, max: 20)'),
    },
  },
  async ({ query, language, limit }) => {
    const quotes = await findQuotesLocal(query, {
      limit: limit ?? 15,
      language,
      minStandalone: 3,
      diverse: true,
    });

    const output = formatQuotes(quotes);
    return {
      content: [{ type: 'text', text: output }],
    };
  }
);

// Tool 2: Filter search - finds quotes by author, category, etc.
server.registerTool(
  'search_by_filter',
  {
    title: 'Filter Quote Search',
    description: `Search quotes by specific criteria like author, category, or language.

Available categories (top ones):
- زهد (asceticism), صبر (patience), توبة (repentance), تقوى (God-consciousness)
- علم (knowledge), أخلاق (ethics), قلب (heart), نفس (soul)
- Swedish categories vary by work

Top authors by quote count:
- Arabic: Ibn al-Jawzi, Ibn Qayyim, al-Suyuti, Ibn Taymiyyah, al-Nawawi, al-Ghazali
- Swedish: Strindberg, Ellen Key, Viktor Rydberg, Selma Lagerlöf, Fredrika Bremer
- Norse: Sæmundur fróði, Snorri Sturluson, Hávamál`,
    inputSchema: {
      author: z.string().optional().describe('Author name (partial match works)'),
      category: z.string().optional().describe('Category/theme (e.g., "صبر", "توبة")'),
      language: z.enum(['sv', 'ar', 'en']).optional().describe('Filter by language'),
      limit: z.number().min(1).max(20).optional().describe('Number of results (default: 10)'),
    },
  },
  async ({ author, category, language, limit }) => {
    const quotes = findQuotesByFilter({
      author,
      category,
      language,
      limit: limit ?? 10,
      minStandalone: 3,
    });

    const output = formatQuotes(quotes);
    return {
      content: [{ type: 'text', text: output }],
    };
  }
);

// Tool 3: Text search - finds quotes containing specific words
server.registerTool(
  'search_text',
  {
    title: 'Text Search',
    description: `Search for quotes containing specific words or phrases. Use this when you need exact term matches.

Examples:
- "tålamod" → Swedish quotes containing the word patience
- "الصبر" → Arabic quotes with the word patience
- "Strindberg" → quotes by or mentioning Strindberg

Note: This is literal text matching, not semantic. For meaning-based search, use search_quotes instead.`,
    inputSchema: {
      query: z.string().describe('Text to search for (matches in quote text, author, work title, keywords)'),
      language: z.enum(['sv', 'ar', 'en']).optional().describe('Filter by language'),
      limit: z.number().min(1).max(20).optional().describe('Number of results (default: 10)'),
    },
  },
  async ({ query, language, limit }) => {
    const quotes = searchQuotesText(query, {
      language,
      limit: limit ?? 10,
      minStandalone: 3,
    });

    const output = formatQuotes(quotes);
    return {
      content: [{ type: 'text', text: output }],
    };
  }
);

// Tool 4: Get database inventory/stats
server.registerTool(
  'get_inventory',
  {
    title: 'Database Inventory',
    description: 'Get an overview of what quotes are available in the database. Shows total counts, top categories, top authors, and language distribution. Use this first to understand what you can search for.',
    inputSchema: {},
  },
  async () => {
    const inventory = getInventory();
    const categories = getCategories();

    const output = `# Quote Database Inventory

## Overview
- Total quotes: ${inventory.total.toLocaleString()}
- High quality (standalone ≥4): ${inventory.quality.standalone4Plus.toLocaleString()}

## Languages
- Swedish: ${inventory.languages.sv.toLocaleString()}
- Arabic: ${inventory.languages.ar.toLocaleString()}
- English/Norse: ${inventory.languages.en.toLocaleString()}

## Top Categories (${categories.length} total)
${categories.slice(0, 15).map(c => `- ${c.category}: ${c.count}`).join('\n')}

## Top Authors
${inventory.authors.slice(0, 20).map(a => `- ${a.name}: ${a.count}`).join('\n')}

## Tips
- Use search_quotes for semantic/meaning-based search
- Use search_by_filter for author/category filtering
- Use search_text for exact word matching`;

    return {
      content: [{ type: 'text', text: output }],
    };
  }
);

// Tool 5: Bulk search - multiple queries in parallel
server.registerTool(
  'bulk_search',
  {
    title: 'Bulk Semantic Search',
    description: `Run multiple semantic searches in parallel. Much faster than calling search_quotes multiple times.

Example: bulk_search(["patience adversity", "death mortality", "knowledge wisdom"])

Returns results grouped by query. Use this when you need quotes from multiple themes.`,
    inputSchema: {
      queries: z.array(z.string()).min(1).max(5).describe('Array of search queries (1-5 queries)'),
      limit_per_query: z.number().min(1).max(15).optional().describe('Results per query (default: 10)'),
    },
  },
  async ({ queries, limit_per_query }) => {
    const limit = limit_per_query ?? 10;

    // Run all searches in parallel
    const results = await Promise.all(
      queries.map(async (query) => {
        const quotes = await findQuotesLocal(query, {
          limit,
          minStandalone: 3,
          diverse: true,
        });
        return { query, quotes };
      })
    );

    // Format output grouped by query
    const output = results.map(({ query, quotes }) => {
      return `## "${query}" (${quotes.length} results)\n\n${formatQuotes(quotes)}`;
    }).join('\n\n---\n\n');

    return {
      content: [{ type: 'text', text: output }],
    };
  }
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
