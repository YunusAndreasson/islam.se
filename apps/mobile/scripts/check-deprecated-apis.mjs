#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error(`No tsconfig.json found under ${projectRoot}`);

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const findings = new Map();

function deprecatedTag(symbol) {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  // Only a tag on the symbol's own declarations counts, as in the editor's strikethrough.
  // `getJsDocTags()` also hands back the tags of a base member that a declaration
  // overrides without a comment of its own: react-native-svg's RectProps and TextProps
  // redeclare x/y as plain positions, and TransformProps.x/y's deprecation came along.
  const tag = (resolved.declarations ?? [])
    .map((declaration) => ts.getJSDocDeprecatedTag(declaration))
    .find(Boolean);
  if (!tag) return null;
  const detail = ts.getTextOfJSDocComment(tag.comment)?.trim();
  return { symbol: resolved.getName(), detail: detail || 'Deprecated API' };
}

function resolvedCallFor(node) {
  if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
    return node.parent;
  }
  if (
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.name === node &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  ) {
    return node.parent.parent;
  }
  return null;
}

function isDeprecatedUse(node) {
  const call = resolvedCallFor(node);
  if (!call) return true;

  // Overloaded functions can carry a deprecation tag on only one overload.
  // TypeScript merges that tag onto the symbol, so inspect the signature
  // selected for this call before reporting it.
  const signature = checker.getResolvedSignature(call);
  if (!signature) return true;
  const signatureTags = signature.getJsDocTags();
  const hasDeprecatedSignature = signatureTags.some((entry) => entry.name === 'deprecated');
  return hasDeprecatedSignature;
}

// A JSX attribute or an option-object key resolves, through
// `getSymbolAtLocation`, to the *local* attribute or property it declares — not
// to the prop or option it fills — so a deprecated prop (`<Canvas onLayout>`)
// or config key (`interruptionModeAndroid`) passed the check above in silence.
// Those are looked up on the type the value is being written into instead.
// The name in an import or export is not a use: what it names is checked where
// it is called or read. Counting it reported the import of any function with one
// deprecated overload, even when every call resolved to a current one.
function isImportOrExportName(node) {
  const parent = node.parent;
  return (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportSpecifier(parent)
  );
}

function deprecatedMemberOf(type, name) {
  if (!type) return null;
  const parts = type.isUnion() ? type.types : [type];
  for (const part of parts) {
    const property = checker.getPropertyOfType(checker.getApparentType(part), name);
    const deprecated = property ? deprecatedTag(property) : null;
    if (deprecated) return deprecated;
  }
  return null;
}

function writtenMember(node) {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
    return { nameNode: node.name, type: checker.getContextualType(node.parent) };
  }
  const isMember =
    (ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node)) &&
    ts.isObjectLiteralExpression(node.parent) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name));
  if (isMember) {
    return { nameNode: node.name, type: checker.getContextualType(node.parent) };
  }
  return null;
}

for (const sourceFile of program.getSourceFiles()) {
  if (
    sourceFile.isDeclarationFile ||
    sourceFile.fileName.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    continue;
  }

  const lines = sourceFile.text.split('\n');
  const record = (node, deprecated) => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    // A use that cannot move yet (the replacement does not exist until the
    // dependency's next major) carries `deprecated-api-allowed: <why>` in a
    // comment on its own line or the line above. The reason is required, so the
    // exception says what has to happen before it can go.
    const marked = [lines[start.line], lines[start.line - 1]].some((text) =>
      /deprecated-api-allowed:\s*\S/.test(text ?? ''),
    );
    if (marked) return;
    const relative = path.relative(projectRoot, sourceFile.fileName);
    const key = `${relative}:${start.line + 1}:${start.character + 1}:${deprecated.symbol}`;
    findings.set(key, {
      file: relative,
      line: start.line + 1,
      column: start.character + 1,
      ...deprecated,
    });
  };

  const visit = (node) => {
    const member = writtenMember(node);
    if (member) {
      const deprecated = deprecatedMemberOf(member.type, member.nameNode.text);
      if (deprecated) record(member.nameNode, deprecated);
    }
    // Checking only identifier references avoids reporting an entire property
    // access twice while still resolving imported functions, members, types,
    // and enum values through TypeScript's real module graph.
    if (ts.isIdentifier(node) && !isImportOrExportName(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const deprecated = symbol ? deprecatedTag(symbol) : null;
      if (deprecated && isDeprecatedUse(node)) record(node, deprecated);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (findings.size === 0) {
  console.log('No deprecated dependency APIs found.');
  process.exit(0);
}

for (const finding of findings.values()) {
  console.error(
    `${finding.file}:${finding.line}:${finding.column} ${finding.symbol} — ${finding.detail}`,
  );
}
console.error(`\nFound ${findings.size} deprecated dependency API reference(s).`);
process.exitCode = 1;
