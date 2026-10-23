import { useState } from 'react';
import { Alert, Button, Checkbox, Divider, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { DemoStorePricePlanner } from './DemoStorePricePlanner';
import { InlinePriceFrame } from './InlinePriceFrame';
import { OfferRuleLookup } from './OfferRuleLookup';
import { compareStorePlans, localDate } from '../lib/storePricePlan.mjs';

const { Text, Paragraph } = Typography;
const money = (value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

function initialDraft(context, tier = context.tier) {
  return {
    model: (context.solution?.model || context.model || '').replace(/-价格卡$/, ''),
    configuration: tier?.configuration || '', budget: context.solution?.budget || String(context.budget || '').replace(/[¥￥元,\s]/g, ''),
    onlinePrice: tier?.price ?? '', onlineSource: tier?.source_url || '', onlineConfirmed: false,
    snapshotDate: tier?.snapshot_date || '', region: '', store: '', quote: '', source: '',
    validUntil: localDate(), confirmed: false, combinations: [],
  };
}

export function StorePricePlanner({ context, onClose, inline = false }) {
  const [draft, setDraft] = useState(() => initialDraft(context));
  const [demo, setDemo] = useState(true);
  const result = compareStorePlans(draft);
  const configurations = context.solution?.configurations || context.solution?.tiers || [];
  const selectedConfiguration = configurations.findIndex((item) => item.configuration === draft.configuration && item.price === draft.onlinePrice);
  function updateQuote(key, value) {
    setDraft((current) => ({ ...current, [key]: value, confirmed: false,
      combinations: current.combinations.map((item) => ({ ...item, confirmed: false })) }));
  }
  const field = (label, key, type = 'text') => <Form.Item label={label}><Input type={type} value={draft[key]} onChange={(event) => updateQuote(key, event.target.value)} /></Form.Item>;
  if (demo) return <DemoStorePricePlanner inline={inline} context={context} onClose={onClose} onExit={() => setDemo(false)} />;
  return <InlinePriceFrame inline={inline} title="制定门店价格方案" open onClose={onClose} width={600} destroyOnHidden>
    <Paragraph type="secondary">由店员填写核实结果，收起后清空本次试算，不会自动查询门店系统。</Paragraph>
    <Form layout="vertical">
      <Alert type="info" showIcon message="知识库报价与华为商城比价" description="以知识库报价为门店演示基准，查询华为商城价格与教育优惠，国补按 15%（每件最高 ¥1,500）规则比较。" action={<Button size="small" onClick={() => setDemo(true)}>读取知识库并比价</Button>} />
      <Text strong>{draft.model}</Text>
      <Form.Item label="对比配置 / SKU">
        <Space direction="vertical" style={{ width: '100%' }}>
          {configurations.length > 0 && <Select aria-label="选择官网参考配置" placeholder="选择官网参考配置" style={{ width: '100%' }} value={selectedConfiguration < 0 ? undefined : selectedConfiguration} options={configurations.map((item, index) => ({ value: index, label: `${item.configuration} · ${money(item.price)}` }))} onChange={(index) => setDraft(initialDraft(context, configurations[index]))} />}
          <Input aria-label="精确配置或SKU" placeholder="请填写精确配置或 SKU" value={draft.configuration} onChange={(event) => setDraft({ ...initialDraft(context, null), configuration: event.target.value })} />
        </Space>
      </Form.Item>
      {draft.budget && <Paragraph>客户预算：{draft.budget} 元</Paragraph>}
      <Form.Item label="官网价格参考">
        <InputNumber aria-label="官网价格参考" min={0} precision={2} prefix="¥" value={draft.onlinePrice === '' ? null : draft.onlinePrice} onChange={(value) => setDraft({ ...draft, onlinePrice: value ?? '', onlineConfirmed: false })} />
        <Paragraph type="secondary">{draft.snapshotDate ? `原始快照：${draft.snapshotDate}；请打开页面核对当日同配置价格。` : '没有官网参考价时可手填；核对同配置后再确认。'}</Paragraph>
        <Input aria-label="官网价格来源" placeholder="官网页面地址或核验记录" value={draft.onlineSource} onChange={(event) => setDraft({ ...draft, onlineSource: event.target.value, onlineConfirmed: false })} />
        {/^https?:\/\//i.test(draft.onlineSource) && <a href={draft.onlineSource} target="_blank" rel="noreferrer">打开官网核价</a>}
        <div><Checkbox checked={draft.onlineConfirmed} onChange={(event) => setDraft({ ...draft, onlineConfirmed: event.target.checked })}>已核对当日同配置、同优惠资格的线上支付价</Checkbox></div>
      </Form.Item>
      <Divider orientation="left">门店报价</Divider>
      {field('购机地区（省 / 市）', 'region')}
      {field('门店名称', 'store')}
      <Form.Item label="本店当前商品报价（已包含的直降不再重复扣减）"><InputNumber aria-label="本店商品报价" min={0} precision={2} prefix="¥" value={draft.quote === '' ? null : draft.quote} onChange={(value) => updateQuote('quote', value ?? '')} /></Form.Item>
      {field('报价来源 / 单号', 'source')}
      {field('报价有效至', 'validUntil', 'date')}
      <Checkbox checked={draft.confirmed} onChange={(event) => setDraft({ ...draft, confirmed: event.target.checked })}>已核实该门店、该配置的报价与可售库存</Checkbox>
      <Divider orientation="left">可用优惠组合</Divider>
      <OfferRuleLookup key={JSON.stringify([draft.model, draft.configuration, draft.region, draft.store, draft.quote, draft.source, draft.validUntil])} quoteConfirmed={result.status === 'ready'}
        scope={{ model: draft.model, configuration: draft.configuration, region: draft.region, store: draft.store, quote: draft.quote }}
        onInvalidate={(id) => setDraft((current) => ({ ...current, combinations: current.combinations.filter((item) => !item.steps?.some((step) => step.id === id)) }))}
        onAdd={(combination) => setDraft((current) => ({ ...current, combinations: [...current.combinations.filter((item) => JSON.stringify(item.steps) !== JSON.stringify(combination.steps)), combination] }))} />
      {draft.combinations.map((item, index) => <Paragraph key={index} style={{ marginTop: 8 }}>
        {item.name} · {item.confirmed ? '已确认' : '需重新核实报价适用性，请重新添加'}
        <Button type="text" danger onClick={() => setDraft((current) => ({ ...current, combinations: current.combinations.filter((_, i) => i !== index) }))}>移除</Button>
      </Paragraph>)}
      <Divider />
      {result.status === 'pending' ? <Alert type="info" message="请补齐并确认门店、配置、报价来源及有效期" /> : <>
        <Alert type="success" message={`已确认方案中最低商品价 ${money(result.best.price)}`} description={<Space direction="vertical" size={2}>
          <Text>{result.best.name}</Text>
          {result.budgetGap !== null && <Text>{result.budgetGap > 0 ? `超预算 ${money(result.budgetGap)}` : '在客户预算内'}</Text>}
          {result.onlineDifference !== null ? <Text>{result.onlineDifference > 0 ? `比已核实线上价低 ${money(result.onlineDifference)}` : result.onlineDifference < 0 ? `比已核实线上价高 ${money(-result.onlineDifference)}` : '与已核实线上价相同'}</Text> : <Text>线上价尚未完成当日核实，仅供参考。</Text>}
        </Space>} />
        {result.plans.map((plan, index) => <Paragraph key={index} style={{ marginTop: 8, marginBottom: 0 }}>{plan.name}：{money(plan.price)}</Paragraph>)}
        {result.excluded > 0 && <Paragraph type="secondary">{result.excluded} 个组合因资料未齐、未确认、已过期或金额无效而未计入。</Paragraph>}
      </>}
    </Form>
  </InlinePriceFrame>;
}
