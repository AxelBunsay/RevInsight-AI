function stripHtml(markdown) {
  return String(markdown)
    .replace(/<\s*(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]*>/g, '');
}

function renderInline(text, keyPrefix) {
  const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|₱[\d,]+(?:\.\d+)?%?|\b\d+(?:,\d{3})*(?:\.\d+)?%?)/g;
  const nodes = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${tokenIndex++}`}>{renderInline(token.slice(2, -2), `${keyPrefix}-bold`)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-${tokenIndex++}`}>{renderInline(token.slice(1, -1), `${keyPrefix}-italic`)}</em>);
    } else {
      nodes.push(<span className="ai-revenue-answer__number" key={`${keyPrefix}-${tokenIndex++}`}>{token}</span>);
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function parseListLine(line) {
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) return { type: 'ul', text: bullet[1] };
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
  if (numbered) return { type: 'ol', text: numbered[1] };
  return null;
}

export default function MarkdownAnswer({ markdown }) {
  const lines = stripHtml(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      return;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'rule' });
      return;
    }

    const listLine = parseListLine(line);
    if (listLine) {
      flushParagraph();
      if (!list || list.type !== listLine.type) flushList();
      if (!list) list = { type: listLine.type, items: [] };
      list.items.push(listLine.text);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();

  return <div className="ai-revenue-answer">
    {blocks.map((block, index) => {
      if (block.type === 'heading') {
        const Heading = `h${block.level}`;
        return <Heading className="ai-revenue-answer__heading" key={`heading-${index}`}>{renderInline(block.text, `heading-${index}`)}</Heading>;
      }
      if (block.type === 'rule') return <hr className="ai-revenue-answer__rule" key={`rule-${index}`} />;
      if (block.type === 'ul' || block.type === 'ol') {
        const List = block.type;
        return <List className="ai-revenue-answer__list" key={`list-${index}`}>
          {block.items.map((item, itemIndex) => <li key={`list-${index}-item-${itemIndex}`}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>)}
        </List>;
      }
      return <p className="ai-revenue-answer__paragraph" key={`paragraph-${index}`}>{renderInline(block.text, `paragraph-${index}`)}</p>;
    })}
  </div>;
}
