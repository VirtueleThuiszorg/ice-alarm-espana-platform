// CSV Export Utility for ICE Alarm Espana
// Generates downloadable CSV files from any data shape, with proper escaping
// and Excel-compatible UTF-8 encoding (BOM prefix).

export interface CsvColumnConfig<T = Record<string, unknown>> {
  /** The key to read from each data object */
  key: string;
  /** The display header for this column */
  header: string;
  /** Optional formatter — receives the raw value and the full row, returns a display string */
  formatter?: (value: unknown, row: T) => string;
}

/**
 * Escapes a single CSV cell value according to RFC 4180:
 * - If the value contains commas, double-quotes, or newlines it is wrapped in double-quotes.
 * - Internal double-quotes are doubled ("").
 */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If the value contains a comma, double-quote, or newline, wrap and escape
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts an array of objects into a CSV string.
 *
 * @param data    - Array of row objects
 * @param columns - Column configuration (key, header, optional formatter)
 * @returns       - The CSV content as a string (without BOM; BOM is added during download)
 */
export function buildCsvString<T extends Record<string, unknown>>(
  data: T[],
  columns: CsvColumnConfig<T>[],
): string {
  // Header row
  const headerRow = columns.map((col) => escapeCsvValue(col.header)).join(',');

  // Data rows
  const dataRows = data.map((row) => {
    return columns
      .map((col) => {
        const rawValue = getNestedValue(row, col.key);
        const displayValue = col.formatter ? col.formatter(rawValue, row) : rawValue;
        return escapeCsvValue(displayValue);
      })
      .join(',');
  });

  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Reads a possibly nested key from an object.
 * Supports dot-notation, e.g. "member.first_name".
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (current !== null && current !== undefined && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

/**
 * Generates a CSV file from data and triggers a browser download.
 *
 * @param data     - Array of row objects
 * @param filename - The download filename (should end in .csv)
 * @param columns  - Column configuration
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns: CsvColumnConfig<T>[],
): void {
  const csvContent = buildCsvString(data, columns);

  // BOM (Byte Order Mark) for UTF-8 — ensures Excel recognises the encoding correctly
  const BOM = '\uFEFF';

  const blob = new Blob([BOM + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
