import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isAllowedImageUrl } from '../lib/imageUrl';

export function MarkdownContent({ children, className = '', allowImages = false }) {
  return <div className={`markdown-content ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ alt, src }) => allowImages && isAllowedImageUrl(src) ? <img src={src} alt={alt || '产品配图'} loading="lazy" /> : <span>{alt ? `[图片：${alt}]` : '[图片]'}</span>,
    }}>{String(children || '')}</ReactMarkdown>
  </div>;
}
