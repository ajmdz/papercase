import type {
  MouseEvent as ReactMouseEvent,
  ReactElement,
  RefObject,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Epub from "epubjs";
import type {
  Book,
  Contents,
  Location as EpubLocation,
  NavItem,
  Rendition,
} from "epubjs";
import type {
  AppTheme,
  EpubPageViewMode,
  EpubReaderLocation,
  LibraryBookSummary,
  ReaderLocation,
} from "../../shared/papercase-api";
import type {
  ReaderContentsItem,
  ReaderNavigationTarget,
} from "./reader-types";

type EpubReaderProps = {
  book: LibraryBookSummary;
  fontSizePercent: number;
  theme: AppTheme;
  onContentsChange: (contents: ReaderContentsItem[]) => void;
  onFontSizeChange: (fontSizePercent: number) => void;
  onLocationChange: (location: ReaderLocation) => void;
  pageNavigationRef: RefObject<
    ((target: ReaderNavigationTarget) => void) | null
  >;
};

type EpubLoadStatus =
  | {
      name: "loading";
    }
  | {
      name: "ready";
    }
  | {
      name: "failed";
      message: string;
    };

type EpubRelocation = EpubLocation & {
  start: EpubLocation["start"] & {
    cfi: string;
    href: string;
    percentage?: number;
    displayed?: {
      page?: number;
      total?: number;
    };
  };
  end: EpubLocation["end"] & {
    cfi: string;
    href: string;
  };
};

type EpubContextMenuPosition = {
  x: number;
  y: number;
};

type EpubFooterLocation = {
  pageLabel: string;
  sectionLabel: string | null;
};

export const minEpubFontSize = 80;
export const maxEpubFontSize = 160;
export const defaultEpubFontSize = 100;
export const epubFontSizeStep = 10;

const generatedLocationBreak = 1600;
const contextMenuWidth = 236;
const contextMenuHeight = 198;
const epubViewModeStoragePrefix = "papercase:epub-view-mode:";
const renditionResizeDelay = 90;
const viewportEdgeInset = 8;

export function EpubReader({
  book,
  fontSizePercent,
  theme,
  onContentsChange,
  onFontSizeChange,
  onLocationChange,
  pageNavigationRef,
}: EpubReaderProps): ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentLocationRef = useRef<EpubReaderLocation | null>(null);
  const fontSizeRef = useRef(defaultEpubFontSize);
  const viewModeRef = useRef<EpubPageViewMode>("single");
  const [status, setStatus] = useState<EpubLoadStatus>({ name: "loading" });
  const [viewMode, setViewMode] = useState<EpubPageViewMode>("single");
  const [currentLocation, setCurrentLocation] =
    useState<EpubReaderLocation | null>(null);
  const [progressFraction, setProgressFraction] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState("Opening EPUB");
  const [canGoPrevious, setCanGoPrevious] = useState(false);
  const [canGoNext, setCanGoNext] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<EpubContextMenuPosition | null>(null);
  const resolvedTheme = useResolvedTheme(theme);
  const resolvedThemeRef = useRef(resolvedTheme);

  const displayNavigationTarget = useCallback(
    (target: ReaderNavigationTarget) => {
      if (typeof target !== "string") {
        return;
      }

      void renditionRef.current?.display(target);
    },
    [],
  );

  const goToPreviousPage = useCallback(() => {
    setContextMenuPosition(null);
    void renditionRef.current?.prev();
  }, []);

  const goToNextPage = useCallback(() => {
    setContextMenuPosition(null);
    void renditionRef.current?.next();
  }, []);

  const notifyReaderInteraction = useCallback(() => {
    window.dispatchEvent(new Event("papercase:reader-interaction"));
  }, []);

  const handleIframeContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      notifyReaderInteraction();

      const iframe = event.view?.frameElement;
      const iframeRect =
        iframe instanceof HTMLElement ? iframe.getBoundingClientRect() : null;

      setContextMenuPosition(
        clampContextMenuPosition(
          event.clientX + (iframeRect?.left ?? 0),
          event.clientY + (iframeRect?.top ?? 0),
        ),
      );
    },
    [notifyReaderInteraction],
  );

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    fontSizeRef.current = fontSizePercent;

    const rendition = renditionRef.current;

    if (!rendition) {
      return;
    }

    rendition.themes.fontSize(`${fontSizePercent}%`);
    setCurrentLocation((location) =>
      location ? { ...location, fontSizePercent } : location,
    );

    if (currentLocationRef.current?.cfi) {
      void rendition.display(currentLocationRef.current.cfi);
    }
  }, [fontSizePercent]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    resolvedThemeRef.current = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    let isCancelled = false;
    let epubBook: Book | null = null;
    let rendition: Rendition | null = null;
    const stageElement = stageRef.current;

    async function loadEpub(): Promise<void> {
      const api = window.papercase?.reader;

      setStatus({ name: "loading" });
      setCurrentLocation(null);
      setProgressFraction(null);
      setLocationLabel("Opening EPUB");
      setCanGoPrevious(false);
      setCanGoNext(false);
      onContentsChange([]);

      if (!stageElement) {
        setStatus({
          name: "failed",
          message: "The EPUB reader could not find a reading surface.",
        });
        return;
      }

      if (!api) {
        setStatus({
          name: "failed",
          message: "The EPUB reader is unavailable in this environment.",
        });
        return;
      }

      try {
        const result = await api.loadEpub(book.id);

        if (isCancelled) {
          return;
        }

        if (result.status !== "loaded") {
          setStatus({ name: "failed", message: result.message });
          return;
        }

        const restoredLocation = parseEpubReaderLocation(
          result.progress?.location,
        );
        const restoredFontSize =
          restoredLocation?.fontSizePercent ?? defaultEpubFontSize;
        const restoredViewMode =
          readStoredEpubViewMode(book.id) ??
          restoredLocation?.viewMode ??
          "single";

        onFontSizeChange(restoredFontSize);
        fontSizeRef.current = restoredFontSize;
        setViewMode(restoredViewMode);
        viewModeRef.current = restoredViewMode;

        epubBook = Epub(toArrayBuffer(result.data));
        bookRef.current = epubBook;

        rendition = epubBook.renderTo(stageElement, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: epubSpreadForViewMode(restoredViewMode),
          minSpreadWidth: 0,
          manager: "default",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        registerEpubThemes(rendition);
        applyEpubTheme(rendition, resolvedThemeRef.current);
        rendition.themes.fontSize(`${restoredFontSize}%`);
        rendition.on("relocated", handleRelocated);
        rendition.hooks.content.register((contents: Contents) => {
          applyEpubContentRules(contents);
          contents.document.addEventListener(
            "contextmenu",
            handleIframeContextMenu,
          );
          contents.document.addEventListener(
            "pointerdown",
            notifyReaderInteraction,
          );
        });

        void epubBook.loaded.navigation
          .then((navigation) => {
            if (!isCancelled) {
              onContentsChange(flattenEpubToc(navigation.toc));
            }
          })
          .catch(() => {
            if (!isCancelled) {
              onContentsChange([]);
            }
          });
        void epubBook.ready
          .then(() => epubBook?.locations.generate(generatedLocationBreak))
          .then(() => {
            if (!isCancelled) {
              void rendition?.reportLocation();
            }
          })
          .catch(() => []);

        await withTimeout(
          rendition.display(restoredLocation?.cfi),
          "The EPUB took too long to render.",
        );

        if (!isCancelled) {
          setStatus({ name: "ready" });
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus({
            name: "failed",
            message:
              error instanceof Error
                ? error.message
                : "The EPUB could not be rendered.",
          });
        }
      }
    }

    function handleRelocated(location: EpubRelocation): void {
      const activeBook = bookRef.current;
      const chapterTitle = findTocTitleByHref(
        activeBook?.navigation?.toc ?? [],
        location.start.href,
      );
      const generatedPage = readGeneratedPage(activeBook, location.start.cfi);
      const displayedPage = generatedPage?.page ?? null;
      const displayedTotal = generatedPage?.total ?? null;
      const nextProgressFraction = readProgressFraction(activeBook, location);
      const nextLocation: EpubReaderLocation = {
        cfi: location.start.cfi,
        href: location.start.href,
        chapterTitle,
        displayedPage,
        displayedTotal,
        fontSizePercent: fontSizeRef.current,
        viewMode: viewModeRef.current,
      };
      const nextLabel = formatEpubLocationLabel(
        nextLocation,
        nextProgressFraction,
      );

      setCurrentLocation(nextLocation);
      setProgressFraction(nextProgressFraction);
      setLocationLabel(nextLabel);
      setCanGoPrevious(!location.atStart);
      setCanGoNext(!location.atEnd);
      onLocationChange({
        bookId: book.id,
        format: "epub",
        location: nextLocation,
        label: nextLabel,
      });
    }

    void loadEpub();

    return () => {
      isCancelled = true;
      onContentsChange([]);
      if (pageNavigationRef.current === displayNavigationTarget) {
        pageNavigationRef.current = null;
      }
      rendition?.off("relocated", handleRelocated);
      rendition?.destroy();
      epubBook?.destroy();
      if (bookRef.current === epubBook) {
        bookRef.current = null;
      }
      if (renditionRef.current === rendition) {
        renditionRef.current = null;
      }
    };
  }, [
    book.id,
    displayNavigationTarget,
    handleIframeContextMenu,
    notifyReaderInteraction,
    onContentsChange,
    onFontSizeChange,
    onLocationChange,
    pageNavigationRef,
  ]);

  useEffect(() => {
    const rendition = renditionRef.current;

    if (!rendition) {
      return;
    }

    applyEpubTheme(rendition, resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    pageNavigationRef.current = displayNavigationTarget;

    return () => {
      if (pageNavigationRef.current === displayNavigationTarget) {
        pageNavigationRef.current = null;
      }
    };
  }, [displayNavigationTarget, pageNavigationRef]);

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    function handlePointerDown(): void {
      setContextMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setContextMenuPosition(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handlePointerDown);
    };
  }, [contextMenuPosition]);

  useEffect(() => {
    if (status.name !== "ready") {
      return;
    }

    const stageElement = stageRef.current;

    if (!stageElement) {
      return;
    }

    const observedStageElement = stageElement;
    let lastHeight = 0;
    let lastWidth = 0;
    let resizeTimeoutId: number | null = null;

    function resizeAtCurrentLocation(): void {
      resizeTimeoutId = null;

      const bounds = observedStageElement.getBoundingClientRect();
      const nextHeight = Math.round(bounds.height);
      const nextWidth = Math.round(bounds.width);

      if (nextWidth < 1 || nextHeight < 1) {
        return;
      }

      if (nextWidth === lastWidth && nextHeight === lastHeight) {
        return;
      }

      lastWidth = nextWidth;
      lastHeight = nextHeight;

      resizeEpubRendition(
        renditionRef.current,
        currentLocationRef.current?.cfi,
      );
    }

    function scheduleResize(): void {
      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
      }

      resizeTimeoutId = window.setTimeout(
        resizeAtCurrentLocation,
        renditionResizeDelay,
      );
    }

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(observedStageElement);
      scheduleResize();

      return () => {
        resizeObserver.disconnect();
        if (resizeTimeoutId !== null) {
          window.clearTimeout(resizeTimeoutId);
        }
      };
    }

    window.addEventListener("resize", scheduleResize);
    scheduleResize();

    return () => {
      window.removeEventListener("resize", scheduleResize);
      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
      }
    };
  }, [status.name]);

  useEffect(() => {
    if (status.name !== "ready") {
      return;
    }

    const rendition = renditionRef.current;

    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableOrControlTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousPage();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextPage();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    rendition?.on("keyup", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      rendition?.off("keyup", handleKeyDown);
    };
  }, [goToNextPage, goToPreviousPage, status.name]);

  useEffect(() => {
    if (status.name !== "ready" || !currentLocation) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void window.papercase?.reader.saveProgress({
        bookId: book.id,
        format: "epub",
        location: currentLocation,
        label: locationLabel,
        progressFraction,
      });
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [book.id, currentLocation, locationLabel, progressFraction, status.name]);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>): void {
    event.preventDefault();
    setContextMenuPosition(
      clampContextMenuPosition(event.clientX, event.clientY),
    );
  }

  function handleViewModeChange(nextViewMode: EpubPageViewMode): void {
    const rendition = renditionRef.current;
    const currentLocation = currentLocationRef.current;

    writeStoredEpubViewMode(book.id, nextViewMode);
    setViewMode(nextViewMode);
    viewModeRef.current = nextViewMode;
    setContextMenuPosition(null);

    if (currentLocation) {
      const nextLocation = {
        ...currentLocation,
        viewMode: nextViewMode,
      };

      currentLocationRef.current = nextLocation;
      setCurrentLocation(nextLocation);
      onLocationChange({
        bookId: book.id,
        format: "epub",
        location: nextLocation,
        label: locationLabel,
      });
      void window.papercase?.reader.saveProgress({
        bookId: book.id,
        format: "epub",
        location: nextLocation,
        label: locationLabel,
        progressFraction,
      });
    }

    if (!rendition) {
      return;
    }

    rendition.spread(epubSpreadForViewMode(nextViewMode), 0);
    resizeEpubRendition(rendition, currentLocationRef.current?.cfi);

    if (currentLocationRef.current?.cfi) {
      void rendition.display(currentLocationRef.current.cfi);
    }
  }

  const footerLocation = formatEpubFooterLocation(currentLocation);

  return (
    <section
      className="epub-reader"
      aria-label="EPUB reader"
      onContextMenu={handleContextMenu}
    >
      <div ref={stageRef} className="epub-reader-surface" />

      {status.name === "loading" ? (
        <section className="epub-reader-status" role="status">
          <p className="dialog-kicker">EPUB</p>
          <h2>Opening EPUB</h2>
        </section>
      ) : null}

      {status.name === "failed" ? (
        <section className="epub-reader-status" role="alert">
          <p className="dialog-kicker">EPUB</p>
          <h2>Unable to render EPUB</h2>
          <p>{status.message}</p>
        </section>
      ) : null}

      {contextMenuPosition ? (
        <EpubContextMenu
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          position={contextMenuPosition}
          viewMode={viewMode}
          onClose={() => setContextMenuPosition(null)}
          onNextPage={goToNextPage}
          onPreviousPage={goToPreviousPage}
          onViewModeChange={handleViewModeChange}
        />
      ) : null}

      {status.name === "ready" && footerLocation ? (
        <footer
          className="epub-reader-footer"
          aria-label={
            footerLocation.sectionLabel
              ? `${footerLocation.pageLabel}, ${footerLocation.sectionLabel}`
              : footerLocation.pageLabel
          }
        >
          <p className="epub-reader-footer-page">{footerLocation.pageLabel}</p>
          {footerLocation.sectionLabel ? (
            <p className="epub-reader-footer-section">
              {footerLocation.sectionLabel}
            </p>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function applyEpubContentRules(contents: Contents): void {
  void contents.addStylesheetRules(
    {
      body: {
        "padding-top": "32px !important",
        "padding-bottom": "32px !important",
      },
    },
    "papercase-epub-spacing",
  );
}

function registerEpubThemes(rendition: Rendition): void {
  rendition.themes.register("papercase-light", {
    body: {
      color: "#171817",
      background: "#fbfbf8",
      "font-family": "Georgia, 'Times New Roman', serif",
      "line-height": "1.58",
      margin: "0 !important",
      padding: "0 !important",
    },
    a: {
      color: "#326b5f",
    },
    "img, svg": {
      "max-width": "100%",
      height: "auto",
    },
    "::selection": {
      background: "#dcebe6",
    },
  });

  rendition.themes.register("papercase-dark", {
    body: {
      color: "#ededeb",
      background: "#141515",
      "font-family": "Georgia, 'Times New Roman', serif",
      "line-height": "1.58",
      margin: "0 !important",
      padding: "0 !important",
    },
    a: {
      color: "#8fcab8",
    },
    "img, svg": {
      "max-width": "100%",
      height: "auto",
    },
    "::selection": {
      background: "#1d302b",
    },
  });
}

function EpubContextMenu({
  canGoNext,
  canGoPrevious,
  position,
  viewMode,
  onClose,
  onNextPage,
  onPreviousPage,
  onViewModeChange,
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  position: EpubContextMenuPosition;
  viewMode: EpubPageViewMode;
  onClose: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onViewModeChange: (viewMode: EpubPageViewMode) => void;
}): ReactElement {
  function handleMenuContextMenu(event: ReactMouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerDown(event: ReactMouseEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  return (
    <section
      aria-label="EPUB reader menu"
      className="pdf-context-menu epub-context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={handleMenuContextMenu}
      onPointerDown={handlePointerDown}
    >
      <div className="pdf-context-menu-section">
        <EpubContextMenuItem
          checked={viewMode === "single"}
          label="Single Page"
          role="menuitemradio"
          onSelect={() => onViewModeChange("single")}
        />
        <EpubContextMenuItem
          checked={viewMode === "two-page"}
          label="Two Pages"
          role="menuitemradio"
          onSelect={() => onViewModeChange("two-page")}
        />
      </div>

      <div className="pdf-context-menu-section">
        <EpubContextMenuItem
          disabled={!canGoNext}
          label="Next Page"
          onSelect={onNextPage}
        />
        <EpubContextMenuItem
          disabled={!canGoPrevious}
          label="Previous Page"
          onSelect={onPreviousPage}
        />
      </div>

      <button className="pdf-context-menu-item" type="button" onClick={onClose}>
        <span aria-hidden="true" />
        Close Menu
      </button>
    </section>
  );
}

function EpubContextMenuItem({
  checked,
  disabled = false,
  label,
  role = "menuitem",
  onSelect,
}: {
  checked?: boolean;
  disabled?: boolean;
  label: string;
  role?: "menuitem" | "menuitemradio";
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      aria-checked={role === "menuitemradio" ? Boolean(checked) : undefined}
      className={`pdf-context-menu-item${checked ? " is-checked" : ""}`}
      disabled={disabled}
      role={role}
      type="button"
      onClick={onSelect}
    >
      <span aria-hidden="true" className="pdf-context-menu-check" />
      {label}
    </button>
  );
}

function applyEpubTheme(rendition: Rendition, resolvedTheme: "light" | "dark") {
  rendition.themes.select(
    resolvedTheme === "dark" ? "papercase-dark" : "papercase-light",
  );
}

function flattenEpubToc(items: NavItem[], level = 0): ReaderContentsItem[] {
  return items.flatMap((item, index) => {
    const title = item.label?.trim();
    const current: ReaderContentsItem[] = title
      ? [
          {
            id: item.id || `${level}-${index}-${item.href}`,
            title,
            target: item.href || null,
            label: null,
            level,
          },
        ]
      : [];

    return [...current, ...flattenEpubToc(item.subitems ?? [], level + 1)];
  });
}

function parseEpubReaderLocation(location: unknown): EpubReaderLocation | null {
  if (!isObject(location)) {
    return null;
  }

  const cfi = location.cfi;
  const href = location.href;
  const chapterTitle = location.chapterTitle;
  const displayedPage = location.displayedPage;
  const displayedTotal = location.displayedTotal;
  const fontSizePercent = location.fontSizePercent;

  if (
    typeof cfi !== "string" ||
    cfi.trim().length === 0 ||
    !isNullableString(href) ||
    !isNullableString(chapterTitle) ||
    !isNullablePositiveInteger(displayedPage) ||
    !isNullablePositiveInteger(displayedTotal)
  ) {
    return null;
  }

  return {
    cfi,
    href,
    chapterTitle,
    displayedPage,
    displayedTotal,
    fontSizePercent:
      typeof fontSizePercent === "number"
        ? clampEpubFontSize(fontSizePercent)
        : defaultEpubFontSize,
    viewMode: parseEpubPageViewMode(location.viewMode),
  };
}

function findTocTitleByHref(items: NavItem[], href: string): string | null {
  for (const item of items) {
    if (sameEpubHref(item.href, href)) {
      return item.label?.trim() || null;
    }

    const nestedTitle = findTocTitleByHref(item.subitems ?? [], href);

    if (nestedTitle) {
      return nestedTitle;
    }
  }

  return null;
}

function sameEpubHref(
  itemHref: string | undefined,
  activeHref: string,
): boolean {
  if (!itemHref) {
    return false;
  }

  return stripEpubHash(itemHref) === stripEpubHash(activeHref);
}

function stripEpubHash(href: string): string {
  return href.split("#", 1)[0];
}

function readProgressFraction(
  epubBook: Book | null,
  location: EpubRelocation,
): number | null {
  if (typeof location.start.percentage === "number") {
    return clampProgress(location.start.percentage);
  }

  try {
    const locations = epubBook?.locations;

    if (!locations || locations.length() < 1) {
      return null;
    }

    return clampProgress(locations.percentageFromCfi(location.start.cfi));
  } catch {
    return null;
  }
}

function readGeneratedPage(
  epubBook: Book | null,
  cfi: string,
): { page: number; total: number } | null {
  const locations = epubBook?.locations;

  if (!locations || locations.length() < 1) {
    return null;
  }

  const locationIndex = locations.locationFromCfi(cfi);
  const total = locations.length();

  if (
    typeof locationIndex !== "number" ||
    !Number.isFinite(locationIndex) ||
    locationIndex < 0 ||
    total < 1
  ) {
    return null;
  }

  return {
    page: Math.min(locationIndex + 1, total),
    total,
  };
}

function formatEpubLocationLabel(
  location: EpubReaderLocation,
  progressFraction: number | null,
): string {
  const prefix = location.chapterTitle ?? "EPUB";

  if (location.displayedPage && location.displayedTotal) {
    return `${prefix} ${location.displayedPage} of ${location.displayedTotal}`;
  }

  if (progressFraction !== null) {
    return `${prefix} ${Math.round(progressFraction * 100)}%`;
  }

  return prefix;
}

function formatEpubFooterLocation(
  location: EpubReaderLocation | null,
): EpubFooterLocation | null {
  if (!location) {
    return null;
  }

  const sectionLabel = location.chapterTitle;

  if (location.displayedPage && location.displayedTotal) {
    return {
      pageLabel: `${location.displayedPage} of ${location.displayedTotal}`,
      sectionLabel,
    };
  }

  return null;
}

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data.slice(0);
  }

  const copiedData = new Uint8Array(data.byteLength);
  copiedData.set(data);

  return copiedData.buffer;
}

function epubSpreadForViewMode(viewMode: EpubPageViewMode): string {
  return viewMode === "two-page" ? "always" : "none";
}

function parseEpubPageViewMode(value: unknown): EpubPageViewMode {
  return value === "two-page" ? "two-page" : "single";
}

function readStoredEpubViewMode(bookId: string): EpubPageViewMode | null {
  try {
    const value = window.localStorage.getItem(
      epubViewModeStoragePrefix + bookId,
    );

    return value === "single" || value === "two-page" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredEpubViewMode(
  bookId: string,
  viewMode: EpubPageViewMode,
): void {
  try {
    window.localStorage.setItem(epubViewModeStoragePrefix + bookId, viewMode);
  } catch {
    // Progress JSON still carries the view mode when renderer storage is blocked.
  }
}

function resizeEpubRendition(
  rendition: Rendition | null,
  cfi: string | undefined,
): void {
  if (!rendition) {
    return;
  }

  (
    rendition.resize as (
      width?: number,
      height?: number,
      epubcfi?: string,
    ) => void
  ).call(rendition, undefined, undefined, cfi);
}

function clampContextMenuPosition(
  x: number,
  y: number,
): EpubContextMenuPosition {
  return {
    x: Math.max(
      viewportEdgeInset,
      Math.min(x, window.innerWidth - contextMenuWidth - viewportEdgeInset),
    ),
    y: Math.max(
      viewportEdgeInset,
      Math.min(y, window.innerHeight - contextMenuHeight - viewportEdgeInset),
    ),
  };
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, 15000);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  });
}

function useResolvedTheme(theme: AppTheme): "light" | "dark" {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    systemPrefersDark() ? "dark" : "light",
  );

  useEffect(() => {
    if (theme !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [theme]);

  return theme === "system" ? systemTheme : theme;
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || positiveIntegerOrNull(value) !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampEpubFontSize(fontSizePercent: number): number {
  return Math.min(
    maxEpubFontSize,
    Math.max(minEpubFontSize, Math.round(fontSizePercent)),
  );
}

function clampProgress(progressFraction: number): number | null {
  if (!Number.isFinite(progressFraction)) {
    return null;
  }

  return Math.min(1, Math.max(0, progressFraction));
}

function isEditableOrControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest(
      'button, input, textarea, select, [contenteditable="true"], [role="menu"]',
    ),
  );
}
