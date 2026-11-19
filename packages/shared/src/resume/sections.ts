import { type Resume, isBuiltInSection } from '../schemas/resume';
import { sectionOrder } from './document';

// Edits to a resume's sections: their printed order, which show, their headings, and the
// learner's own sections. Each returns the changed resume.

/** The list with the item at `index` moved `by` places (negative is up). */
export function moveItem<T>(items: readonly T[], index: number, by: number): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(Math.max(0, index + by), 0, item);
  return next;
}

export function moveSection(resume: Resume, id: string, by: number): Resume {
  const order = sectionOrder(resume);
  return {
    ...resume,
    sections: { ...resume.sections, order: moveItem(order, order.indexOf(id), by) },
  };
}

export function toggleSection(resume: Resume, id: string): Resume {
  const { hidden } = resume.sections;
  const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
  return { ...resume, sections: { ...resume.sections, hidden: next } };
}

/** A built-in section's own heading (blank keeps the default), or a custom section's title. */
export function renameSection(resume: Resume, id: string, title: string): Resume {
  if (isBuiltInSection(id)) {
    const titles = { ...resume.sections.titles, [id]: title };
    return { ...resume, sections: { ...resume.sections, titles } };
  }
  return { ...resume, custom: resume.custom.map((c) => (c.id === id ? { ...c, title } : c)) };
}

/** A new, empty section of the learner's own, printed last. */
export function addCustomSection(resume: Resume, id: string, title: string): Resume {
  return {
    ...resume,
    custom: [...resume.custom, { id, title, items: [] }],
    sections: { ...resume.sections, order: [...sectionOrder(resume), id] },
  };
}

export function removeCustomSection(resume: Resume, id: string): Resume {
  const { sections } = resume;
  return {
    ...resume,
    custom: resume.custom.filter((c) => c.id !== id),
    sections: {
      ...sections,
      order: sectionOrder(resume).filter((o) => o !== id),
      hidden: sections.hidden.filter((h) => h !== id),
    },
  };
}
