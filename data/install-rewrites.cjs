const fs = require('fs');

const rewrites = [
  'ormboet-i-hjartat',
  'sjalens-infargning',
  'strindbergs-enda-steg',
  'stillheten-fore-slutet',
  'silvertarnans-hijra',
  'kompassnalens-moske',
  'vintergatan-vi-slackte',
  'somnens-lilla-dod',
  'skapad-ur-ingenting',
];

for (const slug of rewrites) {
  const rewritePath = `data/rewrite-output/${slug}-v2.md`;
  const articlePath = `data/articles/${slug}.md`;

  if (!fs.existsSync(rewritePath)) {
    console.log(`SKIP: ${rewritePath} not found`);
    continue;
  }

  // Read existing article for frontmatter fields
  const existing = fs.readFileSync(articlePath, 'utf8');
  const dateMatch = existing.match(/publishedAt: "([^"]+)"/);
  const date = dateMatch ? dateMatch[1] : '2025-08-01T12:00:00.000Z';
  const audioMatch = existing.match(/audioFile: "([^"]+)"/);

  // Read rewrite output
  const rewrite = fs.readFileSync(rewritePath, 'utf8');

  // Extract title from rewrite (# heading)
  const titleMatch = rewrite.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : slug;

  // Extract body: everything from "# Title" to the end
  const bodyStart = rewrite.indexOf('\n# ');
  if (bodyStart === -1) {
    console.log(`SKIP: ${slug} - no body found`);
    continue;
  }
  const body = rewrite.slice(bodyStart + 1); // skip the leading newline

  // Count words in body (rough)
  const wordCount = body.split(/\s+/).filter(w => w.length > 0 && !w.startsWith('[^')).length;

  // Extract description from first paragraph
  const firstPara = body.split('\n\n')[1] || ''; // skip title line
  const desc = firstPara.slice(0, 250).replace(/\n/g, ' ').replace(/\*/g, '').trim();

  // Build new article
  let frontmatter = `---
title: "${title}"
publishedAt: "${date}"
wordCount: ${wordCount}
qualityScore: 8.9
description: "${desc.replace(/"/g, '\\"')}"`;

  if (audioMatch) {
    frontmatter += `\naudioFile: "${audioMatch[1]}"`;
  }

  frontmatter += '\n---\n';

  // Body without the "# Title" line (it's in frontmatter)
  const bodyWithoutTitle = body.replace(/^# .+\n+/, '');

  const final = frontmatter + bodyWithoutTitle;
  fs.writeFileSync(articlePath, final);
  console.log(`OK: ${slug} (${wordCount}w, "${title}")`);
}
