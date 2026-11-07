#!/usr/bin/env node
// Fails when the React Compiler bails out of a component or hook in src/.
//
// Production builds run the compiler with panicThreshold 'NONE' (babel-preset-expo), so a
// function it cannot compile ships unmemoised without a word. That is how the scrubber's
// pan config ended up re-sent to native on every render: one eslint suppression in
// SolarTimeline. This runs the same plugin, with the same options, over every source file
// and reports each bailout. A function that must stay uncompiled says so with the
// 'use no memo' directive, which the compiler logs as a skip rather than an error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { transformAsync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'test-utils') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// A function that fails to compile under an opt-out directive is retried and dropped
// without the compiler logging the skip, so the directive is read from the source here:
// it is the first statement of the function body: the first code line after the line that
// opens the body, however many lines the signature wraps onto.
const OPT_OUT = /^\s*['"](use no memo|use no forget)['"]/;
function optedOut(lines, fnLoc) {
  if (!fnLoc) return false;
  let line = fnLoc.start.line;
  while (line < fnLoc.end.line && !(lines[line - 1] ?? '').trimEnd().endsWith('{')) line++;
  for (line += 1; line <= fnLoc.end.line; line++) {
    const text = (lines[line - 1] ?? '').trim();
    if (text === '' || text.startsWith('//')) continue;
    return OPT_OUT.test(text);
  }
  return false;
}

const findings = [];
for (const file of sourceFiles(srcRoot)) {
  const errors = [];
  const code = readFileSync(file, 'utf8');
  const lines = code.split('\n');
  await transformAsync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [
      [
        reactCompiler,
        {
          // Mirrors babel-preset-expo's getReactCompilerPlugin for a production build.
          target: '19',
          panicThreshold: 'none',
          customOptOutDirectives: ['widget', 'use no memo', 'use no forget'],
          logger: {
            logEvent(_filename, event) {
              if (event.kind === 'CompileError' || event.kind === 'PipelineError') errors.push(event);
            },
          },
        },
      ],
    ],
  });
  const seen = new Set();
  for (const error of errors) {
    if (optedOut(lines, error.fnLoc)) continue;
    const loc = error.fnLoc?.start;
    const detail = error.kind === 'PipelineError' ? error.data : (error.detail.reason ?? String(error.detail));
    const finding = `${path.relative(projectRoot, file)}:${loc?.line ?? 0}:${(loc?.column ?? 0) + 1} — ${detail}`;
    if (seen.has(finding)) continue;
    seen.add(finding);
    findings.push(finding);
  }
}

if (findings.length === 0) {
  console.log('React Compiler compiles every component and hook in src/.');
  process.exit(0);
}
for (const finding of findings) console.error(finding);
console.error(
  `\n${findings.length} function(s) the React Compiler skips. Fix the cause, or mark a deliberate exception with 'use no memo'.`,
);
process.exitCode = 1;
