import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useContext } from 'react';
import { KnowledgeNavigationContext, knowledgeCitationPath } from '../lib/knowledgeNavigation';

export function MarkdownContent({ children, className = '', allowImages = false, hideCitations = false }) {
  const openKnowledge = useContext(KnowledgeNavigationContext);
  return <div className={`markdown-content ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ children, href }) => {
        const path = knowledgeCitationPath(href);
        if (path && hideCitations) return null;
        if (path && openKnowledge) return <sup className="knowledge-citation"><a href={href} title={`查看知识库：${path}`} aria-label={`查看引用来源：${path}`} onClick={event => { event.preventDefault(); openKnowledge(path); }}>[{children}]</a></sup>;
        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
      img: ({ alt, src }) => allowImages && (/^\/api\/v1\/products\/image\?path=/.test(src || '') || /^\/api\/v1\/generated-assets\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(src || '')) ? <img src={src} alt={alt || '产品配图'} loading="lazy" /> : <span>{alt ? `[图片：${alt}]` : '[图片]'}</span>,
    }}>{String(children || '')}</ReactMarkdown>
  </div>;
}
