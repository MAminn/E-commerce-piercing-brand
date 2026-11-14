import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * The production server (`pnpm start`) runs server/server.ts, but every
 * `#root/*` import resolves through package.json "imports" to ./build/* —
 * the unbuild (mkdist) output, which only contains the directories listed as
 * entries in build.config.ts (server/, shared/, backend/). A runtime import
 * from those directories into anything else (frontend/, pages/, components/,
 * ...) builds fine and passes vitest (which aliases #root to the source tree),
 * then crashes the container on boot with ERR_MODULE_NOT_FOUND. That is what
 * took down the 5605f6f deploy (backend → #root/frontend/tracking/purchase-event).
 *
 * Type-only imports are erased by the transpiler and are allowed.
 */

const ROOT = path.resolve(__dirname, "..");

function builtServerDirs(): string[] {
  const config = fs.readFileSync(path.join(ROOT, "build.config.ts"), "utf8");
  return [...config.matchAll(/input:\s*["']\.\/([\w-]+)["']/g)].map((m) => m[1] as string);
}

const isTestFile = (rel: string) =>
  /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (/\.([cm]?[jt]s|tsx|jsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(child);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** Module specifiers that survive transpilation (i.e. are loaded at runtime). */
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause?.isTypeOnly ||
        (clause &&
          !clause.name &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specs.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

/** Top-level repo directory a specifier lands in, or null for packages / node builtins. */
function targetTopDir(file: string, spec: string): string | null {
  let abs: string;
  if (spec.startsWith("#root/")) abs = path.join(ROOT, spec.slice("#root/".length));
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(file), spec);
  else return null;
  const rel = path.relative(ROOT, abs).split(path.sep);
  return rel[0] === ".." ? ".." : (rel[0] ?? null);
}

describe("production server runtime imports", () => {
  const dirs = builtServerDirs();

  it("reads the server build entries from build.config.ts", () => {
    expect(dirs).toEqual(expect.arrayContaining(["server", "shared", "backend"]));
  });

  it("only imports code that unbuild emits into ./build", () => {
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of listSourceFiles(dir)) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (isTestFile(rel)) continue;
        for (const spec of runtimeSpecifiers(file)) {
          const top = targetTopDir(file, spec);
          if (top !== null && !dirs.includes(top)) offenders.push(`${rel} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
