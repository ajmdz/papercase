import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, rm, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { BookRecord, BooksRepository } from "../storage/books-repository";
import {
  resolveBookStoragePaths,
  type AppStoragePaths,
  type BookFormat,
} from "../storage/paths";

const METADATA_SAMPLE_BYTES = 2_000_000;
const MAX_EPUB_METADATA_ENTRY_BYTES = 4_000_000;

export type ImportBookDependencies = {
  paths: AppStoragePaths;
  repository: BooksRepository;
};

export type ImportBookFromFileResult = {
  status: "imported" | "duplicate";
  book: BookRecord;
};

export type ImportBookErrorCode = "unsupported-format" | "not-file";

export class ImportBookError extends Error {
  constructor(
    readonly code: ImportBookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportBookError";
  }
}

export async function importBookFromFile(
  filePath: string,
  dependencies: ImportBookDependencies,
): Promise<ImportBookFromFileResult> {
  const format = detectBookFormat(filePath);

  if (!format) {
    throw new ImportBookError(
      "unsupported-format",
      "Choose a PDF or EPUB file.",
    );
  }

  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new ImportBookError(
      "not-file",
      "The selected item is not a readable file.",
    );
  }

  const fileHash = `sha256:${await computeFileHash(filePath)}`;
  const existingBook = dependencies.repository.findByFileHash(fileHash);

  if (existingBook) {
    return {
      status: "duplicate",
      book: existingBook,
    };
  }

  const bookId = randomUUID();
  const storagePaths = resolveBookStoragePaths(
    dependencies.paths,
    bookId,
    format,
  );
  const originalFileName = basename(filePath);

  await mkdir(storagePaths.directory, { recursive: true });

  try {
    await copyFile(filePath, storagePaths.sourceFile);

    const extractedTitle = await extractBookTitle(
      storagePaths.sourceFile,
      format,
    );
    const title = titleFromMetadataOrFileName(extractedTitle, originalFileName);

    return {
      status: "imported",
      book: dependencies.repository.create({
        id: bookId,
        format,
        title,
        fileHash,
        storagePath: storagePaths.sourceFile,
        coverPath: null,
        originalFileName,
        fileSize: fileStats.size,
      }),
    };
  } catch (error) {
    await rm(storagePaths.directory, { recursive: true, force: true });
    throw error;
  }
}

export function importErrorMessage(error: unknown): string {
  if (error instanceof ImportBookError) {
    return error.message;
  }

  return "The book could not be imported. Check the file and try again.";
}

export function detectBookFormat(filePath: string): BookFormat | null {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    return "pdf";
  }

  if (extension === ".epub") {
    return "epub";
  }

  return null;
}

export async function extractBookTitle(
  filePath: string,
  format: BookFormat,
): Promise<string | null> {
  if (format === "pdf") {
    return extractPdfTitle(filePath);
  }

  return extractEpubTitle(filePath);
}

export function titleFromFileName(fileName: string): string {
  const extension = extname(fileName);
  const title = basename(fileName, extension)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || fileName || "Untitled book";
}

export function titleFromMetadataOrFileName(
  metadataTitle: string | null,
  fileName: string,
): string {
  return normalizeTitle(metadataTitle) ?? titleFromFileName(fileName);
}

async function computeFileHash(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function extractPdfTitle(filePath: string): Promise<string | null> {
  const sample = await readFileSample(filePath);
  const text = sample.toString("latin1");
  const literalTitle = /\/Title\s*\(((?:\\.|[^\\)])*)\)/.exec(text);

  if (literalTitle) {
    return normalizeTitle(decodePdfLiteralString(literalTitle[1]));
  }

  const hexTitle = /\/Title\s*<([0-9a-fA-F\s]+)>/.exec(text);

  if (hexTitle) {
    return normalizeTitle(decodePdfHexString(hexTitle[1]));
  }

  return null;
}

async function extractEpubTitle(filePath: string): Promise<string | null> {
  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();
    const buffer = Buffer.alloc(size);
    await file.read(buffer, 0, size, 0);
    const archive = readZipArchive(buffer);
    const containerXml = readZipEntryText(archive, "META-INF/container.xml");

    if (!containerXml) {
      return null;
    }

    const opfPath = parseEpubRootfilePath(containerXml);

    if (!opfPath) {
      return null;
    }

    const packageXml = readZipEntryText(archive, opfPath);

    if (!packageXml) {
      return null;
    }

    return normalizeTitle(parseEpubTitle(packageXml));
  } finally {
    await file.close();
  }
}

async function readFileSample(filePath: string): Promise<Buffer> {
  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();

    if (size <= METADATA_SAMPLE_BYTES * 2) {
      const buffer = Buffer.alloc(size);
      await file.read(buffer, 0, size, 0);
      return buffer;
    }

    const firstChunk = Buffer.alloc(METADATA_SAMPLE_BYTES);
    const lastChunk = Buffer.alloc(METADATA_SAMPLE_BYTES);

    await file.read(firstChunk, 0, firstChunk.length, 0);
    await file.read(
      lastChunk,
      0,
      lastChunk.length,
      size - METADATA_SAMPLE_BYTES,
    );

    return Buffer.concat([firstChunk, Buffer.from("\n"), lastChunk]);
  } finally {
    await file.close();
  }
}

function decodePdfLiteralString(value: string): string {
  let bytes = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "\\") {
      bytes += character;
      continue;
    }

    const nextCharacter = value[index + 1];

    if (!nextCharacter) {
      continue;
    }

    index += 1;

    if (nextCharacter === "n") {
      bytes += "\n";
    } else if (nextCharacter === "r") {
      bytes += "\r";
    } else if (nextCharacter === "t") {
      bytes += "\t";
    } else if (nextCharacter === "b") {
      bytes += "\b";
    } else if (nextCharacter === "f") {
      bytes += "\f";
    } else if (/^[0-7]$/.test(nextCharacter)) {
      const octal = [nextCharacter];

      while (octal.length < 3 && /^[0-7]$/.test(value[index + 1] ?? "")) {
        octal.push(value[index + 1]);
        index += 1;
      }

      bytes += String.fromCharCode(Number.parseInt(octal.join(""), 8));
    } else if (nextCharacter === "\r" || nextCharacter === "\n") {
      if (nextCharacter === "\r" && value[index + 1] === "\n") {
        index += 1;
      }
    } else {
      bytes += nextCharacter;
    }
  }

  return decodePdfByteString(binaryStringToBuffer(bytes));
}

function decodePdfHexString(value: string): string {
  const compactHex = value.replace(/\s+/g, "");
  const bytes = Buffer.from(
    compactHex.length % 2 === 0 ? compactHex : `${compactHex}0`,
    "hex",
  );

  return decodePdfByteString(bytes);
}

function decodePdfByteString(bytes: Buffer): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    if (isAsciiAfterUnicodeMarker(bytes.subarray(2))) {
      return "";
    }

    return decodeUtf16Be(bytes.subarray(2));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (isAsciiAfterUnicodeMarker(bytes.subarray(2))) {
      return "";
    }

    return bytes.subarray(2).toString("utf16le");
  }

  return bytes.toString("utf8");
}

function isAsciiAfterUnicodeMarker(bytes: Buffer): boolean {
  return (
    bytes.length > 0 && bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)
  );
}

function binaryStringToBuffer(value: string): Buffer {
  const bytes = Buffer.alloc(value.length);

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }

  return bytes;
}

function decodeUtf16Be(bytes: Buffer): string {
  let decoded = "";

  for (let index = 0; index + 1 < bytes.length; index += 2) {
    decoded += String.fromCharCode(bytes.readUInt16BE(index));
  }

  return decoded;
}

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type ZipArchive = {
  buffer: Buffer;
  entries: Map<string, ZipEntry>;
};

function readZipArchive(buffer: Buffer): ZipArchive {
  const endOfCentralDirectory = findEndOfCentralDirectory(buffer);
  const entries = new Map<string, ZipEntry>();

  if (!endOfCentralDirectory) {
    return { buffer, entries };
  }

  const centralDirectoryEnd =
    endOfCentralDirectory.offset + endOfCentralDirectory.size;
  let offset = endOfCentralDirectory.offset;

  while (offset < centralDirectoryEnd && offset + 46 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameEnd + extraFieldLength + fileCommentLength;
  }

  return { buffer, entries };
}

function findEndOfCentralDirectory(
  buffer: Buffer,
): { offset: number; size: number } | null {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) {
      continue;
    }

    return {
      offset: buffer.readUInt32LE(offset + 16),
      size: buffer.readUInt32LE(offset + 12),
    };
  }

  return null;
}

function readZipEntryText(
  archive: ZipArchive,
  entryName: string,
): string | null {
  const entry = archive.entries.get(entryName);

  if (!entry || entry.uncompressedSize > MAX_EPUB_METADATA_ENTRY_BYTES) {
    return null;
  }

  const bytes = readZipEntryBuffer(archive.buffer, entry);

  return bytes ? bytes.toString("utf8") : null;
}

function readZipEntryBuffer(buffer: Buffer, entry: ZipEntry): Buffer | null {
  const localHeaderOffset = entry.localHeaderOffset;

  if (
    localHeaderOffset + 30 > buffer.length ||
    buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
  ) {
    return null;
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (dataEnd > buffer.length) {
    return null;
  }

  const compressedBytes = buffer.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === 0) {
    return compressedBytes;
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressedBytes);
  }

  return null;
}

function parseEpubRootfilePath(containerXml: string): string | null {
  const match = /<rootfile\b[^>]*\bfull-path=(["'])(.*?)\1/i.exec(containerXml);

  return match ? decodeXmlEntities(match[2]) : null;
}

function parseEpubTitle(packageXml: string): string | null {
  const titleMatch =
    /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(packageXml) ??
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(packageXml);

  if (!titleMatch) {
    return null;
  }

  return decodeXmlEntities(
    titleMatch[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, ""),
  );
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|apos|quot);/g,
    (entity, body: string) => {
      if (body === "amp") {
        return "&";
      }

      if (body === "lt") {
        return "<";
      }

      if (body === "gt") {
        return ">";
      }

      if (body === "apos") {
        return "'";
      }

      if (body === "quot") {
        return '"';
      }

      if (body.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
      }

      if (body.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
      }

      return entity;
    },
  );
}

function normalizeTitle(title: string | null): string | null {
  const normalized = title?.replace(/\s+/g, " ").trim();

  return normalized && isUsableMetadataTitle(normalized) ? normalized : null;
}

function isUsableMetadataTitle(title: string): boolean {
  if (title.includes("þÿ") || title.includes("\u0000")) {
    return false;
  }

  if (containsDisallowedTitleCharacter(title)) {
    return false;
  }

  if (/^\d+$/.test(title)) {
    return false;
  }

  return true;
}

function containsDisallowedTitleCharacter(title: string): boolean {
  for (const character of title) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === undefined ||
      codePoint === 0xfffd ||
      (codePoint >= 0x01 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f)
    ) {
      return true;
    }
  }

  return false;
}
