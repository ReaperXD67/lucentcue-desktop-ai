import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const expectedArtifacts = new Map([
  ['lucentcue-windows-x64-unsigned', { exe: 1 }],
  ['lucentcue-macos-x64-arm64-unsigned', { dmg: 2 }],
  ['lucentcue-linux-x64-unsigned', { AppImage: 1, deb: 1 }],
]);
const assert = (condition, reason) => {
  if (!condition) throw new Error(reason);
};
const gh = (args, inherit = false) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    shell: false,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16_000_000,
  });
const api = (endpoint) => JSON.parse(gh(['api', '--method', 'GET', endpoint]));

// GitHub normalizes spaces in uploaded asset names. Normalize before hashing so
// the manifest names match the names users actually download.
export const releaseFilename = (name) => name.replace(/[^A-Za-z0-9._-]/g, '.');

export function validateRun(run, repository) {
  assert(run.path === '.github/workflows/build.yml', 'Source is not the native-package workflow.');
  assert(run.event === 'workflow_dispatch', 'Source run was not manually dispatched.');
  assert(
    run.status === 'completed' && run.conclusion === 'success',
    'Source run must be completed and successful.',
  );
  assert(
    run.head_repository?.full_name?.toLowerCase() === repository.toLowerCase(),
    'Source run belongs to another repository.',
  );
  assert(run.head_branch === 'main', 'Source run must come from main.');
  assert(/^[a-f0-9]{40}$/i.test(run.head_sha), 'Source commit is invalid.');
}

export function validateVersionTag(version, tag) {
  assert(
    typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version),
    'Source package version is invalid.',
  );
  const previewPrefix = `v${version}-preview.`;
  const previewNumber = tag.startsWith(previewPrefix) ? tag.slice(previewPrefix.length) : '';
  assert(
    tag === `v${version}` || (/^\d+\.\d+\.\d+$/.test(version) && /^[1-9]\d*$/.test(previewNumber)),
    'Tag must match the source package version, optionally with -preview.N.',
  );
}

export function validateRelease(release, tag) {
  assert(
    release.tag_name === tag && release.draft === true && release.prerelease === true,
    'Target must be the existing matching draft prerelease.',
  );
  assert(
    Number.isSafeInteger(release.id) && Array.isArray(release.assets),
    'Release metadata is invalid.',
  );
}

async function collectFiles(directory) {
  const files = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    assert(!info.isSymbolicLink(), 'Artifact contains a symbolic link.');
    if (info.isDirectory()) files.push(...(await collectFiles(path)));
    else {
      assert(info.isFile() && info.size > 0, 'Artifact contains an empty or unsupported entry.');
      files.push(path);
    }
    assert(files.length <= 5, 'Artifact contains unexpected files.');
  }
  return files;
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const repository = process.env.GH_REPO || '';
  const runId = process.env.SOURCE_RUN_ID || '';
  const tag = process.env.PREVIEW_TAG || '';
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository), 'Invalid current repository.');
  assert(/^[1-9]\d*$/.test(runId), 'Run ID must be numeric.');
  assert(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag), 'Invalid preview tag.');

  const root = `repos/${repository}`;
  const run = api(`${root}/actions/runs/${runId}`);
  validateRun(run, repository);
  const sourcePackage = api(`${root}/contents/package.json?ref=${run.head_sha}`);
  assert(
    sourcePackage.type === 'file' &&
      sourcePackage.encoding === 'base64' &&
      sourcePackage.size < 1_000_000,
    'Source package metadata is invalid.',
  );
  const { version } = JSON.parse(Buffer.from(sourcePackage.content, 'base64').toString('utf8'));
  validateVersionTag(version, tag);
  const releases = api(`${root}/releases?per_page=100`);
  assert(Array.isArray(releases), 'Invalid release list.');
  const matching = releases.filter((release) => release.tag_name === tag);
  assert(matching.length === 1, 'Expected exactly one existing matching release.');
  const initialRelease = matching[0];
  validateRelease(initialRelease, tag);
  assert(
    initialRelease.target_commitish === run.head_sha,
    'Draft must target the exact source commit.',
  );
  const releaseEndpoint = `${root}/releases/${initialRelease.id}`;

  const artifactList = api(`${root}/actions/runs/${runId}/artifacts?per_page=100`);
  assert(
    artifactList.total_count === 3 && artifactList.artifacts?.length === 3,
    'Source must contain exactly three native artifacts.',
  );
  const artifacts = new Map();
  for (const artifact of artifactList.artifacts) {
    assert(
      expectedArtifacts.has(artifact.name) && !artifacts.has(artifact.name),
      'Unexpected or duplicate source artifact.',
    );
    assert(
      artifact.expired === false && artifact.workflow_run?.head_sha === run.head_sha,
      'Artifact is expired or belongs to a different commit.',
    );
    artifacts.set(artifact.name, artifact);
  }

  const temporaryRoot = resolve(tmpdir());
  const staging = await mkdtemp(join(temporaryRoot, 'lucentcue-preview-'));
  try {
    const files = [];
    const names = new Set();
    for (const [name, expected] of expectedArtifacts) {
      const directory = join(staging, name);
      gh(
        ['run', 'download', runId, '--repo', repository, '--name', name, '--dir', directory],
        true,
      );
      const downloaded = await collectFiles(directory);
      const counts = {};
      for (const path of downloaded) {
        const originalName = basename(path);
        assert(
          /^[A-Za-z0-9][A-Za-z0-9._ ()+-]{0,180}\.(exe|dmg|AppImage|deb)$/.test(originalName),
          'Unexpected artifact filename.',
        );
        const filename = releaseFilename(originalName);
        assert(
          filename.includes(version) && !names.has(filename),
          'Artifact version or unique filename check failed.',
        );
        const extension = filename.slice(filename.lastIndexOf('.') + 1);
        assert(Object.hasOwn(expected, extension), 'Artifact contains an unexpected package type.');
        counts[extension] = (counts[extension] || 0) + 1;
        names.add(filename);
        const uploadPath = join(dirname(path), filename);
        if (uploadPath !== path) await copyFile(path, uploadPath, constants.COPYFILE_EXCL);
        files.push(uploadPath);
      }
      assert(
        Object.entries(expected).every(([extension, count]) => counts[extension] === count),
        'Artifact package count does not match the native matrix.',
      );
    }
    assert(files.length === 5, 'Expected one EXE, two DMGs, one AppImage, and one deb.');
    files.sort((left, right) => basename(left).localeCompare(basename(right), 'en'));
    const checksums = new Map();
    for (const path of files) checksums.set(basename(path), await digest(path));
    const checksumPath = join(staging, 'SHA256SUMS.txt');
    await writeFile(
      checksumPath,
      [...checksums].map(([name, hash]) => `${hash}  ${name}\n`).join(''),
      { encoding: 'utf8', flag: 'wx' },
    );
    files.push(checksumPath);
    checksums.set('SHA256SUMS.txt', await digest(checksumPath));

    // Recheck immediately before upload. This script never creates or publishes a release.
    const release = api(releaseEndpoint);
    validateRelease(release, tag);
    assert(release.id === initialRelease.id, 'Target release changed during verification.');
    assert(release.target_commitish === run.head_sha, 'Draft target changed during verification.');
    const upload = files.filter((path) => {
      const existing = release.assets.find((asset) => asset.name === basename(path));
      if (!existing) return true;
      assert(
        existing.digest === `sha256:${checksums.get(basename(path))}`,
        'An existing asset differs or has no verified digest; refusing to overwrite it.',
      );
      return false;
    });
    if (upload.length) gh(['release', 'upload', tag, '--repo', repository, '--', ...upload], true);
    const verified = api(releaseEndpoint);
    validateRelease(verified, tag);
    assert(verified.id === release.id, 'Target release changed during upload.');
    for (const path of files) {
      const asset = verified.assets.find((item) => item.name === basename(path));
      assert(
        asset?.digest === `sha256:${checksums.get(basename(path))}`,
        `Uploaded asset checksum verification failed: ${basename(path)}.`,
      );
    }
    console.log(
      `Attached five unsigned packages and SHA256SUMS.txt from ${run.head_sha} to draft ${tag}. Release remains unpublished.`,
    );
  } finally {
    assert(
      dirname(staging) === temporaryRoot && basename(staging).startsWith('lucentcue-preview-'),
      'Refusing cleanup outside this task staging directory.',
    );
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Preview attachment failed.');
    process.exitCode = 1;
  });
}
