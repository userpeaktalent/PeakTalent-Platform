// Lazy-loaded PDF parsing: pdfjs-dist is only imported when the user picks a PDF.
// We use the legacy build plus a no-worker fallback because some Europass-style
// CVs fail in the browser with the default worker-only path even though the PDF
// itself is valid and readable.

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>;
type PdfPageProxy = Awaited<ReturnType<PdfDocumentProxy['getPage']>>;

let pdfjsWorkerLoaderPromise: Promise<PdfJsModule> | null = null;
let pdfjsInlineLoaderPromise: Promise<PdfJsModule> | null = null;

const loadPdfJsWithWorker = () => {
  if (!pdfjsWorkerLoaderPromise) {
    pdfjsWorkerLoaderPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      // @ts-ignore - Vite handles the ?url suffix
      import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
    ]).then(([pdfjsLib, workerModule]) => {
      const workerSrc = (workerModule as any).default || workerModule;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjsLib;
    });
  }

  return pdfjsWorkerLoaderPromise;
};

const loadPdfJsInline = () => {
  if (!pdfjsInlineLoaderPromise) {
    pdfjsInlineLoaderPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }

  return pdfjsInlineLoaderPromise;
};

const normalizeExtractedText = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const joinUniqueTextSections = (sections: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const uniqueSections: string[] = [];

  for (const section of sections) {
    const normalized = normalizeExtractedText(section || '');
    if (!normalized) continue;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueSections.push(normalized);
    }
  }

  return uniqueSections.join('\n\n').trim();
};

const toUint8Array = (content: Uint8Array | number[] | ArrayBuffer | undefined | null) => {
  if (!content) return null;
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (Array.isArray(content)) return new Uint8Array(content);
  return null;
};

const tryDecodeBytes = (bytes: Uint8Array, encoding: string) => {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return '';
  }
};

const decodeAttachmentContent = (content: Uint8Array | number[] | ArrayBuffer | undefined | null) => {
  const bytes = toUint8Array(content);
  if (!bytes || bytes.length === 0) return '';

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return normalizeExtractedText(new TextDecoder('utf-8').decode(bytes));
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return normalizeExtractedText(new TextDecoder('utf-16le').decode(bytes));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return normalizeExtractedText(new TextDecoder('utf-16be').decode(bytes));
  }

  const utf8 = tryDecodeBytes(bytes, 'utf-8');
  if (utf8) return normalizeExtractedText(utf8);

  const nullByteRatio = bytes.reduce((count, value) => count + (value === 0 ? 1 : 0), 0) / bytes.length;
  if (nullByteRatio > 0.12) {
    const utf16le = tryDecodeBytes(bytes, 'utf-16le');
    if (utf16le) return normalizeExtractedText(utf16le);

    const utf16be = tryDecodeBytes(bytes, 'utf-16be');
    if (utf16be) return normalizeExtractedText(utf16be);
  }

  const windows1252 = tryDecodeBytes(bytes, 'windows-1252');
  if (windows1252) return normalizeExtractedText(windows1252);

  return normalizeExtractedText(new TextDecoder('utf-8').decode(bytes));
};

const extractTextFromMarkup = (markupText: string, mimeType: 'application/xml' | 'text/html') => {
  if (typeof DOMParser === 'undefined') {
    return normalizeExtractedText(markupText);
  }

  try {
    const parsed = new DOMParser().parseFromString(markupText, mimeType);
    if (mimeType === 'application/xml' && parsed.querySelector('parsererror')) {
      return normalizeExtractedText(markupText);
    }

    const extracted = mimeType === 'text/html'
      ? parsed.body?.textContent || ''
      : parsed.documentElement?.textContent || '';

    return normalizeExtractedText(extracted) || normalizeExtractedText(markupText);
  } catch {
    return normalizeExtractedText(markupText);
  }
};

const extractTextFromJson = (jsonText: string) => {
  try {
    const parsed = JSON.parse(jsonText);
    const values: string[] = [];

    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        const normalized = normalizeExtractedText(value);
        if (normalized) values.push(normalized);
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (value && typeof value === 'object') {
        Object.values(value).forEach(visit);
      }
    };

    visit(parsed);
    return joinUniqueTextSections(values);
  } catch {
    return normalizeExtractedText(jsonText);
  }
};

const extractTextFromRtf = (rtfText: string) => normalizeExtractedText(
  rtfText
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-z]+-?\d* ?/g, ' ')
    .replace(/[{}]/g, ' ')
);

const extractPrintableStringsFromBuffer = (buffer: ArrayBuffer) => {
  const rawText = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const matches = rawText.match(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .,:;@&()/'"’+\-_]{6,}/g) || [];

  const candidates = matches
    .map((match) => normalizeExtractedText(match))
    .filter((match) =>
      match.length >= 8 &&
      /[A-Za-zÀ-ÿ]{3,}/.test(match) &&
      !/^(obj|endobj|stream|endstream|xref|trailer|catalog)$/i.test(match)
    );

  return joinUniqueTextSections(candidates.slice(0, 200));
};

const extractPdfFormFieldText = async (pdf: PdfDocumentProxy) => {
  if (typeof (pdf as any).getFieldObjects !== 'function') return '';

  try {
    const fieldObjects = await (pdf as any).getFieldObjects();
    if (!fieldObjects || typeof fieldObjects !== 'object') return '';

    const values: string[] = [];

    for (const [fieldName, fieldEntries] of Object.entries(fieldObjects as Record<string, any>)) {
      const normalizedFieldName = normalizeExtractedText(fieldName);

      for (const entry of Array.isArray(fieldEntries) ? fieldEntries : []) {
        const entryValues = [
          typeof entry?.value === 'string' ? entry.value : '',
          typeof entry?.defaultValue === 'string' ? entry.defaultValue : '',
          typeof entry?.buttonValue === 'string' ? entry.buttonValue : '',
        ].map((value) => normalizeExtractedText(value)).filter(Boolean);

        for (const value of entryValues) {
          values.push(normalizedFieldName ? `${normalizedFieldName}: ${value}` : value);
        }
      }
    }

    return joinUniqueTextSections(values);
  } catch (error) {
    console.warn('Could not extract PDF form fields:', error);
    return '';
  }
};

const extractPdfMetadataText = async (pdf: PdfDocumentProxy) => {
  if (typeof (pdf as any).getMetadata !== 'function') return '';

  try {
    const metadata = await (pdf as any).getMetadata();
    const info = metadata?.info || {};
    const interestingEntries = ['Title', 'Subject', 'Keywords', 'Author', 'Creator']
      .map((key) => {
        const value = typeof info[key] === 'string' ? normalizeExtractedText(info[key]) : '';
        return value ? `${key}: ${value}` : '';
      })
      .filter(Boolean);

    return joinUniqueTextSections(interestingEntries);
  } catch (error) {
    console.warn('Could not extract PDF metadata:', error);
    return '';
  }
};

const extractTextFromAttachment = async (
  attachment: any,
  pdfjsLib: PdfJsModule,
  disableWorker: boolean,
  recursionDepth: number
) => {
  const filename = typeof attachment?.filename === 'string' ? attachment.filename.toLowerCase() : '';
  const bytes = toUint8Array(attachment?.content);
  if (!bytes || bytes.length === 0) return '';

  if (filename.endsWith('.pdf') && recursionDepth < 1) {
    try {
      return extractTextFromPdf(pdfjsLib, bytes.slice().buffer, disableWorker, recursionDepth + 1);
    } catch (error) {
      console.warn('Could not extract text from embedded PDF attachment:', error);
    }
  }

  const rawText = decodeAttachmentContent(bytes);
  if (!rawText) return '';

  if (filename.endsWith('.xml') || filename.endsWith('.xdp') || filename.endsWith('.xfd')) {
    return extractTextFromMarkup(rawText, 'application/xml');
  }

  if (filename.endsWith('.html') || filename.endsWith('.htm')) {
    return extractTextFromMarkup(rawText, 'text/html');
  }

  if (filename.endsWith('.json')) {
    return extractTextFromJson(rawText);
  }

  if (filename.endsWith('.rtf')) {
    return extractTextFromRtf(rawText);
  }

  return normalizeExtractedText(rawText);
};

const extractPdfAttachmentsText = async (
  pdf: PdfDocumentProxy,
  pdfjsLib: PdfJsModule,
  disableWorker: boolean,
  recursionDepth: number
): Promise<string> => {
  if (typeof pdf.getAttachments !== 'function') return '';

  const attachments = await pdf.getAttachments();
  if (!attachments) return '';

  const attachmentTexts = await Promise.all(
    Object.values(attachments).map((attachment: any) =>
      extractTextFromAttachment(attachment, pdfjsLib, disableWorker, recursionDepth)
    )
  );

  return joinUniqueTextSections(attachmentTexts);
};

const extractPdfStructuralText = async (
  pdf: PdfDocumentProxy,
  pdfjsLib: PdfJsModule,
  buffer: ArrayBuffer,
  disableWorker: boolean,
  recursionDepth: number
) => {
  const [attachmentsText, formFieldText, metadataText] = await Promise.all([
    extractPdfAttachmentsText(pdf, pdfjsLib, disableWorker, recursionDepth),
    extractPdfFormFieldText(pdf),
    extractPdfMetadataText(pdf),
  ]);

  const printableFallback = extractPrintableStringsFromBuffer(buffer);
  return joinUniqueTextSections([attachmentsText, formFieldText, metadataText, printableFallback]);
};

const extractTextFromPdf = async (
  pdfjsLib: PdfJsModule,
  buffer: ArrayBuffer,
  disableWorker: boolean,
  recursionDepth = 0
): Promise<string> => {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker,
    useSystemFonts: true,
    stopAtErrors: false,
    isEvalSupported: false,
  } as any);

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();

      if (pageText) {
        pageTexts.push(pageText);
      }
    }
  } catch (pageError) {
    console.warn('Could not extract standard PDF page text, trying structural fallbacks:', pageError);
  }

  const normalizedPageText = normalizeExtractedText(pageTexts.join('\n'));
  const structuralText = await extractPdfStructuralText(pdf, pdfjsLib, buffer, disableWorker, recursionDepth);

  if (normalizedPageText && structuralText) {
    if (normalizedPageText.length < 500 || structuralText.length < 500) {
      return joinUniqueTextSections([normalizedPageText, structuralText]);
    }

    return normalizedPageText;
  }

  return normalizedPageText || structuralText;
};

const openPdfDocument = async (
  pdfjsLib: PdfJsModule,
  buffer: ArrayBuffer,
  disableWorker: boolean
) => pdfjsLib.getDocument({
  data: new Uint8Array(buffer),
  disableWorker,
  useSystemFonts: true,
  stopAtErrors: false,
  isEvalSupported: false,
} as any).promise;

const createCanvasForViewport = (width: number, height: number) => {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  }

  throw new Error('Canvas rendering is not available in this environment.');
};

const canvasToJpegBlob = async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
  }

  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Failed to export rendered PDF page as an image.'));
      }, 'image/jpeg', 0.72);
    });
  }

  throw new Error('Could not convert the rendered PDF page to an image blob.');
};

const renderPdfPageToImageBlob = async (page: PdfPageProxy) => {
  const initialViewport = page.getViewport({ scale: 1 });
  const targetWidth = 1280;
  const scale = Math.min(2, Math.max(1.2, targetWidth / Math.max(initialViewport.width, 1)));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvasForViewport(viewport.width, viewport.height);
  const context = canvas.getContext('2d', { alpha: false } as any);

  if (!context) {
    throw new Error('Could not create a 2D canvas context for PDF rendering.');
  }

  await page.render({
    canvasContext: context as any,
    viewport,
    canvas: canvas as any,
  }).promise;

  return canvasToJpegBlob(canvas);
};

const renderPdfPagesFromDocument = async (pdf: PdfDocumentProxy, maxPages: number) => {
  const pageBlobs: Blob[] = [];
  const totalPages = Math.min(Math.max(maxPages, 1), pdf.numPages);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const blob = await renderPdfPageToImageBlob(page);
    pageBlobs.push(blob);
    if (typeof page.cleanup === 'function') {
      page.cleanup();
    }
  }

  return pageBlobs;
};

const mapPdfReadError = (error: unknown) => {
  const errorName = (error as { name?: string } | null)?.name;
  const errorMessage = (error as { message?: string } | null)?.message || '';

  if (errorName === 'PasswordException') {
    return new Error('This PDF is password-protected. Remove the password and try again.');
  }

  if (errorName === 'InvalidPDFException') {
    return new Error('This PDF appears to be invalid or incomplete.');
  }

  if (errorMessage === 'No readable text was extracted from the PDF.') {
    return new Error('This PDF was opened successfully, but no readable text could be extracted. It may be image-only, heavily protected, or use a structure the current parser cannot fully decode.');
  }

  return new Error('The PDF file could not be read. It might be corrupted, protected, or unsupported by the current parser.');
};

const parsePdfContent = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();

  try {
    const pdfjsLib = await loadPdfJsWithWorker();
    const extractedText = await extractTextFromPdf(pdfjsLib, buffer, false);

    if (extractedText) {
      return extractedText;
    }
  } catch (workerError) {
    console.warn('Primary PDF parsing path failed, retrying without worker:', workerError);
  }

  try {
    const pdfjsLib = await loadPdfJsInline();
    const extractedText = await extractTextFromPdf(pdfjsLib, buffer, true);

    if (extractedText) {
      return extractedText;
    }

    throw new Error('No selectable text was extracted from the PDF.');
  } catch (fallbackError) {
    console.error('Error parsing PDF file:', fallbackError);
    throw mapPdfReadError(fallbackError);
  }
};

export const renderPdfPagesAsImages = async (file: File, maxPages = 3): Promise<Blob[]> => {
  const buffer = await file.arrayBuffer();

  try {
    const pdfjsLib = await loadPdfJsWithWorker();
    const pdf = await openPdfDocument(pdfjsLib, buffer, false);
    return await renderPdfPagesFromDocument(pdf, maxPages);
  } catch (workerError) {
    console.warn('Primary PDF rendering path failed, retrying without worker:', workerError);
  }

  try {
    const pdfjsLib = await loadPdfJsInline();
    const pdf = await openPdfDocument(pdfjsLib, buffer, true);
    return await renderPdfPagesFromDocument(pdf, maxPages);
  } catch (fallbackError) {
    console.error('Error rendering PDF pages as images:', fallbackError);
    throw mapPdfReadError(fallbackError);
  }
};

export const readFileAsText = (file: File): Promise<string> => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return parsePdfContent(file);
  }

  if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  return Promise.reject(new Error('Unsupported file type. Please upload a PDF or a plain text file.'));
};
