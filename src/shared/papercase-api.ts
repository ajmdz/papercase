export type LibraryBookFormat = "pdf" | "epub";

export type LibraryBookSummary = {
  id: string;
  format: LibraryBookFormat;
  title: string;
  originalFileName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type LibraryImportResult =
  | {
      status: "imported";
      book: LibraryBookSummary;
    }
  | {
      status: "duplicate";
      book: LibraryBookSummary;
    }
  | {
      status: "canceled";
    }
  | {
      status: "failed";
      message: string;
    };

export type PapercaseApi = {
  app: {
    getVersion: () => Promise<string>;
  };
  library: {
    listBooks: () => Promise<LibraryBookSummary[]>;
    importBook: () => Promise<LibraryImportResult>;
  };
};
