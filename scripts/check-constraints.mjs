#!/usr/bin/env node
/**
 * Repo-wide gate for the no-cast constraint documented in CLAUDE.md:
 * no `as` type assertions, no non-null (`!`) assertions, no `@ts-ignore`,
 * no `any` — anywhere in src/ or worker/, tests included.
 *
 * Written in Node rather than as a shell one-liner on purpose: npm runs
 * scripts through cmd.exe on Windows and sh on CI, and a `! rg ... | rg -v ...`
 * pipeline only works in one of those. Node is already a hard requirement and
 * this adds no dependency.
 *
 * Exits 1 (listing every violation) when the tree is dirty, 0 when it is clean.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const ROOTS = ["src", "worker"];
const EXTENSIONS = [".ts", ".tsx"];

const RULES = [
  // `as Foo` type assertions. `as const` is a const assertion, not a type
  // assertion, and is allowed. Import aliases (`import x as y`, `export * as`)
  // are not casts either.
  {
    name: "as-cast",
    pattern: /\bas\s+[A-Z][A-Za-z0-9_]*/g,
    allow: (match, line) =>
      /\bas\s+const\b/.test(match) || /^\s*(import|export)\b/.test(line),
  },
  { name: "as-any", pattern: /\bas\s+any\b/g },
  // Non-null assertions: `foo()!.bar`, `arr[0]!;`, `x!)`. Anchored on both
  // sides so that `!==`, `if (!x)` and a `!` inside a string do not match.
  { name: "non-null-assertion", pattern: /[)\]\w]!\s*[.;,)\]]/g },
  // Runs against the raw line: a suppression directive only ever
  // appears inside a comment, which the stripper would otherwise blank out.
  { name: "ts-ignore", pattern: /@ts-ignore|@ts-nocheck/g, raw: true },
  { name: "any-type", pattern: /:\s*any\b|<any[,>]|\bany\[\]/g },
];

// The single sanctioned exception, documented in CLAUDE.md: the narrowing cast
// inside isAppState, immediately followed by the checks that justify it.
const ALLOWED_EXACT = new Set([`src${sep}shared${sep}types.ts::as Record<string, unknown>`]);

/**
 * Blanks out comments so prose cannot trip the rules ("en-CA formats as
 * YYYY-MM-DD" is not a cast). Quote-aware, so a `//` inside a string literal
 * (a URL, say) does not truncate the rest of the line. `inBlock` carries block
 * comment state across lines.
 */
function stripComments(line, inBlock) {
  let out = "";
  let quote = null;
  let block = inBlock;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (block) {
      if (char === "*" && next === "/") {
        block = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") break;
    if (char === "/" && next === "*") {
      block = true;
      i += 1;
      continue;
    }
    out += char;
  }
  return { code: out, inBlock: block };
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    const rel = relative(repoRoot, file);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let inBlock = false;
    lines.forEach((rawLine, index) => {
      const stripped = stripComments(rawLine, inBlock);
      inBlock = stripped.inBlock;
      const line = stripped.code;
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        const haystack = rule.raw ? rawLine : line;
        for (const match of haystack.matchAll(rule.pattern)) {
          const text = match[0].trim();
          if (rule.allow && rule.allow(text, haystack)) continue;
          // `as Record<string, unknown>` needs the generic args, which the
          // rule's pattern stops short of — re-read them off the line.
          const fullMatch = haystack.slice(match.index).match(/^as\s+Record<string,\s*unknown>/);
          const key = `${rel}::${fullMatch ? fullMatch[0] : text}`;
          if (ALLOWED_EXACT.has(key)) continue;
          violations.push(`${rel}:${index + 1}  ${rule.name}  ${rawLine.trim()}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `Constraint violations (${violations.length}) — see CLAUDE.md "No-cast constraint":`,
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log("constraints ok: no as-casts, non-null assertions, @ts-ignore or any in src/ or worker/");
