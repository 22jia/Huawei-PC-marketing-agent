import { useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, List, Select, Space, Tag, Typography } from 'antd';

const labels = { failed: '失败', success: '完成', warning: '完成，需核对', running: '执行中 / 未结束', needs_clarification: '等待补充', needs_confirmation: '等待确认' };
export function RunLogs({ requestId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const findings = trace?.events.filter(event => event.stage === 'grounding' && event.data?.error?.details) || [];
  async function load(id, filter = status) {
    setBusy(true); setError('');
    try {
      const response = await fetch(id ? `/api/v1/runs/${encodeURIComponent(id)}` : `/api/v1/runs?status=${filter}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '读取日志失败');
      if (id) setTrace(data); else { setItems(data.items); setTrace(null); }
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <>
    <Button onClick={() => { setOpen(true); load(requestId); }}>运行日志</Button>
    <Drawer title="运行日志与失败追踪" width={760} open={open} onClose={() => setOpen(false)}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button loading={busy} onClick={() => load()}>刷新列表</Button>
        <Select value={status} style={{ width: 150 }} options={[{ value: '', label: '全部记录' }, { value: 'failed', label: '仅失败记录' }]} onChange={value => { setStatus(value); load(null, value); }} />
        <Input.Search placeholder="按 req_ 编号查询" onSearch={id => load(id.trim())} style={{ width: 300 }} />
      </Space>
      <p>记录包含各轮草稿、模型响应、检索证据、修稿意见和核验命中详情。失败草稿仅供排查。</p>
      {error && <Alert type="error" message={error} showIcon />}
      {trace ? <>
        <Typography.Text copyable>{trace.request_id}</Typography.Text>
        <p><Tag color={trace.status === 'failed' ? 'error' : 'blue'}>{labels[trace.status] || trace.status}</Tag>{trace.duration_ms != null && `${trace.duration_ms} ms`}</p>
        {trace.error && <Alert type="error" message={trace.error.code} description={trace.error.message} />}
        {findings.length > 0 && <Alert style={{ marginTop: 12 }} type="warning" message={`发现 ${findings.length} 次事实核验拦截`} description={<ul>{findings.map((event, index) => <li key={index}>规则：{event.data.error.details.rule}；命中：{event.data.error.details.matches.join('、')}。展开下方 grounding 记录查看原句与证据。</li>)}</ul>} />}
        {trace.events.map((event, index) => <details key={index} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
          <summary style={{ cursor: 'pointer' }}>{event.at} · {event.stage} · {event.status}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{JSON.stringify(event.data, null, 2)}</pre>
        </details>)}
      </> : <List loading={busy} dataSource={items} locale={{ emptyText: <Empty description="尚无运行记录，发起一次请求后即可查看" /> }} renderItem={item => <List.Item actions={[<Button key="view" onClick={() => load(item.request_id)}>查看详情</Button>]}>
        <List.Item.Meta title={<Space><Tag color={item.status === 'failed' ? 'error' : 'blue'}>{labels[item.status] || item.status}</Tag>{item.request_id}</Space>} description={`${item.started_at} · ${item.route || ''} ${item.error?.code || ''}`} />
      </List.Item>} />}
    </Drawer>
  </>;
}
