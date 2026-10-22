import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { canConfirmOffer } from '../lib/storePricePlan.mjs';

const { Paragraph, Text } = Typography;
const emptyRule = { name: '', kind: 'fixed', amount: '', cap: '', minSpend: '', validFrom: '', validUntil: '', basis: '', source: '', excerpt: '', exclusiveGroup: '', confirmed: false, verification: { store: false, sku: false, eligibility: false, notInQuote: false, sourceReviewed: false } };

export function OfferRuleLookup({ scope, quoteConfirmed, onAdd, onInvalidate }) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [rules, setRules] = useState([]);
  const [selected, setSelected] = useState([]);
  const [stacking, setStacking] = useState(false);
  const [stackSource, setStackSource] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function lookup() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true); setReport(null);
    try {
      const response = await fetch('/api/v1/store/offer-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ ...scope, sourceUrl }) });
      const data = await response.json();
      if (!response.ok || data.status === 'error') throw new Error(data.message || '查询失败');
      if (request.signal.aborted) return;
      setReport(data);
      setRules((current) => {
        const seen = new Set(current.map((rule) => rule.source + '|' + rule.excerpt));
        return [...current, ...(data.rules || []).filter((rule) => !seen.has(rule.source + '|' + rule.excerpt)).map((rule) => ({ ...emptyRule, ...rule, id: crypto.randomUUID() }))];
      });
    } catch (error) {
      if (!request.signal.aborted) setReport({ note: error.message || '查询失败，请稍后重试', status: 'unavailable' });
    } finally { if (!request.signal.aborted) setLoading(false); }
  }
  function update(id, key, value) {
    onInvalidate(id);
    setStacking(false);
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, [key]: value, confirmed: key === 'confirmed' ? value : false } : rule));
  }
  function addCombination(items, multi = false) {
    const steps = items.map((item) => ({ ...item }));
    onAdd({
      name: steps.map((step) => step.name).join(' + '), steps,
      source: steps.map((step) => step.source).join('；') + (multi ? '；叠加依据：' + stackSource : ''),
      validUntil: steps.map((step) => step.validUntil).sort()[0] || '',
      confirmed: steps.every((step) => step.confirmed), stackingConfirmed: multi && stacking,
      stackingSource: multi ? stackSource : '',
    });
  }
  function canConfirm(rule) {
    return Boolean(quoteConfirmed && scope.model?.trim() && scope.configuration?.trim() && scope.region?.trim() && scope.store?.trim() &&
      canConfirmOffer(rule, scope.quote));
  }
  const chosen = selected.map((id) => rules.find((rule) => rule.id === id)).filter(Boolean);
  const numberField = (rule, label, key, max) => <Form.Item label={label}><InputNumber aria-label={rule.name + label} min={0} max={max} precision={2} value={rule[key] === '' ? null : rule[key]} onChange={(value) => update(rule.id, key, value ?? '')} /></Form.Item>;
  return <section>
    <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
      <Input aria-label="优惠规则来源" placeholder="官方活动链接（可选，留空按型号和地区搜索）" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
      <Button loading={loading} onClick={lookup}>联网查询优惠</Button>
    </Space.Compact>
    {report && <Alert type={report.status === 'unavailable' ? 'warning' : 'info'} message={report.note} />}
    {report && <Collapse style={{ marginTop: 8 }} items={[{ key: 'sources', label: '店员核对来源', children: <Space direction="vertical">
      {report.checked_at && <Text type="secondary">查询时间：{report.checked_at}</Text>}
      {(report.sources || []).map((source) => <a key={source.source_url} href={source.source_url} target="_blank" rel="noreferrer">{source.title}</a>)}
      {(report.search_urls || []).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">{['搜索地区国补', '搜索官方教育优惠', '搜索官方换新活动'][index]}</a>)}
      {(report.warnings || []).map((warning) => <Text key={warning} type="secondary">{warning}</Text>)}
    </Space> }]} />}
    <Paragraph type="secondary" style={{ marginTop: 8 }}>查询结果仅是候选。请核实本店适用、配置、资格与有效期；已包含在报价中的直降不要再次添加。旧机回收估值不作为优惠录入。</Paragraph>
    {rules.map((rule) => <Collapse key={rule.id} style={{ marginBottom: 8 }} items={[{ key: rule.id, label: rule.name || '手动补充规则', children: <>
      {rule.excerpt && <Paragraph type="secondary">{rule.excerpt}</Paragraph>}
      <Form.Item label="规则名称"><Input value={rule.name} onChange={(event) => update(rule.id, 'name', event.target.value)} /></Form.Item>
      <Form.Item label="优惠类型"><Select value={rule.kind} options={[{ value: 'fixed', label: '固定减免（元）' }, { value: 'percent', label: '减免比例（%）' }]} onChange={(value) => update(rule.id, 'kind', value)} /></Form.Item>
      {numberField(rule, rule.kind === 'percent' ? '减免比例（不是折后比例）' : '减免金额', 'amount', rule.kind === 'percent' ? 100 : undefined)}
      {numberField(rule, '封顶金额（无则留空）', 'cap')}
      {numberField(rule, '满额门槛（无则留空）', 'minSpend')}
      <Form.Item label="计价及门槛基数"><Select placeholder="按活动原文确认" value={rule.basis || undefined} options={[{ value: 'original', label: '原始门店报价' }, { value: 'remaining', label: '扣除前序优惠后的金额' }]} onChange={(value) => update(rule.id, 'basis', value)} /></Form.Item>
      <Form.Item label="有效开始日期"><Input type="date" value={rule.validFrom} onChange={(event) => update(rule.id, 'validFrom', event.target.value)} /></Form.Item>
      <Form.Item label="有效截止日期"><Input type="date" value={rule.validUntil} onChange={(event) => update(rule.id, 'validUntil', event.target.value)} /></Form.Item>
      <Form.Item label="官方来源或店员核验记录"><Input value={rule.source} onChange={(event) => update(rule.id, 'source', event.target.value)} /></Form.Item>
      <Form.Item label="互斥组（同组不可叠加，无则留空）"><Input value={rule.exclusiveGroup} onChange={(event) => update(rule.id, 'exclusiveGroup', event.target.value)} /></Form.Item>
      <Paragraph type="secondary">确认范围：{scope.region || '地区待补'} · {scope.store || '门店待补'} · {scope.model} · {scope.configuration || '配置待补'}</Paragraph>
      {!canConfirm(rule) && <Paragraph type="secondary">确认前请补齐有效期、金额、计价口径及逐项核验；金额须适用于当前已确认报价。</Paragraph>}
      <Space direction="vertical">
        <Checkbox checked={rule.verification.store} onChange={(event) => update(rule.id, 'verification', { ...rule.verification, store: event.target.checked })}>活动适用于当前门店和地区</Checkbox>
        <Checkbox checked={rule.verification.sku} onChange={(event) => update(rule.id, 'verification', { ...rule.verification, sku: event.target.checked })}>活动适用于当前配置 / SKU</Checkbox>
        <Checkbox checked={rule.verification.eligibility} onChange={(event) => update(rule.id, 'verification', { ...rule.verification, eligibility: event.target.checked })}>已核实顾客符合活动资格</Checkbox>
        <Checkbox checked={rule.verification.notInQuote} onChange={(event) => update(rule.id, 'verification', { ...rule.verification, notInQuote: event.target.checked })}>优惠尚未计入门店报价</Checkbox>
        <Checkbox checked={rule.verification.sourceReviewed} onChange={(event) => update(rule.id, 'verification', { ...rule.verification, sourceReviewed: event.target.checked })}>已对照来源原文确认金额、期限、门槛和计算口径</Checkbox>
        <Checkbox checked={rule.confirmed} disabled={!canConfirm(rule)} onChange={(event) => update(rule.id, 'confirmed', event.target.checked)}>确认本项核验完成，可参与比价</Checkbox>
      </Space>
      <Paragraph type="secondary" style={{ marginTop: 8 }}>资格核验只记录结果，不填写身份证号、学生证号或其他敏感信息。</Paragraph>
      <div style={{ marginTop: 8 }}><Button disabled={!rule.confirmed || !canConfirm(rule)} onClick={() => addCombination([rule])}>加入单项比价</Button></div>
    </> }]} />)}
    <Button type="dashed" onClick={() => setRules((current) => [...current, { ...emptyRule, id: crypto.randomUUID() }])}>手动补充门店规则</Button>
    {rules.length > 1 && <Collapse style={{ marginTop: 8 }} items={[{ key: 'stack', label: '制定可叠加组合', children: <>
      <Form.Item label="按计算顺序选择（最多六项）"><Select mode="multiple" value={selected} onChange={(value) => { setSelected(value.slice(0, 6)); setStacking(false); }} options={rules.map((rule) => ({ value: rule.id, label: rule.name || '未命名', disabled: !rule.confirmed || !canConfirm(rule) }))} /></Form.Item>
      <Paragraph>{chosen.map((rule, index) => (index + 1) + '. ' + rule.name).join(' → ')}</Paragraph>
      <Form.Item label="可叠加与计算顺序的依据"><Input value={stackSource} onChange={(event) => { setStackSource(event.target.value); setStacking(false); }} /></Form.Item>
      <Checkbox checked={stacking} onChange={(event) => setStacking(event.target.checked)}>已核实所选规则可叠加，并确认以上顺序和基数</Checkbox>
      <div style={{ marginTop: 8 }}><Button disabled={chosen.length < 2 || !chosen.every((rule) => rule.confirmed && canConfirm(rule)) || !stacking || !stackSource.trim()} onClick={() => addCombination(chosen, true)}>加入组合比价</Button></div>
    </> }]} />}
  </section>;
}
