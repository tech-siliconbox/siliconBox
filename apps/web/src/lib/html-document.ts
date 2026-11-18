import render from 'dom-serializer';
import type { AnyNode, Document } from 'domhandler';
import { parseDocument } from 'htmlparser2';

// One way to read and write an author's page markup (ADR 0024), so every step that edits it
// keeps SVG intact: camelCase attributes such as viewBox and self-closing drawing elements.

export const parseHtml = (html: string): Document =>
  parseDocument(html, { lowerCaseAttributeNames: false, recognizeSelfClosing: true });

export const renderHtml = (nodes: AnyNode | AnyNode[]): string =>
  render(nodes, { encodeEntities: 'utf8' });
