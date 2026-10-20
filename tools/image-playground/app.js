const $ = (id) => document.getElementById(id);
let config = { configured: false, processor: false };
let assets = [];
let controller;
const hints = {
  demo: '检查本地页面和图片预览，显示固定示意图，不会请求生图模型。',
  direct: '把你的描述直接交给生图 API，先比较各个模型的画面效果。',
  product: '保留选中的官方产品图，让模型生成背景，再由子 Agent 合成。',
};
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
    const response = await fetch('/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, model: $('model').value, prompt: $('prompt').value, assetId: $('asset').value }), signal: controller.signal });
    const result = await response.json();
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
  try {
    const response = await fetch('/status');
    if (!response.ok) throw new Error('无法读取配置');
    config = await response.json();
    $('model').replaceChildren(...config.models.map((model) => { const option = document.createElement('option'); option.value = model; option.textContent = model; return option; }));
    $('model').value = 'gpt-image-2';
    $('environment').textContent = `${config.configured ? 'Key 已配置，可测试真实生图。' : 'Key 未配置，目前可运行离线演示。'}${config.processor ? '合成依赖已安装。' : '合成依赖未安装；直接生图无需此依赖。'}`;
  } catch { $('environment').textContent = '无法连接本地测试服务，请确认服务已启动。'; }
  try {
    const response = await fetch('/products');
    if (!response.ok) throw new Error('素材读取失败');
    assets = await response.json();
    $('asset').replaceChildren(...assets.map((asset) => { const option = document.createElement('option'); option.value = asset.id; option.textContent = `${asset.product}：${asset.description}`; return option; }));
    if (!assets.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '当前没有可用官方素材'; $('asset').append(option); }
    $('asset').dispatchEvent(new Event('change'));
  } catch { $('asset').replaceChildren(new Option('官方素材读取失败，仍可测试直接生图', '')); }
}
initialize();
