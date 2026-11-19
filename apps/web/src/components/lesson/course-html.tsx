import 'server-only';
import parse, {
  attributesToProps,
  type DOMNode,
  Element,
  type HTMLReactParserOptions,
  Text,
  domToReact,
} from 'html-react-parser';
import { cn } from '@/lib/cn';
import { sanitizeCourseHtml } from '@/server/course-html';
import { CopyCodeButton } from './copy-code-button';

/** The visible text of a node, for the Copy button. */
function textOf(nodes: DOMNode[]): string {
  return nodes
    .map((node) => {
      if (node instanceof Text) return node.data;
      return node instanceof Element ? textOf(node.children as DOMNode[]) : '';
    })
    .join('');
}

const isWaveform = (node: Element) =>
  node.parent instanceof Element && (node.parent.attribs.class ?? '').split(' ').includes('wave');

const options: HTMLReactParserOptions = {
  replace(node) {
    if (!(node instanceof Element)) return undefined;
    const children = node.children as DOMNode[];
    // Code examples gain a Copy button: the one part of paid content that may be copied
    // (ADR 0023). Waveforms drawn in text are pictures, protected like the rest.
    if (node.name === 'pre' && !isWaveform(node)) {
      return (
        <div className="code-frame relative">
          <CopyCodeButton code={textOf(children)} />
          <pre data-copyable="">{domToReact(children, options)}</pre>
        </div>
      );
    }
    // Wide tables scroll inside their frame instead of widening the page.
    if (node.name === 'table') {
      return (
        <div className="table-frame">
          <table {...attributesToProps(node.attribs)}>{domToReact(children, options)}</table>
        </div>
      );
    }
    return undefined;
  },
};

/**
 * An author's page markup (ADR 0024), sanitised to the allow-list on every render. The
 * `.course-html` rules in the site stylesheet give its classes the site's design.
 */
export function CourseHtml({ html }: { html: string }) {
  return <div className="course-html">{parse(sanitizeCourseHtml(html), options)}</div>;
}

/** A short piece of the author's markup (a question, an option, a rubric line) inside a line. */
export function InlineCourseHtml({ html, className }: { html: string; className?: string }) {
  return (
    <span className={cn('course-html', className)}>{parse(sanitizeCourseHtml(html), options)}</span>
  );
}
