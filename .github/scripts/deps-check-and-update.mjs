#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const PKG_PATH = path.join(ROOT, 'package.json');
const README_PATH = path.join(ROOT, 'README.md');
const ART_DIR = path.join(ROOT, 'artifacts');
const ART_PATH = path.join(ART_DIR, 'deps-update.json');

const TARGETS = [
  { name: 'leaflet', section: 'dependencies' },
  { name: 'typescript', section: 'devDependencies' },
  { name: 'vite', section: 'devDependencies' },
];

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function normalizeSpec(spec) {
  return String(spec || '').replace(/^[^\d]*/, ''); // "^1.9.4" -> "1.9.4"
}

function semverParts(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpPatch(v) {
  const { major, minor, patch } = semverParts(v);
  return `${major}.${minor}.${patch + 1}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function replaceReadme(readme, versions) {
  // Update both English and Japanese parts; it appears twice in README.
  readme = readme.replace(/Leaflet v[\d.]+/g, `Leaflet v${versions.leaflet}`);
  readme = readme.replace(/TypeScript v[\d.]+/g, `TypeScript v${versions.typescript}`);
  readme = readme.replace(/Vite v[\d.]+/g, `Vite v${versions.vite}`);
  return readme;
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));

const current = {};
for (const t of TARGETS) {
  current[t.name] = normalizeSpec(pkg?.[t.section]?.[t.name]);
}

const latest = {};
for (const t of TARGETS) {
  latest[t.name] = sh(`npm view ${t.name} version`);
}

let changed = false;
let leafletChanged = false;

for (const t of TARGETS) {
  const cur = current[t.name];
  const lat = latest[t.name];
  if (!cur || !lat) continue;
  if (cur !== lat) {
    pkg[t.section][t.name] = `^${lat}`;
    changed = true;
    if (t.name === 'leaflet') leafletChanged = true;
  }
}

ensureDir(ART_DIR);

if (!changed) {
  fs.writeFileSync(ART_PATH, JSON.stringify({
    changed: false,
    current,
    latest,
    install_ok: true,
    build_ok: null,
    visual_ok: null,
  }, null, 2));
  console.log('No dependency updates.');
  process.exit(0);
}

// project version rule
const prevVersion = pkg.version;
if (leafletChanged) {
  pkg.version = latest.leaflet;
} else {
  pkg.version = bumpPatch(pkg.version);
}

// write package.json
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// update README
const versionsForReadme = {
  leaflet: normalizeSpec(pkg.dependencies?.leaflet),
  typescript: normalizeSpec(pkg.devDependencies?.typescript),
  vite: normalizeSpec(pkg.devDependencies?.vite),
};
const readme = fs.readFileSync(README_PATH, 'utf8');
fs.writeFileSync(README_PATH, replaceReadme(readme, versionsForReadme), 'utf8');

// npm install (updates package-lock.json)
let install_ok = true;
try {
  execSync('npm install', { stdio: 'inherit' });
} catch (e) {
  install_ok = false;
  console.error('npm install failed (will still create PR to notify).');
}

fs.writeFileSync(ART_PATH, JSON.stringify({
  changed: true,
  current,
  latest,
  prev_version: prevVersion,
  next_version: pkg.version,
  install_ok,
  versions_for_readme: versionsForReadme,
}, null, 2));

process.exit(install_ok ? 0 : 11);
