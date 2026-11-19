// A small CSV reader (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes), enough
// for the files in a LinkedIn data export.

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

type Field = { value: string; next: number; endsRow: boolean };

/** A quoted field from just after its opening quote: doubled quotes are one quote. */
function quotedField(text: string, start: number): { value: string; next: number } {
  let value = '';
  let i = start;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '"' && text.charAt(i + 1) !== '"') return { value, next: i + 1 };
    value += char;
    i += char === '"' ? 2 : 1;
  }
  return { value, next: i };
}

/** One field from `start`, the index after its separator, and whether a line break ended it. */
function readField(text: string, start: number): Field {
  let value = '';
  let i = start;
  if (text.charAt(i) === '"') ({ value, next: i } = quotedField(text, i + 1));
  while (i < text.length && !',\r\n'.includes(text.charAt(i))) value += text.charAt(i++);
  const separator = text.charAt(i);
  const width = separator === '\r' && text.charAt(i + 1) === '\n' ? 2 : 1;
  return { value, next: i + width, endsRow: separator !== ',' };
}

/** Rows of fields; a leading byte-order mark and blank rows are ignored. */
export function parseCsv(source: string): string[][] {
  const text = source.startsWith(BYTE_ORDER_MARK) ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  for (let i = 0; i < text.length;) {
    const field = readField(text, i);
    row.push(field.value);
    i = field.next;
    if (field.endsRow) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Each row after the header as an object keyed by the header's names. */
export function csvRecords(source: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(source);
  if (header === undefined) return [];
  const names = header.map((name) => name.trim());
  return rows.map((cells) => Object.fromEntries(names.map((name, i) => [name, cells[i] ?? ''])));
}
