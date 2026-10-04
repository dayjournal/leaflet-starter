import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { groups } from '../deps-config.mjs';

const verifier = fileURLToPath(new URL('./verify-update.mjs', import.meta.url));
const dependency = Object.values(groups).flat()[0];
const manifest = {
    name: 'fixture',
    version: '1.0.0',
    private: true,
    dependencies: { [dependency]: '^1.2.3' },
};
const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
const lockfile = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      '${dependency}':
        specifier: ^1.2.3
        version: 1.2.3
packages:
  '${dependency}@1.2.3':
    resolution: {integrity: ${integrity}}
  helper@2.0.0-beta.1:
    resolution: {integrity: ${integrity}}
    peerDependencies:
      peer: ^1.0.0
  peer@1.0.0:
    resolution: {integrity: ${integrity}}
snapshots:
  '${dependency}@1.2.3':
    dependencies:
      helper: 2.0.0-beta.1(peer@1.0.0)
  helper@2.0.0-beta.1(peer@1.0.0):
    dependencies:
      peer: 1.0.0
  peer@1.0.0: {}
`;
const nestedPeers = lockfile
    .replace(
        'packages:\n',
        `packages:\n  other@3.0.0:\n    resolution: {integrity: ${integrity}}\n`
    )
    .replaceAll('2.0.0-beta.1(peer@1.0.0)', '2.0.0-beta.1(peer@1.0.0(other@3.0.0))')
    .replace('peer: 1.0.0', 'peer: 1.0.0(other@3.0.0)')
    .replace(
        '  peer@1.0.0: {}',
        '  peer@1.0.0(other@3.0.0):\n    dependencies:\n      other: 3.0.0\n  other@3.0.0: {}'
    );

function verify(lock, nextManifest = manifest) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-update-test-'));
    try {
        const incoming = path.join(directory, 'incoming');
        fs.mkdirSync(incoming);
        for (const [folder, pkg] of [
            [directory, manifest],
            [incoming, nextManifest],
        ]) {
            fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify(pkg));
            fs.writeFileSync(path.join(folder, 'README.md'), 'Fixture\n');
        }
        fs.writeFileSync(path.join(directory, 'pnpm-lock.yaml'), lockfile);
        fs.writeFileSync(path.join(incoming, 'pnpm-lock.yaml'), lock);
        return spawnSync(process.execPath, [verifier, incoming], {
            cwd: directory,
            encoding: 'utf8',
        });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

function rejected(name, lock) {
    test(name, () => {
        const result = verify(lock);
        assert.equal(result.status, 1, result.stderr || result.stdout);
        assert.match(result.stderr, /pnpm-lock\.yaml:/);
        assert.doesNotMatch(result.stdout, /verify-update: OK/);
    });
}

for (const [name, lock] of [
    ['registry packages, prereleases and peer suffixes', lockfile],
    [
        'transitive semver build metadata',
        lockfile.replaceAll('2.0.0-beta.1', '2.0.0-beta.1+build.1'),
    ],
    ['nested peer suffixes', nestedPeers],
    ['quoted registry resolution keys', lockfile.replaceAll('{integrity:', '{"integrity":')],
    [
        'block registry resolutions',
        lockfile.replaceAll(`{integrity: ${integrity}}`, `\n      integrity: ${integrity}`),
    ],
]) {
    test(`accepts ${name}`, () => {
        const result = verify(lock);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /verify-update: OK/);
    });
}

test('accepts a managed version update with a matching importer', () => {
    const next = { ...manifest, dependencies: { [dependency]: '^1.2.4' } };
    const result = verify(lockfile.replaceAll('1.2.3', '1.2.4'), next);
    assert.equal(result.status, 0, result.stderr);
});

test('accepts a resolved version within the importer range', () => {
    const lock = lockfile
        .replaceAll('1.2.3', '1.4.0')
        .replace('specifier: ^1.4.0', 'specifier: ^1.2.3');
    const result = verify(lock);
    assert.equal(result.status, 0, result.stderr);
});

for (const resolution of [
    '{"tarball": "https://example.invalid/package.tgz"}',
    '{"ta\\u0072ball": "https://example.invalid/package.tgz"}',
    '\n      "tarball": https://example.invalid/package.tgz',
    '{"type": "git", "repo": "https://example.invalid/repository"}',
    '{"directory": "../local"}',
]) {
    rejected(
        `rejects non-registry resolution ${JSON.stringify(resolution)}`,
        lockfile.replace(`{integrity: ${integrity}}`, resolution)
    );
}

for (const source of [
    'https://example.invalid/package.tgz',
    'git+https://example.invalid/repository#abcdef',
    'file:../local',
    'link:../local',
]) {
    rejected(
        `rejects importer source ${source}`,
        lockfile.replace('version: 1.2.3', `version: '${source}'`)
    );
    rejected(
        `rejects package source ${source}`,
        lockfile.replace('  helper@2.0.0-beta.1:\n', `  'helper@${source}':\n`)
    );
    rejected(
        `rejects snapshot dependency source ${source}`,
        lockfile.replace('helper: 2.0.0-beta.1(peer@1.0.0)', `helper: '${source}'`)
    );
}

for (const [name, before, after] of [
    [
        'duplicate mapping keys',
        "lockfileVersion: '9.0'",
        "lockfileVersion: '9.0'\nlockfileVersion: '9.0'",
    ],
    ['multiple importers', 'importers:\n', 'importers:\n  other: {}\n'],
    ['changed lockfile settings', 'autoInstallPeers: true', 'autoInstallPeers: false'],
    [
        'an importer specifier that differs from package.json',
        'specifier: ^1.2.3',
        'specifier: ^1.2.4',
    ],
    [
        'an importer missing a dependency',
        `      '${dependency}':\n        specifier: ^1.2.3\n        version: 1.2.3`,
        '      other:\n        specifier: ^1.2.3\n        version: 1.2.3',
    ],
    ['a non-string version', 'version: 1.2.3', 'version: [1.2.3]'],
    ['a non-string integrity', `integrity: ${integrity}`, 'integrity: [invalid]'],
    ['a missing package resolution', `resolution: {integrity: ${integrity}}`, 'resolution: {}'],
    [
        'a custom YAML tag',
        `resolution: {integrity: ${integrity}}`,
        `resolution: !custom {integrity: ${integrity}}`,
    ],
    [
        'a resolution field in a snapshot',
        `  '${dependency}@1.2.3':\n    dependencies:`,
        `  '${dependency}@1.2.3':\n    resolution: {"tarball": "https://example.invalid/package.tgz"}\n    dependencies:`,
    ],
    [
        'a snapshot reference that does not exist',
        'helper: 2.0.0-beta.1(peer@1.0.0)',
        'helper: 3.0.0(peer@1.0.0)',
    ],
    [
        'a snapshot key with a URL',
        '  helper@2.0.0-beta.1(peer@1.0.0):',
        "  'helper@https://example.invalid/package.tgz':",
    ],
]) {
    rejected(`rejects ${name}`, lockfile.replace(before, after));
}

rejected(
    'rejects YAML aliases',
    lockfile
        .replace(
            `resolution: {integrity: ${integrity}}`,
            `resolution: &registry {integrity: ${integrity}}`
        )
        .replace(`resolution: {integrity: ${integrity}}`, 'resolution: *registry')
);

rejected(
    'rejects a resolved version outside the importer range',
    lockfile.replaceAll('1.2.3', '2.0.0').replace('specifier: ^2.0.0', 'specifier: ^1.2.3')
);

rejected(
    'rejects a package name with a trailing newline',
    lockfile
        .replace('  helper@2.0.0-beta.1:\n', '  "helper\\n@2.0.0-beta.1":\n')
        .replace(
            '  helper@2.0.0-beta.1(peer@1.0.0):\n',
            '  "helper\\n@2.0.0-beta.1(peer@1.0.0)":\n'
        )
        .replace(
            '      helper: 2.0.0-beta.1(peer@1.0.0)',
            '      "helper\\n": 2.0.0-beta.1(peer@1.0.0)'
        )
);

for (const section of ['importers', 'packages', 'snapshots']) {
    const pattern = new RegExp(`${section}:\\n[\\s\\S]*?(?=\\n[a-zA-Z]|$)`);
    rejected(`rejects an array in ${section}`, lockfile.replace(pattern, `${section}: []\n`));
}
