const SUPPORTED_EXTENSIONS = new Set(['csv', 'xls', 'xlsx']);

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const EMAIL_SCRAPE_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

const extractEmailsFromCell = (cell: unknown): string[] => {
  const text = String(cell ?? '');
  if (!text) return [];
  const matches = text.match(EMAIL_SCRAPE_REGEX);
  return matches ? matches.map(normalizeEmail) : [];
};

export type InviteEmailTemplateFormat = 'csv' | 'xls' | 'xlsx';

type SpreadsheetModule = {
  read: (data: ArrayBuffer, options?: Record<string, unknown>) => any;
  utils: {
    sheet_to_json: (sheet: unknown, options?: Record<string, unknown>) => unknown;
    aoa_to_sheet: (rows: unknown[][]) => unknown;
    sheet_to_csv: (sheet: unknown) => string;
    book_new: () => unknown;
    book_append_sheet: (workbook: unknown, worksheet: unknown, sheetName: string) => void;
  };
  write: (workbook: unknown, options?: Record<string, unknown>) => ArrayBuffer;
};

declare global {
  interface Window {
    XLSX?: SpreadsheetModule;
  }
}

let spreadsheetModulePromise: Promise<SpreadsheetModule> | null = null;

const loadSpreadsheetModule = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('The spreadsheet module is only available in the browser.');
  }

  if (window.XLSX) {
    return window.XLSX;
  }

  if (!spreadsheetModulePromise) {
    spreadsheetModulePromise = new Promise<SpreadsheetModule>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-peaktalent-xlsx="true"]');

      const finalize = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
          return;
        }

        reject(new Error('The spreadsheet module could not be loaded right now. Please reload the page and try again.'));
      };

      if (existingScript) {
        existingScript.addEventListener('load', finalize, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('The spreadsheet module could not be loaded right now. Please reload the page and try again.')), { once: true });
        if ((existingScript as any).dataset.loaded === 'true') {
          finalize();
        }
        return;
      }

      const script = document.createElement('script');
      script.src = '/vendor/xlsx.full.min.js';
      script.async = true;
      script.dataset.peaktalentXlsx = 'true';
      script.onload = () => {
        script.dataset.loaded = 'true';
        finalize();
      };
      script.onerror = () => {
        spreadsheetModulePromise = null;
        reject(new Error('The spreadsheet module could not be loaded right now. Please reload the page and try again.'));
      };
      document.head.appendChild(script);
    });
  }

  return spreadsheetModulePromise;
};

export const dedupeInviteEmails = (emails: string[]) =>
  Array.from(
    new Set(
      emails
        .map(normalizeEmail)
        .filter((email) => isValidEmail(email))
    )
  );

export const parseInviteEmailFile = async (file: File): Promise<string[]> => {
  const { read, utils } = await loadSpreadsheetModule();
  const extension = file.name.split('.').pop()?.trim().toLowerCase() || '';

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported file format. Use CSV, XLS or XLSX.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded file is empty.');
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as Array<Array<string | number | boolean | null>>;

  if (rows.length === 0) {
    throw new Error('The uploaded file does not contain any rows.');
  }

  const scrapedEmails: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      scrapedEmails.push(...extractEmailsFromCell(cell));
    }
  }

  const importedEmails = dedupeInviteEmails(scrapedEmails);

  if (importedEmails.length === 0) {
    throw new Error('No valid email addresses were found in the uploaded file.');
  }

  return importedEmails;
};

const triggerDownload = (bytes: BlobPart, filename: string, mimeType: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([bytes], { type: mimeType });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

export const downloadInviteEmailTemplate = async (format: InviteEmailTemplateFormat): Promise<void> => {
  const { utils, write } = await loadSpreadsheetModule();
  const rows = [
    ['Mail'],
    ['candidate1@example.com'],
    ['candidate2@example.com'],
  ];

  const worksheet = utils.aoa_to_sheet(rows);

  if (format === 'csv') {
    const csv = utils.sheet_to_csv(worksheet);
    triggerDownload(csv, 'peaktalent_invited_candidates_template.csv', 'text/csv;charset=utf-8;');
    return;
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'InvitedCandidates');
  const arrayBuffer = write(workbook, {
    bookType: format,
    type: 'array',
  });

  triggerDownload(
    arrayBuffer,
    `peaktalent_invited_candidates_template.${format}`,
    format === 'xls'
      ? 'application/vnd.ms-excel'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
};

export const downloadTabularData = async (
  filenameBase: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  format: InviteEmailTemplateFormat,
): Promise<void> => {
  const safeRows = [
    headers,
    ...rows.map((row) => row.map((value) => value ?? '')),
  ];

  const { utils, write } = await loadSpreadsheetModule();
  const worksheet = utils.aoa_to_sheet(safeRows);

  if (format === 'csv') {
    const csv = utils.sheet_to_csv(worksheet);
    triggerDownload(csv, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
    return;
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Candidates');
  const arrayBuffer = write(workbook, {
    bookType: format,
    type: 'array',
  });

  triggerDownload(
    arrayBuffer,
    `${filenameBase}.${format}`,
    format === 'xls'
      ? 'application/vnd.ms-excel'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
};
