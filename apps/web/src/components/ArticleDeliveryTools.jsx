import { useState } from 'react';
import { Button, Modal, Tag, List } from 'antd';
import { creativeReport, imagePosition } from '../lib/creativeArticle';

export function ArticleDeliveryTools({ result }) {
  const [open, setOpen] = useState(false);
  if (!result?.content_strategy) return null;
  const strategy = result.content_strategy;
  function download() {
    const text = creativeReport(result).replace(/\]\(\/api\//g, `](${window.location.origin}/api/`);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${result.content.title.replace(/[\\/:*?"<>|]/g, '_')}.md`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><Button size="small" onClick={() => setOpen(true)}>图文策划</Button><Button size="small" onClick={download}>下载完整交付 MD</Button><Modal title="本次图文策划与审稿" open={open} onCancel={() => setOpen(false)} footer={null}>
    <h4>{strategy.angle}</h4><p>读者困扰：{strategy.reader_tension}</p><p>平台选择：{strategy.platform_reason}</p>
    <ol>{strategy.outline.map((item, i) => <li key={i}>{item}</li>)}</ol>
    <Tag color="green">模型审稿通过 · 重写 {result.editorial_review?.revision_count || 0} 次</Tag><p>{result.editorial_review?.platform_fit}</p>
    <List dataSource={result.images || []} renderItem={(image) => <List.Item><div><b>{image.name || image.description}</b><p>{image.description}</p><p>{image.purpose} · {imagePosition(image, result)}</p><p>图注：{image.caption}</p><p>本地来源：{image.source_path}</p><a href={image.source_url} target="_blank" rel="noreferrer">核对官方来源</a></div></List.Item>} />
    {strategy.asset_gap && <p>{strategy.asset_gap}</p>}<p>图片按同型号资料索引匹配，尚未视觉核验。发布前核对版本、画面和使用权。MD 配图链接需本地服务运行。</p>
  </Modal></>;
}
