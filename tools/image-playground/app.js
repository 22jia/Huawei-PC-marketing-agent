const $ = (id) => document.getElementById(id);
let config = { configured: false, processor: false };
let assets = [];
let controller;
let promptEdited = false;
const hints = {
  demo: '检查本地页面和图片预览，显示固定示意图，不会请求生图模型。',
  direct: '把你的描述直接交给生图 API，先比较各个模型的画面效果。',
  product: '保留选中的官方产品图，让模型生成背景，再由子 Agent 合成。',
};
function automaticPrompt(force = false) {
  if (promptEdited && !force) return;
  const audience = $('audience').value || '产品潜在用户';
  const scene = $('scenario').value || '学习';
  const goal = $('goal').value || '种草';
  const platform = $('platform').selectedOptions[0]?.textContent || '社交平台';
  const context = `面向${audience}，发布在${platform}，内容目标为${goal}。`;
  const asset = assets.find((item) => item.id === $('asset').value);
  const product = $('product-model').value || asset?.model || '[产品名称]';
  const sourceName = `${asset?.name || ''} ${asset?.description || ''}`;
  const color = /原野绿|绿色/.test(sourceName) ? '原野绿' : /樱粉金|粉色/.test(sourceName) ? '樱粉金' : /深空灰|灰色/.test(sourceName) ? '深空灰' : '与所选官方产品图片一致的配色';
  $('prompt').value = $('visual-kind').value === 'poster'
    ? `生成一张高级商业产品宣传海报，产品为[${product}]，品牌名为[华为]。\n整体采用现代、极简、高级的科技商业广告风格，画面以[${color}]为主，搭配同色系深浅变化和少量白色文字。\n产品作为画面核心主体，使用高质量3D写实渲染，材质细节真实，带柔和反光和高级棚拍光影。产品可轻微悬浮，底部带自然阴影，突出立体感。\n版式采用简洁对称构图，背景加入超大英文排版，与产品形成前后层次。四周可以加入少量极简UI线条、几何装饰和产品参数信息，但不要过度复杂。\n整体要有高端电子品牌广告、Behance商业视觉、产品发布会海报的质感。字体使用简洁现代无衬线字体，排版克制，留白充足。\n底部加入简洁CTA按钮，例如“EXPLORE NOW”，以及少量品牌官网或社媒信息。\n背景采用与产品原色协调的高端商业广告视觉，可使用空间光影、抽象曲面、细腻反射或专业影棚环境，不限定渐变；未明确要求时不添加山水。标题与页脚区域采用较深的同色系色调，适合银白色文字。\n画面要求：高级、干净、商业感强、真实产品广告质感、超高细节、电影感灯光、专业产品摄影效果。\n${context}产品主体由所选知识库官方图片提供并保持原样；本流程只生成背景并在本地合成主体，不会重新3D绘制、改变产品角度或编造参数。`
    : `生成3:4竖版日常真实摄影照片。${context}场景为${scene}，${/宿舍/.test(scene) ? '浅木色宿舍书桌，课程笔记、书本、水杯与帆布包' : /图书馆|学习|自习/.test(scene) ? '大学图书馆窗边木质书桌，摊开的笔记本、中性笔、透明水杯' : /办公|咖啡/.test(scene) ? '简约浅色办公书桌，拿铁、细框眼镜与纸质手账' : '自然生活桌面，少量与场景有关的真实生活道具'}。柔和自然窗光、真实材质、轻微生活痕迹，像手机随手拍摄的INS风好物分享。场景视角适配所选电脑原图，电脑落在桌面上，接触阴影自然；仅合成一个官方电脑主体，不重绘、不补画。无额外文字或水印。`;
  if (force) promptEdited = false;
}
function updateAssets() {
  const matching = assets.filter((asset) => asset.model === $('product-model').value);
  const priority = (asset) => (asset.hasTransparency && /\.png$/i.test(asset.name) ? 0 : 8) + (/经典开合外观|开合产品外观|正面产品展示|完整外观|多彩配色外观/.test(asset.name) ? 0 : /细节|键盘|接口|屏幕/.test(asset.name) ? 4 : 2);
  matching.sort((a, b) => priority(a) - priority(b));
  $('asset').replaceChildren(new Option('自动按场景选图（MateBook 14 鸿蒙版）', ''), ...matching.map((asset) => { const option = new Option(`${asset.hasTransparency ? '透明底' : '带背景/未确认'} · ${asset.name}`, asset.id); return option; }));
  if ($('visual-kind').value === 'poster' && matching.length) $('asset').value = matching[0].id;
  if (!matching.length) $('asset').append(new Option('该型号没有可用素材', ''));
  $('asset').dispatchEvent(new Event('change'));
}
$('product-model').addEventListener('change', () => { updateAssets(); automaticPrompt(); });
for (const id of ['audience', 'scenario', 'goal', 'platform', 'visual-kind']) $(id).addEventListener('change', () => automaticPrompt());
$('reset-prompt').addEventListener('click', () => automaticPrompt(true));
$('prompt').addEventListener('input', () => { promptEdited = true; });
function updateMode() {
  const mode = $('mode').value;
  $('mode-hint').textContent = hints[mode];
  $('product-controls').hidden = mode !== 'product';
  $('model').disabled = mode === 'demo';
  $('generate').textContent = mode === 'demo' ? '运行离线演示' : mode === 'product' ? '生成产品合成图' : '调用 API 生图';
}
$('mode').addEventListener('change', updateMode);
$('asset').addEventListener('change', () => {
  const asset = assets.find((item) => item.id === $('asset').value);
  $('source').hidden = !asset;
  if (asset) $('source').src = asset.url;
  const detail = asset && /细节|键盘|接口/.test(`${asset.name} ${asset.description}`);
  $('asset-match').textContent = asset ? `已绑定：${asset.model}｜${asset.name}｜${asset.hasTransparency ? '已检测到透明背景' : '未确认透明背景，需抠图服务'}｜${detail ? '注意：这是细节素材，原图可能已裁切；完整产品海报请选择主视觉，并检查上方原图。' : '请检查上方原图是否包含完整产品；合成不会补画原图缺失部分。'}` : '将按当前型号和场景自动选图；没有匹配角度时停止生成。';
  automaticPrompt();
});
$('cancel').addEventListener('click', () => controller?.abort());
$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const mode = $('mode').value;
  if (mode !== 'demo' && !config.configured) { $('status').textContent = '尚未配置 Key。请展开左侧首次使用说明，配置后重启测试服务。'; return; }
  if (mode === 'product' && !config.processor) { $('status').textContent = '产品合成需要 sharp 依赖。请运行左侧说明中的安装命令后重启服务；也可以先选择直接生图。'; return; }
  controller = new AbortController();
  $('generate').disabled = true;
  $('mode').disabled = true;
  $('cancel').hidden = false;
  $('status').textContent = mode === 'demo' ? '正在读取离线示意图…' : '正在生成，可能需要一到两分钟…';
  $('warnings').replaceChildren();
  $('download').hidden = true;
  $('result').hidden = true;
  $('empty').hidden = false;
  try {
    const response = await fetch('/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, model: $('model').value, prompt: $('prompt').value, assetId: $('asset').value, productModel: $('product-model').value, audience: $('audience').value, scenario: $('scenario').value, goal: $('goal').value, platform: $('platform').value, style: $('prompt').value }), signal: controller.signal });
    const result = await response.json();
    if (result.source_filename) (result.warnings ||= []).push(`本次采用官方原图：${result.source_filename}（${result.source_product_image}）`);
    if (!response.ok) throw new Error(`${result.message}${result.code ? `（${result.code}）` : ''}`);
    if (!/^\/api\/v1\/generated-assets\/img_[a-f0-9]{32}\.(png|jpg|jpeg|webp)$/.test(result.url)) throw new Error('测试服务返回了无效的图片地址');
    $('result').src = result.url;
    $('result').hidden = false;
    $('empty').hidden = true;
    $('download').href = result.url;
    $('download').hidden = false;
    $('status').textContent = result.message;
    for (const warning of result.warnings || []) { const li = document.createElement('li'); li.textContent = warning; $('warnings').append(li); }
  } catch (error) {
    $('status').textContent = error.name === 'AbortError' ? '已停止等待。供应商已开始的远程任务可能仍会计费。' : error.message;
  } finally { $('generate').disabled = false; $('mode').disabled = false; $('cancel').hidden = true; }
});
async function initialize() {
  updateMode();
  automaticPrompt(true);
  try {
    const response = await fetch('/status');
    if (!response.ok) throw new Error('无法读取配置');
    config = await response.json();
    $('model').replaceChildren(...config.models.map((model) => { const option = document.createElement('option'); option.value = model; option.textContent = model; return option; }));
    $('model').value = 'gpt-image-2';
    $('environment').textContent = `${config.configured ? '生图 Key 已配置。' : '生图 Key 未配置，目前可运行离线演示。'}${config.cutoutConfigured ? '背景移除 Key 已配置。' : '背景移除 Key 未配置；透明底官方图不受影响。'}${config.processor ? '合成依赖已安装。' : '合成依赖未安装；直接生图无需此依赖。'}${config.diagnosticVersion >= 3 ? '连接诊断 v3。' : '测试服务版本旧，请重启。'}`;
  } catch { $('environment').textContent = '无法连接本地测试服务，请确认服务已启动。'; }
  try {
    const response = await fetch('/products');
    if (!response.ok) throw new Error('素材读取失败');
    assets = await response.json();
    const models = [...new Set(assets.map((asset) => asset.model))];
    $('product-model').replaceChildren(...models.map((model) => new Option(model, model)));
    const harmony14 = models.find((model) => /MateBook 14/.test(model) && /鸿蒙/.test(model));
    if (harmony14) $('product-model').value = harmony14;
    updateAssets();
    automaticPrompt(true);

  } catch { $('asset').replaceChildren(new Option('官方素材读取失败，仍可测试直接生图', '')); }
}
initialize();
