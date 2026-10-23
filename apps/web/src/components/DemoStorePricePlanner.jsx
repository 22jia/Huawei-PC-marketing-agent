import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Form, Select, Space, Typography } from 'antd';
import { applyPublicReport, buildDemoPlan, createDemoProfile } from '../lib/demoStorePlan.mjs';
import { InlinePriceFrame } from './InlinePriceFrame';
import { PriceComparisonOverview } from './PriceComparisonOverview';
import subsidyRule from '../../../../shared/pcSubsidy2026.json' with { type: 'json' };

const { Paragraph, Text } = Typography;
const money = (value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

export function DemoStorePricePlanner({ context, onClose, onExit, inline = false }) {
  const [profile, setProfile] = useState(() => createDemoProfile(context));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [channelSections, setChannelSections] = useState([]);
  const controller = useRef(null);
  const { result } = buildDemoPlan(profile);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  async function lookup(live = true, initial = false, selectedModel = profile.model, configuration = profile.configuration) {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    // Re-query invalidates both channel confirmations, including failed requests.
    setProfile((p) => ({ ...p, onlinePrice: '', onlineConfirmed: false, educationPrice: '', educationConfirmed: false, educationStacking: false, storeSubsidyConfirmed: false, onlineSubsidyConfirmed: false, energyEfficiencyConfirmed: false, ...(initial ? { quote: '' } : {}) }));
    setReport(current => current ? { ...current, online: undefined, education: undefined } : null);
    try {
      const read = (publicLookup, selectedConfiguration) => fetch('/api/v1/store/channel-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ model: selectedModel, configuration: selectedConfiguration, budget: profile.budget, live: publicLookup }) });
      const response = await read(false, initial ? '' : configuration);
      const data = await response.json();
      if (request.signal.aborted) return;
      if (response.status === 404 || data.code === 'NOT_FOUND') throw new Error('价格查询接口尚未加载，请重启后端服务后重试。');
      if (data.status === 'needs_model_clarification') {
        setReport(data);
        setError('');
        return;
      }
      if (!response.ok || data.status !== 'success') throw new Error(data.message || '未找到知识库价格，请核对具体型号。');
      if (request.signal.aborted) return;
      setReport(data);
      setProfile((p) => applyPublicReport(p, data));
      if (live) {
        const publicResponse = await read(true, data.tier.configuration);
        const publicReport = await publicResponse.json();
        if (request.signal.aborted) return;
        if (!publicResponse.ok || publicReport.status !== 'success') throw new Error(publicReport.message || '公开查询失败，请重试。');
        setReport(publicReport);
        setProfile(p => applyPublicReport(p, publicReport));
      }
    } catch (e) { if (!request.signal.aborted) setError(e.message || '查询失败，请重试'); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  useEffect(() => { lookup(true); return () => controller.current?.abort(); }, []);
  const changeModel = (value) => {
    controller.current?.abort(); setLoading(false); setReport(null); setError('');
    setProfile((p) => ({ ...createDemoProfile({ model: value, budget: p.budget }), model: value }));
  };
  const configurationControl = report?.status === 'success' ? <Select aria-label="切换商品配置" value={profile.configuration} style={{ width: '100%', marginBottom: 12 }} options={report.solution.configurations.map(row => ({ value: row.configuration, label: row.configuration }))} onChange={configuration => {
    controller.current?.abort();
    const tier = report.solution.configurations.find(row => row.configuration === configuration);
    setReport({ ...report, tier, online: undefined, education: undefined });
    setProfile(p => ({ ...p, configuration, quote: tier.price, onlinePrice: '', onlineConfirmed: false, educationPrice: '', educationConfirmed: false }));
    lookup(true, false, profile.model, configuration);
  }} /> : null;
  return <InlinePriceFrame inline={inline} title="门店与华为商城价格方案" open width={680} onClose={onClose} destroyOnHidden>
    <PriceComparisonOverview profile={profile} result={result} report={report} loading={loading} snapshotDate={report?.tier?.snapshot_date} onLookup={() => lookup(true)} configurationControl={configurationControl} />
    <Form layout="vertical" style={{ marginTop: 16 }}>
      {report?.status === 'needs_model_clarification' && <Alert type="info" showIcon message="请选择具体版本后读取价格" description={report.message} action={<Select aria-label="选择产品版本" placeholder="选择版本" style={{ minWidth: 250 }} options={(report.models || []).map(model => ({ value: model, label: model }))} onChange={model => { changeModel(model); lookup(true, true, model); }} />} />}
      {error && <Alert type="warning" message={error} style={{ marginTop: 8 }} />}
      {report?.status === 'success' && <>
        <div className="price-section-heading"><Text strong>公开查询与个人条件</Text><Text type="secondary">商城信息由系统获取</Text></div>
        <Button loading={loading} onClick={() => lookup(true)}>{loading ? '正在匹配配置并读取商城…' : '刷新公开价格与活动'}</Button>
        <Collapse activeKey={channelSections} onChange={setChannelSections} style={{ marginTop: 12 }} items={[{ key: 'channels', label: '查看官方查询依据', children: <>
          <Paragraph>{loading ? '正在打开官方商品页，选择同一配置并读取公开售价，再查询教育专区。' : report.online?.message}</Paragraph>
          {report.online?.selected_configuration && <Paragraph>商城已选：{report.online.selected_configuration}</Paragraph>}
          {report.online?.checked_at && <Paragraph type="secondary">查询时间：{new Date(report.online.checked_at).toLocaleString('zh-CN')}</Paragraph>}
          {profile.onlineSource && <Paragraph><a href={profile.onlineSource} target="_blank" rel="noreferrer">查看华为商城商品页</a></Paragraph>}
          <Paragraph><Text strong>教育优惠查询</Text></Paragraph>
          <Paragraph>{report.education?.message || (loading ? '正在查询官方教育活动…' : '尚无查询结果')}</Paragraph>
          {(report.education?.sources || []).map(source => <Paragraph key={source.source_url}><a href={source.source_url} target="_blank" rel="noreferrer">{source.title}</a></Paragraph>)}
        </> }]} />
        <Collapse className="price-settings" style={{ marginTop: 12 }} items={[{ key: 'personal', label: '个人条件 · 教育资格与购机补贴', children: <Space direction="vertical" style={{ width: '100%', margin: '12px 0' }}>
          <Checkbox checked={!!profile.studentEligible} onChange={e => setProfile(p => ({ ...p, studentEligible: e.target.checked, educationConfirmed: false }))}>顾客具备教育优惠认证资格</Checkbox>
          {profile.studentEligible && <Paragraph type="secondary">教育优惠金额尚未取得，暂不扣减；公开查询结果见上方教育优惠卡片。</Paragraph>}
          <Checkbox checked={profile.subsidyEligible} onChange={e => update('subsidyEligible', e.target.checked)}>顾客电脑类国补次数未使用，申领、付款、收货与发票身份一致</Checkbox>
          <Paragraph type="secondary">仅确认个人资格；商品及地区是否参与由系统查询。金额计算见下方核算标准。</Paragraph>
          {profile.subsidyEligible && !result.subsidyPreviews?.length && <Paragraph type="secondary">{loading ? '正在读取同配置售价，取得后自动显示试算。' : !profile.onlineConfirmed ? '尚未取得同配置公开售价，暂无法计算补贴金额，请刷新公开价格。' : '当前日期不在所配置国补规则有效期内，或已计入核实后的补贴方案。'}</Paragraph>}
        </Space> }]} />
      </>}
      {result.status === 'ready' && <Collapse className="price-settings" style={{ marginTop: 12 }} items={[{ key: 'calculation', label: '核算标准与当前算式', children: <>
        <Paragraph><Text strong>① 核对同款同配置</Text>：系统、内存、硬盘、屏幕版本、颜色、处理器与键盘均匹配后，才采用商城公开售价。历史快照只用于参考，不作为门店报价。</Paragraph>
        <Paragraph><Text strong>② 确定补贴前价格</Text>：采用已核实且适用的最终销售价；已包含的优惠不重复扣减。教育优惠未取得明确金额时不扣减，也不默认与其他优惠叠加。</Paragraph>
        <Paragraph><Text strong>③ 计算国补</Text>：补贴金额 = min（补贴前价格 × 15%，¥1,500），四舍五入到分；预计到手价 = 补贴前价格 − 补贴金额。2026 年规则每人电脑类限 1 件，需符合一级能效及当地参与条件。<a href={subsidyRule.source} target="_blank" rel="noreferrer">官方规则 ↗</a></Paragraph>
        {result.subsidyPreviews?.map(row => <Alert key={row.name} type="info" message={`${money(row.base)} − ${money(row.subsidy)} = ${money(row.price)}（国补条件试算）`} description={row.conditions} />)}
        {!result.subsidyPreviews?.length && <Paragraph>当前{profile.onlineConfirmed ? `采用商城公开售价 ${money(profile.onlinePrice)}` : '未取得可靠的同配置公开售价'}；{profile.subsidyEligible ? '暂未形成国补试算。' : '未确认个人国补资格，不扣减国补。'}</Paragraph>}
        <Paragraph style={{ marginTop: 12 }}><Text strong>④ 判断可成交价格</Text>：条件试算不参与已核实最低价排名。门店与商城须采用同配置、同等适用优惠后的有效报价比较；缺少实际门店报价时不给出购买渠道结论。</Paragraph>
      </> }]} />}
      <div className="price-actual-quote"><div><Text strong>已有门店实际报价？</Text><p>录入实际报价，进一步比较成交价。</p></div><Button onClick={onExit}>录入门店报价</Button></div>
    </Form>
  </InlinePriceFrame>;
}
