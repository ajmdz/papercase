import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryBookSummary,
  PapercaseApi,
} from "../../shared/papercase-api";
import App from "./App";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  Reflect.deleteProperty(window, "papercase");
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the empty library foundation", () => {
    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([]),
    });
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Reading desk" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("shows the empty library after books load", async () => {
    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([]),
    });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "No books yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
  });

  it("renders imported books returned by the library API", async () => {
    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
    });
    render(<App />);

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();
    expect(screen.getByText("QS")).toBeInTheDocument();
    expect(screen.getByText("PDF / 2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More options for Quiet Systems" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 book")).toBeInTheDocument();
  });

  it("renders saved reading progress when available", async () => {
    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([
        makeBook({
          progress: {
            label: "Page 12",
            progressFraction: 0.25,
            updatedAt: "2026-06-14T00:30:00.000Z",
          },
        }),
      ]),
    });
    render(<App />);

    expect(await screen.findByText("Page 12 - 25%")).toBeInTheDocument();
  });

  it("opens a library item into the reader shell", async () => {
    const book = makeBook();
    const openBook = vi.fn().mockResolvedValue({ status: "ready" });

    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([book]),
      openBook,
    });
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Quiet Systems" }),
    );

    expect(
      await screen.findByRole("main", { name: "Reader" }),
    ).toBeInTheDocument();
    expect(openBook).toHaveBeenCalledWith("book-1");
    expect(
      screen.getByRole("heading", { level: 1, name: "Quiet Systems" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to library" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Table of contents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show table of contents" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show bookmarks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show highlights and notes" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show table of contents" }),
    );

    expect(
      screen.getByRole("heading", { name: "Table of contents" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bookmarks" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Highlights and notes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide table of contents" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Show bookmarks" }));
    expect(
      screen.queryByRole("heading", { name: "Table of contents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Bookmarks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No bookmarks yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide bookmarks" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Show highlights and notes" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Bookmarks" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Highlights and notes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No highlights or notes yet.")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("heading", { name: "Highlights and notes" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show table of contents" }),
    );
    fireEvent.click(screen.getByRole("link", { name: /Start/ }));
    expect(
      screen.queryByRole("heading", { name: "Table of contents" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reader options" }));
    expect(
      screen.getByRole("menu", { name: "Reader options" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "System" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("menu", { name: "Reader options" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));

    expect(
      screen.getByRole("heading", { name: "Reading desk" }),
    ).toBeInTheDocument();
  });

  it("shows a reader error state when the local copy is missing", async () => {
    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
      openBook: vi.fn().mockResolvedValue({
        status: "missing-file",
        message: "The local copy for this book is missing.",
      }),
    });
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Quiet Systems" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Book unavailable",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The local copy for this book is missing.",
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to library" }),
    ).toBeInTheDocument();
  });

  it("persists reader theme changes", async () => {
    const updateSettings = vi.fn().mockResolvedValue({
      status: "updated",
      settings: { theme: "dark" },
    });

    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
      updateSettings,
    });
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Quiet Systems" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reader options" }),
    );
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ theme: "dark" });
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Reader options" }));
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("imports a book and shows a restrained success notice", async () => {
    const book = makeBook();
    const listBooks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([book]);
    const importBook = vi.fn().mockResolvedValue({
      status: "imported",
      book,
    });

    installPapercaseApi({
      listBooks,
      importBook,
    });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "No books yet" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Quiet Systems was added to your library.",
    );
    expect(importBook).toHaveBeenCalledOnce();
    expect(listBooks).toHaveBeenCalledTimes(2);
  });

  it("shows a clear duplicate import notice", async () => {
    const book = makeBook();
    const listBooks = vi.fn().mockResolvedValue([book]);
    const importBook = vi.fn().mockResolvedValue({
      status: "duplicate",
      book,
    });

    installPapercaseApi({
      listBooks,
      importBook,
    });
    render(<App />);

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Already in your library: Quiet Systems.",
    );
  });

  it("asks before removing a book and keeps it when canceled", async () => {
    const removeBook = vi.fn().mockResolvedValue({ status: "removed" });

    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
      removeBook,
    });
    render(<App />);

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "More options for Quiet Systems" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Remove Quiet Systems" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Remove Quiet Systems?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This deletes the local copy, reading progress, highlights, notes, and bookmarks from Papercase.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(removeBook).not.toHaveBeenCalled();
    expect(screen.getByText("Quiet Systems")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "This deletes the local copy, reading progress, highlights, notes, and bookmarks from Papercase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("removes a book after confirmation", async () => {
    const removeBook = vi.fn().mockResolvedValue({ status: "removed" });

    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
      removeBook,
    });
    render(<App />);

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "More options for Quiet Systems" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Remove Quiet Systems" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Remove Quiet Systems?" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Quiet Systems from library" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Quiet Systems")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Quiet Systems was removed from your library.",
    );
    expect(removeBook).toHaveBeenCalledWith("book-1");
  });

  it("keeps a book visible when removal fails", async () => {
    const removeBook = vi.fn().mockResolvedValue({
      status: "failed",
      message:
        "The book could not be removed. Its local data was left in place.",
    });

    installPapercaseApi({
      listBooks: vi.fn().mockResolvedValue([makeBook()]),
      removeBook,
    });
    render(<App />);

    expect(await screen.findByText("Quiet Systems")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "More options for Quiet Systems" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Remove Quiet Systems" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Quiet Systems from library" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The book could not be removed. Its local data was left in place.",
    );
    expect(screen.getByText("Quiet Systems")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Remove Quiet Systems?" }),
    ).toBeInTheDocument();
  });
});

function installPapercaseApi({
  listBooks,
  getSettings = vi.fn().mockResolvedValue({ theme: "system" }),
  importBook = vi.fn().mockResolvedValue({ status: "canceled" }),
  openBook = vi.fn().mockResolvedValue({ status: "ready" }),
  removeBook = vi.fn().mockResolvedValue({ status: "not-found" }),
  updateSettings = vi.fn().mockResolvedValue({
    status: "updated",
    settings: { theme: "system" },
  }),
}: {
  listBooks: PapercaseApi["library"]["listBooks"];
  getSettings?: PapercaseApi["settings"]["getSettings"];
  importBook?: PapercaseApi["library"]["importBook"];
  openBook?: PapercaseApi["library"]["openBook"];
  removeBook?: PapercaseApi["library"]["removeBook"];
  updateSettings?: PapercaseApi["settings"]["updateSettings"];
}): void {
  const api: PapercaseApi = {
    app: {
      getVersion: vi.fn().mockResolvedValue("0.0.0"),
    },
    library: {
      listBooks,
      openBook,
      importBook,
      removeBook,
    },
    settings: {
      getSettings,
      updateSettings,
    },
  };

  Object.defineProperty(window, "papercase", {
    configurable: true,
    value: api,
  });
}

function makeBook(
  overrides: Partial<LibraryBookSummary> = {},
): LibraryBookSummary {
  return {
    id: "book-1",
    format: "pdf",
    title: "Quiet Systems",
    originalFileName: "quiet-systems.pdf",
    fileSize: 2048,
    progress: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    lastOpenedAt: null,
    ...overrides,
  };
}
