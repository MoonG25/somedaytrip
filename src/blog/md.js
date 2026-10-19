// 아주 작은 마크다운 렌더러. 이 블로그 본문에 필요한 문법만 지원한다.
//   ## 제목 (목차용 id 자동 부여) · 문단 · **굵게** · *기울임* · `코드` · [링크](url)
//   > 인용 · - 목록 · 1. 목록 · --- · ![이미지](src "캡션") · :::pull 큰 인용문
import { esc } from './util.js';

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      const ext = /^https?:/.test(href);
      return `<a class="link-u" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    });
}

export function slugify(text) {
  return (
    'h-' +
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
  );
}

/** @returns {{ html: string, toc: {id:string,text:string,level:number}[] }} */
export function renderMarkdown(src) {
  const lines = src.replace(/\r/g, '').trim().split('\n');
  const out = [];
  const toc = [];
  let para = [];
  let list = null;
  let quote = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushAll();
    } else if ((m = line.match(/^(#{2,4})\s+(.*)$/))) {
      flushAll();
      const level = m[1].length;
      const id = slugify(m[2]);
      if (level <= 3) toc.push({ id, text: m[2], level });
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
    } else if (/^---+$/.test(line)) {
      flushAll();
      out.push('<hr>');
    } else if ((m = line.match(/^:::pull\s+(.*)$/))) {
      flushAll();
      out.push(`<aside class="pull" data-reveal>${inline(m[1])}</aside>`);
    } else if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/))) {
      flushAll();
      out.push(`<figure><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy">${m[3] ? `<figcaption>${inline(m[3])}</figcaption>` : ''}</figure>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  flushAll();
  return { html: out.join('\n'), toc };
}

export const plainText = (md) => md.replace(/[#>*`\[\]()!_-]/g, ' ').replace(/\s+/g, ' ').trim();
