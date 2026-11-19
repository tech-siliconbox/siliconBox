/** A number with its noun, plural unless it is one: "1 day", "3 days". */
export const countOf = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
