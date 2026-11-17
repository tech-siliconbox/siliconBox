// What the converter could not carry over exactly. Printed after every run so nothing in the
// original pages changes silently.

export type Notes = { file: string; add: (message: string) => void; list: string[] };

export function createNotes(file: string, list: string[] = []): Notes {
  return {
    file,
    list,
    add: (message) => {
      const note = `${file}: ${message}`;
      if (!list.includes(note)) list.push(note);
    },
  };
}
