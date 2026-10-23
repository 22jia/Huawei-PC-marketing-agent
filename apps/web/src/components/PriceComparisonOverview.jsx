import { Tag } from 'antd';

const money = value => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

export function PriceComparisonOverview({ profile, result, report, loading, snapshotDate, onLookup, configurationControl }) {
  const ready = result.status === 'ready';
  const store = ready ? result.plans.filter(plan => plan.name.startsWith('门店')).sort((a, b) => a.price - b.price)[0] : null;
  const online = ready ? result.plans.filter(plan => plan.name.startsWith('华为商城价格')).sort((a, b) => a.price - b.price)[0] : null;
  const education = ready ? result.plans.filter(plan => plan.name.startsWith('华为商城教育')).sort((a, b) => a.price - b.price)[0] : null;
  const bestOnline = [online, education].filter(Boolean).sort((a, b) => a.price - b.price)[0];
  const difference = store && bestOnline ? Math.round((store.price - bestOnline.price) * 100) / 100 : null;
  const hasExample = store?.example || bestOnline?.example;
  const subsidyPreview = result.subsidyPreviews?.[0];
  const title = !ready ? (loading ? '正在读取所选配置价格…' : '先确认型号与配置')
    : !bestOnline ? (loading ? '正在自动查询商城同配置售价与教育活动…' : '公开查询未取得可比较价格，可查看原因或重试')
    : difference === 0 ? '商城现价与商城历史记录相同'
    : difference > 0 ? `商城现价比历史记录低 ${money(difference)}`
    : `历史记录比商城现价低 ${money(-difference)}`;
  const cards = [
    { label: '商城历史参考', plan: store, status: '历史快照', note: snapshotDate ? `${snapshotDate} · 华为商城历史记录，非门店实时报价` : '来自知识库历史记录，非门店实时报价' },
    { label: '华为商城', plan: online, status: online ? '自动查价' : loading ? '查询中' : report?.online?.status === 'sku_unavailable' ? '配置未匹配' : '查询失败', note: online ? `同配置公开售价 · ${new Date(report?.online?.checked_at).toLocaleTimeString('zh-CN')}` : report?.online?.message || '系统正在读取官方商品页', source: report?.online?.source_url },
    { label: '商城教育优惠', plan: education, status: education ? '已核实教育价' : loading ? '查询中' : ['discount_not_disclosed', 'qualification_required'].includes(report?.education?.status) ? '优惠金额未取得' : report?.education?.status === 'not_listed' ? '无公开报价' : '查询失败', note: education ? '同配置教育优惠价格' : report?.education?.message || '系统正在查询官方教育专区', source: report?.education?.sources?.[0]?.source_url },
  ];
  return <section className="price-overview" aria-label="渠道价格一览" aria-live="polite">
    <div className="price-overview-product"><span>同一配置 · 渠道对比</span><h4>{profile.model.replace(/｜官方公开价格卡$/, '')}</h4>{configurationControl || <p>{profile.configuration || '配置待确认'}</p>}</div>
    {Number(profile.budget) > 0 && <p className="price-budget-summary">对话预算 {money(profile.budget)} · {(() => {
      const price = subsidyPreview?.price ?? bestOnline?.price;
      if (price == null) return '正在查询价格';
      const delta = Math.round((Number(profile.budget) - price) * 100) / 100;
      return `${subsidyPreview ? '条件试算' : '已核实售价'} ${money(price)}，${delta >= 0 ? `比预算少 ${money(delta)}` : `超预算 ${money(-delta)}`}`;
    })()}</p>}
    <div className="price-channel-grid">{cards.map(card => <article className={`price-channel-card${card.plan ? ' has-price' : ''}`} key={card.label}>
      <div className="price-channel-label"><span>{card.label}</span><Tag color={['自动查价', '已核实教育价'].includes(card.status) ? 'green' : 'default'}>{card.label === '华为商城' && subsidyPreview ? '预计到手价' : card.status}</Tag></div>
      <strong className="price-channel-amount">{card.label === '华为商城' && subsidyPreview ? money(subsidyPreview.price) : card.plan ? money(card.plan.price) : loading ? '查询中…' : '—'}</strong>
      {card.label === '华为商城' && subsidyPreview && <div><Tag color="orange">国补条件试算</Tag><p>公开售价 {money(subsidyPreview.base)} − 国补 {money(subsidyPreview.subsidy)} = 预计 {money(subsidyPreview.price)}</p><p>{subsidyPreview.conditions}</p></div>}
      {card.label === '商城教育优惠' && profile.studentEligible && <Tag color="blue">已记录教育资格</Tag>}
      <p>{card.plan?.example ? `含国补演算 · 减 ${money(card.plan.subsidy)}` : card.note}</p>
      {card.source && <a href={card.source} target="_blank" rel="noreferrer">官方来源 ↗</a>}
    </article>)}</div>
    <div className={`price-comparison-verdict${bestOnline ? ' comparable' : ''}`}><span className="price-verdict-label">{subsidyPreview ? '公开原价对比 · 未扣国补' : bestOnline ? '参考差额' : '当前进度'}</span><strong>{title}</strong>
      <p>{hasExample ? '含国补条件演算；差额基于历史基准，实际成交价以门店核价为准。' : '门店实际报价尚未录入，暂不能判断最终在哪买更便宜。'}{education && bestOnline === education ? '商城侧采用已核实教育价。' : ''}</p>
      {ready && !bestOnline && <button type="button" className="price-lookup-action" disabled={loading} onClick={onLookup}>{loading ? '正在查询商城…' : '查询商城当日价格 →'}</button>}
    </div>
  </section>;
}
