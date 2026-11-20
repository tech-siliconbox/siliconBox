/** File types Praman reads: design, SVA, Tcl, file lists and connectivity sheets. */
export const ACCEPT = '.sv,.v,.svh,.vh,.tcl,.f,.csv,.txt';
const ACCEPTED = new Set(ACCEPT.split(','));

/** A file of the learner's computer, read as text. */
export type TextFile = { name: string; text: string };

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();

/** The chosen or dropped files Praman can read, as text; others are left out. */
export function readTextFiles(files: readonly File[]): Promise<TextFile[]> {
  const readable = files.filter((file) => ACCEPTED.has(extensionOf(file.name)));
  return Promise.all(readable.map(async (file) => ({ name: file.name, text: await file.text() })));
}
