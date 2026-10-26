import { useState } from 'react';
import { Button, Modal } from 'antd';
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Star, Share2, MoreHorizontal } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { creativeArticle } from '../lib/creativeArticle';
import './PlatformPreview.css';

const platforms = {
  xiaohongshu: '小红书', wechat: '微信公众号', wechat_moments: '微信朋友圈',
  douyin: '抖音', weibo: '微博', bilibili: '哔哩哔哩',
};
function platformKey(value) {
  return Object.keys(platforms).find(key => key === value || platforms[key] === value) || 'article';
}

export function PlatformPreview({ result }) {
  const [open, setOpen] = useState(false);
  if (!result?.content?.body) return null;
  const platform = platformKey(result.scene_judgment?.platform || result.task?.platform);
  return <><Button size="small" onClick={() => setOpen(true)}>发布预览</Button>
    <Modal title={`${platforms[platform] || '图文'} · 发布预览`} open={open} onCancel={() => setOpen(false)} footer={null} width={820} destroyOnHidden>
      <p className="platform-preview-hint">根据本次平台模拟阅读效果，实际发布以平台展示为准。</p>
      <Publication key={`${platform}-${result.request_id || result.content.title}`} result={result} platform={platform} />
    </Modal></>;
}

function Picture({ image }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="publication-image-missing">图片暂时无法加载</div> : <img src={image.url} alt={image.description || image.caption || '笔记配图'} onError={() => setFailed(true)} />;
}

function Publication({ result, platform }) {
  const [index, setIndex] = useState(0);
  const content = result.content;
  const images = (result.images || []).filter(image => image.url);
  const gallery = ['xiaohongshu', 'douyin', 'bilibili'].includes(platform);
  const social = ['wechat_moments', 'weibo'].includes(platform);
  const hashtags = (content.hashtags || []).map(tag => String(tag).startsWith('#') ? tag : `#${tag}`);
  const author = <div className="publication-author"><span className="publication-avatar">华</span><div><b>门店创作笔记</b><small>作者展示示意</small></div><MoreHorizontal size={20} /></div>;
  return <div className={`publication-stage publication-stage-${platform}`}><article className={`publication publication-${platform}`}>
    {platform === 'xiaohongshu' && <div className="publication-nav"><ChevronLeft size={20} /><b>笔记预览</b><Share2 size={19} /></div>}
    {(gallery || social) && author}
    {gallery && images.length > 0 && <div className="publication-gallery">
      <Picture key={images[index].url} image={images[index]} />
      {images[index].generated && <span className="publication-ai">AI 生成</span>}
      <span className="publication-count">{index + 1} / {images.length}</span>
      {images.length > 1 && <><button className="publication-previous" aria-label="上一张图片" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={20} /></button><button className="publication-next" aria-label="下一张图片" disabled={index === images.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight size={20} /></button></>}
    </div>}
    {gallery && images.length > 1 && <div className="publication-dots">{images.map((image, i) => <button key={`${image.url}-${i}`} aria-label={`查看第 ${i + 1} 张图片`} aria-current={index === i ? 'true' : undefined} onClick={() => setIndex(i)} />)}</div>}
    <div className="publication-copy">
      {gallery || social ? <><h2>{content.title}</h2><MarkdownContent hideCitations>{[content.lead, content.body, content.cta].filter(Boolean).join('\n\n')}</MarkdownContent></> : <>
        <h2>{content.title}</h2><div className="publication-article-meta"><span>原创</span> 门店创作 · {platforms[platform] || '图文'}</div>
        <MarkdownContent allowImages hideCitations>{creativeArticle(result).replace(/^# [^\n]*\n*/, '')}</MarkdownContent>
      </>}
      {(gallery || social) && hashtags.length > 0 && <p className="publication-tags">{hashtags.join(' ')}</p>}
      {social && images.length > 0 && <div className="publication-grid">{images.map((image, i) => <div key={`${image.url}-${i}`}><Picture image={image} />{image.generated && <span className="publication-ai">AI 生成</span>}</div>)}</div>}
    </div>
    {platform === 'xiaohongshu' && <div className="publication-actions"><span>说点什么…</span><Heart size={21} /><Star size={21} /><MessageCircle size={21} /></div>}
  </article></div>;
}
