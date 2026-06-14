export type LibraryBookFormat = "pdf" | "epub";

export type LibraryBookProgress = {
  label: string | null;
  progressFraction: number | null;
  updatedAt: string;
};

export type LibraryBookSummary = {
  id: string;
  format: LibraryBookFormat;
  title: string;
  originalFileName: string;
  fileSize: number;
  progress: LibraryBookProgress | null;
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

export type LibraryRemoveResult =
  | {
      status: "removed";
    }
  | {
      status: "not-found";
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
    removeBook: (bookId: string) => Promise<LibraryRemoveResult>;
  };
};
