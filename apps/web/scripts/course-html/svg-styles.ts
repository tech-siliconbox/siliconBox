import { type Element, isTag } from 'domhandler';
import type { Notes } from './notes';

// Course diagrams take their colours and fonts from classes in the course stylesheet. The site
// does not load that stylesheet (and strips inline styles), so the same values are written onto
// each SVG element as presentation attributes. The picture stays as the author drew it.

const PRESENTATION = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'font-size',
  'font-weight',
  'font-family',
  'marker-end',
  'opacity',
]);

type Rule = { tag: string | null; classes: string[]; declarations: [string, string][] };

function readVariables(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return new Map(
    [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  );
}

/** Rules written as `<scope> .a.b` or `<scope> text` inside the diagram's scope class. */
export type SvgRules = Rule[];

export function readSvgRules(css: string, scope: string): Rule[] {
  const variables = readVariables(css);
  const resolve = (value: string) =>
    value.replace(/var\((--[\w-]+)\)/g, (match, name: string) => variables.get(name) ?? match);
  const rules: Rule[] = [];
  for (const [, selectors = '', body = ''] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const declarations = [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)]
      .map(([, property = '', value = '']): [string, string] => [property, resolve(value.trim())])
      .filter(([property, value]) => PRESENTATION.has(property) && value !== 'inherit');
    if (declarations.length === 0) continue;
    for (const selector of selectors.split(',').map((part) => part.trim())) {
      const match = new RegExp(`^\\.${scope}\\s+([a-z]+)?((?:\\.[\\w-]+)*)$`).exec(selector);
      if (match === null) continue;
      const classes = (match[2] ?? '').split('.').filter(Boolean);
      rules.push({ tag: match[1] ?? null, classes, declarations });
    }
  }
  return rules;
}

function applies(rule: Rule, element: Element): boolean {
  const classes = (element.attribs.class ?? '').split(/\s+/);
  return (
    (rule.tag === null || rule.tag === element.name) &&
    rule.classes.every((name) => classes.includes(name)) &&
    (rule.tag !== null || rule.classes.length > 0)
  );
}

function styleTree(element: Element, rules: Rule[]): void {
  for (const rule of rules.filter((candidate) => applies(candidate, element))) {
    for (const [property, value] of rule.declarations) element.attribs[property] = value;
  }
  delete element.attribs.class;
  delete element.attribs.style;
  for (const child of element.children) if (isTag(child)) styleTree(child, rules);
}

/** Writes the stylesheet's diagram rules onto the SVG's own elements, in place. */
export function styleSvg(svg: Element, rules: Rule[], notes: Notes): void {
  if (svg.attribs.style) notes.add('diagram inline style dropped (the site sizes diagrams)');
  styleTree(svg, rules);
}
