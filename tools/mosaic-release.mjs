#!/usr/bin/env node

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
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_PATH = join(KIT_ROOT, "release-plan.json");
const STATE_PATH = join(KIT_ROOT, "current-release.json");
const MANIFEST_PATH = join(KIT_ROOT, "manifest/sha256sums.tsv");
const RELEASED_ROOT = join(KIT_ROOT, "released");
const ARCHIVE_MAGIC = Buffer.from("MOSAIC_ARCHIVE_V1\n", "ascii");
const PROTECTED_PATH = /(^|\/)(facilitator|control|ground[_ -]?truth|adjudication|answer[_ -]?key)([_ .-]|\/|$)/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function plan() {
  return readJson(PLAN_PATH);
}

function state() {
  if (!existsSync(STATE_PATH)) return null;
  return readJson(STATE_PATH);
}

function nextRelease() {
  const releases = plan().releases;
  const current = state();
  if (!current) return releases[0];
  const index = releases.findIndex((release) => release.id === current.activeRelease);
  if (index < 0) throw new Error("The active release is not present in release-plan.json.");
  return releases[index + 1] ?? null;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function safeDestination(root, portablePath) {
  if (!portablePath || isAbsolute(portablePath) || portablePath.includes("\\")) {
    throw new Error(`Unsafe archive path: ${portablePath}`);
  }
  const normalized = normalize(portablePath).split(sep).join("/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe archive path: ${portablePath}`);
  }
  if (PROTECTED_PATH.test(normalized)) throw new Error(`Protected path in archive: ${portablePath}`);
  const destination = resolve(root, normalized);
  const prefix = `${resolve(root)}${sep}`;
  if (!destination.startsWith(prefix)) throw new Error(`Archive path escapes staging area: ${portablePath}`);
  return destination;
}

class ArchiveExtractor extends Writable {
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
  }

  _write(chunk, _encoding, callback) {
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.process();
      callback();
    } catch (error) {
      this.closeOpenFile();
      callback(error);
    }
  }

  closeOpenFile() {
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }

  process() {
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
        writeSync(this.fd, slice);
        this.hash.update(slice);
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
      if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        throw new Error(`Invalid archive entry metadata: ${entry.path ?? "unknown"}`);
      }
      const destination = safeDestination(this.root, entry.path);
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
      this.process();
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

async function verifyPackagedFiles() {
  if (!existsSync(MANIFEST_PATH)) throw new Error("Kit checksum manifest is missing.");
  const lines = readFileSync(MANIFEST_PATH, "utf8").split(/\r?\n/);
  let checked = 0;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) throw new Error(`Invalid checksum manifest line: ${line}`);
    const expected = line.slice(0, tab);
    const portablePath = line.slice(tab + 1);
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`Invalid checksum for ${portablePath}`);
    const path = safeDestination(KIT_ROOT, portablePath);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Kit file is missing: ${portablePath}`);
    if (await sha256File(path) !== expected) throw new Error(`Kit checksum mismatch: ${portablePath}`);
    checked += 1;
  }
  return checked;
}

async function unlock(word) {
  if (!word || !/^[A-Za-z]+$/.test(word)) throw new Error("A release word must contain letters only.");
  const release = nextRelease();
  if (!release) {
    console.log("All four participant releases are already unlocked.");
    return;
  }
  const metadataPath = join(KIT_ROOT, "sealed", `${release.id}.json`);
  const cipherPath = join(KIT_ROOT, "sealed", `${release.id}.mosaic`);
  const metadata = readJson(metadataPath);
  if (metadata.releaseId !== release.id || metadata.format !== "mission-mosaic-encrypted-release-v1") {
    throw new Error(`Invalid package metadata for ${release.id}.`);
  }
  if (await sha256File(cipherPath) !== metadata.ciphertextSha256) {
    throw new Error(`Encrypted package checksum mismatch: ${release.id}`);
  }
  const key = scryptSync(word.toUpperCase(), Buffer.from(metadata.kdf.salt, "base64"), metadata.kdf.keyLength, {
    N: metadata.kdf.N,
    r: metadata.kdf.r,
    p: metadata.kdf.p,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv(metadata.cipher, key, Buffer.from(metadata.iv, "base64"));
  decipher.setAAD(Buffer.from(metadata.aad, "base64"));
  decipher.setAuthTag(Buffer.from(metadata.authTag, "base64"));
  mkdirSync(RELEASED_ROOT, { recursive: true });
  const target = join(RELEASED_ROOT, release.id);
  const staging = join(RELEASED_ROOT, `.staging-${release.id}-${process.pid}`);
  if (existsSync(target)) throw new Error(`Release directory already exists but is not active: ${relative(KIT_ROOT, target)}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const extractor = new ArchiveExtractor(staging);
  try {
    await pipeline(createReadStream(cipherPath), decipher, createGunzip(), extractor);
    const internal = readJson(join(staging, "_release.json"));
    if (internal.releaseId !== release.id || internal.cutoffHour !== release.cutoffHour) {
      throw new Error("Decrypted release identity does not match the release plan.");
    }
    const database = join(staging, ...internal.database.split("/"));
    if (!existsSync(database)) throw new Error("Decrypted release database is missing.");
    renameSync(staging, target);
    const newState = {
      format: "mission-mosaic-active-release-v1",
      activeRelease: internal.releaseId,
      releaseNumber: internal.releaseNumber,
      label: internal.label,
      cutoffHour: internal.cutoffHour,
      cumulative: true,
      database: `released/${release.id}/${internal.database}`,
      dataPath: `released/${release.id}/${internal.dataPath}`,
      unlockedAt: new Date().toISOString(),
    };
    const temporaryState = `${STATE_PATH}.tmp-${process.pid}`;
    writeFileSync(temporaryState, `${JSON.stringify(newState, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryState, STATE_PATH);
    console.log(`Release activated: ${release.id}`);
    console.log(`Scenario cutoff: H${release.cutoffHour >= 0 ? "+" : ""}${release.cutoffHour}`);
    console.log(`Database: ${newState.database}`);
    console.log(`Decrypted and verified files: ${extractor.files}`);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (process.env.MOSAIC_RELEASE_DEBUG === "1") {
      console.error(error.stack ?? error.message);
    }
    throw new Error(`Release word was not accepted for the next release (${release.id}), or its package is damaged.`);
  }
}

function printStatus(mode) {
  const current = state();
  const next = nextRelease();
  if (mode === "--json") {
    console.log(JSON.stringify({ active: current, nextRelease: next?.id ?? null }, null, 2));
    return;
  }
  if (mode === "--database") {
    if (!current) throw new Error("No release has been unlocked.");
    console.log(join(KIT_ROOT, ...current.database.split("/")));
    return;
  }
  if (!current) console.log("Active release: none");
  else {
    console.log(`Active release: ${current.activeRelease}`);
    console.log(`Scenario cutoff: H+${current.cutoffHour}`);
    console.log(`Database: ${current.database}`);
  }
  console.log(`Next release: ${next?.id ?? "none"}`);
}

async function main() {
  const [command = "status", argument] = process.argv.slice(2);
  if (command === "verify") {
    const checked = await verifyPackagedFiles();
    console.log(`Encrypted Edge Kit verification passed (${checked} packaged files).`);
  } else if (command === "status") {
    printStatus(argument);
  } else if (command === "unlock") {
    await unlock(argument);
  } else {
    throw new Error("Usage: node tools/mosaic-release.mjs verify|status [--json|--database]|unlock WORD");
  }
}

main().catch((error) => {
  console.error(`Mission Mosaic release error: ${error.message}`);
  process.exitCode = 1;
});
