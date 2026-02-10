import React from 'react';

// Simple token-based syntax highlighter
// Returns React elements with span.token-* classes

const LANG_ALIASES = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', sh: 'bash', shell: 'bash',
  yml: 'yaml', md: 'markdown', htm: 'html',
  '': 'text', text: 'text',
};

const KEYWORDS = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'import', 'export', 'from', 'default', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'void', 'delete', 'yield', 'static', 'super', 'debugger', 'do', 'finally', 'with'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'import', 'export', 'from', 'default', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw', 'type', 'interface', 'enum', 'implements', 'namespace', 'abstract', 'as', 'is', 'keyof', 'readonly', 'declare', 'module', 'switch', 'case', 'break', 'null', 'undefined', 'true', 'false', 'void'],
  python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'global', 'nonlocal', 'del', 'assert', 'async', 'await'],
  rust: ['fn', 'let', 'mut', 'const', 'if', 'else', 'for', 'while', 'loop', 'match', 'return', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'where', 'async', 'await', 'move', 'ref', 'true', 'false', 'as', 'in', 'type', 'unsafe', 'extern', 'dyn', 'static', 'macro'],
  go: ['func', 'var', 'const', 'type', 'struct', 'interface', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'package', 'import', 'defer', 'go', 'chan', 'select', 'map', 'nil', 'true', 'false', 'make', 'new', 'append', 'len', 'cap'],
  java: ['class', 'public', 'private', 'protected', 'static', 'final', 'void', 'int', 'String', 'boolean', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'super', 'import', 'package', 'extends', 'implements', 'interface', 'abstract', 'try', 'catch', 'throw', 'throws', 'finally', 'null', 'true', 'false', 'switch', 'case', 'break', 'continue', 'enum', 'synchronized'],
  css: ['@media', '@keyframes', '@import', '@font-face', '@charset', '@supports', '!important'],
  html: ['DOCTYPE', 'html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'script', 'style', 'link', 'meta', 'title'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'LIKE', 'IN', 'EXISTS', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'DEFAULT', 'CASCADE', 'INTEGER', 'TEXT', 'DATETIME', 'BOOLEAN'],
  bash: ['echo', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'sed', 'awk', 'find', 'chmod', 'chown', 'sudo', 'apt', 'npm', 'yarn', 'git', 'docker', 'curl', 'wget', 'export', 'source', 'if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'exit'],
  ruby: ['def', 'end', 'class', 'module', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'do', 'begin', 'rescue', 'ensure', 'raise', 'return', 'yield', 'require', 'include', 'extend', 'attr_accessor', 'attr_reader', 'attr_writer', 'self', 'nil', 'true', 'false', 'puts', 'print', 'lambda', 'proc'],
  c: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'struct', 'enum', 'union', 'typedef', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'goto', 'sizeof', 'static', 'extern', 'const', 'volatile', 'register', 'include', 'define', 'ifdef', 'ifndef', 'endif', 'NULL', 'true', 'false', 'malloc', 'free', 'printf', 'scanf'],
  cpp: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'bool', 'string', 'vector', 'map', 'set', 'class', 'struct', 'enum', 'union', 'namespace', 'using', 'template', 'typename', 'public', 'private', 'protected', 'virtual', 'override', 'static', 'const', 'constexpr', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'try', 'catch', 'throw', 'nullptr', 'true', 'false', 'auto', 'inline', 'sizeof', 'include', 'define'],
};

// Tokenize and highlight
export function highlightCode(code, lang) {
  const normalizedLang = LANG_ALIASES[lang?.toLowerCase()] || lang?.toLowerCase() || 'text';
  const keywords = KEYWORDS[normalizedLang] || [];

  if (normalizedLang === 'text' || !keywords.length) {
    return code; // Return plain text for unknown languages
  }

  const tokens = [];
  let remaining = code;
  let key = 0;

  while (remaining.length > 0) {
    // Single-line comments (// or #)
    const commentMatch = remaining.match(/^(\/\/.*|#.*)/);
    if (commentMatch) {
      tokens.push(<span key={key++} className="token-comment">{commentMatch[0]}</span>);
      remaining = remaining.slice(commentMatch[0].length);
      continue;
    }

    // Multi-line comments /* */
    const multiCommentMatch = remaining.match(/^\/\*[\s\S]*?\*\//);
    if (multiCommentMatch) {
      tokens.push(<span key={key++} className="token-comment">{multiCommentMatch[0]}</span>);
      remaining = remaining.slice(multiCommentMatch[0].length);
      continue;
    }

    // Strings (double and single quotes, with escape handling)
    const stringMatch = remaining.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    if (stringMatch) {
      tokens.push(<span key={key++} className="token-string">{stringMatch[0]}</span>);
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }

    // Numbers
    const numberMatch = remaining.match(/^(\b\d+\.?\d*\b|\b0x[0-9a-fA-F]+\b)/);
    if (numberMatch) {
      tokens.push(<span key={key++} className="token-number">{numberMatch[0]}</span>);
      remaining = remaining.slice(numberMatch[0].length);
      continue;
    }

    // Keywords (word boundary check)
    const wordMatch = remaining.match(/^([a-zA-Z_$@!][\w$]*)/);
    if (wordMatch) {
      const word = wordMatch[0];
      const isKeyword = normalizedLang === 'sql'
        ? keywords.some(k => k.toLowerCase() === word.toLowerCase())
        : keywords.includes(word);

      if (isKeyword) {
        tokens.push(<span key={key++} className="token-keyword">{word}</span>);
      } else if (normalizedLang !== 'text' && /^[A-Z][a-zA-Z]*$/.test(word) && word.length > 1) {
        // PascalCase = likely a type/class
        tokens.push(<span key={key++} className="token-type">{word}</span>);
      } else {
        tokens.push(word);
      }
      remaining = remaining.slice(word.length);
      continue;
    }

    // Operators and punctuation
    const opMatch = remaining.match(/^([=!<>]=?|[+\-*/%]=?|&&|\|\||[{}()\[\];:,.<>?&|^~])/);
    if (opMatch) {
      tokens.push(<span key={key++} className="token-punctuation">{opMatch[0]}</span>);
      remaining = remaining.slice(opMatch[0].length);
      continue;
    }

    // Default: consume one character
    tokens.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return tokens;
}
