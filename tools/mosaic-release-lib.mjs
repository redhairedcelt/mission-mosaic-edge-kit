/** Verify and progressively unlock the offline Mission Mosaic participant kit. */

import {
  createDecipheriv,
  createHash,
  scryptSync,
} from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { fileURLToPath } from "node:url";

export const RELEASE_FORMAT = "mission-mosaic-encrypted-release-v1";
export const PLAN_FORMAT = "mission-mosaic-release-plan-v1";
export const STATE_FORMAT = "mission-mosaic-active-release-v1";
export const ARCHIVE_MAGIC = Buffer.from("MOSAIC_ARCHIVE_V1\n", "ascii");
export const EXPECTED_RELEASES = Object.freeze([
  Object.freeze({ id: "REL-AST-01", number: 1, cutoffHour: 0 }),
  Object.freeze({ id: "REL-AST-02", number: 2, cutoffHour: 72 }),
  Object.freeze({ id: "REL-AST-03", number: 3, cutoffHour: 120 }),
]);

const DEFAULT_KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_FORMAT = "mission-mosaic-stream-v1";
const CIPHER = "aes-256-gcm";
const COMPRESSION = "gzip";
const EXPECTED_KDF = Object.freeze({ name: "scrypt", N: 32768, r: 8, p: 1, keyLength: 32 });
const RETRYABLE_FILESYSTEM_ERRORS = new Set(["EACCES", "EBUSY", "EEXIST", "ENOTEMPTY", "EPERM"]);
const LOCAL_WRITE_ERRORS = new Set([
  ...RETRYABLE_FILESYSTEM_ERRORS,
  "EDQUOT",
  "EMFILE",
  "ENFILE",
  "ENOSPC",
  "ENAMETOOLONG",
  "EROFS",
]);
const PROTECTED_PATH = /(^|\/)(facilitator|facilitation|control|ground[_ -]?truth|adjudication|answer[_ -]?keys?|hidden[_ -]?intent|release[_ -]?words?|scoring)([_ .-]|\/|$)/i;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const REQUIRED_BASE_FILES = Object.freeze([
  ".gitignore",
  "AGENTS.md",
  "DATA_GUIDE.md",
  "EXCLUSIONS.md",
  "README.md",
  "PREFLIGHT.md",
  "RELEASE_SCHEDULE.md",
  "START_HERE.md",
  "data/reference/asset_catalog.json",
  "data/reference/maps/kordan_reference_map.html",
  "prompts/STARTUP_PROMPT.md",
  "release-plan.json",
  "released/.gitkeep",
  "tools/DUCKDB_LICENSE.txt",
  "tools/duckdb_cli-osx-universal-1.5.5.zip",
  "tools/duckdb_cli/duckdb.exe",
  "tools/macos_common.sh",
  "tools/mosaic-release-lib.mjs",
  "tools/mosaic-release.mjs",
  "tools/new_working_database.ps1",
  "tools/new_working_database.sh",
  "tools/open_current_readonly.ps1",
  "tools/open_current_readonly.sh",
  "tools/test_release_decryption.ps1",
  "tools/test_release_decryption.sh",
  "workspace/README.md",
]);

const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function waitMilliseconds(milliseconds) {
  Atomics.wait(waitBuffer, 0, 0, milliseconds);
}

export function retryTransientFileOperation(operation, {
  attempts = 8,
  retryDelayMs = 125,
  wait = waitMilliseconds,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_FILESYSTEM_ERRORS.has(error?.code) || attempt === attempts) throw error;
      wait(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

export async function retryTransientAsyncOperation(operation, {
  attempts = 4,
  retryDelayMs = 250,
  wait = waitMilliseconds,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_FILESYSTEM_ERRORS.has(error?.code) || attempt === attempts) throw error;
      wait(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

function kitPaths(kitRoot) {
  const root = resolve(kitRoot);
  return {
    root,
    plan: join(root, "release-plan.json"),
    state: join(root, "current-release.json"),
    manifest: join(root, "manifest/sha256sums.tsv"),
    released: join(root, "released"),
  };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

export function validatePlan(value) {
  assertPlainObject(value, "Release plan");
  if (value.format !== PLAN_FORMAT) throw new Error("The release plan format is invalid.");
  if (!/^\d+\.\d+\.\d+$/.test(value.packageVersion ?? "")) {
    throw new Error("The release plan package version is invalid.");
  }
  if (!Array.isArray(value.releases) || value.releases.length !== EXPECTED_RELEASES.length) {
    throw new Error("The release plan must contain the three expected releases.");
  }
  const seen = new Set();
  value.releases.forEach((release, index) => {
    assertPlainObject(release, `Release plan entry ${index + 1}`);
    const expected = EXPECTED_RELEASES[index];
    if (release.id !== expected.id || release.number !== expected.number || release.cutoffHour !== expected.cutoffHour) {
      throw new Error(`Release plan entry ${index + 1} is out of sequence.`);
    }
    if (typeof release.label !== "string" || !release.label.trim()) {
      throw new Error(`Release plan entry ${index + 1} has no label.`);
    }
    if (seen.has(release.id)) throw new Error(`Duplicate release identifier: ${release.id}`);
    seen.add(release.id);
  });
  if (value.initialActiveReleaseId !== value.releases[0].id) {
    throw new Error("The release plan must activate the H0 baseline initially.");
  }
  return value;
}

function readPlan(paths) {
  if (!existsSync(paths.plan)) throw new Error("The release plan is missing.");
  return validatePlan(readJson(paths.plan, "Release plan"));
}

function portableSegments(portablePath) {
  if (typeof portablePath !== "string" || !portablePath || isAbsolute(portablePath) || portablePath.includes("\\")) {
    throw new Error(`Unsafe package path: ${portablePath}`);
  }
  if (/^[A-Za-z]:/.test(portablePath) || /[\u0000-\u001f:]/.test(portablePath)) {
    throw new Error(`Unsafe package path: ${portablePath}`);
  }
  const segments = portablePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[. ]$/.test(segment) || WINDOWS_RESERVED.test(segment))) {
    throw new Error(`Unsafe package path: ${portablePath}`);
  }
  if (PROTECTED_PATH.test(portablePath)) throw new Error("The package contains a prohibited path.");
  return segments;
}

export function safeDestination(root, portablePath) {
  const rootPath = resolve(root);
  const destination = resolve(rootPath, ...portableSegments(portablePath));
  const fromRoot = relative(rootPath, destination);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Package path escapes its root: ${portablePath}`);
  }
  return destination;
}

function portableRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function decodeBase64(value, byteLength, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} is not valid base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== byteLength) throw new Error(`${label} has the wrong length.`);
  return decoded;
}

async function validateReleaseMetadata(paths, release, releasePlan) {
  const metadataPath = join(paths.root, "sealed", `${release.id}.json`);
  const cipherPath = join(paths.root, "sealed", `${release.id}.mosaic`);
  if (!existsSync(metadataPath) || !existsSync(cipherPath)) {
    throw new Error(`The encrypted package for ${release.id} is incomplete.`);
  }
  const metadata = readJson(metadataPath, `Package metadata for ${release.id}`);
  assertPlainObject(metadata, `Package metadata for ${release.id}`);
  if (
    metadata.format !== RELEASE_FORMAT ||
    metadata.packageVersion !== releasePlan.packageVersion ||
    metadata.releaseId !== release.id ||
    metadata.releaseNumber !== release.number ||
    metadata.cutoffHour !== release.cutoffHour ||
    metadata.cumulative !== true ||
    metadata.cipher !== CIPHER ||
    metadata.compression !== COMPRESSION ||
    metadata.archiveFormat !== ARCHIVE_FORMAT
  ) {
    throw new Error(`Package metadata for ${release.id} does not match the release plan.`);
  }
  assertPlainObject(metadata.kdf, `KDF metadata for ${release.id}`);
  for (const [name, expected] of Object.entries(EXPECTED_KDF)) {
    if (metadata.kdf[name] !== expected) throw new Error(`KDF metadata for ${release.id} is invalid.`);
  }
  const salt = decodeBase64(metadata.kdf.salt, 16, `KDF salt for ${release.id}`);
  const iv = decodeBase64(metadata.iv, 12, `Cipher IV for ${release.id}`);
  const authTag = decodeBase64(metadata.authTag, 16, `Authentication tag for ${release.id}`);
  const expectedAad = `${RELEASE_FORMAT}|${releasePlan.packageVersion}|${release.id}`;
  const aad = decodeBase64(metadata.aad, Buffer.byteLength(expectedAad), `AAD for ${release.id}`);
  if (aad.toString("utf8") !== expectedAad) throw new Error(`AAD for ${release.id} is invalid.`);
  if (!Number.isSafeInteger(metadata.ciphertextBytes) || metadata.ciphertextBytes <= 0) {
    throw new Error(`Ciphertext byte count for ${release.id} is invalid.`);
  }
  if (!/^[0-9a-f]{64}$/.test(metadata.ciphertextSha256 ?? "")) {
    throw new Error(`Ciphertext checksum for ${release.id} is invalid.`);
  }
  if (statSync(cipherPath).size !== metadata.ciphertextBytes || await sha256File(cipherPath) !== metadata.ciphertextSha256) {
    throw new Error(`Encrypted package checksum mismatch: ${release.id}`);
  }
  return { metadata, cipherPath, salt, iv, authTag, aad };
}

function parseChecksumLines(text, label) {
  const entries = new Map();
  const portableNames = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab < 0 || line.indexOf("\t", tab + 1) >= 0) throw new Error(`Invalid ${label} line.`);
    const expected = line.slice(0, tab);
    const portablePath = line.slice(tab + 1);
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`Invalid checksum in ${label}.`);
    portableSegments(portablePath);
    const portableKey = portablePath.toLocaleLowerCase("en-US");
    if (entries.has(portablePath) || portableNames.has(portableKey)) {
      throw new Error(`Duplicate or case-colliding path in ${label}: ${portablePath}`);
    }
    entries.set(portablePath, expected);
    portableNames.add(portableKey);
  }
  return entries;
}

export function shouldIgnoreGenerated(relativePath) {
  const segments = relativePath.split("/");
  return relativePath === "manifest/sha256sums.tsv" ||
    relativePath === "current-release.json" ||
    (relativePath.startsWith("released/") && relativePath !== "released/.gitkeep") ||
    (relativePath.startsWith("workspace/") && relativePath !== "workspace/README.md") ||
    segments.includes("__pycache__") ||
    relativePath.endsWith(".pyc") ||
    segments.at(-1) === ".DS_Store";
}

function walkFiles(root, { ignoreGenerated = false } = {}) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const portablePath = portableRelative(root, path);
      if (ignoreGenerated && shouldIgnoreGenerated(portablePath)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the Edge Kit: ${portablePath}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(portablePath);
      else throw new Error(`Unsupported file type in the Edge Kit: ${portablePath}`);
    }
  }
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function verifyChecksumEntries(root, entries, label) {
  for (const [portablePath, expected] of entries) {
    const path = safeDestination(root, portablePath);
    if (!existsSync(path)) throw new Error(`${label} lists a missing file: ${portablePath}`);
    const status = lstatSync(path);
    if (status.isSymbolicLink() || !status.isFile()) throw new Error(`${label} lists a non-file path: ${portablePath}`);
    if (await sha256File(path) !== expected) throw new Error(`${label} mismatch: ${portablePath}`);
  }
}

function assertExactFileSet(actualFiles, expectedEntries, label) {
  const expected = new Set(expectedEntries.keys());
  const actual = new Set(actualFiles);
  for (const actualPath of actual) {
    if (!expected.has(actualPath)) {
      if (PROTECTED_PATH.test(actualPath)) throw new Error("The Edge Kit contains prohibited unmanifested content.");
      throw new Error(`${label} does not list packaged file: ${actualPath}`);
    }
  }
  for (const expectedPath of expected) {
    if (!actual.has(expectedPath)) throw new Error(`${label} lists a missing file: ${expectedPath}`);
  }
}

function validateInternalRelease(value, release) {
  assertPlainObject(value, `Internal release metadata for ${release.id}`);
  if (
    value.format !== "mission-mosaic-release-state-v1" ||
    value.releaseId !== release.id ||
    value.releaseNumber !== release.number ||
    value.label !== release.label ||
    value.cutoffHour !== release.cutoffHour ||
    value.cumulative !== true ||
    value.dataPath !== "data" ||
    value.checksums !== "_checksums.tsv" ||
    typeof value.database !== "string" ||
    !value.database.endsWith(".duckdb")
  ) {
    throw new Error(`Decrypted release identity does not match the release plan for ${release.id}.`);
  }
  portableSegments(value.database);
  portableSegments(value.dataPath);
  return value;
}

export async function verifyReleaseDirectory(root, release) {
  const internalPath = join(root, "_release.json");
  const checksumsPath = join(root, "_checksums.tsv");
  if (!existsSync(internalPath) || !existsSync(checksumsPath)) {
    throw new Error(`Decrypted release ${release.id} is missing its internal manifest.`);
  }
  const internal = validateInternalRelease(readJson(internalPath, `Internal release metadata for ${release.id}`), release);
  const entries = parseChecksumLines(readFileSync(checksumsPath, "utf8"), `release checksum manifest for ${release.id}`);
  if (!entries.has(internal.database)) throw new Error(`Release manifest for ${release.id} omits its database.`);
  const actual = walkFiles(root).filter((portablePath) => portablePath !== "_release.json" && portablePath !== "_checksums.tsv");
  assertExactFileSet(actual, entries, `Release checksum manifest for ${release.id}`);
  await verifyChecksumEntries(root, entries, `Release checksum manifest for ${release.id}`);
  const database = safeDestination(root, internal.database);
  const dataPath = safeDestination(root, internal.dataPath);
  if (!lstatSync(database).isFile() || !lstatSync(dataPath).isDirectory()) {
    throw new Error(`Decrypted release ${release.id} has invalid database or data paths.`);
  }
  return { internal, checked: entries.size };
}

function validateState(value, releasePlan, paths, { requireFiles = true } = {}) {
  assertPlainObject(value, "Active release state");
  const release = releasePlan.releases.find((candidate) => candidate.id === value.activeRelease);
  if (!release || value.format !== STATE_FORMAT || value.releaseNumber !== release.number ||
      value.label !== release.label || value.cutoffHour !== release.cutoffHour || value.cumulative !== true ||
      typeof value.unlockedAt !== "string" || !Number.isFinite(Date.parse(value.unlockedAt))) {
    throw new Error("The active release state is invalid.");
  }
  const prefix = `released/${release.id}/`;
  if (typeof value.database !== "string" || typeof value.dataPath !== "string" ||
      !value.database.startsWith(prefix) || !value.dataPath.startsWith(prefix) ||
      !value.database.endsWith(".duckdb")) {
    throw new Error("The active release state contains unsafe paths.");
  }
  const database = safeDestination(paths.root, value.database);
  const dataPath = safeDestination(paths.root, value.dataPath);
  if (requireFiles && (!existsSync(database) || !lstatSync(database).isFile() || !existsSync(dataPath) || !lstatSync(dataPath).isDirectory())) {
    throw new Error("The active release state points to missing data.");
  }
  return { value, release, database, dataPath };
}

function readState(paths, releasePlan, options) {
  if (!existsSync(paths.state)) return null;
  return validateState(readJson(paths.state, "Active release state"), releasePlan, paths, options);
}

function nextRelease(releasePlan, current) {
  if (!current) return releasePlan.releases[0];
  return releasePlan.releases[current.release.number] ?? null;
}

function releasedDirectories(paths) {
  if (!existsSync(paths.released)) return [];
  return readdirSync(paths.released, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function verifyPackagedFiles(kitRoot = DEFAULT_KIT_ROOT) {
  const paths = kitPaths(kitRoot);
  if (!existsSync(paths.manifest)) {
    throw new Error(
      "This is the public source checkout, not the complete packaged Edge Kit. " +
      "Download the current release asset from https://github.com/redhairedcelt/mission-mosaic-edge-kit/releases/latest; " +
      "do not use GitHub's source-code ZIP.",
    );
  }
  const releasePlan = readPlan(paths);
  const entries = parseChecksumLines(readFileSync(paths.manifest, "utf8"), "kit checksum manifest");
  const required = [
    ...REQUIRED_BASE_FILES,
    ...releasePlan.releases.slice(1).flatMap((release) => [`sealed/${release.id}.json`, `sealed/${release.id}.mosaic`]),
  ];
  for (const portablePath of required) {
    if (!entries.has(portablePath)) throw new Error(`Kit checksum manifest omits required file: ${portablePath}`);
  }
  const actual = walkFiles(paths.root, { ignoreGenerated: true });
  assertExactFileSet(actual, entries, "Kit checksum manifest");
  await verifyChecksumEntries(paths.root, entries, "Kit checksum manifest");
  for (const release of releasePlan.releases.slice(1)) await validateReleaseMetadata(paths, release, releasePlan);

  const current = readState(paths, releasePlan);
  if (!current) throw new Error("The packaged Edge Kit must start with the H0 baseline active.");
  const directories = releasedDirectories(paths);
  const allowed = new Set(current ? releasePlan.releases.slice(0, current.release.number).map((release) => release.id) : []);
  const unexpected = directories.filter((name) => !allowed.has(name));
  if (unexpected.length) {
    throw new Error(
      "The released directory contains an interrupted or unauthorized release. " +
      "Run `node tools/mosaic-release.mjs repair`, then retry verification or the same authorized unlock.",
    );
  }
  let activeFiles = 0;
  if (current) {
    const activeRoot = join(paths.released, current.release.id);
    const verified = await verifyReleaseDirectory(activeRoot, current.release);
    activeFiles = verified.checked;
  }
  return { packagedFiles: entries.size, activeFiles };
}

function removePathWithRetries(path, { strict = false } = {}) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
  } catch (error) {
    if (strict) throw error;
  }
  if (strict && existsSync(path)) throw new Error(`Could not remove temporary path: ${path}`);
}

function renameWithRetries(source, destination) {
  return retryTransientFileOperation(() => renameSync(source, destination));
}

function temporaryStatePaths(paths) {
  const prefix = "current-release.json.tmp-";
  return readdirSync(paths.root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => join(paths.root, entry.name));
}

function stagingPaths(paths) {
  if (!existsSync(paths.released)) return [];
  return readdirSync(paths.released, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\.staging-REL-AST-\d{2}-\d+(?:-\d+)?$/.test(entry.name))
    .map((entry) => join(paths.released, entry.name));
}

function preflightPaths(paths) {
  const workspace = join(paths.root, "workspace");
  if (!existsSync(workspace)) return [];
  return readdirSync(workspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\.release-preflight-\d+-\d+$/.test(entry.name))
    .map((entry) => join(workspace, entry.name));
}

function cleanRecoverableTemporaryPaths(paths, { includePreflight = true } = {}) {
  const candidates = [
    ...temporaryStatePaths(paths),
    ...stagingPaths(paths),
    ...(includePreflight ? preflightPaths(paths) : []),
  ];
  for (const candidate of candidates) removePathWithRetries(candidate, { strict: true });
  return candidates.length;
}

function writeState(paths, releasePlan, release, internal) {
  const newState = {
    format: STATE_FORMAT,
    activeRelease: release.id,
    releaseNumber: release.number,
    label: release.label,
    cutoffHour: release.cutoffHour,
    cumulative: true,
    database: `released/${release.id}/${internal.database}`,
    dataPath: `released/${release.id}/${internal.dataPath}`,
    unlockedAt: new Date().toISOString(),
  };
  validateState(newState, releasePlan, paths, { requireFiles: true });
  const temporaryState = `${paths.state}.tmp-${process.pid}-${Date.now()}`;
  removePathWithRetries(temporaryState, { strict: true });
  try {
    writeFileSync(temporaryState, `${JSON.stringify(newState, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameWithRetries(temporaryState, paths.state);
  } finally {
    removePathWithRetries(temporaryState);
  }
  return newState;
}

function reportActivation(release, newState, checked, recovered = false) {
  console.log(`${recovered ? "Recovered and activated" : "Release activated"}: ${release.id}`);
  console.log(`Scenario cutoff: H${release.cutoffHour > 0 ? "+" : ""}${release.cutoffHour}`);
  console.log(`Database: ${newState.database}`);
  console.log(`Decrypted and verified files: ${checked}`);
}

function removeStaging(path) {
  removePathWithRetries(path, { strict: true });
}

function isLocalWriteFailure(error) {
  return LOCAL_WRITE_ERRORS.has(error?.code);
}

function releaseOperationError(message, { recoverable = false, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.releaseRecoverable = recoverable;
  return error;
}

function facilitatorAssistanceError(error) {
  if (/flag this for a facilitator/i.test(error.message)) return error;
  return new Error(`${error.message} Please flag this for a facilitator.`, { cause: error });
}

export async function runWithAutomaticReleaseRecovery(operation, repair, {
  wait = () => waitMilliseconds(500),
} = {}) {
  try {
    return await operation();
  } catch (error) {
    if (error?.releaseRecoverable !== true && !isLocalWriteFailure(error)) {
      throw facilitatorAssistanceError(error);
    }
    console.error("The release encountered a recoverable local error. Running one automatic repair and retry.");
    try {
      wait();
      await repair();
      const result = await operation();
      console.log("Automatic release recovery completed successfully.");
      return result;
    } catch (recoveryError) {
      throw facilitatorAssistanceError(recoveryError);
    }
  }
}

export async function unlockRelease(word, kitRoot = DEFAULT_KIT_ROOT) {
  if (!word || !/^[A-Z]+$/.test(word)) {
    throw facilitatorAssistanceError(new Error("A release word must use uppercase letters exactly as displayed."));
  }
  return runWithAutomaticReleaseRecovery(
    () => unlockReleaseAttempt(word, kitRoot),
    () => repairReleaseWorkspace(kitRoot),
  );
}

async function unlockReleaseAttempt(word, kitRoot) {
  const paths = kitPaths(kitRoot);
  const releasePlan = readPlan(paths);
  const current = readState(paths, releasePlan);
  const release = nextRelease(releasePlan, current);
  if (!release) {
    console.log("All participant releases are already unlocked.");
    return;
  }
  try {
    cleanRecoverableTemporaryPaths(paths, { includePreflight: false });
  } catch (error) {
    throw releaseOperationError(`Temporary release cleanup was blocked: ${error.message}`, {
      recoverable: isLocalWriteFailure(error),
      cause: error,
    });
  }
  const target = join(paths.released, release.id);
  if (existsSync(target)) {
    try {
      await authenticateReleaseWord(word, paths, releasePlan, release);
    } catch (error) {
      if (isLocalWriteFailure(error)) {
        throw releaseOperationError(`The recoverable release could not be read locally: ${error.message}`, {
          recoverable: true,
          cause: error,
        });
      }
      throw releaseOperationError(
        `The release word was not accepted for the recoverable release (${release.id}), or its package is damaged.`,
        { cause: error },
      );
    }
    let recovered;
    try {
      recovered = await verifyReleaseDirectory(target, release);
    } catch (error) {
      throw releaseOperationError(`The recoverable release could not be verified: ${error.message}`, {
        recoverable: isLocalWriteFailure(error),
        cause: error,
      });
    }
    let newState;
    try {
      newState = writeState(paths, releasePlan, release, recovered.internal);
    } catch (error) {
      throw releaseOperationError(`The verified release could not be activated: ${error.message}`, {
        recoverable: true,
        cause: error,
      });
    }
    reportActivation(release, newState, recovered.checked, true);
    return;
  }

  const staging = join(paths.released, `.staging-${release.id}-${process.pid}-${Date.now()}`);
  let phase = "prepare";
  try {
    mkdirSync(paths.released, { recursive: true });
    removePathWithRetries(staging, { strict: true });
    mkdirSync(staging, { recursive: true });
    phase = "decrypt";
    await decryptRelease(word, paths, releasePlan, release, staging);
    phase = "validate";
    const verified = await verifyReleaseDirectory(staging, release);
    phase = "activate";
    renameWithRetries(staging, target);
    const newState = writeState(paths, releasePlan, release, verified.internal);
    reportActivation(release, newState, verified.checked);
  } catch (error) {
    let cleanupError = null;
    try {
      removeStaging(staging);
    } catch (candidate) {
      cleanupError = candidate;
    }
    if (process.env.MOSAIC_RELEASE_DEBUG === "1") console.error(error.stack ?? error.message);
    if (cleanupError) {
      throw releaseOperationError(
        `Temporary extraction cleanup was blocked: ${cleanupError.message}`,
        { recoverable: true, cause: cleanupError },
      );
    }
    if (isLocalWriteFailure(error)) {
      const code = error.code ? ` (${error.code})` : "";
      throw releaseOperationError(
        `The release could not be written locally${code}: ${error.message} ` +
        "Local security, indexing, synchronization, disk space, or path length may be blocking it.",
        { recoverable: true, cause: error },
      );
    }
    if (phase === "decrypt") {
      throw releaseOperationError(
        `The release word was not accepted for the next release (${release.id}), or its package is damaged.`,
        { cause: error },
      );
    }
    if (phase === "activate") {
      throw releaseOperationError(`The release was decrypted but activation did not finish: ${error.message}`, {
        recoverable: true,
        cause: error,
      });
    }
    if (phase === "prepare") {
      throw releaseOperationError(`The release staging area could not be prepared: ${error.message}`, {
        recoverable: true,
        cause: error,
      });
    }
    throw releaseOperationError(`The decrypted release failed validation: ${error.message}`, { cause: error });
  }
}

async function releaseDecipher(word, paths, releasePlan, release) {
  const { metadata, cipherPath, salt, iv, authTag, aad } = await validateReleaseMetadata(paths, release, releasePlan);
  const key = scryptSync(word, salt, metadata.kdf.keyLength, {
    N: metadata.kdf.N,
    r: metadata.kdf.r,
    p: metadata.kdf.p,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv(metadata.cipher, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return { cipherPath, decipher };
}

async function authenticateReleaseWord(word, paths, releasePlan, release) {
  const { cipherPath, decipher } = await releaseDecipher(word, paths, releasePlan, release);
  const discard = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  await pipeline(createReadStream(cipherPath), decipher, discard);
}

async function decryptRelease(word, paths, releasePlan, release, destination) {
  const { cipherPath, decipher } = await releaseDecipher(word, paths, releasePlan, release);
  const extractor = new ArchiveExtractor(destination);
  await pipeline(createReadStream(cipherPath), decipher, createGunzip(), extractor);
  return {
    extractedFiles: extractor.files,
    extractedBytes: extractor.bytes,
    longestDestination: extractor.longestDestination,
  };
}

function formatMebibytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function filesystemWriteProbe(paths) {
  const probe = join(paths.root, `.mosaic-write-probe-${process.pid}-${Date.now()}`);
  const source = `${probe}.new`;
  const destination = `${probe}.current`;
  try {
    writeFileSync(source, "new\n", { flag: "wx" });
    writeFileSync(destination, "old\n", { flag: "wx" });
    renameWithRetries(source, destination);
    if (readFileSync(destination, "utf8") !== "new\n") {
      throw new Error("The filesystem did not replace the state probe atomically.");
    }
  } finally {
    removePathWithRetries(source);
    removePathWithRetries(destination);
  }
}

function writePreflightReport(paths, lines) {
  const workspace = join(paths.root, "workspace");
  mkdirSync(workspace, { recursive: true });
  const report = join(workspace, "release-preflight-report.txt");
  const temporary = `${report}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${lines.join("\n")}\n`, { flag: "wx" });
    renameWithRetries(temporary, report);
  } finally {
    removePathWithRetries(temporary);
  }
  return portableRelative(paths.root, report);
}

export async function repairReleaseWorkspace(kitRoot = DEFAULT_KIT_ROOT) {
  const paths = kitPaths(kitRoot);
  const releasePlan = readPlan(paths);
  const removed = cleanRecoverableTemporaryPaths(paths);
  const current = readState(paths, releasePlan);
  if (!current) throw new Error("The H0 starting state is missing; restore a fresh extracted kit.");
  await verifyReleaseDirectory(join(paths.released, current.release.id), current.release);
  const next = nextRelease(releasePlan, current);
  let recoverableRelease = null;
  if (next && existsSync(join(paths.released, next.id))) {
    const verified = await verifyReleaseDirectory(join(paths.released, next.id), next);
    recoverableRelease = next.id;
    console.log(`A verified ${next.id} directory is ready to recover (${verified.checked} files).`);
    console.log("Retry the same authorized release word to finish activation.");
  }
  console.log(`Release workspace repair passed. Removed temporary paths: ${removed}.`);
  return { removed, recoverableRelease };
}

export async function preflightReleaseDecryption(words, kitRoot = DEFAULT_KIT_ROOT, { writeReport = true } = {}) {
  const paths = kitPaths(kitRoot);
  const releasePlan = readPlan(paths);
  const sealedReleases = releasePlan.releases.slice(1);
  if (!Array.isArray(words) || words.length !== sealedReleases.length) {
    throw new Error(`Preflight requires ${sealedReleases.length} release words in sequence.`);
  }
  for (const word of words) {
    if (!word || !/^[A-Z]+$/.test(word)) {
      throw new Error("Each release word must use uppercase letters exactly as displayed.");
    }
  }

  const lines = [
    "Mission Mosaic release decryption preflight",
    `Timestamp: ${new Date().toISOString()}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Node.js: ${process.version}`,
    `Kit root length: ${paths.root.length} characters`,
  ];
  const originalState = readFileSync(paths.state);
  let reportPath = null;
  let preflightRoot = null;
  try {
    const removed = cleanRecoverableTemporaryPaths(paths);
    lines.push(`Recoverable temporary paths removed: ${removed}`);
    const checked = await verifyPackagedFiles(paths.root);
    lines.push(`Package verification: PASS (${checked.packagedFiles} packaged files)`);
    filesystemWriteProbe(paths);
    lines.push("Local write/replace/delete probe: PASS");
    const filesystem = statfsSync(paths.root);
    const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    lines.push(`Free space before test: ${formatMebibytes(freeBytes)}`);
    if (freeBytes < 1024 * 1024 * 1024) {
      throw new Error("At least 1 GiB of free space is required for release preflight and live recovery.");
    }

    const workspace = join(paths.root, "workspace");
    mkdirSync(workspace, { recursive: true });
    preflightRoot = join(workspace, `.release-preflight-${process.pid}-${Date.now()}`);
    mkdirSync(preflightRoot, { recursive: true });

    for (let index = 0; index < sealedReleases.length; index += 1) {
      const release = sealedReleases[index];
      const destination = join(preflightRoot, release.id);
      mkdirSync(destination, { recursive: true });
      let extraction;
      try {
        extraction = await decryptRelease(words[index], paths, releasePlan, release, destination);
      } catch (error) {
        if (isLocalWriteFailure(error)) throw error;
        throw new Error(`${release.id} could not be authenticated and decrypted. Confirm its authorized word.`, { cause: error });
      }
      const verified = await verifyReleaseDirectory(destination, release);
      const renamedDestination = `${destination}.renamed`;
      renameWithRetries(destination, renamedDestination);
      lines.push(
        `${release.id}: PASS (${verified.checked} verified files, ${formatMebibytes(extraction.extractedBytes)}, ` +
        `longest local path ${extraction.longestDestination} characters)`,
      );
      removePathWithRetries(renamedDestination, { strict: true });
    }

    if (!readFileSync(paths.state).equals(originalState)) {
      throw new Error("Preflight changed current-release.json; restore a fresh kit.");
    }
    lines.push("Exercise release state unchanged: PASS");
    lines.push("Overall result: PASS");
  } catch (error) {
    lines.push(`Overall result: FAIL${error?.code ? ` (${error.code})` : ""}`);
    lines.push(`Failure: ${error.message}`);
    throw Object.assign(error, { preflightLines: lines });
  } finally {
    if (preflightRoot) removePathWithRetries(preflightRoot);
    if (writeReport) {
      try {
        reportPath = writePreflightReport(paths, lines);
      } catch (reportError) {
        console.error(`Could not write the preflight report: ${reportError.message}`);
      }
    }
    for (const line of lines) console.log(line);
    if (reportPath) console.log(`Report: ${reportPath}`);
  }
  return { reportPath, releasesTested: sealedReleases.length };
}

async function wordsFromStandardInput(expected) {
  if (process.stdin.isTTY) {
    throw new Error("Preflight words must be supplied through standard input. Use the provided platform preflight script.");
  }
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const words = input.replace(/^\uFEFF/, "").split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
  if (words.length !== expected) throw new Error(`Expected ${expected} release words on standard input.`);
  return words;
}

export class ArchiveExtractor extends Writable {
  constructor(root) {
    super();
    this.root = root;
    this.buffer = Buffer.alloc(0);
    this.magicRead = false;
    this.headerLength = null;
    this.entry = null;
    this.fd = null;
    this.remaining = 0;
    this.hash = null;
    this.ended = false;
    this.files = 0;
    this.bytes = 0;
    this.longestDestination = 0;
    this.paths = new Set();
  }

  _write(chunk, _encoding, callback) {
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
      callback();
    } catch (error) {
      this.closeOpenFile();
      callback(error);
    }
  }

  _destroy(error, callback) {
    this.closeOpenFile();
    callback(error);
  }

  closeOpenFile() {
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }

  processBuffer() {
    while (true) {
      if (!this.magicRead) {
        if (this.buffer.length < ARCHIVE_MAGIC.length) return;
        const magic = this.buffer.subarray(0, ARCHIVE_MAGIC.length);
        if (!magic.equals(ARCHIVE_MAGIC)) throw new Error("Invalid encrypted release archive.");
        this.buffer = this.buffer.subarray(ARCHIVE_MAGIC.length);
        this.magicRead = true;
      }
      if (this.ended) {
        if (this.buffer.length) throw new Error("Unexpected bytes after archive terminator.");
        return;
      }
      if (this.entry) {
        if (!this.buffer.length) return;
        const count = Math.min(this.remaining, this.buffer.length);
        const slice = this.buffer.subarray(0, count);
        let offset = 0;
        while (offset < slice.length) {
          const written = writeSync(this.fd, slice, offset, slice.length - offset);
          if (written <= 0) throw new Error(`Release extraction stopped while writing: ${this.entry.path}`);
          offset += written;
        }
        this.hash.update(slice);
        this.bytes += slice.length;
        this.remaining -= count;
        this.buffer = this.buffer.subarray(count);
        if (this.remaining === 0) {
          this.closeOpenFile();
          const actual = this.hash.digest("hex");
          if (actual !== this.entry.sha256) throw new Error(`Checksum mismatch after decryption: ${this.entry.path}`);
          this.files += 1;
          this.entry = null;
          this.hash = null;
        }
        continue;
      }
      if (this.headerLength === null) {
        if (this.buffer.length < 4) return;
        this.headerLength = this.buffer.readUInt32BE(0);
        this.buffer = this.buffer.subarray(4);
        if (this.headerLength === 0) {
          this.headerLength = null;
          this.ended = true;
          continue;
        }
        if (this.headerLength > 1024 * 1024) throw new Error("Archive entry header is too large.");
      }
      if (this.buffer.length < this.headerLength) return;
      const headerBytes = this.buffer.subarray(0, this.headerLength);
      this.buffer = this.buffer.subarray(this.headerLength);
      this.headerLength = null;
      const entry = JSON.parse(headerBytes.toString("utf8"));
      if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")) {
        throw new Error(`Invalid archive entry metadata: ${entry.path ?? "unknown"}`);
      }
      const portableKey = String(entry.path).toLocaleLowerCase("en-US");
      if (this.paths.has(portableKey)) throw new Error(`Duplicate or case-colliding archive path: ${entry.path}`);
      this.paths.add(portableKey);
      const destination = safeDestination(this.root, entry.path);
      this.longestDestination = Math.max(this.longestDestination, destination.length);
      mkdirSync(dirname(destination), { recursive: true });
      this.fd = openSync(destination, "wx", 0o600);
      this.entry = entry;
      this.remaining = entry.size;
      this.hash = createHash("sha256");
      if (this.remaining === 0) {
        this.closeOpenFile();
        if (this.hash.digest("hex") !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.path}`);
        this.files += 1;
        this.entry = null;
        this.hash = null;
      }
    }
  }

  _final(callback) {
    try {
      this.processBuffer();
      if (!this.magicRead || !this.ended || this.entry || this.headerLength !== null || this.buffer.length) {
        throw new Error("Encrypted release archive ended unexpectedly.");
      }
      callback();
    } catch (error) {
      this.closeOpenFile();
      callback(error);
    }
  }
}

function printStatus(mode, paths, releasePlan) {
  const current = readState(paths, releasePlan);
  const next = nextRelease(releasePlan, current);
  if (mode === "--json") {
    console.log(JSON.stringify({ active: current?.value ?? null, nextRelease: next?.id ?? null }, null, 2));
    return;
  }
  if (mode === "--database") {
    if (!current) throw new Error("No release has been unlocked.");
    console.log(current.database);
    return;
  }
  if (mode) throw new Error(`Unknown status option: ${mode}`);
  if (!current) console.log("Active release: none");
  else {
    console.log(`Active release: ${current.release.id}`);
    console.log(`Scenario cutoff: H${current.release.cutoffHour > 0 ? "+" : ""}${current.release.cutoffHour}`);
    console.log(`Database: ${current.value.database}`);
  }
  console.log(`Next release: ${next?.id ?? "none"}`);
}

export async function runCli(argv, kitRoot = DEFAULT_KIT_ROOT) {
  const [command = "status", ...arguments_] = argv;
  const [argument, ...extra] = arguments_;
  const paths = kitPaths(kitRoot);
  if (command === "verify") {
    if (extra.length) throw new Error("Too many command-line arguments.");
    if (argument) throw new Error("The verify command does not accept arguments.");
    const checked = await verifyPackagedFiles(paths.root);
    console.log(`Encrypted Edge Kit verification passed (${checked.packagedFiles} packaged files).`);
    if (checked.activeFiles) console.log(`Active release verification passed (${checked.activeFiles} files).`);
  } else if (command === "status") {
    if (extra.length) throw new Error("Too many command-line arguments.");
    const releasePlan = readPlan(paths);
    printStatus(argument, paths, releasePlan);
  } else if (command === "unlock") {
    if (extra.length) throw new Error("Too many command-line arguments.");
    if (!argument) throw facilitatorAssistanceError(new Error("A release word is required."));
    try {
      await unlockRelease(argument, paths.root);
      const checked = await retryTransientAsyncOperation(() => verifyPackagedFiles(paths.root));
      console.log(`Post-unlock verification passed (${checked.activeFiles} active-release files).`);
      const releasePlan = readPlan(paths);
      printStatus(null, paths, releasePlan);
    } catch (error) {
      throw facilitatorAssistanceError(error);
    }
  } else if (command === "repair") {
    if (argument) throw new Error("The repair command does not accept arguments.");
    await repairReleaseWorkspace(paths.root);
  } else if (command === "preflight") {
    if (argument !== "--stdin" || extra.length) {
      throw new Error("Use the provided platform preflight script to supply release words securely.");
    }
    const releasePlan = readPlan(paths);
    const words = await wordsFromStandardInput(releasePlan.releases.length - 1);
    await preflightReleaseDecryption(words, paths.root);
  } else {
    throw new Error(
      "Usage: node tools/mosaic-release.mjs verify|status [--json|--database]|unlock WORD|repair|preflight --stdin",
    );
  }
}
