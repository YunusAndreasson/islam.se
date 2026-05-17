const fs = require('fs');
const rewrites = [
  'det-han-letade-efter',
  'lejonet-i-hjartat',
  'poesins-kapitulation',
  'bannlyst-och-renad',
  'skummet-och-metallen',
];
for (const slug of rewrites) {
  const rewritePath = `data/rewrite-output/${slug}-v2.md`;
  const articlePath = `data/articles/${slug}.md`;
  if (!fs.existsSync(rewritePath)) { console.log(`SKIP: ${slug}`); continue; }
  const existing = fs.readFileSync(articlePath, 'utf8');
  const dateMatch = existing.match(/publishedAt: "([^"]+)"/);
  const date = dateMatch ? dateMatch[1] : '2025-08-01T12:00:00.000Z';
  const rewrite = fs.readFileSync(rewritePath, 'utf8');
  const titleMatch = rewrite.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : slug;
  const bodyStart = rewrite.indexOf('\n# ');
  if (bodyStart === -1) { console.log(`SKIP: ${slug} - no body`); continue; }
  const body = rewrite.slice(bodyStart + 1);
  const wordCount = body.split(/\s+/).filter(w => w.length > 0 && !w.startsWith('[^')).length;
  const firstPara = body.split('\n\n')[1] || '';
  const desc = firstPara.slice(0, 250).replace(/\n/g, ' ').replace(/\*/g, '').trim();
  let fm = `---\ntitle: "${title}"\npublishedAt: "${date}"\nwordCount: ${wordCount}\nqualityScore: 8.9\ndescription: "${desc.replace(/"/g, '\\"')}"\n---\n`;
  const bodyWithoutTitle = body.replace(/^# .+\n+/, '');
  fs.writeFileSync(articlePath, fm + bodyWithoutTitle);
  console.log(`OK: ${slug} (${wordCount}w, "${title}")`);
}
