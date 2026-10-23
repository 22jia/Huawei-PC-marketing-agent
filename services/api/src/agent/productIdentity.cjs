const path = require('node:path');

// Called only after the main agent's retrieval has resolved version ambiguity.
// Identity comes from the selected facts document, never from a client-supplied alias.
function bindProductIdentity(task, evidence, assets) {
  const anchors = [...new Map(evidence.filter(item => /^P1-/.test(item.source_path || '') && /\/产品事实\.md$/.test((item.source_path || '').replace(/\\/g, '/')))
    .map(item => [item.source_path.replace(/\\/g, '/'), item])).values()];
  if (anchors.length !== 1) return { task, assets };
  const anchor = anchors[0];
  const directory = path.posix.dirname(anchor.source_path.replace(/\\/g, '/'));
  const identity = { product_id: directory, display_model: task.model, catalog_model: String(anchor.title || '').replace(/\s*-\s*产品事实$/, ''), source_path: anchor.source_path };
  return {
    task: { ...task, product_identity: identity },
    assets: assets.map(asset => {
      const sourcePath = path.posix.normalize(String(asset.source_path || '').replace(/\\/g, '/'));
      if (!sourcePath.startsWith(`${directory}/`)) return asset;
      return { ...asset, catalog_model: asset.model, model: task.model, product_id: identity.product_id };
    }),
  };
}

module.exports = { bindProductIdentity };
