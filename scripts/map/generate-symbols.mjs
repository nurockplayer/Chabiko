import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(file);
  }
}
for (const directory of ['src', 'functions', 'scripts']) await collect(path.join(root, directory));
const rows = new Map();
function add(symbol, kind, file, line) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  rows.set(`${symbol}\t${kind}\t${relative}:${line}`, true);
}
for (const file of files) {
  const sourceText = await readFile(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  function visit(node) {
    const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
        if (node.name) add(node.name.text, ts.SyntaxKind[node.kind].replace('Declaration', '').toLowerCase(), file, line);
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) add(declaration.name.text, 'const', file, line);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const componentFiles = [];
async function collectComponents(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectComponents(file);
    else if (entry.name.endsWith('.astro')) componentFiles.push(file);
  }
}
await collectComponents(path.join(root, 'src/components'));
for (const file of componentFiles) add(path.basename(file, '.astro'), 'component', file, 1);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packageText = await readFile(path.join(root, 'package.json'), 'utf8');
for (const name of Object.keys(pkg.scripts)) {
  const line = packageText.slice(0, packageText.indexOf(`"${name}"`)).split('\n').length;
  add(name, 'script', path.join(root, 'package.json'), line);
}
const output = [...rows.keys()].sort((a, b) => a.localeCompare(b)).join('\n') + '\n';
await writeFile(path.join(root, 'docs/map/symbols.tsv'), output);
