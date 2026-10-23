import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Timeline, Typography } from 'antd';
import { useAui, useAuiState } from '@assistant-ui/react';
import { ProductRecommendations } from './ProductRecommendations';
import { StorePricePlanner } from './StorePricePlanner';
import { MarkdownContent } from './MarkdownContent';

const { Paragraph, Text } = Typography;

export function CustomerConversationResult({ result }) {
  const [price, setPrice] = useState(null);
  const pricePanel = useRef(null);
  useEffect(() => {
    if (price) {
      pricePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pricePanel.current?.focus({ preventScroll: true });
    }
  }, [price]);
  const openPrice = (selected, tier) => setPrice({
    solution: selected, model: selected?.model,
    tier: tier || selected?.budget_fit || selected?.tiers?.[0],
  });
  const aui = useAui();
  const running = useAuiState(s => s.thread.isRunning);
  const isLast = useAuiState(s => s.message.isLast);
  const { solution, customer, sales_script: script, follow_up_plan: followUp = [] } = result;
  const send = text => aui.thread().append({ role: 'user', content: [{ type: 'text', text }], startRun: true });
  return <div className="customer-conversation-result">
    <h3>客户成交辅助方案</h3>
    {customer?.summary && <MarkdownContent>{`**客户需求**：${customer.summary}`}</MarkdownContent>}
    <MarkdownContent>{solution.rationale}</MarkdownContent>
    {!!solution.candidate_products?.length && <ProductRecommendations products={solution.candidate_products}
      alternatives={solution.recommendation_stage === 'budget_alternatives'} segment={customer?.segment} loading={running}
      onSelect={(_model, selected, tier) => openPrice(selected, tier)}
      onPrice={openPrice} />}
    {solution.price_solution && <Button onClick={() => openPrice(solution.price_solution)}>查看所选型号价格与门店优惠</Button>}
    {price && <div ref={pricePanel} tabIndex={-1} aria-label={`${price.model}比价面板`}><StorePricePlanner key={JSON.stringify(price)} inline context={price} onClose={() => setPrice(null)} /></div>}
    {script && <section className="inline-sales-script"><h3>可以这样跟客户说</h3>
      {[['开场', script.opening], ['推荐表达', script.recommendation], ['收尾', script.close]].filter(([, text]) => text).map(([label, text]) => <div key={label}><Text type="secondary">{label}</Text><Paragraph copyable>{text}</Paragraph></div>)}
    </section>}
    {!!result.objection_responses?.length && <Collapse items={result.objection_responses.map((item, index) => ({ key: String(index), label: item.objection, children: <Paragraph copyable>{item.response}</Paragraph> }))} />}
    {!!followUp.length && <section className="inline-followup"><h3>1 / 3 / 7 天跟进</h3><p className="muted">消息草稿可直接复制，审核后发送。</p>
      <Timeline items={followUp.map(item => ({ children: <div><Text strong>第 {item.day} 天 · {item.objective}</Text><p className="muted">{item.action}</p><Paragraph copyable>{item.message_draft}</Paragraph></div> }))} />
    </section>}
    {result.guardrails?.retrieval_warning && <Alert type="warning" message={result.guardrails.retrieval_warning} />}
    {!!solution.evidence?.length && <details className="inline-evidence"><summary>查看产品资料依据 · {solution.evidence.length}</summary>{solution.evidence.map((item, index) => <div key={index}><strong>{item.title}</strong><MarkdownContent>{item.excerpt}</MarkdownContent><Text type="secondary">{item.source_path}</Text></div>)}</details>}
    {result.awaiting_ticket_consent && isLast && <div className="inline-ticket-choice"><p>需要我为这位客户建立跟进工单吗？</p><Button disabled={running} onClick={() => send('需要，请为这位客户建立跟进工单')}>建立跟进工单</Button><Button disabled={running} type="text" onClick={() => send('暂不需要建立跟进工单')}>暂不需要</Button></div>}
  </div>;
}
