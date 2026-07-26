#!/usr/bin/env node
// Trusted validator for the deps auto-update flow. Runs in the publish job —
// from the trusted main checkout, NOT from the artifact — before the result
// files are copied into place (see the Verify step in deps-autoupdate.yml).
//
// The update job installs, builds and tests freshly-published third-party
// code, so anything it produces (package.json, pnpm-lock.yaml, README.md) is
// attacker-influenced data. package.json and the lockfile are not inert text:
// they decide what later runs execute. A compromised release could add a
// `scripts.postinstall`, downgrade `packageManager` to disable the
// pnpm-workspace.yaml supply-chain gates, add a dependency, or point the
// lockfile at a non-registry tarball — and the whole thing would auto-merge.
//
// This rejects any change beyond the narrow shape a real update has: the
// project version, the four managed dependency versions, and the matching
// README version lines. Anything else fails the run and nothing is merged.
//
//   node .github/scripts/verify-update.mjs <incoming-dir>
import fs from 'node:fs';
import path from 'node:path';

const incoming = process.argv[2];
if (!incoming) fail('usage: verify-update.mjs <incoming-dir>');

// Only these dependency versions may change, and only to a caret range of a
// stable x.y.z. Keep in sync with GROUPS in deps-check-and-update.mjs.
const MANAGED = ['leaflet', '@types/leaflet', 'typescript', 'vite'];
const CARET_VERSION = /^\^\d+\.\d+\.\d+$/;

verifyPackageJson();
verifyLockfile();
verifyReadme();
console.log('verify-update: OK');

// package.json may differ from main ONLY in `version` and the versions of the
// four managed dependencies. Every other key — scripts, packageManager,
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

// The lockfile must reference registry packages only — never a tarball URL,
// git, link, file or path resolution that could pull in arbitrary code.
function verifyLockfile() {
    const lock = read(path.join(incoming, 'pnpm-lock.yaml'));
    const forbidden = [/tarball:/, /resolution:\s*\{\s*type:\s*git/, /\bgit\+/, /\blink:/, /\bfile:/];
    for (const pattern of forbidden) {
        const line = lock.split('\n').find((l) => pattern.test(l));
        if (line) fail(`pnpm-lock.yaml: non-registry source: ${line.trim()}`);
    }
}

// README may differ from main only in the three version lines the update
// script rewrites (see updateReadmeVersions in deps-check-and-update.mjs).
function verifyReadme() {
    const baseLines = read('README.md').split('\n');
    const nextLines = read(path.join(incoming, 'README.md')).split('\n');
    if (baseLines.length !== nextLines.length) {
        fail('README.md: line count changed');
    }
    const versionLine = /(Leaflet|TypeScript|Vite) v[\d.]+/;
    for (let i = 0; i < baseLines.length; i++) {
        if (baseLines[i] === nextLines[i]) continue;
        if (!versionLine.test(baseLines[i]) || !versionLine.test(nextLines[i])) {
            fail(`README.md: unexpected change on line ${i + 1}`);
        }
    }
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
