// @vitest-environment node

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BooksRepository } from "../storage/books-repository";
import { initializeLocalStorage } from "../storage/database";
import {
  detectBookFormat,
  importBookFromFile,
  titleFromFileName,
  titleFromMetadataOrFileName,
} from "./import-service";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("importBookFromFile", () => {
  it("imports a PDF by copying it into app storage and storing metadata", async () => {
    const sourceDir = makeTempDir();
    const sourcePath = join(sourceDir, "quiet-systems.pdf");
    writeFileSync(
      sourcePath,
      "%PDF-1.7\n1 0 obj\n<< /Title (Quiet Systems) >>\nendobj\n",
    );
    const userDataDir = makeTempDir();
    const storage = initializeLocalStorage(userDataDir);
    const repository = new BooksRepository(storage.database);
    let isStorageClosed = false;

    try {
      const result = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });

      expect(result.status).toBe("imported");
      expect(result.book).toMatchObject({
        format: "pdf",
        title: "Quiet Systems",
        originalFileName: "quiet-systems.pdf",
        fileSize: readFileSync(sourcePath).byteLength,
      });
      expect(result.book.storagePath).toBe(
        join(storage.paths.booksDir, result.book.id, "source.pdf"),
      );
      expect(existsSync(result.book.storagePath)).toBe(true);
      expect(readFileSync(result.book.storagePath)).toEqual(
        readFileSync(sourcePath),
      );

      rmSync(sourcePath);

      expect(existsSync(result.book.storagePath)).toBe(true);
      expect(repository.list()).toEqual([result.book]);

      storage.database.close();
      isStorageClosed = true;

      const reopenedStorage = initializeLocalStorage(userDataDir);
      const reopenedRepository = new BooksRepository(reopenedStorage.database);

      try {
        expect(reopenedRepository.list()).toEqual([result.book]);
      } finally {
        reopenedStorage.database.close();
      }
    } finally {
      if (!isStorageClosed) {
        storage.database.close();
      }
    }
  });

  it("imports an EPUB title from its package document", async () => {
    const sourceDir = makeTempDir();
    const sourcePath = join(sourceDir, "metadata.epub");
    writeFileSync(
      sourcePath,
      makeZipArchive([
        {
          name: "META-INF/container.xml",
          content: `
            <container>
              <rootfiles>
                <rootfile full-path="OPS/content.opf" />
              </rootfiles>
            </container>
          `,
        },
        {
          name: "OPS/content.opf",
          content: `
            <package>
              <metadata>
                <dc:title>EPUB &amp; Care</dc:title>
              </metadata>
            </package>
          `,
        },
      ]),
    );
    const userDataDir = makeTempDir();
    const storage = initializeLocalStorage(userDataDir);
    const repository = new BooksRepository(storage.database);
    let isStorageClosed = false;

    try {
      const result = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });

      expect(result.status).toBe("imported");
      expect(result.book).toMatchObject({
        format: "epub",
        title: "EPUB & Care",
        originalFileName: "metadata.epub",
      });
      expect(result.book.storagePath).toBe(
        join(storage.paths.booksDir, result.book.id, "source.epub"),
      );
      expect(existsSync(result.book.storagePath)).toBe(true);

      storage.database.close();
      isStorageClosed = true;

      const reopenedStorage = initializeLocalStorage(userDataDir);
      const reopenedRepository = new BooksRepository(reopenedStorage.database);

      try {
        expect(reopenedRepository.list()).toEqual([result.book]);
      } finally {
        reopenedStorage.database.close();
      }
    } finally {
      if (!isStorageClosed) {
        storage.database.close();
      }
    }
  });

  it("blocks re-importing the exact same file hash", async () => {
    const sourceDir = makeTempDir();
    const sourcePath = join(sourceDir, "duplicate.pdf");
    writeFileSync(sourcePath, "%PDF-1.7\nsame contents\n");
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      const firstImport = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });
      const duplicateImport = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });

      expect(firstImport.status).toBe("imported");
      expect(duplicateImport).toEqual({
        status: "duplicate",
        book: firstImport.book,
      });
      expect(repository.list()).toHaveLength(1);
    } finally {
      storage.database.close();
    }
  });

  it("falls back to the filename when metadata is missing", async () => {
    const sourceDir = makeTempDir();
    const sourcePath = join(sourceDir, "missing-metadata.pdf");
    writeFileSync(sourcePath, "%PDF-1.7\n");
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      const result = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });

      expect(result.status).toBe("imported");
      expect(result.book.title).toBe("missing metadata");
    } finally {
      storage.database.close();
    }
  });

  it("falls back to the filename when PDF title metadata is unusable", async () => {
    const sourceDir = makeTempDir();
    const sourcePath = join(sourceDir, "ace-study-guide.pdf");
    writeFileSync(
      sourcePath,
      "%PDF-1.7\n1 0 obj\n<< /Title (\\376\\377536760822) >>\nendobj\n",
    );
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      const result = await importBookFromFile(sourcePath, {
        paths: storage.paths,
        repository,
      });

      expect(result.status).toBe("imported");
      expect(result.book.title).toBe("ace study guide");
    } finally {
      storage.database.close();
    }
  });
});

describe("import helpers", () => {
  it("detects supported formats by extension", () => {
    expect(detectBookFormat("/tmp/book.PDF")).toBe("pdf");
    expect(detectBookFormat("/tmp/book.epub")).toBe("epub");
    expect(detectBookFormat("/tmp/book.txt")).toBeNull();
  });

  it("cleans fallback titles from filenames", () => {
    expect(titleFromFileName("quiet-reading_notes.pdf")).toBe(
      "quiet reading notes",
    );
  });

  it("uses the filename when stored metadata titles are not displayable", () => {
    expect(
      titleFromMetadataOrFileName("þÿ536760822", "ace-study-guide.pdf"),
    ).toBe("ace study guide");
  });
});

function makeTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "papercase-import-"));
  tempDirs.push(tempDir);
  return tempDir;
}

type ZipFixtureEntry = {
  name: string;
  content: string;
};

function makeZipArchive(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, fileName, content);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.length + fileName.length + content.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce(
    (size, part) => size + part.length,
    0,
  );
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}
