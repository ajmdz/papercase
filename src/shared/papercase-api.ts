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

export type PdfPageViewMode = "single" | "two-page";
export type PdfZoomMode = "auto" | "actual" | "custom";
export type EpubPageViewMode = "single" | "two-page";

export type PdfReaderLocation = {
  pageNumber: number;
  pageCount: number;
  viewMode: PdfPageViewMode;
  zoom: number;
  zoomMode: PdfZoomMode;
};

export type EpubReaderLocation = {
  cfi: string;
  href: string | null;
  chapterTitle: string | null;
  displayedPage: number | null;
  displayedTotal: number | null;
  fontSizePercent: number;
  viewMode: EpubPageViewMode;
};

export type PdfBookmark = {
  id: string;
  bookId: string;
  format: "pdf";
  location: PdfReaderLocation;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EpubBookmark = {
  id: string;
  bookId: string;
  format: "epub";
  location: EpubReaderLocation;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkSummary = PdfBookmark | EpubBookmark;

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

export type PdfDocumentLoadResult =
  | {
      status: "loaded";
      data: Uint8Array;
      progress: ReaderLocation | null;
    }
  | {
      status: "not-found";
      message: string;
    }
  | {
      status: "not-pdf";
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

export type EpubDocumentLoadResult =
  | {
      status: "loaded";
      data: Uint8Array;
      progress: ReaderLocation | null;
    }
  | {
      status: "not-found";
      message: string;
    }
  | {
      status: "not-epub";
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

export type SavePdfReadingProgressInput = {
  bookId: string;
  format: "pdf";
  location: PdfReaderLocation;
  label: string;
  progressFraction: number | null;
};

export type SaveEpubReadingProgressInput = {
  bookId: string;
  format: "epub";
  location: EpubReaderLocation;
  label: string;
  progressFraction: number | null;
};

export type SaveReadingProgressInput =
  | SavePdfReadingProgressInput
  | SaveEpubReadingProgressInput;

export type SaveReadingProgressResult =
  | {
      status: "saved";
      progress: LibraryBookProgress;
    }
  | {
      status: "failed";
      message: string;
    };

export type CreatePdfBookmarkInput = {
  bookId: string;
  format: "pdf";
  location: PdfReaderLocation;
  label: string | null;
};

export type CreateEpubBookmarkInput = {
  bookId: string;
  format: "epub";
  location: EpubReaderLocation;
  label: string | null;
};

export type CreateBookmarkInput =
  | CreatePdfBookmarkInput
  | CreateEpubBookmarkInput;

export type DeleteBookmarkInput = {
  bookId: string;
  bookmarkId: string;
};

export type ListBookmarksResult =
  | {
      status: "loaded";
      bookmarks: BookmarkSummary[];
    }
  | {
      status: "failed";
      message: string;
    };

export type CreateBookmarkResult =
  | {
      status: "created";
      bookmark: BookmarkSummary;
    }
  | {
      status: "failed";
      message: string;
    };

export type DeleteBookmarkResult =
  | {
      status: "deleted";
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
  reader: {
    loadPdf: (bookId: string) => Promise<PdfDocumentLoadResult>;
    loadEpub: (bookId: string) => Promise<EpubDocumentLoadResult>;
    saveProgress: (
      input: SaveReadingProgressInput,
    ) => Promise<SaveReadingProgressResult>;
  };
  bookmarks: {
    listBookmarks: (bookId: string) => Promise<ListBookmarksResult>;
    createBookmark: (
      input: CreateBookmarkInput,
    ) => Promise<CreateBookmarkResult>;
    deleteBookmark: (
      input: DeleteBookmarkInput,
    ) => Promise<DeleteBookmarkResult>;
  };
};
