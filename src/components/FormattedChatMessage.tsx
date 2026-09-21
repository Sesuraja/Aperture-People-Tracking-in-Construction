import React from 'react';

interface FormattedChatMessageProps {
  text: string;
  isUser?: boolean;
}

/**
 * Parses inline formatting:
 * - `code` -> inline code badge
 * - **bold** -> strong tag
 * - *italic* -> em tag
 * - Clean up raw LaTeX-style math like $(\mu)$ -> (μ)
 */
function renderInlineContent(rawText: string, isUser: boolean): React.ReactNode[] {
  // First normalize simple LaTeX syntax like $(\mu)$ or $(\sigma)$
  const text = rawText
    .replace(/\$\(\\mu\)\$/g, '(μ)')
    .replace(/\$\(\\sigma\)\$/g, '(σ)')
    .replace(/\$\\ge\s*/g, '≥ ')
    .replace(/\$\\le\s*/g, '≤ ');

  // Tokenize by `code` or **bold** or *italic*
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*)/g);

  return tokens.map((part, index) => {
    if (!part) return null;

    // Inline Code: `someCode`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeContent = part.slice(1, -1);
      return (
        <code
          key={`code-${index}`}
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium ${
            isUser
              ? 'bg-indigo-700/80 text-white border border-indigo-500/40'
              : 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200/80 dark:border-slate-700/70 shadow-2xs'
          }`}
        >
          {codeContent}
        </code>
      );
    }

    // Bold: **someText**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldContent = part.slice(2, -2);
      return (
        <strong
          key={`bold-${index}`}
          className={`font-semibold ${
            isUser ? 'text-white font-bold' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {boldContent}
        </strong>
      );
    }

    // Italic: *someText*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicContent = part.slice(1, -1);
      return (
        <em key={`em-${index}`} className={`italic ${isUser ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-400'}`}>
          {italicContent}
        </em>
      );
    }

    // Plain text chunk
    return <React.Fragment key={`txt-${index}`}>{part}</React.Fragment>;
  });
}

type BlockType =
  | { type: 'heading'; level: number; text: string }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: { num: string; text: string }[] }
  | { type: 'paragraph'; lines: string[] };

/**
 * FormattedChatMessage parses markdown text (headings, bullet points, numbered lists,
 * bold, italics, inline code) and renders crisp, modern, styled React elements.
 */
export const FormattedChatMessage: React.FC<FormattedChatMessageProps> = ({
  text,
  isUser = false
}) => {
  if (!text) return null;

  // Split lines
  const lines = text.split('\n');
  const blocks: BlockType[] = [];

  let currentBulletList: string[] = [];
  let currentNumberedList: { num: string; text: string }[] = [];
  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      blocks.push({ type: 'paragraph', lines: [...currentParagraphLines] });
      currentParagraphLines = [];
    }
  };

  const flushLists = () => {
    if (currentBulletList.length > 0) {
      blocks.push({ type: 'bullet-list', items: [...currentBulletList] });
      currentBulletList = [];
    }
    if (currentNumberedList.length > 0) {
      blocks.push({ type: 'numbered-list', items: [...currentNumberedList] });
      currentNumberedList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Blank line -> separates blocks
    if (!trimmed) {
      flushParagraph();
      flushLists();
      continue;
    }

    // 2. Heading: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushLists();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      continue;
    }

    // 3. Bullet list item: -, *, •
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      if (currentNumberedList.length > 0) flushLists();
      currentBulletList.push(bulletMatch[1]);
      continue;
    }

    // 4. Numbered list item: 1., 2., etc.
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numberedMatch) {
      flushParagraph();
      if (currentBulletList.length > 0) flushLists();
      currentNumberedList.push({
        num: numberedMatch[1],
        text: numberedMatch[2]
      });
      continue;
    }

    // 5. Standard text line inside paragraph
    if (currentBulletList.length > 0 || currentNumberedList.length > 0) {
      flushLists();
    }
    currentParagraphLines.push(rawLine);
  }

  // Final flush
  flushParagraph();
  flushLists();

  return (
    <div className="space-y-2.5 leading-relaxed font-sans text-xs">
      {blocks.map((block, bIdx) => {
        if (block.type === 'heading') {
          const headingStyle = isUser
            ? 'font-bold text-white mt-2 mb-1 flex items-center gap-1.5'
            : 'font-bold text-slate-900 dark:text-slate-100 mt-2 mb-1 flex items-center gap-1.5';

          if (block.level <= 2) {
            return (
              <h3 key={bIdx} className={`text-sm ${headingStyle}`}>
                {renderInlineContent(block.text, isUser)}
              </h3>
            );
          }
          return (
            <h4 key={bIdx} className={`text-xs uppercase tracking-wide ${headingStyle}`}>
              {renderInlineContent(block.text, isUser)}
            </h4>
          );
        }

        if (block.type === 'bullet-list') {
          return (
            <ul key={bIdx} className="space-y-1.5 my-1.5 pl-0.5">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      isUser ? 'bg-white/80' : 'bg-indigo-500 dark:bg-indigo-400'
                    }`}
                  />
                  <div className="flex-1">
                    {renderInlineContent(item, isUser)}
                  </div>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'numbered-list') {
          return (
            <ol key={bIdx} className="space-y-1.5 my-1.5 pl-0.5">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2">
                  <span
                    className={`inline-flex items-center justify-center min-w-4 h-4 text-[10px] font-bold rounded px-1 shrink-0 select-none ${
                      isUser
                        ? 'bg-indigo-700/80 text-indigo-100'
                        : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60'
                    }`}
                  >
                    {item.num}
                  </span>
                  <div className="flex-1">
                    {renderInlineContent(item.text, isUser)}
                  </div>
                </li>
              ))}
            </ol>
          );
        }

        // Paragraph block
        return (
          <p key={bIdx} className="leading-relaxed">
            {block.lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInlineContent(line, isUser)}
                {lIdx < block.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export default FormattedChatMessage;
