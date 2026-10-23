import { Tag, Typography } from 'antd';

export function ModelRunStatus({ result }) {
  if (!result?.llm) return null;
  const { llm } = result;
  const names = { analysis: '需求理解', strategy: '图文策划', generation: '成稿', review: '审稿', revision: '自动修稿', grounding: '事实核验（触发修稿）' };
  return <div style={{ margin: '8px 0' }}>
    <Tag color={llm.status === 'success' ? 'success' : 'warning'}>{llm.status === 'success' ? result.result_type === 'answer' ? 'LLM 对话回复完成' : 'LLM 分析与生成完成' : '等待补充信息'}</Tag>
    <Typography.Text type="secondary">{llm.model || llm.stages?.[0]?.model} · {(llm.stages || []).map((stage) => `${names[stage.stage] || stage.stage} ${((stage.duration_ms || 0) / 1000).toFixed(1)} 秒${stage.usage?.total_tokens ? ` / ${stage.usage.total_tokens} tokens` : ''}`).join('；')}</Typography.Text>
  </div>;
}
