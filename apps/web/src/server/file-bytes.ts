/** Whether a file's bytes begin with a format's signature (`null` matches any byte there). */
export const startsWith = (bytes: Uint8Array, magic: readonly (number | null)[]) =>
  magic.every((byte, index) => byte === null || bytes[index] === byte);
