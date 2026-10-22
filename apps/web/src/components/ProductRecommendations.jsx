import { Button, Card, Space, Tag, Typography } from 'antd';

const { Paragraph, Text } = Typography;

export function ProductRecommendations({ products, alternatives, loading, onSelect, onPrice, segment }) {
  return <section className="question-block">
    <Text strong>{segment?.label ? `${segment.label} · ` : ''}{alternatives ? '预算内替代选择' : '先看这几款'}</Text>
    {segment?.hint && <Paragraph type="secondary" className="recommendation-segment-hint">{segment.hint}</Paragraph>}
    <Paragraph type="secondary">先选更合适的产品，再比较门店优惠。以下为官网历史参考价，门店价待核。</Paragraph>
    <div className="recommendation-carousel">
      {products.map((item) => {
        const tier = item.recommended_configuration;
        const source = tier?.source_url || item.source_url;
        return <Card key={item.model} className="recommendation-card" size="small">
          {item.image && <img className="recommendation-image" src={item.image} alt={item.model} />}
          <Paragraph strong>{item.model}</Paragraph>
          <Paragraph>{tier?.configuration || '配置待核'}</Paragraph>
          <Paragraph strong>{tier ? `¥${tier.price} · 官网参考` : '价格待核'}</Paragraph>
          {item.price_solution?.budget_status === 'within_budget' && <Tag color="green">参考价在预算内</Tag>}
          {item.price_solution?.budget_status === 'over_budget' && <Tag color="orange">超预算 ¥{item.price_solution.budget_gap}</Tag>}
          <Paragraph className="recommendation-fit">{item.positioning || item.reason}</Paragraph>
          <Paragraph type="secondary">适合：{item.suitable_tasks?.slice(0, 2).join('、') || '关键任务待核'}</Paragraph>
          {tier?.offer_summary && tier.offer_summary !== '未记录可确认的直降或赠品' && <Paragraph type="secondary">线上活动参考：{tier.offer_summary}</Paragraph>}
          {item.comparison && <Paragraph>比意向型号最低参考价约省 ¥{item.comparison.saving}；配置：{item.comparison.configuration}。<Text type="secondary">{item.comparison.note}</Text></Paragraph>}
          <Space wrap>
            <Button type="primary" disabled={loading} onClick={() => onSelect(item.model)}>选这款，继续比价</Button>
            <Button onClick={() => onPrice(item.price_solution, tier)}>查门店优惠</Button>
            {/^https:\/\//i.test(source || '') && <a href={source} target="_blank" rel="noreferrer">官网</a>}
          </Space>
        </Card>;
      })}
    </div>
  </section>;
}
