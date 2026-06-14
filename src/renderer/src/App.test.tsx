import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryBookSummary,
  PapercaseApi,
} from "../../shared/papercase-api";
import App from "./App";

afterEach(() => {
  cleanup();
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
    expect(screen.getByText("quiet-systems.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 book")).toBeInTheDocument();
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
});

function installPapercaseApi({
  listBooks,
  importBook = vi.fn().mockResolvedValue({ status: "canceled" }),
}: {
  listBooks: PapercaseApi["library"]["listBooks"];
  importBook?: PapercaseApi["library"]["importBook"];
}): void {
  const api: PapercaseApi = {
    app: {
      getVersion: vi.fn().mockResolvedValue("0.0.0"),
    },
    library: {
      listBooks,
      importBook,
    },
  };

  Object.defineProperty(window, "papercase", {
    configurable: true,
    value: api,
  });
}

function makeBook(): LibraryBookSummary {
  return {
    id: "book-1",
    format: "pdf",
    title: "Quiet Systems",
    originalFileName: "quiet-systems.pdf",
    fileSize: 2048,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    lastOpenedAt: null,
  };
}
