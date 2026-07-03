#!/usr/bin/env node
// Prints the project version and the leaflet/typescript/vite versions from
// package.json as GitHub Actions step outputs. Used by the Release workflow:
//   node .github/scripts/read-versions.mjs >> "$GITHUB_OUTPUT"
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Same normalization as versionOf() in deps-check-and-update.mjs — keep in sync.
const versionOf = (spec) => String(spec || '').replace(/^[^\d]*/, ''); // "^1.9.4" -> "1.9.4"

console.log(`version=${pkg.version}`);
console.log(`leaflet=${versionOf(pkg.dependencies?.leaflet)}`);
console.log(`typescript=${versionOf(pkg.devDependencies?.typescript)}`);
console.log(`vite=${versionOf(pkg.devDependencies?.vite)}`);
