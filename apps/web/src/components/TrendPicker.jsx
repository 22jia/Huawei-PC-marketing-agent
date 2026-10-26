import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Segmented, Select, Space, Spin, Tag, Typography } from 'antd';

export function TrendPicker({ selection, platform, task, sessionId, disabled, onChoose }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('expression');
  const [query, setQuery] = useState('');
  const [chosenPlatform, setChosenPlatform] = useState(platform || 'xiaohongshu');
  const sequence = useRef(0);
  useEffect(() => {
    if (selection?.status === 'pending') {
      setChosenPlatform(selection.platform); setOpen(true); setMode('expression');
      if (selection.inspiration_type === 'expression') setData(selection);
      else load(selection.platform, 'expression', '');
    }
    return () => { sequence.current++; };
  }, [selection]);
  async function load(value = chosenPlatform, type = mode, term = query) {
    const request = ++sequence.current;
    setChosenPlatform(value); setMode(type); setLoading(true); setError(''); setData(null);
    try {
      if (type === 'ranking' && selection?.status === 'pending' && selection.platform === value && selection.relevance_version === 1) {
        setData(selection); return;
      }
      const response = await fetch(type === 'expression' ? '/api/v1/inspirations' : '/api/v1/trends/recommendations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: value, task, session_id: sessionId, ...(type === 'expression' ? { query: term } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '灵感暂时不可用，请稍后再试');
      if (request === sequence.current) setData(body);
    } catch (err) { if (request === sequence.current) setError(err.message); }
    finally { if (request === sequence.current) setLoading(false); }
  }
  async function choose(item, integration) {
    setChoosing(true); setError('');
    try {
      if (item.kind === 'expression') {
        const response = await fetch('/api/v1/inspirations/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, discovery_id: data.discovery_id, item_id: item.id }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || '未能选择灵感，请重试');
        onChoose(`${integration}：${item.topic}`, body.selection);
      } else {
        const pending = selection?.status === 'pending' && selection.platform === chosenPlatform && selection.items.some(row => row.id === item.id);
        onChoose(pending ? `${integration}：${item.topic}` : `请${integration}“${item.topic}”，${chosenPlatform === 'weibo' ? '微博' : '小红书'}平台，结合原需求${platform ? '改写' : '创作'}软文。话题来源：${item.source_url}。仅借用选题，不把热点作为产品事实依据。`);
      }
      setOpen(false);
    } catch (err) { setError(err.message); } finally { setChoosing(false); }
  }
  const blocked = disabled || choosing;
  return <><Button size="small" disabled={disabled} onClick={() => { setOpen(true); load(); }}>创作灵感</Button>
    <Modal title="寻找创作灵感" open={open} onCancel={() => setOpen(false)} width={760} footer={<Button disabled={blocked} onClick={() => { onChoose('跳过热点，直接创作'); setOpen(false); }}>按原需求直接创作</Button>}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented value={mode} disabled={choosing} onChange={type => load(chosenPlatform, type)} options={[{ value: 'expression', label: '热梗与玩法' }, ...(['xiaohongshu', 'weibo'].includes(chosenPlatform) ? [{ value: 'ranking', label: '事件话题' }] : [])]} />
        <Select value={chosenPlatform} disabled={loading || choosing || selection?.status === 'pending'} onChange={value => load(value)} options={[{ value: 'xiaohongshu', label: '小红书' }, { value: 'weibo', label: '微博' }, { value: 'wechat', label: '微信公众号' }, { value: 'wechat_moments', label: '朋友圈' }, { value: 'douyin', label: '抖音' }, { value: 'bilibili', label: 'B站' }]} />
      </Space>
      {mode === 'expression' ? <>
        <Input.Search value={query} onChange={e => setQuery(e.target.value)} maxLength={180} placeholder="输入想用的梗、句式或参考链接，例如：烧心梗" enterButton="搜索用法" loading={loading} disabled={choosing} onSearch={value => load(chosenPlatform, 'expression', value)} />
        <p>联网寻找表达玩法，也可以指定一个梗。先理解含义，再结合当前产品、人群与场景提出写法。</p>
      </> : <p>从平台榜单中筛选相关事件话题；没有合适话题时，不强行关联产品。</p>}
      {error && <Alert type="warning" message={error} />}
      {!loading && data && !data.items?.length && <Alert type="info" message={data.recommendation_status === 'no_match' ? (mode === 'expression' ? '搜索材料中没有找到有依据且适合本次创作的表达玩法。可以输入具体的梗重新搜索，或直接创作。' : '当前榜单没有适合这次创作的话题，可直接按原需求创作。') : data.recommendation_status === 'needs_context' ? '请先在对话中说明产品、人群或使用场景。' : '暂时未能完成搜索或筛选，请稍后重试，也可以直接创作。'} />}
      {loading ? <div style={{ padding: 32, textAlign: 'center' }}><Spin /><p>正在查询公开来源，并分析适合的表达方式…</p></div> : <div style={{ display: 'grid', gap: 12, maxHeight: '52vh', overflowY: 'auto', marginTop: 12 }}>{(data?.items || []).map(item => <Card key={item.id} size="small" title={<Space wrap>{item.topic}<Tag>{item.label || (item.kind === 'expression' ? '表达参考（时间待核实）' : '榜单话题')}</Tag></Space>}>
        {item.meaning && <p style={{ marginTop: 0 }}><strong>原本含义：</strong>{item.meaning}</p>}
        <p><strong>为什么适合：</strong>{item.reason}</p>
        <p><strong>创作切入：</strong>{item.angle}</p>
        {item.example && <p style={{ background: '#f7f8fa', padding: 10, borderRadius: 8 }}><strong>试写一句：</strong>{item.example}</p>}
        <Space wrap><Button disabled={blocked} size="small" onClick={() => choose(item, '围绕话题创作')}>围绕它创作</Button><Button disabled={blocked} size="small" onClick={() => choose(item, '自然融入话题')}>自然融入</Button>{item.rank && <Typography.Text type="secondary">榜单第 {item.rank} 位</Typography.Text>}</Space>
        <div style={{ marginTop: 12 }}>{(item.sources || [{ source_url: item.source_url, title: '查看话题来源' }]).map(source => <div key={source.source_url}><a href={source.source_url} target="_blank" rel="noreferrer">{source.title}</a><Typography.Text type="secondary"> · {source.publication_verified && source.published_at ? `发布时间：${source.published_at}` : '发布时间待核实'}</Typography.Text></div>)}</div>
      </Card>)}</div>}
      {data && <p style={{ color: '#999', fontSize: 12, marginTop: 14 }}>来源：{data.provider} · 检索时间：{data.fetched_at ? new Date(data.fetched_at).toLocaleString() : '未知'}{data.cached ? '（30分钟内缓存）' : ''}。{mode === 'expression' ? '逐条区分发布时间与传播证据；时间未知会明确标注，检索时间不代表发布时间。' : '上游未提供榜单更新时间，热度不保证实时。'}</p>}
    </Modal></>;
}
