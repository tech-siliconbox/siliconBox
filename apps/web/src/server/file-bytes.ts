/** Whether a file's bytes begin with a format's signature (`null` matches any byte there). */
export const startsWith = (bytes: Uint8Array, magic: readonly (number | null)[]) =>
  magic.every((byte, index) => byte === null || bytes[index] === byte);

/** "PK\x03\x04": a zip archive's first file, as in a .docx or a LinkedIn export. */
export const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
