#!/usr/bin/env node
// Run this validator from the trusted main checkout before applying artifacts.
// Allow project and managed dependency version changes, matching README versions,
// and registry lockfile entries.
// Usage: node .github/scripts/verify-update.mjs <incoming-dir>
import fs from 'node:fs';
import path from 'node:path';
import { verifyLockfile } from './verify-lockfile.mjs';
// The config is read from the main checkout too, never from the artifact.
import { groups, displayNames } from '../deps-config.mjs';

const incoming = process.argv[2];
if (!incoming) fail('usage: verify-update.mjs <incoming-dir>');

// Only these dependency versions may change, and only to a caret range of a
// stable x.y.z.
const MANAGED = Object.values(groups).flat();
const CARET_VERSION = /^\^\d+\.\d+\.\d+$/;

verifyPackageJson();
try {
    verifyLockfile(
        'pnpm-lock.yaml',
        path.join(incoming, 'pnpm-lock.yaml'),
        readJson(path.join(incoming, 'package.json'))
    );
} catch (error) {
    fail(`pnpm-lock.yaml: ${error.message}`);
}
verifyReadme();
console.log('verify-update: OK');

// package.json may differ from main ONLY in `version` and the versions of the
// managed dependencies. Every other key — scripts, packageManager,
// private, name, the set of dependencies — must be byte-for-byte unchanged.
function verifyPackageJson() {
    const base = readJson('package.json');
    const next = readJson(path.join(incoming, 'package.json'));

    if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(String(next.version))) {
        fail(`package.json: version "${next.version}" is not a plain version number`);
    }

    // Compare everything except the dependency maps and version as raw JSON.
    const strip = (pkg) => ({ ...pkg, version: null, dependencies: null, devDependencies: null });
    if (JSON.stringify(strip(base)) !== JSON.stringify(strip(next))) {
        fail('package.json: a field other than version/dependencies changed');
    }

    verifyDeps('dependencies', base.dependencies, next.dependencies);
    verifyDeps('devDependencies', base.devDependencies, next.devDependencies);
}

// The dependency map may change only in the values of the managed packages,
// and only to a caret range. No package may be added or removed.
function verifyDeps(section, base = {}, next = {}) {
    const baseKeys = Object.keys(base).sort();
    const nextKeys = Object.keys(next).sort();
    if (JSON.stringify(baseKeys) !== JSON.stringify(nextKeys)) {
        fail(`package.json: ${section} added or removed a package`);
    }
    for (const name of nextKeys) {
        if (next[name] === base[name]) continue;
        if (!MANAGED.includes(name)) {
            fail(`package.json: ${section}.${name} changed but is not a managed dependency`);
        }
        if (!CARET_VERSION.test(next[name])) {
            fail(`package.json: ${section}.${name} = "${next[name]}" is not a caret version`);
        }
    }
}

// README may differ from main only in the versions the update script writes
// after "<Name> v" for the names in displayNames (see updateReadmeVersions in
// deps-check-and-update.mjs): a changed line must have such a version before
// and after, and nothing else on it may change.
function verifyReadme() {
    const baseLines = read('README.md').split('\n');
    const nextLines = read(path.join(incoming, 'README.md')).split('\n');
    if (baseLines.length !== nextLines.length) {
        fail('README.md: line count changed');
    }
    for (let i = 0; i < baseLines.length; i++) {
        if (baseLines[i] === nextLines[i]) continue;
        const before = blankVersions(baseLines[i]);
        const after = blankVersions(nextLines[i]);
        const bothVersionLines = before !== baseLines[i] && after !== nextLines[i];
        if (!bothVersionLines || before !== after) {
            fail(`README.md: unexpected change on line ${i + 1}`);
        }
    }
}

// "- [Vite v8.3.1](https://vitejs.dev)" -> "- [Vite v](https://vitejs.dev)"
function blankVersions(line) {
    for (const displayName of Object.values(displayNames)) {
        const pattern = new RegExp(`${escapeRegExp(displayName)} v\\d+(?:\\.\\d+)*`, 'g');
        line = line.replace(pattern, () => `${displayName} v`);
    }
    return line;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
    return JSON.parse(read(file));
}

function fail(message) {
    console.error(`verify-update: ${message}`);
    process.exit(1);
}
