#!/usr/bin/env node
// Prints the project version and the leaflet/typescript/vite versions from
// package.json as GitHub Actions step outputs. Used by the Release workflow:
//   node .github/scripts/read-versions.mjs >> "$GITHUB_OUTPUT"
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Same normalization as versionOf() in deps-check-and-update.mjs — keep in sync.
const versionOf = (spec) => String(spec || '').replace(/^[^\d]*/, ''); // "^1.9.4" -> "1.9.4"

// The Release workflow turns these into a git tag and release notes, so only
// plain digits and dots may leave this script. Anything else — a range, a
// prerelease, a stray "$(...)" — fails the release instead of reaching the
// shell. Errors go to stderr: stdout is the $GITHUB_OUTPUT stream.
const PROJECT_VERSION = /^\d+\.\d+\.\d+(\.\d+)?$/; // fourth segment: see deps-check-and-update.mjs
const DEP_VERSION = /^\d+\.\d+\.\d+$/;

const checked = (name, value, pattern) => {
    if (!pattern.test(value)) {
        console.error(`read-versions: ${name} is not a plain version number: "${value}"`);
        process.exit(1);
    }
    return value;
};

const dev = pkg.devDependencies;
console.log(`version=${checked('version', String(pkg.version), PROJECT_VERSION)}`);
console.log(`leaflet=${checked('leaflet', versionOf(pkg.dependencies?.leaflet), DEP_VERSION)}`);
console.log(`typescript=${checked('typescript', versionOf(dev?.typescript), DEP_VERSION)}`);
console.log(`vite=${checked('vite', versionOf(dev?.vite), DEP_VERSION)}`);
