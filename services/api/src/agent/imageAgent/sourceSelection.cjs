const { ImageProviderError } = require('./provider.cjs');
const { chooseStyle } = require('./styles.cjs');

// These profiles were visually checked. Other transparent assets use metadata-derived hints.
const profiles = {
  img_adbd7386ab0e: { color: '原野绿', view: 'oblique', state: 'open', dailyRotation: 35 }, // Align the KV's diagonal front edge with a desk, without warping pixels.
  img_08f8cb6ac09e: { color: '原野绿', view: 'oblique', state: 'open' },
  img_d6c0f67c5e77: { color: '樱粉金', view: 'oblique', state: 'open' },
  img_0391312d4f63: { color: '深空灰', view: 'oblique', state: 'open' },
  img_578dcffad7c3: { color: '原野绿', view: 'overhead', state: 'open' },
  img_b8c11bbb9b6a: { color: '原野绿', view: 'overhead', state: 'closed' },
  img_1caafbf422af: { color: '樱粉金', view: 'front', state: 'open' },
  img_7a7fde1fda8c: { color: '原野绿', view: 'front', state: 'open' },
};
function inferProfile(asset) {
  if (profiles[asset.id]) return profiles[asset.id];
  const text = `${asset.name || ''} ${asset.description || ''} ${asset.source_path || ''}`;
  const color = ['原野绿', '樱粉金', '深空灰', '柔光金', '皓月银', '雅川青'].find(value => text.includes(value)) || null;
  const view = /俯拍|俯视|键盘俯视|顶视/.test(text) ? 'overhead' : /正面|屏幕展示|键盘屏幕|打开/.test(text) ? 'front' : 'oblique';
  const state = /合盖|闭合|收纳/.test(text) ? 'closed' : 'open';
  const detailOnly = /机身细节|键盘细节|接口细节|屏幕细节|局部特写|微距/.test(text);
  return { color, view, state, detailOnly, metadataDerived: true };
}
function selectSourceAsset(input, assets, plan = {}) {
  const model = input.task?.model?.trim();
  if (!model) throw new ImageProviderError('IMAGE_MATCH_REQUIRED', '请先选择明确的产品型号。');
  const selection = chooseStyle(input, plan);
  if (selection.unsupported) throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
  const brief = `${plan.purpose || ''} ${input.task.visual_brief || ''} ${input.task.scenario || ''}`;
  const mentionedColors = [...new Set(brief.match(/原野绿|樱粉金|深空灰|柔光金/g) || [])];
  if (mentionedColors.length > 1 || (input.task.color && mentionedColors.length && !mentionedColors.includes(input.task.color))) throw new ImageProviderError('IMAGE_MATCH_REQUIRED', '配色要求不明确或相互冲突，请指定一种配色。');
  const color = input.task.color || mentionedColors[0];
  const closed = /合盖|合上|平铺|毛绒/.test(brief);
  const explicitOverhead = /俯拍|俯视|正上方/.test(brief);
  const overhead = closed || explicitOverhead;
  const preferOverhead = explicitOverhead || selection.style.group === 'daily';
  const desired = { state: closed ? 'closed' : 'open', view: overhead || preferOverhead ? 'overhead' : 'oblique' };
  const candidates = assets.filter(asset => asset.model === model && asset.hasTransparency === true)
    .map(asset => ({ ...asset, composition_profile: inferProfile(asset) }))
    // A transparent crop of a keyboard or port is not a complete product hero.
    .filter(asset => !asset.composition_profile.detailOnly)
    .filter(asset => !color || asset.composition_profile.color === color)
    .filter(asset => closed ? asset.composition_profile.state === 'closed' : asset.composition_profile.state !== 'closed')
    .filter(asset => !explicitOverhead || asset.composition_profile.view === 'overhead')
    .sort((a, b) => Number(b.composition_profile.view === desired.view) - Number(a.composition_profile.view === desired.view) ||
      (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0) || a.id.localeCompare(b.id));
  if (!candidates.length) throw new ImageProviderError('IMAGE_NO_MATCHED_ASSET', '没有匹配型号、配色及场景角度的已确认透明素材，已停止生成；请换场景或明确选择原图。');
  return candidates[0];
}
function sourceCameraDirection(asset) {
  const profile = asset.composition_profile || profiles[asset.id];
  if (profile?.dailyRotation) return 'Camera requirement: steep elevated three-quarter view of a desk, looking down at approximately 55 degrees. The laptop base will sit flat on the supporting surface with its front edge horizontal. Use a close-up continuous tabletop filling the frame; no visible horizon, distant chair, wall or window frame. Light from upper left; avoid hard directional sunlight.';
  if (profile?.view === 'overhead') return 'Camera requirement: true overhead top-down view, looking straight down at a flat supporting surface, parallel edges, no visible horizon or distant window view. This camera requirement overrides oblique-view wording elsewhere.';
  if (profile?.view === 'oblique') return 'Camera requirement: elevated three-quarter tabletop view, matching a product seen from above and from its front-left side. Avoid a straight-on or strict overhead surface.';
  return '';
}
module.exports = { selectSourceAsset, sourceCameraDirection, profiles };
