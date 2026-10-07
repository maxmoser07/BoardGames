// Listet alle Zeichen auf, die nicht in sauberem deutschem Text vorkommen.
//
// Ersetzt die beiden Ad-hoc-Pruefungen waehrend der Encoding-Reparatur:
// gescannt wird das ganze Repository, nicht nur frontend/.
//
// Aufruf: node scripts/charset-check.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", "dist", "target", ".git", ".idea"]);
const EXTS = new Set([".ts", ".tsx", ".css", ".json", ".html", ".md", ".rs", ".sql"]);

/** Zeichen, die in deutschem Text und im Code vorkommen duerfen. */
const ALLOWED = new Set(
  [
    ...'äöüÄÖÜß', // Umlaute und scharfes s
    ...'–—„“”’‘', // Gedankenstrich, Anfuehrungszeichen
    ...'…·×°§±©®€→←', // Auslassungspunkte, Mittelpunkt, Malzeichen, Pfeile
  ].flatMap((s) => [...s]),
);

const offenders = new Map();

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else if (EXTS.has(extname(full))) onFile(full);
  }
}

walk(ROOT, (file) => {
  const rel = relative(ROOT, file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const ch of line) {
        const cp = ch.codePointAt(0);
        if (cp < 128 || ALLOWED.has(ch)) continue;
        const key = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
        if (!offenders.has(key)) offenders.set(key, { char: ch, where: [] });
        offenders.get(key).where.push(`${rel}:${i + 1}`);
      }
    });
});

if (offenders.size === 0) {
  console.log(`OK - alle Sonderzeichen in ${ROOT} sind gültig.`);
} else {
  for (const [code, { char, where }] of offenders) {
    console.log(`${code}  ${JSON.stringify(char).padEnd(8)} ${where.join(", ")}`);
  }
  console.log(`\n${offenders.size} unerwartete Zeichen.`);
  process.exitCode = 1;
}
