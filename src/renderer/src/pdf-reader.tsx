import type {
  ReactElement,
  RefObject,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type {
  LibraryBookSummary,
  PdfPageViewMode,
  PdfReaderLocation,
  PdfZoomMode,
  ReaderLocation,
} from "../../shared/papercase-api";
import type {
  ReaderContentsItem,
  ReaderNavigationTarget,
} from "./reader-types";

type PdfReaderProps = {
  book: LibraryBookSummary;
  onContentsChange: (contents: ReaderContentsItem[]) => void;
  onLocationChange: (location: ReaderLocation) => void;
  pageNavigationRef: RefObject<
    ((target: ReaderNavigationTarget) => void) | null
  >;
};

type PdfLoadStatus =
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

type PdfJsModule = typeof import("pdfjs-dist");

type PdfOutlineNode = {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineNode[];
};

type PdfPageSize = {
  width: number;
  height: number;
};

type PdfReaderViewport = {
  width: number;
  height: number;
};

type PdfContextMenuPosition = {
  x: number;
  y: number;
};

const minPdfZoom = 0.5;
const maxPdfZoom = 2;
const minAutoPdfZoom = 0.2;
const maxAutoPdfZoom = 1.8;
const pdfZoomStep = 0.1;
const pdfPageGap = 0;
const pdfReaderPadding = 12;
const pdfViewportPadding = pdfReaderPadding * 2;
const contextMenuWidth = 236;
const contextMenuHeight = 314;
const viewportEdgeInset = 8;

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

export function PdfReader({
  book,
  onContentsChange,
  onLocationChange,
  pageNavigationRef,
}: PdfReaderProps): ReactElement {
  const readerRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<PdfLoadStatus>({ name: "loading" });
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewMode, setViewMode] = useState<PdfPageViewMode>("single");
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("auto");
  const [zoom, setZoom] = useState(1);
  const [basePageSize, setBasePageSize] = useState<PdfPageSize | null>(null);
  const [readerViewport, setReaderViewport] = useState<PdfReaderViewport>({
    width: 0,
    height: 0,
  });
  const [contextMenuPosition, setContextMenuPosition] =
    useState<PdfContextMenuPosition | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;

    async function loadPdf(): Promise<void> {
      const api = window.papercase?.reader;

      setStatus({ name: "loading" });
      setPdfDocument(null);
      setPageCount(0);
      setCurrentPage(1);
      setViewMode("single");
      setZoomMode("auto");
      setZoom(1);
      setBasePageSize(null);
      onContentsChange([]);

      if (!api) {
        setStatus({
          name: "failed",
          message: "The PDF reader is unavailable in this environment.",
        });
        return;
      }

      try {
        const result = await api.loadPdf(book.id);

        if (isCancelled) {
          return;
        }

        if (result.status !== "loaded") {
          setStatus({ name: "failed", message: result.message });
          return;
        }

        const pdfjs = await loadPdfJs();
        loadingTask = pdfjs.getDocument({
          data: normalizePdfData(result.data),
        });
        loadedDocument = await loadingTask.promise;

        if (isCancelled) {
          await loadedDocument.cleanup();
          await loadingTask.destroy();
          return;
        }

        const restoredLocation = parsePdfReaderLocation(
          result.progress?.location,
          loadedDocument.numPages,
        );

        setPdfDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setCurrentPage(restoredLocation?.pageNumber ?? 1);
        setViewMode(restoredLocation?.viewMode ?? "single");
        setZoomMode(restoredLocation?.zoomMode ?? "auto");
        setZoom(restoredLocation?.zoom ?? 1);
        setStatus({ name: "ready" });

        const contents = await loadPdfContents(loadedDocument);

        if (!isCancelled) {
          onContentsChange(contents);
        }
      } catch {
        if (!isCancelled) {
          setStatus({
            name: "failed",
            message: "The PDF could not be rendered.",
          });
        }
      }
    }

    void loadPdf();

    return () => {
      isCancelled = true;
      onContentsChange([]);
      void loadedDocument?.cleanup();
      void loadingTask?.destroy();
    };
  }, [book.id, onContentsChange]);

  useEffect(() => {
    const observedElement = readerRef.current;

    if (!observedElement) {
      return;
    }

    const element: HTMLElement = observedElement;
    let animationFrameId = window.requestAnimationFrame(() => {
      updateReaderViewport(element, setReaderViewport);
    });
    const ResizeObserverConstructor = window.ResizeObserver;

    if (ResizeObserverConstructor) {
      const resizeObserver = new ResizeObserverConstructor(() => {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = window.requestAnimationFrame(() => {
          updateReaderViewport(element, setReaderViewport);
        });
      });

      resizeObserver.observe(element);

      return () => {
        window.cancelAnimationFrame(animationFrameId);
        resizeObserver.disconnect();
      };
    }

    function handleWindowResize(): void {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        updateReaderViewport(element, setReaderViewport);
      });
    }

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [status.name]);

  useEffect(() => {
    if (!pdfDocument || status.name !== "ready" || pageCount < 1) {
      return;
    }

    const loadedDocument = pdfDocument;
    let isCancelled = false;

    async function loadPageSize(): Promise<void> {
      try {
        const page = await loadedDocument.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });

        if (!isCancelled) {
          setBasePageSize({
            width: viewport.width,
            height: viewport.height,
          });
        }
      } catch {
        if (!isCancelled) {
          setBasePageSize(null);
        }
      }
    }

    void loadPageSize();

    return () => {
      isCancelled = true;
    };
  }, [currentPage, pageCount, pdfDocument, status.name]);

  const visiblePageNumbers = useMemo(() => {
    if (pageCount < 1) {
      return [];
    }

    if (viewMode === "single") {
      return [currentPage];
    }

    return [currentPage, currentPage + 1].filter(
      (pageNumber) => pageNumber <= pageCount,
    );
  }, [currentPage, pageCount, viewMode]);

  const autoZoom = useMemo(
    () =>
      calculateAutoZoom({
        basePageSize,
        pageCount: visiblePageNumbers.length || 1,
        viewport: readerViewport,
      }),
    [basePageSize, readerViewport, visiblePageNumbers.length],
  );
  const effectiveZoom = zoomMode === "auto" ? autoZoom : zoom;
  const locationLabel =
    pageCount > 0 ? `Page ${currentPage} of ${pageCount}` : "Opening PDF";

  const goToPage = useCallback(
    (pageNumber: number) => {
      setCurrentPage(clampPage(pageNumber, pageCount));
      setContextMenuPosition(null);
    },
    [pageCount],
  );

  const goToReaderTarget = useCallback(
    (target: ReaderNavigationTarget) => {
      if (typeof target === "number") {
        goToPage(target);
      }
    },
    [goToPage],
  );

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((pageNumber) =>
      clampPage(pageNumber - pageStep(viewMode), pageCount),
    );
    setContextMenuPosition(null);
  }, [pageCount, viewMode]);

  const goToNextPage = useCallback(() => {
    setCurrentPage((pageNumber) =>
      clampPage(pageNumber + pageStep(viewMode), pageCount),
    );
    setContextMenuPosition(null);
  }, [pageCount, viewMode]);

  useEffect(() => {
    pageNavigationRef.current = goToReaderTarget;

    return () => {
      if (pageNavigationRef.current === goToReaderTarget) {
        pageNavigationRef.current = null;
      }
    };
  }, [goToReaderTarget, pageNavigationRef]);

  useEffect(() => {
    if (status.name !== "ready" || pageCount < 1) {
      return;
    }

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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToNextPage, goToPreviousPage, pageCount, status.name]);

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
    if (status.name !== "ready" || pageCount < 1) {
      return;
    }

    const location: PdfReaderLocation = {
      pageNumber: currentPage,
      pageCount,
      viewMode,
      zoom: effectiveZoom,
      zoomMode,
    };

    onLocationChange({
      bookId: book.id,
      format: "pdf",
      location,
      label: locationLabel,
    });
  }, [
    book.id,
    currentPage,
    effectiveZoom,
    locationLabel,
    onLocationChange,
    pageCount,
    status.name,
    viewMode,
    zoomMode,
  ]);

  useEffect(() => {
    if (status.name !== "ready" || pageCount < 1) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const location: PdfReaderLocation = {
        pageNumber: currentPage,
        pageCount,
        viewMode,
        zoom: effectiveZoom,
        zoomMode,
      };

      void window.papercase?.reader.saveProgress({
        bookId: book.id,
        format: "pdf",
        location,
        label: locationLabel,
        progressFraction: currentPage / pageCount,
      });
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    book.id,
    currentPage,
    effectiveZoom,
    locationLabel,
    pageCount,
    status.name,
    viewMode,
    zoomMode,
  ]);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>): void {
    event.preventDefault();
    setContextMenuPosition(
      clampContextMenuPosition(event.clientX, event.clientY),
    );
  }

  function handleViewModeChange(nextViewMode: PdfPageViewMode): void {
    setViewMode(nextViewMode);
    setCurrentPage((pageNumber) => clampPage(pageNumber, pageCount));
    setContextMenuPosition(null);
  }

  function handleAutoResize(): void {
    setZoomMode("auto");
    setContextMenuPosition(null);
  }

  function handleActualSize(): void {
    setZoomMode("actual");
    setZoom(1);
    setContextMenuPosition(null);
  }

  function changeZoom(delta: number): void {
    setZoomMode("custom");
    setZoom(
      roundZoom(
        Math.min(maxPdfZoom, Math.max(minPdfZoom, effectiveZoom + delta)),
      ),
    );
    setContextMenuPosition(null);
  }

  function handleReaderWheel(event: ReactWheelEvent<HTMLElement>): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    setZoomMode("custom");
    setZoom((currentZoom) => {
      const startingZoom = zoomMode === "auto" ? autoZoom : currentZoom;
      const direction = event.deltaY > 0 ? -1 : 1;
      return roundZoom(
        Math.min(
          maxPdfZoom,
          Math.max(minPdfZoom, startingZoom + direction * pdfZoomStep),
        ),
      );
    });
    setContextMenuPosition(null);
  }

  if (status.name === "loading") {
    return (
      <section className="pdf-reader-status" role="status">
        <p className="dialog-kicker">PDF</p>
        <h2>Opening PDF</h2>
      </section>
    );
  }

  if (status.name === "failed" || !pdfDocument) {
    return (
      <section className="pdf-reader-status" role="alert">
        <p className="dialog-kicker">PDF</p>
        <h2>Unable to render PDF</h2>
        <p>{status.name === "failed" ? status.message : "Try reopening it."}</p>
      </section>
    );
  }

  return (
    <section
      ref={readerRef}
      className="pdf-reader"
      aria-label="PDF reader"
      onContextMenu={handleContextMenu}
      onWheel={handleReaderWheel}
    >
      <div className={`pdf-page-strip is-${viewMode}`}>
        {visiblePageNumbers.map((pageNumber) => (
          <PdfPageCanvas
            key={`${pageNumber}-${effectiveZoom}`}
            pageNumber={pageNumber}
            pdfDocument={pdfDocument}
            zoom={effectiveZoom}
          />
        ))}
      </div>

      {contextMenuPosition ? (
        <PdfContextMenu
          canGoNext={currentPage < pageCount}
          canGoPrevious={currentPage > 1}
          canZoomIn={effectiveZoom < maxPdfZoom}
          canZoomOut={effectiveZoom > minPdfZoom}
          position={contextMenuPosition}
          viewMode={viewMode}
          zoomMode={zoomMode}
          onActualSize={handleActualSize}
          onAutoResize={handleAutoResize}
          onClose={() => setContextMenuPosition(null)}
          onNextPage={goToNextPage}
          onPreviousPage={goToPreviousPage}
          onViewModeChange={handleViewModeChange}
          onZoomIn={() => changeZoom(pdfZoomStep)}
          onZoomOut={() => changeZoom(-pdfZoomStep)}
        />
      ) : null}
    </section>
  );
}

function PdfContextMenu({
  canGoNext,
  canGoPrevious,
  canZoomIn,
  canZoomOut,
  position,
  viewMode,
  zoomMode,
  onActualSize,
  onAutoResize,
  onClose,
  onNextPage,
  onPreviousPage,
  onViewModeChange,
  onZoomIn,
  onZoomOut,
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  position: PdfContextMenuPosition;
  viewMode: PdfPageViewMode;
  zoomMode: PdfZoomMode;
  onActualSize: () => void;
  onAutoResize: () => void;
  onClose: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onViewModeChange: (viewMode: PdfPageViewMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
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
      aria-label="PDF reader menu"
      className="pdf-context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={handleMenuContextMenu}
      onPointerDown={handlePointerDown}
    >
      <div className="pdf-context-menu-section">
        <PdfContextMenuItem
          checked={zoomMode === "auto"}
          label="Automatically Resize"
          role="menuitemradio"
          onSelect={onAutoResize}
        />
        <PdfContextMenuItem
          checked={zoomMode === "actual"}
          label="Actual Size"
          role="menuitemradio"
          onSelect={onActualSize}
        />
        <PdfContextMenuItem
          disabled={!canZoomIn}
          label="Zoom In"
          onSelect={onZoomIn}
        />
        <PdfContextMenuItem
          disabled={!canZoomOut}
          label="Zoom Out"
          onSelect={onZoomOut}
        />
      </div>

      <div className="pdf-context-menu-section">
        <PdfContextMenuItem
          checked={viewMode === "single"}
          label="Single Page"
          role="menuitemradio"
          onSelect={() => onViewModeChange("single")}
        />
        <PdfContextMenuItem
          checked={viewMode === "two-page"}
          label="Two Pages"
          role="menuitemradio"
          onSelect={() => onViewModeChange("two-page")}
        />
      </div>

      <div className="pdf-context-menu-section">
        <PdfContextMenuItem
          disabled={!canGoNext}
          label="Next Page"
          onSelect={onNextPage}
        />
        <PdfContextMenuItem
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

function PdfContextMenuItem({
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

function PdfPageCanvas({
  pageNumber,
  pdfDocument,
  zoom,
}: {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    let isCancelled = false;
    let page: PDFPageProxy | null = null;

    async function renderPage(): Promise<void> {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      renderTaskRef.current?.cancel();
      setStatus("loading");

      try {
        page = await pdfDocument.getPage(pageNumber);

        if (isCancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: zoom });
        const outputScale = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");

        if (!context) {
          setStatus("failed");
          return;
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!isCancelled) {
          setStatus("ready");
        }
      } catch (error) {
        if (!isCancelled && !isPdfRenderCancel(error)) {
          setStatus("failed");
        }
      }
    }

    void renderPage();

    return () => {
      isCancelled = true;
      renderTaskRef.current?.cancel();
      page?.cleanup();
    };
  }, [pageNumber, pdfDocument, zoom]);

  return (
    <figure className="pdf-page-frame">
      <canvas
        aria-label={`Page ${pageNumber}`}
        className="pdf-page-canvas"
        ref={canvasRef}
      />
      {status === "failed" ? (
        <figcaption className="pdf-page-caption is-error">
          Page {pageNumber} could not be rendered.
        </figcaption>
      ) : null}
    </figure>
  );
}

async function loadPdfJs(): Promise<PdfJsModule> {
  pdfJsModulePromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return pdfjs;
  });

  return pdfJsModulePromise;
}

async function loadPdfContents(
  pdfDocument: PDFDocumentProxy,
): Promise<ReaderContentsItem[]> {
  const outline = (await pdfDocument.getOutline()) as PdfOutlineNode[] | null;

  if (!outline || outline.length === 0) {
    return [];
  }

  return flattenPdfOutline(pdfDocument, outline, 0);
}

async function flattenPdfOutline(
  pdfDocument: PDFDocumentProxy,
  outline: PdfOutlineNode[],
  level: number,
  path = "",
): Promise<ReaderContentsItem[]> {
  const items: ReaderContentsItem[] = [];

  for (const [index, outlineItem] of outline.entries()) {
    const itemPath = `${path}${index}`;
    const title = outlineItem.title?.trim();

    if (title) {
      items.push({
        id: `${level}-${itemPath}-${title}`,
        title,
        target: await resolveOutlinePageNumber(pdfDocument, outlineItem.dest),
        label: null,
        level,
      });

      const lastItem = items[items.length - 1];
      if (typeof lastItem.target === "number") {
        lastItem.label = String(lastItem.target);
      }
    }

    if (outlineItem.items && outlineItem.items.length > 0) {
      items.push(
        ...(await flattenPdfOutline(
          pdfDocument,
          outlineItem.items,
          level + 1,
          `${itemPath}.`,
        )),
      );
    }
  }

  return items;
}

async function resolveOutlinePageNumber(
  pdfDocument: PDFDocumentProxy,
  destination: string | unknown[] | null | undefined,
): Promise<number | null> {
  try {
    const explicitDestination =
      typeof destination === "string"
        ? await pdfDocument.getDestination(destination)
        : destination;

    if (!Array.isArray(explicitDestination) || explicitDestination.length < 1) {
      return null;
    }

    const pageReference = explicitDestination[0];

    if (typeof pageReference === "number") {
      return clampPage(pageReference + 1, pdfDocument.numPages);
    }

    const pageIndex = await pdfDocument.getPageIndex(pageReference);

    return clampPage(pageIndex + 1, pdfDocument.numPages);
  } catch {
    return null;
  }
}

function calculateAutoZoom({
  basePageSize,
  pageCount,
  viewport,
}: {
  basePageSize: PdfPageSize | null;
  pageCount: number;
  viewport: PdfReaderViewport;
}): number {
  if (!basePageSize || viewport.width <= 0 || viewport.height <= 0) {
    return 1;
  }

  const visiblePageCount = Math.max(1, pageCount);
  const horizontalGap = (visiblePageCount - 1) * pdfPageGap;
  const availableWidth = Math.max(
    1,
    viewport.width - pdfViewportPadding - horizontalGap,
  );
  const availableHeight = Math.max(1, viewport.height - pdfViewportPadding);
  const widthScale = availableWidth / visiblePageCount / basePageSize.width;
  const heightScale = availableHeight / basePageSize.height;
  const nextZoom = Math.min(widthScale, heightScale);

  return floorAutoZoom(
    Math.min(maxAutoPdfZoom, Math.max(minAutoPdfZoom, nextZoom)),
  );
}

function updateReaderViewport(
  element: HTMLElement,
  onChange: (viewport: PdfReaderViewport) => void,
): void {
  const rect = element.getBoundingClientRect();

  onChange({
    width: rect.width,
    height: rect.height,
  });
}

function parsePdfReaderLocation(
  location: unknown,
  pageCount: number,
): PdfReaderLocation | null {
  if (!isObject(location)) {
    return null;
  }

  const pageNumber = location.pageNumber;
  const viewMode = location.viewMode;
  const zoom = location.zoom;
  const zoomMode = parsePdfZoomMode(location.zoomMode, zoom);

  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    (viewMode !== "single" && viewMode !== "two-page")
  ) {
    return null;
  }

  const parsedZoom =
    typeof zoom === "number" && Number.isFinite(zoom)
      ? roundZoom(Math.min(maxPdfZoom, Math.max(minPdfZoom, zoom)))
      : 1;

  return {
    pageNumber: clampPage(pageNumber, pageCount),
    pageCount,
    viewMode,
    zoom: parsedZoom,
    zoomMode,
  };
}

function parsePdfZoomMode(value: unknown, zoom: unknown): PdfZoomMode {
  if (isPdfZoomMode(value)) {
    return value;
  }

  if (typeof zoom !== "number" || !Number.isFinite(zoom)) {
    return "auto";
  }

  return roundZoom(zoom) === 1 ? "auto" : "custom";
}

function normalizePdfData(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  return new Uint8Array(data);
}

function pageStep(viewMode: PdfPageViewMode): number {
  return viewMode === "two-page" ? 2 : 1;
}

function clampPage(pageNumber: number, pageCount: number): number {
  return Math.min(Math.max(1, pageNumber), Math.max(1, pageCount));
}

function clampContextMenuPosition(
  x: number,
  y: number,
): PdfContextMenuPosition {
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

function roundZoom(zoom: number): number {
  return Math.round(zoom * 10) / 10;
}

function floorAutoZoom(zoom: number): number {
  return Math.floor(zoom * 100) / 100;
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

function isPdfZoomMode(value: unknown): value is PdfZoomMode {
  return value === "auto" || value === "actual" || value === "custom";
}

function isPdfRenderCancel(error: unknown): boolean {
  return isObject(error) && error.name === "RenderingCancelledException";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
