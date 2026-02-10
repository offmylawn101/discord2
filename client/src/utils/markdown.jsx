import React from 'react';
import { useStore } from '../store';
import { highlightCode } from './syntaxHighlight';

// Discord-like markdown parser
// Supports: **bold**, *italic*, ~~strikethrough~~, __underline__, `code`, ```code blocks```, ||spoiler||, > blockquote, [links](url), @mentions

// Helper to get custom emoji image URL from store
function getCustomEmojiUrl(emojiId) {
  const state = useStore.getState();
  const emoji = (state.serverEmojis || []).find(e => e.id === emojiId);
  return emoji?.image_url || `/uploads/emojis/${emojiId}.png`;
}

const mentionStyle = {
  background: 'rgba(88, 101, 242, 0.3)',
  color: '#dee0fc',
  padding: '0 2px',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 500,
};

const RULES = [
  // Code blocks (must come first to avoid processing inside them)
  {
    pattern: /```(\w*)\n?([\s\S]*?)```/g,
    render: (match, lang, code, key) => (
      <pre key={key} className="md-codeblock">
        {lang && <div className="md-codeblock-lang">{lang}</div>}
        <code>{code}</code>
      </pre>
    ),
  },
  // Inline code
  {
    pattern: /`([^`]+)`/g,
    render: (match, code, key) => <code key={key} className="md-inline-code">{code}</code>,
  },
  // Bold + Italic
  {
    pattern: /\*\*\*(.+?)\*\*\*/g,
    render: (match, text, key) => <strong key={key}><em>{parseInline(text)}</em></strong>,
  },
  // Bold
  {
    pattern: /\*\*(.+?)\*\*/g,
    render: (match, text, key) => <strong key={key}>{parseInline(text)}</strong>,
  },
  // Italic with *
  {
    pattern: /\*(.+?)\*/g,
    render: (match, text, key) => <em key={key}>{parseInline(text)}</em>,
  },
  // Underline
  {
    pattern: /__(.+?)__/g,
    render: (match, text, key) => <u key={key}>{parseInline(text)}</u>,
  },
  // Italic with _
  {
    pattern: /_(.+?)_/g,
    render: (match, text, key) => <em key={key}>{parseInline(text)}</em>,
  },
  // Strikethrough
  {
    pattern: /~~(.+?)~~/g,
    render: (match, text, key) => <del key={key}>{parseInline(text)}</del>,
  },
  // Spoiler
  {
    pattern: /\|\|(.+?)\|\|/g,
    render: (match, text, key) => <span key={key} className="md-spoiler" onClick={e => e.currentTarget.classList.toggle('revealed')}>{text}</span>,
  },
  // Links
  {
    pattern: /\[([^\]]+)\]\(([^)]+)\)/g,
    render: (match, text, url, key) => <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="md-link">{text}</a>,
  },
  // Auto-links
  {
    pattern: /(https?:\/\/[^\s<]+)/g,
    render: (match, url, key) => <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="md-link">{url}</a>,
  },
];

function parseInline(text) {
  if (!text) return text;
  // Simple inline parse for nested formatting
  return text;
}

export function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Block quote
    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="md-blockquote">
          {renderInline(quoteLines.join('\n'))}
        </blockquote>
      );
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const codeText = codeLines.join('\n');
      elements.push(
        <pre key={`cb-${i}`} className="md-codeblock" data-lang={lang || undefined}>
          <div className="md-codeblock-header">
            {lang && <span className="md-codeblock-lang">{lang}</span>}
            <button className="md-codeblock-copy" onClick={() => navigator.clipboard.writeText(codeText)}>Copy</button>
          </div>
          <code>{lang ? highlightCode(codeText, lang) : codeText}</code>
        </pre>
      );
      continue;
    }

    // Regular line
    elements.push(
      <React.Fragment key={`line-${i}`}>
        {i > 0 && elements.length > 0 && '\n'}
        {renderInline(line)}
      </React.Fragment>
    );
    i++;
  }

  return elements;
}

function renderInline(text) {
  if (!text) return null;

  const parts = [];
  let remaining = text;
  let keyCounter = 0;

  // Process inline patterns
  const inlinePatterns = [
    // Inline code (process first to avoid formatting inside)
    { regex: /`([^`]+)`/, render: (m) => <code key={`ic-${keyCounter++}`} className="md-inline-code">{m[1]}</code> },
    // Bold + Italic
    { regex: /\*\*\*(.+?)\*\*\*/, render: (m) => <strong key={`bi-${keyCounter++}`}><em>{m[1]}</em></strong> },
    // Bold
    { regex: /\*\*(.+?)\*\*/, render: (m) => <strong key={`b-${keyCounter++}`}>{m[1]}</strong> },
    // Underline (before italic _)
    { regex: /__(.+?)__/, render: (m) => <u key={`u-${keyCounter++}`}>{m[1]}</u> },
    // Italic *
    { regex: /\*(.+?)\*/, render: (m) => <em key={`i-${keyCounter++}`}>{m[1]}</em> },
    // Italic _
    { regex: /_(.+?)_/, render: (m) => <em key={`i2-${keyCounter++}`}>{m[1]}</em> },
    // Strikethrough
    { regex: /~~(.+?)~~/, render: (m) => <del key={`s-${keyCounter++}`}>{m[1]}</del> },
    // Spoiler
    { regex: /\|\|(.+?)\|\|/, render: (m) => <span key={`sp-${keyCounter++}`} className="md-spoiler" onClick={e => e.currentTarget.classList.toggle('revealed')}>{m[1]}</span> },
    // Custom emojis <:name:id>
    { regex: /<:([a-zA-Z0-9_]+):([a-f0-9-]+)>/, render: (m) => (
      <img
        key={`ce-${keyCounter++}`}
        className="custom-emoji"
        src={getCustomEmojiUrl(m[2])}
        alt={`:${m[1]}:`}
        title={`:${m[1]}:`}
        style={{ width: 22, height: 22, objectFit: 'contain', verticalAlign: 'middle', margin: '0 1px' }}
      />
    )},
    // User mentions <@userId>
    { regex: /<@([a-f0-9-]+)>/, render: (m) => {
      const state = useStore.getState();
      const member = state.members.find(u => u.id === m[1]);
      const name = member?.nickname || member?.username || 'Unknown User';
      return <span key={`mention-${keyCounter++}`} style={mentionStyle}>@{name}</span>;
    }},
    // Role mentions <@&roleId>
    { regex: /<@&([a-f0-9-]+)>/, render: (m) => {
      const state = useStore.getState();
      const role = state.roles.find(r => r.id === m[1]);
      const name = role?.name || 'Unknown Role';
      return <span key={`rmention-${keyCounter++}`} style={mentionStyle}>@{name}</span>;
    }},
    // @everyone
    { regex: /@everyone/, render: (m) => <span key={`everyone-${keyCounter++}`} style={mentionStyle}>@everyone</span> },
    // @here
    { regex: /@here/, render: (m) => <span key={`here-${keyCounter++}`} style={mentionStyle}>@here</span> },
    // Named links
    { regex: /\[([^\]]+)\]\(([^)]+)\)/, render: (m) => <a key={`l-${keyCounter++}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="md-link">{m[1]}</a> },
    // Auto-links
    { regex: /(https?:\/\/[^\s<>]+)/, render: (m) => <a key={`al-${keyCounter++}`} href={m[1]} target="_blank" rel="noopener noreferrer" className="md-link">{m[1]}</a> },
  ];

  while (remaining.length > 0) {
    let earliestMatch = null;
    let earliestPattern = null;
    let earliestIndex = Infinity;

    for (const p of inlinePatterns) {
      const match = remaining.match(p.regex);
      if (match && match.index < earliestIndex) {
        earliestMatch = match;
        earliestPattern = p;
        earliestIndex = match.index;
      }
    }

    if (!earliestMatch) {
      parts.push(remaining);
      break;
    }

    // Add text before match
    if (earliestIndex > 0) {
      parts.push(remaining.slice(0, earliestIndex));
    }

    // Add rendered match
    parts.push(earliestPattern.render(earliestMatch));

    // Continue after match
    remaining = remaining.slice(earliestIndex + earliestMatch[0].length);
  }

  return parts;
}

export default renderMarkdown;
