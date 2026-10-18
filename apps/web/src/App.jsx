import { useEffect, useRef, useState } from 'react';
import { Sparkles, PanelLeftClose, BookOpen, MessagesSquare, PenLine, ArrowUpRight, Plus, ChevronDown, Check, Settings2, Layers, CircleHelp, ChevronRight, ArrowLeft } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button as StudioButton } from './components/ui/button';
import { CreativeThread } from './components/CreativeThread';
import { MarkdownContent } from './components/MarkdownContent';
import { creativeArticle, creativeReport } from './lib/creativeArticle';
import { ArticleDeliveryTools } from './components/ArticleDeliveryTools';
import { ModelRunStatus } from './components/ModelRunStatus';
import {
  Alert, Badge, Breadcrumb, Button, Card, Checkbox, Col, Descriptions, Divider, Drawer, Empty, Form,
  Input, Layout, List, Radio, Row, Select, Space, Statistic, Steps, Tabs, Tag,
  Timeline, Typography, message, Table, Modal, Progress,
} from 'antd';
import {
  BulbOutlined, CheckCircleOutlined, CopyOutlined, CustomerServiceOutlined,
  FileSearchOutlined, FileTextOutlined, PlayCircleOutlined, ReloadOutlined,
  SafetyCertificateOutlined, SendOutlined, FolderOpenOutlined, FolderOutlined, FileOutlined,
  DashboardOutlined, PlusOutlined, EyeOutlined,
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const marketingInitialValues = {
  audience: '大学生',
  scenario: '学习和移动办公',
  goal: '种草并引导到店咨询',
  platform: 'xiaohongshu',
  model: 'HUAWEI MateBook 14',
  requirements: ['突出便携', '突出屏幕体验'],
  include_price: false,
};

const customerInitialValues = {
  customer_description: '大学生，常在图书馆写论文，担心电脑太重；已有华为手机，希望传文件方便',
  model: 'HUAWEI MateBook 14',
  follow_up_days: [1, 3, 7],
};

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') throw new Error(`${data.message || '请求失败'}${data.code ? `（${data.code}）` : ''}`);
  return data;
}

function LegacyMarketingWorkbench({ messageApi }) {
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate(values) {
    setLoading(true);
    setResult(null);
    try {
      const data = await postJson('/api/v1/generate', values);
      setResult(data);
      if (data.status === 'needs_clarification') messageApi.warning('请补充任务信息后再生成');
    } catch (error) {
      messageApi.error(error.message || '无法连接 API 服务');
    } finally {
      setLoading(false);
    }
  }

  async function copyBody() {
    if (!result?.content) return;
    await navigator.clipboard.writeText(`${result.content.title}\n\n${result.content.body}\n\n${result.content.hashtags.join(' ')}`);
    messageApi.success('内容已复制');
  }

  return <Row gutter={[20, 20]} align="top">
    <Col xs={24} lg={8}>
      <Card title={<Space><BulbOutlined />创建营销任务</Space>} className="panel-card" extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => form.resetFields()}>重置</Button>}>
        <Form form={form} layout="vertical" initialValues={marketingInitialValues} onFinish={handleGenerate}>
          <Form.Item name="audience" label="目标受众" rules={[{ required: true, message: '请填写目标受众' }]}><Input placeholder="例如：大学生、职场新人" /></Form.Item>
          <Form.Item name="scenario" label="使用场景" rules={[{ required: true, message: '请填写使用场景' }]}><Input.TextArea rows={2} placeholder="例如：学习和移动办公" /></Form.Item>
          <Form.Item name="goal" label="内容目标" rules={[{ required: true, message: '请填写内容目标' }]}><Input placeholder="例如：种草并引导到店咨询" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="platform" label="发布平台" rules={[{ required: true }]}><Select options={[{ value: 'xiaohongshu', label: '小红书' }, { value: 'douyin', label: '抖音' }, { value: 'wechat', label: '微信公众号' }, { value: 'wechat_moments', label: '微信朋友圈' }, { value: 'weibo', label: '微博' }, { value: 'bilibili', label: '哔哩哔哩' }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="model" label="产品型号" rules={[{ required: true, message: '请填写产品型号' }]}><Input placeholder="例如：HUAWEI MateBook 14" /></Form.Item></Col>
          </Row>
          <Form.Item name="requirements" label="重点要求"><Select mode="tags" tokenSeparators={[',']} placeholder="输入卖点后回车" options={[{ value: '突出便携' }, { value: '突出屏幕体验' }, { value: '突出跨端协作' }]} /></Form.Item>
          <Form.Item name="include_price" label="是否包含价格"><Radio.Group options={[{ value: false, label: '不包含（推荐）' }, { value: true, label: '包含，需严格核验' }]} /></Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={loading} block size="large">生成场景化内容</Button>
        </Form>
      </Card>
    </Col>
    <Col xs={24} lg={16}>
      <Card title={<Space><FileTextOutlined />生成结果</Space>} className="panel-card result-card" extra={result?.content && <Button icon={<CopyOutlined />} onClick={copyBody}>复制内容</Button>}>
        {!result && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="填写左侧任务后开始生成" className="empty-state" />}
        {result?.status === 'needs_clarification' && <Alert type="warning" showIcon message="还需要补充信息" description={<Space direction="vertical">{result.task?.questions?.map((item) => <Text key={item.field}>{item.question}</Text>)}</Space>} />}
        {result?.content && <>
          <div className="result-meta"><Tag color={result.validation?.status === 'pass' ? 'success' : 'warning'} icon={<CheckCircleOutlined />}>{result.validation?.status === 'pass' ? '核验通过' : '需要人工确认'}</Tag><Text type="secondary">{result.request_id}</Text></div>
          <Title level={3}>{result.content.title}</Title>
          <Paragraph className="draft-body">{result.content.body}</Paragraph>
          <Space wrap>{result.content.hashtags?.map((tag) => <Tag key={tag} color="blue">{tag}</Tag>)}</Space>
          <Divider />
          <div className="cta-line"><Text strong>CTA</Text><Text>{result.content.cta}</Text></div>
          <Divider />
          <div className="section-label"><SafetyCertificateOutlined /> 事实来源与核验</div>
          <List size="small" dataSource={result.facts || []} locale={{ emptyText: '没有返回事实来源' }} renderItem={(item) => <List.Item><Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><Text>{item.title}</Text><Tag>{item.confidence}</Tag></Space></List.Item>} />
          {result.warnings?.length > 0 && <Alert className="result-alert" type="warning" showIcon message="发布前确认" description={result.warnings.join('；')} />}
        </>}
      </Card>
    </Col>
  </Row>;
}

function MarketingWorkbench({ messageApi }) {
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const artifactRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const adapter = {
    async run({ messages, abortSignal }) {
      setBusy(true);
      try {
        const values = form.getFieldsValue(true);
        const history = messages.filter((m) => ['user', 'assistant'].includes(m.role)).slice(-12).map((m) => ({ role: m.role, content: m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n') }));
        setRunResult(null);
        const response = await fetch('/api/v1/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abortSignal, body: JSON.stringify({ ...values, history, last_artifact: artifactRef.current }) });
        const data = await response.json();
        if (!response.ok || data.status === 'error') throw new Error(`${data.message || '生成失败，请重试'}${data.code ? `（${data.code}）` : ''}`);
        if (data.task && !abortSignal?.aborted) {
          const updates = {};
          for (const key of ['model', 'audience', 'scenario', 'goal', 'platform', 'requirements', 'include_price']) {
            if (data.task[key] !== undefined && JSON.stringify(form.getFieldValue(key)) === JSON.stringify(values[key])) updates[key] = data.task[key];
          }
          form.setFieldsValue(updates);
        }
        setRunResult(data);
        if (data.reply) return { content: [{ type: 'text', text: data.reply }] };
        if (!data.content) return { content: [{ type: 'text', text: `${data.task?.questions?.map((q) => q.question).join('\n') || '请补充任务信息。'}\n直接在这里回复即可，我会继续处理。` }] };
        artifactRef.current = data.content;
        setResult(data);
        return { content: [{ type: 'text', text: creativeReport(data) }] };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        return { content: [{ type: 'text', text: error.errorFields ? '请先补充左侧必填的创作信息，然后重新发送。' : `本次创作未完成：${error.message}。请稍后重试。` }] };
      } finally { setBusy(false); }
    },
  };
  async function copy() {
    try { await navigator.clipboard.writeText(creativeArticle(result)); messageApi.success('图文 Markdown 已复制'); } catch { messageApi.error('复制失败，请手动选择文案复制'); }
  }
  return <div className="studio-workbench"><CreativeThread adapter={adapter}>{(runtime) => <>
    <aside className="brief-panel"><div className="panel-eyebrow"><Settings2 size={15} /> 创作设定 <span>BRIEF</span></div><h3>好内容，始于好场景。</h3><p className="brief-description">告诉我，为谁而写，在哪打动他。</p>
      <Form form={form} layout="vertical" initialValues={marketingInitialValues} onFinish={() => runtime.thread.append({ role: 'user', content: [{ type: 'text', text: '根据当前创作设定，写一篇适合所选平台的场景化营销文案。' }] })}>
        <Form.Item name="platform" label="发布平台"><Select showSearch optionFilterProp="label" placeholder="选择发布平台，也可以在对话中指定" options={[{ value: 'xiaohongshu', label: '小红书' }, { value: 'wechat', label: '微信公众号' }, { value: 'wechat_moments', label: '微信朋友圈' }, { value: 'douyin', label: '抖音' }, { value: 'weibo', label: '微博' }, { value: 'bilibili', label: '哔哩哔哩' }]} /></Form.Item>
        <Form.Item name="model" label="产品型号" rules={[{required:true,message:'请填写产品型号'}]}><Input placeholder="例如 HUAWEI MateBook GT 14" /></Form.Item>
        <Form.Item name="audience" label="目标受众" rules={[{required:true,message:'请填写目标受众'}]}><Input placeholder="为谁创作？" /></Form.Item>
        <Form.Item name="scenario" label="使用场景" rules={[{required:true,message:'请填写使用场景'}]}><Input.TextArea rows={2} placeholder="例如：出差途中修改提案、客户会议" /></Form.Item>
        <Form.Item name="goal" label="内容目标" rules={[{required:true,message:'请填写内容目标'}]}><Input /></Form.Item>
        <Form.Item name="requirements" label="重点表达"><Select mode="tags" options={[{value:'突出便携'},{value:'突出屏幕体验'},{value:'突出跨端协作'}]} placeholder="添加重点要求" /></Form.Item>
        <Form.Item name="include_price" valuePropName="checked"><Checkbox>包含价格信息 <span className="muted">· 需来源支持</span></Checkbox></Form.Item>
        <StudioButton type="submit" className="generate-button" disabled={busy}><Sparkles size={16} />{busy ? '正在创作…' : '开始创作'}<ArrowUpRight size={16} /></StudioButton>
        <button className="reset-brief" type="button" disabled={busy} onClick={() => form.resetFields()}>重置创作设定</button>
      </Form><div className="brief-footer"><BookOpen size={15} /><span>基于华为 PC 产品知识库</span><span className="status-dot" /></div>
    </aside>
    <div className="conversation-toolbar"><div><span className="live-dot" /> 创作对话 <span className="toolbar-subtitle">/ 新的灵感</span><ModelRunStatus result={runResult} /></div><Space wrap><ArticleDeliveryTools result={result} />{result?.content && <StudioButton variant="ghost" onClick={copy}><CopyOutlined /> 复制</StudioButton>}<StudioButton variant="outline" onClick={() => setEvidenceOpen(true)}><BookOpen size={14} /> 来源与核验 {result?.facts?.length || 0}</StudioButton></Space></div>
  </>}</CreativeThread><Drawer title="来源与核验" open={evidenceOpen} onClose={() => setEvidenceOpen(false)} width={480}><p>核对产品依据后，再发布你的内容。</p>{result ? <><Tag color={result.validation?.status === 'pass' ? 'success' : 'warning'}>{result.validation?.status === 'pass' ? '基础规则检查通过' : '需要人工核对'}</Tag><List dataSource={result.facts || []} locale={{emptyText:'当前没有可引用的产品来源'}} renderItem={(item) => <List.Item><div><Text strong>{item.title}</Text><p>{item.source_path}</p></div></List.Item>} />{result.warnings?.length > 0 && <Alert type="warning" showIcon message="发布前确认" description={result.warnings.join('；')} />}<p className="muted">{result.generation_mode === 'llm' ? '本次由模型生成' : '尚未生成，等待补充信息'}</p></> : <Empty description="生成文案后，来源会显示在这里" />}</Drawer></div>;
}

function CustomerAssistWorkbench({ messageApi }) {
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [assistError, setAssistError] = useState('');

  async function handleAssist(values) {
    setLoading(true);
    setResult(null);
    setTicket(null);
    setAssistError('');
    try {
      const data = await postJson('/api/v1/customer/assist', values);
      setResult(data);
      setTicket(null);
      if (data.status === 'partial') messageApi.warning('部分动态信息暂不可用，已保留本地知识库结果');
    } catch (error) {
      setAssistError(error.message || '无法连接 API 服务');
      messageApi.error(error.message || '无法连接 API 服务');
    } finally {
      setLoading(false);
    }
  }

  async function createTicket() {
    if (!result) return;
    try { const values = await form.validateFields(); const data = await postJson('/api/v1/tickets', { ...values, assist_result: result, needs_follow_up: values.needs_follow_up !== false, source: 'customer_assist' }); setTicket(data.ticket); messageApi.success('工单已创建，可在客户工单中继续跟进'); }
    catch (error) { messageApi.error(error.message || '工单创建失败'); }
  }

  async function selectModel(title) {
    const model = title.replace(/\s*[-–—]\s*产品事实.*$/, '').trim();
    try {
      const values = await form.validateFields();
      form.setFieldValue('model', model);
      await handleAssist({ ...values, model });
    } catch {
      messageApi.warning('请先补充客户描述');
    }
  }

  const solutionTab = result && <div>
    <Alert
      type={result.solution?.status === 'insufficient_evidence' ? 'warning' : 'info'}
      showIcon
      message={result.solution?.status === 'needs_model_clarification'
        ? '本地知识库已找到资料，请先确认产品版本'
        : result.solution?.status === 'needs_staff_confirmation'
          ? '本地知识库已找到产品资料，需店员核对'
          : '暂不能形成具体型号推荐'}
      description={result.solution?.rationale}
    />
    {result.solution?.candidate_models?.length > 0 && <div className="question-block"><Text strong>请选择客户关注的版本</Text><List size="small" dataSource={result.solution.candidate_models} renderItem={(item) => <List.Item actions={[<Button key="select" type="primary" disabled={loading} onClick={() => selectModel(item)}>选择并检索</Button>]}><Space><FileSearchOutlined /><Text>{item}</Text></Space></List.Item>} /></div>}
    {result.clarification?.questions?.length > 0 && <div className="question-block"><Text strong>建议先追问</Text><List size="small" dataSource={result.clarification.questions} renderItem={(question) => <List.Item><FileSearchOutlined /> {question}</List.Item>} /></div>}
    {result.solution?.price_solution?.status === 'available' && <section className="price-solution"><div className="price-solution-heading"><div><Title level={4}>四档价格方案</Title><Text type="secondary">{result.solution.price_solution.model} · 官方价格快照 {result.solution.price_solution.snapshot_date}</Text></div><Tag color="blue">{result.solution.price_solution.tiers.length} 档</Tag></div><Row gutter={[12, 12]}>{result.solution.price_solution.tiers.map((tier) => <Col xs={24} sm={12} key={`${tier.configuration}-${tier.price}`}><Card size="small" className={tier.recommended ? 'price-tier recommended' : 'price-tier'} title={<Space>{tier.label}{tier.recommended && <Tag color="green">预算内优先</Tag>}</Space>}><Statistic value={tier.price} prefix="¥" precision={0} /><Paragraph className="price-tier-config">{tier.configuration}</Paragraph><Text type="secondary">{tier.status}</Text><Paragraph className="price-tier-conditions">权益：{tier.conditions || '未记录'}</Paragraph></Card></Col>)}</Row><Alert className="price-solution-note" type="info" showIcon message={result.solution.price_solution.note} description={<span>金额仅用于配置价格比较，不是承诺价；下单前需按对应 SKU 核对价格、权益与库存。<a href={result.solution.price_solution.tiers[0]?.source_url} target="_blank" rel="noreferrer">打开官方页面核对</a> · 来源：{result.solution.price_solution.source_path}</span>} /></section>}
    {result.solution?.price_solution?.status === 'needs_model_clarification' && <Alert className="question-block" type="warning" showIcon message="暂不能给出价格梯度" description={result.solution.price_solution.message} />}
    {result.solution?.price_solution?.status === 'unavailable' && <Alert className="question-block" type="info" showIcon message="该型号没有足够的价格档位" description={result.solution.price_solution.message} />}
    <Divider />
    <div className="section-label"><SafetyCertificateOutlined /> 检索证据</div>
    <List dataSource={result.solution?.evidence || []} locale={{ emptyText: '当前没有可引用证据，请在门店资料中进一步核对。' }} renderItem={(item) => <List.Item className="evidence-item"><div><Text strong>{item.title}</Text><MarkdownContent className="evidence-excerpt">{item.excerpt}</MarkdownContent><Text type="secondary">来源：{item.source_path}{item.updated_at ? ` · 快照日期：${item.updated_at}` : ''}</Text>{item.source_url && <div><a href={item.source_url} target="_blank" rel="noreferrer">打开官方来源核对</a></div>}</div><Tag color={['local_snapshot', 'local_knowledge_base'].includes(item.source_status) ? 'orange' : 'blue'}>{['local_snapshot', 'local_knowledge_base'].includes(item.source_status) ? '本地库，待核对' : item.confidence}</Tag></List.Item>} />
  </div>;

  const scriptTab = result && <div>
    <div className="talk-track"><Text strong>开场</Text><Paragraph>{result.sales_script?.opening}</Paragraph><Text strong>推荐说明</Text><Paragraph>{result.sales_script?.recommendation}</Paragraph><Text strong>收口</Text><Paragraph>{result.sales_script?.close}</Paragraph></div>
    <Divider />
    <div className="section-label"><CustomerServiceOutlined /> 异议回应</div>
    <List dataSource={result.objection_responses || []} locale={{ emptyText: '补充客户顾虑后可生成对应回应。' }} renderItem={(item) => <List.Item><div><Text strong>{item.objection}</Text><Paragraph className="list-paragraph">{item.response}</Paragraph></div><Tag color="gold">需核对</Tag></List.Item>} />
  </div>;

  const followUpTab = result && <Timeline items={(result.follow_up_plan || []).map((item) => ({ color: 'blue', children: <div><Text strong>第 {item.day} 天：{item.objective}</Text><Paragraph className="list-paragraph"><Text type="secondary">店员操作：</Text>{item.action}</Paragraph><div className="followup-draft"><Text type="secondary">客户消息草稿（审核后使用）</Text><Paragraph editable={{ onChange: (value) => setResult((current) => ({ ...current, follow_up_plan: current.follow_up_plan.map((plan) => plan.day === item.day ? { ...plan, message_draft: value } : plan) })) }} copyable style={{ marginBottom: 0 }}>{item.message_draft}</Paragraph></div></div> }))} />;

  return <Row gutter={[20, 20]} align="top">
    <Col xs={24} lg={8}>
      <Card title={<Space><CustomerServiceOutlined />记录客户需求</Space>} className="panel-card" extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => form.resetFields()}>重置</Button>}>
        <Form form={form} layout="vertical" initialValues={customerInitialValues} onFinish={handleAssist}>
          <Form.Item name="customer_description" label="客户描述" extra="记录用途、顾虑、已有设备和沟通阶段；请不要输入手机号等隐私信息。" rules={[{ required: true, message: '请填写客户描述' }]}><Input.TextArea rows={6} placeholder="例如：客户常在图书馆写论文，担心电脑太重……" /></Form.Item>
          <Form.Item name="model" label="意向型号（可选）"><Input placeholder="未确定时留空，Agent 会先建议追问" /></Form.Item>
          <Form.Item name="budget" label="客户预算（可选）"><Input inputMode="numeric" placeholder="例如：7000 元" /></Form.Item>
          <Form.Item name="customer_name" label="客户备注名"><Input placeholder="例如：李同学 / 3号桌客户" /></Form.Item>
          <Form.Item name="assignee" label="跟进人"><Input placeholder="例如：张三 / 店员姓名" /></Form.Item>
          <Form.Item name="needs_follow_up" label="是否需要跟进" initialValue={true}><Radio.Group options={[{ value: true, label: '需要跟进' }, { value: false, label: '暂不跟进' }]} /></Form.Item>
          <Form.Item name="follow_up_days" label="生成跟进草稿"><Checkbox.Group options={[{ label: '第 1 天', value: 1 }, { label: '第 3 天', value: 3 }, { label: '第 7 天', value: 7 }]} /></Form.Item>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} block size="large">生成成交辅助方案</Button>
        </Form>
      </Card>
    </Col>
    <Col xs={24} lg={16}>
      <Card title={<Space><FileSearchOutlined />客户成交辅助</Space>} className="panel-card result-card">
        {assistError && <Alert type="error" showIcon message="本次模型处理未完成" description={assistError} />}
        {!result && !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入客户沟通情况，生成洞察、讲解与跟进草稿" className="empty-state" />}
        {loading && <Alert type="info" showIcon message="正在分析需求、检索资料并生成方案" description="完成后展示实际模型、各模型调用耗时和用量。" />}
        {result?.status === 'needs_clarification' && <Alert type="warning" showIcon message="需要补充客户描述" description={(result.questions || []).join('；')} />}
        {result?.customer && <>
          <ModelRunStatus result={result} />
          {result.guardrails?.retrieval_warning && <Alert className="result-alert" type="warning" showIcon message="华为商城动态核验提示" description={result.guardrails.retrieval_warning} />}
          <div className="result-meta"><Tag color={result.solution?.status === 'needs_model_clarification' ? 'processing' : result.status === 'success' ? 'success' : 'warning'}>{result.solution?.status === 'needs_model_clarification' ? '等待确认产品版本' : result.status === 'success' ? '辅助方案已生成' : '部分结果，需人工核对'}</Tag><Text type="secondary">{result.request_id}</Text></div>
          <Title level={3}>客户洞察</Title>
          <Paragraph>{result.customer.summary}</Paragraph>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="客户类型">{result.customer.audience}</Descriptions.Item>
            <Descriptions.Item label="决策阶段">{result.customer.buying_stage}</Descriptions.Item>
            <Descriptions.Item label="核心需求"><Space wrap>{result.customer.needs?.map((item) => <Tag color="blue" key={item}>{item}</Tag>)}</Space></Descriptions.Item>
            <Descriptions.Item label="当前顾虑"><Space wrap>{result.customer.concerns?.map((item) => <Tag color="orange" key={item}>{item}</Tag>)}</Space></Descriptions.Item>
          </Descriptions>
          <Tabs className="customer-result-tabs" items={[{ key: 'solution', label: '方案与证据', children: solutionTab }, { key: 'script', label: '讲解与异议', children: scriptTab }, { key: 'follow-up', label: '1/3/7 天跟进', children: followUpTab }]} />
          <Divider /><Space><Button type="primary" icon={<PlusOutlined />} onClick={createTicket} disabled={Boolean(ticket)}> {ticket ? `已创建工单 ${ticket.id.slice(-6)}` : '创建客户跟进工单'} </Button><Text type="secondary">创建后可在工单列表中记录每次跟进和成交结果</Text></Space>
          <Badge status="processing" text="所有推荐、价格与跟进内容均须店员审核，不会自动发送" />
        </>}
      </Card>
    </Col>
  </Row>;
}

const statusLabels = { new: '新建', follow_up_pending: '待跟进', following_up: '跟进中', won: '已成交', lost: '未成交', paused: '暂不考虑' };
const statusColors = { new: 'default', follow_up_pending: 'orange', following_up: 'blue', won: 'success', lost: 'error', paused: 'default' };

function TicketWorkbench({ messageApi }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(false); const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [selected, setSelected] = useState(null); const [followOpen, setFollowOpen] = useState(false); const [newOpen, setNewOpen] = useState(false); const [form] = Form.useForm(); const [newForm] = Form.useForm();
  async function load() { setLoading(true); try { const params = new URLSearchParams(); if (status) params.set('status', status); if (q) params.set('q', q); const r = await fetch(`/api/v1/tickets?${params}`); const data = await r.json(); setItems(data.items || []); } catch (e) { messageApi.error(e.message || '工单读取失败'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [status]);
  async function saveFollow(values) { try { const r = await postJson(`/api/v1/tickets/${selected.id}/follow-ups`, values); setSelected(r.ticket); setFollowOpen(false); form.resetFields(); await load(); messageApi.success('跟进记录已保存'); } catch (e) { messageApi.error(e.message || '保存失败'); } }
  async function createNewTicket(values) { try { await postJson('/api/v1/tickets', { ...values, follow_up_days: [1, 3, 7], needs_follow_up: true, source: 'ticket_list' }); setNewOpen(false); newForm.resetFields(); await load(); messageApi.success('工单已创建'); } catch (e) { messageApi.error(e.message || '工单创建失败'); } }
  async function updateStatus(next) { try { const r = await fetch(`/api/v1/tickets/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }); const data = await r.json(); setSelected(data.ticket); await load(); messageApi.success('状态已更新'); } catch (e) { messageApi.error(e.message || '更新失败'); } }
  const columns = [{ title: '客户', dataIndex: 'customer_name', render: (v, row) => <Button type="link" onClick={() => setSelected(row)}>{v || '未命名客户'}</Button> }, { title: '意向产品', dataIndex: 'model', render: (v) => v || '待确认' }, { title: '跟进人', dataIndex: 'assignee', render: (v) => v || '未分配' }, { title: '状态', dataIndex: 'status', render: (v) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> }, { title: '最近跟进', dataIndex: 'last_follow_up_at', render: (v) => v ? new Date(v).toLocaleDateString() : '—' }, { title: '下次跟进', dataIndex: 'next_follow_up_at', render: (v) => v ? new Date(v).toLocaleDateString() : '—' }, { title: '跟进次数', dataIndex: 'follow_up_count' }, { title: '操作', render: (_, row) => <Space><Button icon={<EyeOutlined />} onClick={() => setSelected(row)}>详情</Button><Button type="primary" ghost onClick={() => { setSelected(row); setFollowOpen(true); }}>记录跟进</Button></Space> }];
  async function saveAssignee(value) { try { const r = await fetch(`/api/v1/tickets/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignee: value }) }); const data = await r.json(); setSelected(data.ticket); await load(); messageApi.success('跟进人已更新'); } catch (e) { messageApi.error(e.message || '跟进人更新失败'); } }
  return <div><Row gutter={[12, 12]} className="ticket-toolbar"><Col flex="auto"><Input.Search placeholder="搜索客户、产品或备注" allowClear onSearch={(v) => { setQ(v); setTimeout(load, 0); }} /></Col><Col><Select value={status} onChange={setStatus} style={{ width: 150 }} options={[{ value: '', label: '全部状态' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} /></Col><Col><Button type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)}>新增工单</Button></Col><Col><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button></Col></Row><Card className="panel-card"><Table rowKey="id" loading={loading} dataSource={items} columns={columns} pagination={{ pageSize: 8 }} locale={{ emptyText: '还没有客户工单，点击右上角新增工单' }} /></Card><Drawer title={selected ? `${selected.customer_name || '客户'} · 工单详情` : '工单详情'} open={Boolean(selected)} onClose={() => setSelected(null)} width={560}>{selected && <><Descriptions bordered size="small" column={1}><Descriptions.Item label="意向产品">{selected.model || '待确认'}</Descriptions.Item><Descriptions.Item label="跟进人"><Space><Input defaultValue={selected.assignee} placeholder="填写跟进人" onPressEnter={(e) => saveAssignee(e.currentTarget.value)} /><Button onClick={(e) => saveAssignee(e.currentTarget.previousSibling?.value || '')}>保存</Button></Space></Descriptions.Item><Descriptions.Item label="客户描述">{selected.customer_description}</Descriptions.Item><Descriptions.Item label="当前状态"><Select value={selected.status} onChange={updateStatus} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Descriptions.Item><Descriptions.Item label="跟进次数">{selected.follow_up_count}</Descriptions.Item></Descriptions><Divider /><Title level={5}>跟进时间线</Title><Timeline items={(selected.follow_ups || []).map((f) => ({ children: <div><Text strong>{f.method} · {new Date(f.date).toLocaleString()}</Text><div>{f.summary || '无摘要'}</div>{f.customer_feedback && <Text type="secondary">客户反馈：{f.customer_feedback}</Text>}</div> }))} /><Button type="primary" block icon={<PlusOutlined />} onClick={() => setFollowOpen(true)}>添加跟进记录</Button></>}</Drawer><Modal title="新增客户工单" open={newOpen} onCancel={() => setNewOpen(false)} onOk={() => newForm.submit()} okText="创建工单"><Form form={newForm} layout="vertical" onFinish={createNewTicket}><Form.Item name="customer_name" label="客户备注名"><Input placeholder="例如：李同学 / 3号桌客户" /></Form.Item><Form.Item name="customer_description" label="客户描述" rules={[{ required: true, message: '请填写客户描述' }]}><Input.TextArea rows={4} placeholder="记录客户用途、顾虑和购买阶段" /></Form.Item><Form.Item name="model" label="意向产品"><Input placeholder="例如：HUAWEI MateBook 14" /></Form.Item><Form.Item name="assignee" label="跟进人"><Input placeholder="例如：张三" /></Form.Item></Form></Modal><Modal title="添加跟进记录" open={followOpen} onCancel={() => setFollowOpen(false)} onOk={() => form.submit()} okText="保存"><Form form={form} layout="vertical" onFinish={saveFollow}><Form.Item name="method" label="跟进方式" initialValue="微信"><Select options={['微信', '电话', '短信', '到店'].map((v) => ({ value: v, label: v }))} /></Form.Item><Form.Item name="summary" label="本次沟通摘要" rules={[{ required: true, message: '请填写沟通摘要' }]}><Input.TextArea rows={3} /></Form.Item><Form.Item name="customer_feedback" label="客户反馈"><Input.TextArea rows={2} /></Form.Item><Form.Item name="next_action" label="下一步动作"><Input placeholder="例如：发送配置对比，预约周六到店" /></Form.Item><Form.Item name="next_follow_up_at" label="下次跟进时间"><Input type="datetime-local" /></Form.Item></Form></Modal></div>;
}

function DashboardWorkbench({ messageApi }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); try { const r = await fetch('/api/v1/dashboard'); setData(await r.json()); } catch (e) { messageApi.error(e.message || '看板读取失败'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  if (loading && !data) return <Card loading className="panel-card" />;
  if (!data) return <Empty description="暂无数据" />;
  return <div><div className="dashboard-actions"><Text type="secondary">工单数据实时来自本地工作区</Text><Button icon={<ReloadOutlined />} onClick={load}>刷新看板</Button></div><Row gutter={[16, 16]}><Col xs={12} lg={6}><Card><Statistic title="累计工单" value={data.total} /></Card></Col><Col xs={12} lg={6}><Card><Statistic title="待跟进" value={data.pending_follow_up} valueStyle={{ color: '#fa8c16' }} /></Card></Col><Col xs={12} lg={6}><Card><Statistic title="已成交" value={data.won} valueStyle={{ color: '#52c41a' }} /></Card></Col><Col xs={12} lg={6}><Card><Statistic title="成交率" value={data.conversion_rate} suffix="%" valueStyle={{ color: '#1677ff' }} /></Card></Col></Row><Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col xs={24} lg={12}><Card title="成交漏斗"><Space direction="vertical" style={{ width: '100%' }}>{data.status_distribution.filter((x) => x.count > 0).map((x) => <div key={x.status}><div className="funnel-label"><span>{statusLabels[x.status]}</span><Text type="secondary">{x.count}</Text></div><Progress percent={data.total ? Math.round(x.count / data.total * 100) : 0} showInfo={false} strokeColor={statusColors[x.status] === 'success' ? '#52c41a' : undefined} /></div>)}</Space></Card></Col><Col xs={24} lg={12}><Card title="产品成交表现"><Table size="small" rowKey="model" pagination={false} dataSource={data.product_stats} columns={[{ title: '产品', dataIndex: 'model' }, { title: '工单数', dataIndex: 'total' }, { title: '成交', dataIndex: 'won' }, { title: '成交率', render: (_, r) => `${r.total ? Math.round(r.won / r.total * 100) : 0}%` }]} locale={{ emptyText: '暂无产品数据' }} /></Card></Col></Row></div>;
}

function KnowledgeBrowser({ messageApi }) {
  const [items, setItems] = useState([]);
  const [path, setPath] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadFolder(folderId = '') {
    setLoading(true);
    try {
      const data = await postJson('/api/v1/knowledge/list', { folder_id: folderId, limit: 50 });
      setItems(data.items || []); setPath(data.current_path || []); setDetail(null);
    } catch (error) { messageApi.error(error.message || '知识库目录读取失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadFolder(''); }, []);
  async function openItem(item) {
    if (item.kind === 'folder') return loadFolder(item.id);
    setDetailLoading(true);
    try { const data = await postJson('/api/v1/knowledge/item', { media_id: item.id, title: item.title, media_type: item.media_type }); setDetail(data.item); }
    catch (error) { messageApi.error(error.message || '知识条目读取失败'); }
    finally { setDetailLoading(false); }
  }
  return <section className="knowledge-workspace">
    <div className="knowledge-page-heading"><div className="panel-eyebrow"><BookOpen size={15}/> 产品知识库 <span>KNOWLEDGE BASE</span></div><h2>华为 PC 全板块深度知识库 v7</h2><p>浏览产品事实、使用场景与服务资料；涉及实时价格和库存时请以华为商城页面为准。</p></div>
    {detail ? <div className="knowledge-reader"><Button icon={<ArrowLeft size={15}/>} onClick={() => setDetail(null)}>返回目录</Button><div className="knowledge-reader-title"><FileTextOutlined/><Title level={3}>{detail.title}</Title></div><div className="knowledge-reader-content"><MarkdownContent>{detail.content}</MarkdownContent></div></div> : <><Breadcrumb items={[{ title: '知识库' }, ...path.slice(1).map((item) => ({ title: item.name }))]} /><div className="knowledge-directory"><List loading={loading || detailLoading} dataSource={items} locale={{ emptyText: '当前目录为空' }} renderItem={(item) => <List.Item className="knowledge-item" onClick={() => openItem(item)}><List.Item.Meta avatar={item.kind === 'folder' ? <FolderOutlined className="folder-icon" /> : <FileOutlined className="file-icon" />} title={item.title} description={item.kind === 'folder' ? '打开分类' : '查看知识内容'} /><Tag color={item.kind === 'folder' ? 'blue' : 'default'}>{item.kind === 'folder' ? '分类' : '知识条目'}</Tag><ChevronRight size={16} className="knowledge-chevron"/></List.Item>} /></div></>}
  </section>;
}

function ProductSpotlight({ messageApi }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('全部产品');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/products/spotlight');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '新品资料读取失败');
      setProducts(data.items || []);
    } catch (error) { messageApi.error(error.message || '新品资料读取失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const categories = ['全部产品', ...new Set(products.map((item) => item.category))];
  const searchTerms = [...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean).flatMap((term) => ({
    '大学生': ['大学生', '学生', '在校生', '论文', '学习'],
    '学生党': ['学生党', '学生', '在校生', '学习'],
    '写论文': ['写论文', '论文', '学习'],
    '上班族': ['上班族', '职场', '商务', '办公'],
    '出差': ['出差', '移动办公', '商务'],
  }[term] || [term])))];
  const filtered = products.filter((item) => {
    if (category !== '全部产品' && item.category !== category) return false;
    const searchable = `${item.name} ${item.positioning} ${item.suitable_tasks.join(' ')}`.toLowerCase();
    return !searchTerms.length || searchTerms.some((term) => searchable.includes(term));
  });

  return <section className="spotlight-workspace">
    <div className="knowledge-page-heading">
      <div className="panel-eyebrow"><Sparkles size={15}/> 新品速递 <span>PRODUCT SPOTLIGHT</span></div>
      <h2>产品线重点速览</h2>
      <p>产品图、定位与适用任务来自本地产品资料。资料日期可帮助判断新旧；当期主推安排请以运营通知为准。</p>
    </div>
    <div className="spotlight-toolbar">
      <Input.Search value={query} onChange={(event) => setQuery(event.target.value)} allowClear placeholder="搜索产品、人群或使用任务" className="spotlight-search" />
      <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新资料</Button>
    </div>
    <div className="spotlight-categories">{categories.map((item) => <Button key={item} type={category === item ? 'primary' : 'default'} onClick={() => setCategory(item)}>{item}</Button>)}</div>
    {loading && !products.length ? <Card loading /> : filtered.length ? <div className="spotlight-grid">{filtered.map((item) => <button className="spotlight-card" key={item.id} onClick={() => setSelected(item)}>
      {item.image ? <img className="spotlight-image" src={item.image} alt={item.name} loading="lazy" /> : <div className="spotlight-image spotlight-image-empty"><BookOpen size={28}/></div>}
      <div className="spotlight-card-body"><div className="spotlight-card-meta"><Tag>{item.category}</Tag><Text type="secondary">资料日期：{item.checked_at || '未标注'}</Text></div><h3>{item.name}</h3><p>{item.positioning || '请打开详情查看产品事实资料。'}</p><span className="spotlight-open">查看产品说明 <ArrowUpRight size={14}/></span></div>
    </button>)}</div> : <Empty description="没有匹配的产品资料" />}
    <Drawer title={selected?.name || '产品说明'} open={Boolean(selected)} onClose={() => setSelected(null)} width={680}>
      {selected && <div className="spotlight-detail">
        {selected.image && <img className="spotlight-detail-image" src={selected.image} alt={selected.name} />}
        <Space wrap><Tag color="blue">{selected.category}</Tag><Tag color="orange">产品资料快照</Tag><Text type="secondary">事实基准日：{selected.checked_at || '未标注'}</Text></Space>
        <Title level={4}>产品介绍</Title><Paragraph>{selected.positioning || '资料中暂无一句话定位，请查看下方官方产品事实。'}</Paragraph>
        <Title level={4}>适合关注这些任务的人群</Title>
        {selected.suitable_tasks.length ? <List size="small" dataSource={selected.suitable_tasks} renderItem={(task) => <List.Item>{task}</List.Item>} /> : <Paragraph type="secondary">当前知识卡未提供结构化适用任务，请结合客户的软件、预算及设备条件进一步确认。</Paragraph>}
        <Space wrap className="spotlight-source-links">
          <Button type="primary" href={selected.vmall_search_url} target="_blank" rel="noreferrer">前往 VMall 查看在售、价格与活动</Button>
          {selected.source_url && <Button href={selected.source_url} target="_blank" rel="noreferrer">华为产品规格页</Button>}
        </Space>
        <Divider/><Title level={4}>产品事实</Title><div className="spotlight-facts"><MarkdownContent>{selected.detail}</MarkdownContent></div>
        <Text type="secondary">知识库来源：{selected.source_path}</Text>
      </div>}
    </Drawer>
  </section>;
}

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [serviceStatus, setServiceStatus] = useState('连接中');
  const [workspace, setWorkspace] = useState('marketing');
  const [session, setSession] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/health').then((response) => {
      setServiceStatus(response.ok ? '服务已连接' : '服务不可用');
    }).catch(() => setServiceStatus('服务不可用'));
  }, []);

  return <Layout className={`app-shell studio-shell ${collapsed ? 'sidebar-collapsed' : ''} workspace-${workspace}`}>
    {contextHolder}
    <aside className="studio-sidebar"><a className="studio-brand" href="/" aria-label="PC Studio 首页"><div className="studio-logo"><Layers size={21} /></div><div>PC Studio<span>华为 PC · 增长工作台</span></div></a><StudioButton variant="outline" className="new-session" onClick={() => { setSession((n) => n+1); setWorkspace('marketing'); }}><Plus size={17} /> 新建创作<span>＋</span></StudioButton><div className="nav-caption">工作空间</div><nav><button className={workspace === 'marketing' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('marketing')}><PenLine size={17} /> 内容创作<span>01</span></button><button className={workspace === 'customer' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('customer')}><MessagesSquare size={17} /> 客户成交助手<span>02</span></button><button className={workspace === 'tickets' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('tickets')}><FolderOpenOutlined /> 客户工单<span>03</span></button><button className={workspace === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('dashboard')}><DashboardOutlined /> 经营看板<span>04</span></button><button className={workspace === 'spotlight' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('spotlight')}><Sparkles size={16} /> 新品速递<span>05</span></button><button className={workspace === 'knowledge' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('knowledge')}><BookOpen size={17} /> 产品知识库<span>06</span></button></nav><div className="sidebar-note"><span className="note-symbol">✳</span><h4>灵感有据，表达有度。</h4><p>从产品事实出发，<br />让每一次沟通更有价值。</p></div><div className="sidebar-bottom"><button className="nav-item" onClick={() => messageApi.info('先填写创作设定，再点击开始创作；生成后可在对话框中提出修改要求。')}><CircleHelp size={17} /> 使用帮助</button><DropdownMenu.Root><DropdownMenu.Trigger className="profile-trigger"><div className="profile-avatar">S</div><div>Studio 工作空间<span>内容运营与门店团队</span></div><ChevronDown size={14}/></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="profile-menu" sideOffset={8}><DropdownMenu.Label>当前工作空间</DropdownMenu.Label><DropdownMenu.Item onSelect={() => messageApi.info('当前使用本地工作空间')}><Check size={14}/> 本地团队空间</DropdownMenu.Item><DropdownMenu.Separator/><DropdownMenu.Item onSelect={() => setWorkspace('knowledge')}><BookOpen size={14}/> 查看产品知识库</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></aside>
    <div className="studio-main"><header className="studio-topbar"><div><StudioButton variant="ghost" size="icon" aria-label="切换侧栏" onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={18}/></StudioButton><span className="breadcrumb-root">工作空间</span><span className="breadcrumb-slash">/</span><span>{{ marketing: '内容创作', customer: '客户成交助手', tickets: '客户工单', dashboard: '经营看板', spotlight: '新品速递', knowledge: '产品知识库' }[workspace]}</span></div><div className="topbar-right"><span className={`service-indicator ${serviceStatus === '服务已连接' ? 'connected' : ''}`}><i/>{serviceStatus}</span><span className="workspace-badge">PC STUDIO</span></div></header>
    <Content className={`page-content ${workspace === 'knowledge' ? 'knowledge-page-content' : ''}`}>{workspace === 'knowledge' ? <KnowledgeBrowser key="knowledge" messageApi={messageApi}/> : <><div className="studio-heading"><div><div className="overline">{workspace === 'marketing' ? 'CONTENT STUDIO' : workspace === 'customer' ? 'CUSTOMER ASSISTANT' : workspace === 'tickets' ? 'CUSTOMER TICKETS' : 'SALES DASHBOARD'}</div><h1>{workspace === 'marketing' ? '让好产品，有好故事。' : workspace === 'customer' ? '让每次沟通，更进一步。' : workspace === 'tickets' ? '把跟进变成可追踪的工单。' : '用数据看见成交进展。'}</h1><p>{workspace === 'marketing' ? '从一个真实场景出发，把产品价值写进生活。' : workspace === 'customer' ? '梳理客户需求，准备有依据的讲解与跟进。' : workspace === 'tickets' ? '记录客户、安排跟进、沉淀成交结果。' : '查看工单状态、跟进漏斗和产品成交表现。'}</p></div><button className="knowledge-pill" onClick={() => setWorkspace('knowledge')}><span className="knowledge-icon"><BookOpen size={17}/></span><div>产品知识库<span>浏览产品资料与场景依据</span></div><ArrowUpRight size={16}/></button></div>
      {workspace === 'marketing' ? null : workspace === 'customer' ? <CustomerAssistWorkbench messageApi={messageApi}/> : workspace === 'tickets' ? <TicketWorkbench messageApi={messageApi}/> : workspace === 'spotlight' ? <ProductSpotlight messageApi={messageApi}/> : <DashboardWorkbench messageApi={messageApi}/>}</>}
      <div hidden={workspace !== 'marketing'}><MarketingWorkbench key={session} messageApi={messageApi}/></div>
      <footer className="workspace-footer"><span>PC Studio · 每一份灵感，都值得认真表达。</span><span>AI 辅助创作，发布前请人工审核</span></footer></Content></div>
  </Layout>;
}

export default App;
