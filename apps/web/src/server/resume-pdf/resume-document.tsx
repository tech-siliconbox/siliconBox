import 'server-only';
import {
  type InlineNode,
  type Resume,
  type ResumeBlock,
  type ResumeDocumentModel,
  type ResumeEntry,
  parseInlineText,
  resumeDocument,
} from '@siliconbox/shared';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { type ResumeStyles, resumeStyles } from './styles';

type Styled = { styles: ResumeStyles };
type Emphasis = { bold: boolean; italic: boolean };

function fontOf({ bold, italic }: Emphasis, styles: ResumeStyles) {
  if (bold && italic) return styles.boldItalic;
  if (bold) return styles.strong;
  return italic ? styles.italic : styles.regular;
}

function runsOf(nodes: InlineNode[], styles: ResumeStyles, emphasis: Emphasis): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.kind === 'text' || node.kind === 'code') {
      return (
        <Text key={index} style={fontOf(emphasis, styles)}>
          {node.text}
        </Text>
      );
    }
    const inner = {
      bold: emphasis.bold || node.kind === 'strong',
      italic: emphasis.italic || node.kind === 'em',
    };
    return runsOf(node.children, styles, inner);
  });
}

/** Text the learner may mark with **bold** and *italic*. */
function Rich({ text, styles }: Styled & { text: string }) {
  return <Text>{runsOf(parseInlineText(text), styles, { bold: false, italic: false })}</Text>;
}

function Entry({ entry, styles }: Styled & { entry: ResumeEntry }) {
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.row}>
        <Text style={styles.strong}>{entry.title}</Text>
        <Text style={styles.muted}>{entry.meta}</Text>
      </View>
      {entry.subtitle !== '' && <Text style={styles.muted}>{entry.subtitle}</Text>}
      {entry.description !== '' && <Rich text={entry.description} styles={styles} />}
      {entry.bullets.map((bullet, index) => (
        <View key={index} style={styles.bullet}>
          <Text style={styles.bulletMark}>•</Text>
          <View style={styles.bulletText}>
            <Rich text={bullet} styles={styles} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Block({ block, styles }: Styled & { block: ResumeBlock }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{block.heading}</Text>
      {block.kind === 'text' && <Rich text={block.text} styles={styles} />}
      {block.kind === 'lines' &&
        block.lines.map(({ label, text }) => (
          <Text key={label}>
            <Text style={styles.strong}>{label}: </Text>
            {text}
          </Text>
        ))}
      {block.kind === 'entries' &&
        block.entries.map((entry, index) => <Entry key={index} entry={entry} styles={styles} />)}
    </View>
  );
}

function Header({ model, styles }: Styled & { model: ResumeDocumentModel }) {
  return (
    <View>
      <Text style={styles.name}>{model.name}</Text>
      {model.headline !== '' && <Text style={styles.headline}>{model.headline}</Text>}
      <Text style={styles.contact}>{model.contact.join('  |  ')}</Text>
    </View>
  );
}

/** The resume as a single-column, text-based PDF that applicant tracking systems can parse. */
export function ResumeDocument({ resume }: { resume: Resume }) {
  const model = resumeDocument(resume);
  const styles = resumeStyles(resume);
  return (
    <Document
      title={`${model.name} - Resume`}
      author={model.name}
      creator="SiliconBox"
      producer="SiliconBox"
    >
      <Page size={resume.design.pageSize} style={styles.page}>
        <Header model={model} styles={styles} />
        {model.blocks.map((block) => (
          <Block key={block.id} block={block} styles={styles} />
        ))}
      </Page>
    </Document>
  );
}
