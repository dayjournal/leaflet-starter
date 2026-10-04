import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';
import { parseDocument } from 'yaml';

const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const packageFields = [
    'resolution',
    'engines',
    'cpu',
    'os',
    'libc',
    'hasBin',
    'deprecated',
    'peerDependencies',
    'peerDependenciesMeta',
];
const snapshotFields = [
    'dependencies',
    'optionalDependencies',
    'optional',
    'transitivePeerDependencies',
];
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function verifyLockfile(baseFile, nextFile, manifest) {
    const base = readLockfile(baseFile);
    const next = readLockfile(nextFile);
    const metadata = ({ importers, packages, snapshots, ...rest }) => rest;
    check(next.lockfileVersion === '9.0', 'expected lockfile version 9.0');
    check(isDeepStrictEqual(metadata(base), metadata(next)), 'lockfile settings changed');

    const importers = mapping(next.importers);
    fields(importers, ['.']);
    const importer = mapping(importers['.']);
    fields(importer, dependencySections);
    const packages = mapping(next.packages);
    const snapshots = mapping(next.snapshots);

    for (const [id, entry] of Object.entries(packages)) {
        registryPackage(id);
        fields(entry, packageFields);
        fields(entry.resolution, ['integrity']);
        check(validIntegrity(entry.resolution.integrity), `${id}: invalid registry integrity`);
    }

    for (const [id, entry] of Object.entries(snapshots)) {
        const { baseId } = registryPackage(id, true);
        check(Object.hasOwn(packages, baseId), `${id}: missing package`);
        // pnpm merges snapshot fields into package metadata, so check both.
        fields(entry, snapshotFields);
        for (const section of ['dependencies', 'optionalDependencies']) {
            for (const [name, version] of Object.entries(mapping(entry[section] ?? {}))) {
                reference(name, version, snapshots);
            }
        }
        if (entry.optional !== undefined) {
            check(typeof entry.optional === 'boolean', `${id}: invalid optional flag`);
        }
        if (entry.transitivePeerDependencies !== undefined) {
            check(Array.isArray(entry.transitivePeerDependencies), `${id}: invalid peers`);
            check(
                entry.transitivePeerDependencies.every(isPackageName),
                `${id}: invalid peer name`
            );
        }
    }

    for (const section of dependencySections) {
        const declared = manifest[section] ?? {};
        const locked = mapping(importer[section] ?? {});
        check(
            isDeepStrictEqual(Object.keys(declared).sort(), Object.keys(locked).sort()),
            `${section}: dependencies differ from package.json`
        );
        for (const [name, entry] of Object.entries(locked)) {
            fields(entry, ['specifier', 'version']);
            check(
                entry.specifier === declared[name],
                `${name}: specifier differs from package.json`
            );
            const version = reference(name, entry.version, snapshots);
            check(
                semver.satisfies(version, entry.specifier),
                `${name}: version is outside its declared range`
            );
        }
    }
}

function readLockfile(file) {
    const document = parseDocument(fs.readFileSync(file, 'utf8'), {
        version: '1.2',
        schema: 'core',
        merge: false,
        resolveKnownTags: false,
        stringKeys: true,
        uniqueKeys: true,
    });
    check(
        document.errors.length === 0 && document.warnings.length === 0,
        'invalid or unsupported YAML'
    );
    return mapping(document.toJS({ maxAliasCount: 0 }));
}

function reference(name, version, snapshots) {
    check(typeof version === 'string', `${name}: expected a registry version`);
    const id = `${name}@${version}`;
    const parsed = registryPackage(id, true);
    check(Object.hasOwn(snapshots, id), `${id}: missing snapshot`);
    return parsed.version;
}

// Peer suffixes may nest: package@1.0.0(peer@2.0.0(other@3.0.0)).
function registryPackage(id, allowPeers = false) {
    const baseId = id.split('(')[0];
    const at = baseId.lastIndexOf('@');
    const name = baseId.slice(0, at);
    const version = baseId.slice(at + 1);
    const parsed = semver.parse(version);
    const canonical =
        parsed && parsed.version + (parsed.build.length ? `+${parsed.build.join('.')}` : '');
    check(isPackageName(name) && canonical === version, `${id}: expected a registry package`);
    let peers = id.slice(baseId.length);
    check(allowPeers || peers === '', `${id}: unexpected peer suffix`);
    while (peers) {
        const remaining = peers.replace(/\(([^()]*)\)/g, (_, peer) => {
            registryPackage(peer);
            return '';
        });
        check(remaining !== peers, `${id}: invalid peer suffix`);
        peers = remaining;
    }
    return { baseId, version };
}

function validIntegrity(value) {
    if (typeof value !== 'string') return false;
    const [algorithm, digest] = value.split('-');
    const length = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 }[algorithm];
    if (!length || !digest) return false;
    const bytes = Buffer.from(digest, 'base64');
    return bytes.length === length && `${algorithm}-${bytes.toString('base64')}` === value;
}

function isPackageName(value) {
    return typeof value === 'string' && packageName.exec(value)?.[0] === value;
}

function mapping(value) {
    check(
        value !== null && typeof value === 'object' && !Array.isArray(value),
        'expected a mapping'
    );
    return value;
}

function fields(value, allowed) {
    for (const key of Object.keys(mapping(value))) {
        check(allowed.includes(key), `unsupported field: ${key}`);
    }
}

function check(condition, message) {
    if (!condition) throw new Error(message);
}
