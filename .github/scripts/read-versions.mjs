#!/usr/bin/env node
// Read package.json in the working directory and emit validated release outputs.
//   node .github/scripts/read-versions.mjs >> "$GITHUB_OUTPUT"
import fs from 'node:fs';
import { displayNames } from '../deps-config.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Same normalization as versionOf() in deps-check-and-update.mjs — keep in sync.
const versionOf = (spec) => String(spec || '').replace(/^[^\d]*/, ''); // "^1.9.4" -> "1.9.4"

// Only plain versions may reach the tag and GitHub Actions outputs.
const PROJECT_VERSION = /^\d+\.\d+\.\d+(\.\d+)?$/; // fourth segment: see deps-check-and-update.mjs
const DEP_VERSION = /^\d+\.\d+\.\d+$/;

const checked = (name, value, pattern) => {
    if (!pattern.test(value)) {
        console.error(`read-versions: ${name} is not a plain version number: "${value}"`);
        process.exit(1);
    }
    return value;
};

// Check everything before printing, so a bad value leaves no partial output.
const version = checked('version', String(pkg.version), PROJECT_VERSION);
const notes = Object.entries(displayNames).map(([name, displayName]) => {
    const spec = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    return `- ${displayName} v${checked(name, versionOf(spec), DEP_VERSION)}`;
});
console.log(`version=${version}`);
console.log(['notes<<EOF', ...notes, 'EOF'].join('\n'));
