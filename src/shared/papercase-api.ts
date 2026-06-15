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

export type ReaderLocation = {
  bookId: string;
  format: LibraryBookFormat;
  location: unknown;
  label?: string;
};

export type LibraryOpenResult =
  | {
      status: "ready";
    }
  | {
      status: "not-found";
      message: string;
    }
  | {
      status: "missing-file";
      message: string;
    }
  | {
      status: "failed";
      message: string;
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

export type AppTheme = "system" | "light" | "dark";

export type AppSettings = {
  theme: AppTheme;
};

export type SettingsUpdateInput = {
  theme?: AppTheme;
};

export type SettingsUpdateResult =
  | {
      status: "updated";
      settings: AppSettings;
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
    openBook: (bookId: string) => Promise<LibraryOpenResult>;
    importBook: () => Promise<LibraryImportResult>;
    removeBook: (bookId: string) => Promise<LibraryRemoveResult>;
  };
  settings: {
    getSettings: () => Promise<AppSettings>;
    updateSettings: (
      input: SettingsUpdateInput,
    ) => Promise<SettingsUpdateResult>;
  };
};
