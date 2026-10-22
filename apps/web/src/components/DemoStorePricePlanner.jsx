import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Drawer, Form, Input, InputNumber, Select, Space, Table, Typography } from 'antd';
import { buildDemoPlan, createDemoProfile } from '../lib/demoStorePlan.mjs';
import subsidyRule from '../../../../shared/pcSubsidy2026.json' with { type: 'json' };

const { Paragraph, Text } = Typography;
const money = (value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

export function DemoStorePricePlanner({ context, onClose, onExit }) {
  const [profile, setProfile] = useState(() => createDemoProfile(context));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  const { result } = buildDemoPlan(profile);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  async function lookup(live = false, initial = false, selectedModel = profile.model) {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    // Re-query invalidates both channel confirmations, including failed requests.
    setProfile((p) => ({ ...p, onlineConfirmed: false, educationConfirmed: false, educationStacking: false, storeSubsidyConfirmed: false, onlineSubsidyConfirmed: false, energyEfficiencyConfirmed: false, ...(initial ? { quote: '' } : {}) }));
    setReport(null);
    try {
      const response = await fetch('/api/v1/store/channel-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ model: selectedModel, configuration: initial ? '' : profile.configuration, budget: profile.budget, live }) });
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
      setProfile((p) => ({ ...p, configuration: data.tier.configuration, quote: data.tier.price,
        onlinePrice: '', onlineSource: data.online?.source_url || data.tier.source_url || '', onlineConfirmed: false,
        educationPrice: '', educationSource: '', educationConfirmed: false, educationStacking: false }));
    } catch (e) { if (!request.signal.aborted) setError(e.message || '查询失败，请重试'); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  useEffect(() => { lookup(false); return () => controller.current?.abort(); }, []);
  const changeModel = (value) => {
    controller.current?.abort(); setLoading(false); setReport(null); setError('');
    setProfile((p) => ({ ...createDemoProfile({ model: value, budget: p.budget }), model: value }));
  };
  const numberField = (label, key, confirmation) => <Form.Item label={label}>
    <InputNumber aria-label={label} min={0} precision={2} value={profile[key] === '' ? null : profile[key]} onChange={(value) => setProfile((p) => ({ ...p, [key]: value ?? '', ...(confirmation ? { [confirmation]: false, educationStacking: false } : {}), ...(key === 'onlinePrice' ? { onlineSubsidyConfirmed: false } : {}) }))} />
  </Form.Item>;
  return <Drawer title="门店与华为商城价格方案" open width={680} onClose={onClose} destroyOnHidden>
    <Alert type="info" showIcon message="门店基准取知识库；线上与教育优惠查华为商城" description="知识库原始价格为华为商城历史快照；国补按官方口径演示：一级能效确认后按实际销售价 15% 计算，每件最高 ¥1,500。" />
    <Form layout="vertical" style={{ marginTop: 16 }}>
      <Form.Item label="意向产品"><Input aria-label="报价意向产品" value={profile.model} onChange={(event) => changeModel(event.target.value)} /></Form.Item>
      <Button loading={loading} onClick={() => lookup(false, true)}>读取知识库报价</Button>
      {error && <Alert type="warning" message={error} style={{ marginTop: 8 }} />}
      {report?.status === 'needs_model_clarification' && <Alert type="info" showIcon message="请选择具体版本后读取价格" description={report.message} style={{ marginTop: 8 }} action={<Select aria-label="选择产品版本" placeholder="选择版本" style={{ minWidth: 250 }} options={(report.models || []).map((model) => ({ value: model, label: model }))} onChange={(model) => { changeModel(model); lookup(false, true, model); }} />} />}
      {report?.status === 'success' && <>
        <Form.Item label="配置 / 知识库门店报价基准" style={{ marginTop: 12 }}>
          <Select aria-label="知识库报价配置" value={profile.configuration} options={report.solution.configurations.map((row) => ({ value: row.configuration, label: `${row.configuration} · ${money(row.price)}` }))} onChange={(configuration) => {
            controller.current?.abort(); setLoading(false);
            const tier = report.solution.configurations.find((row) => row.configuration === configuration);
            setReport({ ...report, tier, online: undefined, education: undefined });
            setProfile((p) => ({ ...createDemoProfile({ model: p.model, budget: p.budget }), configuration, quote: tier.price, onlineSource: tier.source_url }));
          }} />
        </Form.Item>
        <Paragraph>门店报价基准：<Text strong>{money(profile.quote)}</Text><Text type="secondary"> · 知识库 {report.tier.snapshot_date} 记录</Text></Paragraph>
        {numberField('客户预算（元）', 'budget')}
        <Button loading={loading} onClick={() => lookup(true)}>查询华为商城价格 / 教育优惠</Button>
        <Collapse style={{ marginTop: 12 }} items={[{ key: 'channels', label: '华为商城核价与教育优惠', children: <>
          <Paragraph type="secondary">查询到的页面金额需核对同一配置；页面未能读取时可打开华为商城，将核实后的金额填入。优惠已包含在支付价内，不再重复扣减。</Paragraph>
          {report.online && <Paragraph>{report.online.message}</Paragraph>}
          {profile.onlineSource && <Paragraph><a href={profile.onlineSource} target="_blank" rel="noreferrer">打开华为商城商品页</a></Paragraph>}
          {!!report.online?.candidates?.length && <Select aria-label="华为商城候选金额" placeholder="选择页面候选金额（待核对配置）" style={{ width: '100%', marginBottom: 12 }} options={report.online.candidates.map((value) => ({ value, label: money(value) }))} onChange={(value) => setProfile((p) => ({ ...p, onlinePrice: value, onlineConfirmed: false, onlineSubsidyConfirmed: false }))} />}
          {numberField('华为商城价格（元）', 'onlinePrice', 'onlineConfirmed')}
          <Checkbox checked={profile.onlineConfirmed} disabled={!profile.onlinePrice || !profile.onlineSource} onChange={(e) => update('onlineConfirmed', e.target.checked)}>已在华为商城核对当日同配置最终价格</Checkbox>
          <Paragraph style={{ marginTop: 16 }}><Text strong>华为商城教育优惠</Text></Paragraph>
          {report.education && !(report.education.rules || []).length && <Paragraph type="secondary">未查到可计算的教育优惠，不默认优惠比例；请在华为商城核实。</Paragraph>}
          {(report.education?.rules || []).map((rule, index) => <Paragraph key={index}>{rule.excerpt} <a href={rule.source} target="_blank" rel="noreferrer">核对华为商城活动</a></Paragraph>)}
          {(report.education?.sources || []).map((source) => <Paragraph key={source.source_url}><a href={source.source_url} target="_blank" rel="noreferrer">{source.title}</a></Paragraph>)}
          {numberField('华为商城教育最终价（元，非减免金额）', 'educationPrice', 'educationConfirmed')}
          <Form.Item label="华为商城教育活动链接"><Input value={profile.educationSource} placeholder="https://…vmall.com/…" onChange={(e) => setProfile((p) => ({ ...p, educationSource: e.target.value, educationConfirmed: false, educationStacking: false }))} /></Form.Item>
          <Checkbox checked={profile.educationConfirmed} disabled={!profile.educationPrice || !/^https:\/\/([\w-]+\.)*vmall\.com\//.test(profile.educationSource)} onChange={(e) => setProfile((p) => ({ ...p, educationConfirmed: e.target.checked, educationStacking: false }))}>已核实华为商城同 SKU 教育价、活动有效期及学生资格</Checkbox>
        </> }]} />
        <Space direction="vertical" style={{ margin: '12px 0' }}>
          <Text type="secondary">电脑国补：优惠后价格 × 15%，每人限 1 件，最高 ¥1,500；国家未设电脑 ¥6,000 价格上限。<a href={subsidyRule.source} target="_blank" rel="noreferrer">官方规则</a></Text>
          <Checkbox checked={profile.subsidyExample} onChange={(e) => update('subsidyExample', e.target.checked)}>启用国补规则演示（15%，每件最高 ¥1,500）</Checkbox>
          <Checkbox checked={profile.subsidyEligible} onChange={(e) => update('subsidyEligible', e.target.checked)}>已核实顾客资格、电脑类未用次数及申领/付款/收货/发票姓名一致</Checkbox>
          <Checkbox checked={profile.energyEfficiencyConfirmed} onChange={(e) => update('energyEfficiencyConfirmed', e.target.checked)}>已核实当前电脑达到一级能效标准</Checkbox>
          <Checkbox checked={profile.storeSubsidyConfirmed} onChange={(e) => update('storeSubsidyConfirmed', e.target.checked)}>门店：已核实当地活动可用、本店与 SKU 参与、报价不高于备案价且未扣国补</Checkbox>
          <Checkbox checked={profile.onlineSubsidyConfirmed} onChange={(e) => update('onlineSubsidyConfirmed', e.target.checked)}>华为商城：已核实当前地区与 SKU 可用国补，所填价格尚未扣国补</Checkbox>
          <Checkbox disabled={!profile.educationConfirmed || !profile.subsidyExample || !profile.subsidyEligible || !profile.energyEfficiencyConfirmed || !profile.onlineSubsidyConfirmed} checked={profile.educationStacking} onChange={(e) => update('educationStacking', e.target.checked)}>已核实教育优惠可叠加国补，教育价尚未扣国补</Checkbox>
        </Space>
      </>}
      {result.status === 'ready' && <>
        <Alert type={result.budgetGap > 0 ? 'warning' : 'success'} showIcon message={`${result.best.example ? '含国补示例的参考最低价' : '当前可比最低价'} ${money(result.best.price)}`} description={`${result.best.name}${result.budgetGap === null ? '' : result.budgetGap > 0 ? `，超预算 ${money(result.budgetGap)}` : '，在预算内'}`} />
        <Table style={{ marginTop: 12 }} size="small" pagination={false} rowKey="name" dataSource={result.plans} columns={[{ title: '方案 / 来源', dataIndex: 'name' }, { title: '商品价格', dataIndex: 'price', render: money }]} />
      </>}
      <Paragraph type="secondary" style={{ marginTop: 12 }}>实际使用前，须接入真实门店报价与库存，由店员确认价格有效期、优惠资格和叠加条件。当前结果不构成成交承诺。</Paragraph>
      <Button onClick={onExit}>填写真实门店报价与规则</Button>
    </Form>
  </Drawer>;
}
