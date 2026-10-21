// Keep the same illustrated artifact in chat, clipboard and Markdown download.
export function creativeArticle(result) {
  const { content, images = [] } = result;
  const picture = (image) => {
    const description = String(image.description || '产品配图').replace(/[\[\]\r\n]/g, '');
    const caption = String(image.caption || '').replace(/\r?\n/g, ' ');
    const sourceLabel = image.generated
      ? 'AI生成合成图（背景由 AI 生成，产品主体为知识库原图）'
      : '知识库原图（官方产品素材）';
    return `![${description}](${image.url})\n\n*${sourceLabel}${caption ? `｜${caption}` : ''}*\n`;
  };
  const cover = images.filter((i) => i.placement === 'cover');
  const inline = images.filter((i) => i.placement === 'inline');
  const closing = images.filter((i) => i.placement === 'closing');
  const blocks = content.body.split(/\n\s*\n/);
  const sections = blocks.map((block, index) => {
    const selected = inline.filter((image, i) => (Number.isInteger(image.after_paragraph) && image.after_paragraph > 0 ? Math.min(blocks.length - 1, image.after_paragraph - 1) : Math.min(blocks.length - 1, Math.floor((i + 1) * blocks.length / (inline.length + 1)))) === index);
    return [block, ...selected.map(picture)].join('\n\n');
  });
  return [`# ${content.title}`, content.lead, ...cover.map(picture), sections.join('\n\n'), ...closing.map(picture), content.cta, (content.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
}

const plain = (value) => String(value ?? '待确认').replace(/[\\`*_\[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ');
export function imagePosition(image, result) {
  if (image.placement === 'cover') return '导语后（封面）';
  if (image.placement === 'closing') return '正文后、行动引导前';
  const count = result.content.body.split(/\n\s*\n/).length;
  return `正文第 ${Math.min(count, Math.max(1, image.after_paragraph || 1))} 段后`;
}

// Reviewable delivery report; copying the article remains free of internal notes.
export function creativeReport(result) {
  const scene = result.scene_judgment || {};
  const problems = Array.isArray(scene.main_problems) ? scene.main_problems.join('；') : scene.main_problems;
  const facts = (result.facts || []).map((item) => [
    `### ${plain(item.id)} · ${plain(item.title)}`,
    `型号：${plain(item.model)}  \n资料路径：${plain(item.source_path)}`,
    ...(item.fact_points || []).map((point) => `- 事实：${plain(point.fact)}\n  原文：${plain(point.quote)}`),
    item.source_url ? `[官方来源](${item.source_url})` : '',
  ].filter(Boolean).join('\n\n')).join('\n\n');
  const pictures = (result.images || []).map((item, i) => [
    `- 图片 ${i + 1}：${plain(item.name || item.description)}`,
    `  位置：${imagePosition(item, result)}；图注：${plain(item.caption)}  `,
    `  制作方式：${item.generated ? 'AI 背景＋官方产品图合成（非实拍）' : '官方原图'}；本地来源：${plain(item.source_path)}  `,
    `  [官方来源](${item.source_url})；核验：已按型号索引匹配，画面与使用权待人工核对。`,
  ].join('\n')).join('\n\n');
  const validation = result.validation || {};
  const imageWarnings = (result.warnings || []).filter((w) => /图片生成未完成|装饰性拼贴|不透明官方图/.test(w));
  return [
    '## 一、场景判断',
    `人群：${plain(scene.audience)}  \n场景：${plain(scene.scenario)}  \n购买阶段：${plain(scene.buying_stage)}  \n主要问题：${plain(problems)}  \n目标：${plain(scene.content_goal)}  \n平台：${plain(scene.platform)}  \n切入点：${plain(scene.angle)}`,
    '## 二、知识库依据', facts || '暂无可用依据。',
    '## 三、图文软文', creativeArticle(result),
    '### 配图说明', pictures || '缺少配图。', ...imageWarnings.map((w) => `- ${plain(w)}`),
    '## 四、核验结果',
    `事实：已执行证据引用、参数规则和模型审稿，发布前仍需人工核对。  \n图片：同型号索引匹配，未执行视觉核验。  \n合规：${validation.checks?.compliance === 'pass' ? '基础规则检查通过，另经模型审稿' : '待核对'}。  \n审稿：${result.editorial_review?.passed ? '模型审稿通过' : '待确认'}。`,
    ...[...new Set([...(validation.blocking_issues || []), ...(validation.pending_confirmation || []), ...(result.content_strategy?.asset_gap ? [result.content_strategy.asset_gap] : [])])].map((item) => `- 待确认：${plain(item)}`),
  ].join('\n\n');
}
