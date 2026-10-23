import { RunLogs } from './components/RunLogs';
import { createStudioAdapter } from './lib/studioAdapter.mjs';
import { restoreChatMessages } from './lib/customerPresentation.mjs';
import { sessionRequest, createStudioSession } from './lib/sessionApi.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, PanelLeftClose, BookOpen, MessagesSquare, PenLine, ArrowUpRight, Plus, ChevronDown, Check, Settings2, Layers, ChevronRight, ArrowLeft, FolderOpen, ChartNoAxesCombined } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button as StudioButton } from './components/ui/button';
import { CreativeThread } from './components/CreativeThread';
import { MarkdownContent } from './components/MarkdownContent';
import { KnowledgeNavigationContext } from './lib/knowledgeNavigation';
import { creativeArticle, creativeReport } from './lib/creativeArticle';
import { ArticleDeliveryTools } from './components/ArticleDeliveryTools';
import { ModelRunStatus } from './components/ModelRunStatus';
import { formatGenerationError } from './lib/generationError';
import { StorePricePlanner } from './components/StorePricePlanner';
import { ProductRecommendations } from './components/ProductRecommendations';
import {
  Alert, Badge, Breadcrumb, Button, Card, Checkbox, Col, Collapse, Descriptions, Divider, Drawer, Empty, Form,
  Input, Layout, List, Radio, Row, Select, Space, Statistic, Steps, Tabs, Tag,
  Timeline, Typography, message, Table, Modal, Progress,
} from 'antd';
import {
  BulbOutlined, CheckCircleOutlined, CopyOutlined, CustomerServiceOutlined,
  FileSearchOutlined, FileTextOutlined, PlayCircleOutlined, ReloadOutlined,
  SafetyCertificateOutlined, SendOutlined, FolderOutlined, FileOutlined,
  PlusOutlined, EyeOutlined,
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

function MarketingWorkbench({ messageApi, sessionId, sessionData, onSessionUpdated }) {
  const taskRef = useRef(sessionData?.task || {});
  const [result, setResult] = useState(sessionData?.result?.content ? sessionData.result : null);
  const [runResult, setRunResult] = useState(null);
  const artifactRef = useRef(sessionData?.artifact || null);
  const sessionUpdatedRef = useRef(onSessionUpdated);
  sessionUpdatedRef.current = onSessionUpdated;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  // A background job is authoritative while it is queued or running. The
  // session result may still contain an older clarification and must not show
  // its options again when the user switches back to this conversation.
  const sessionJob = sessionData?.generation_job || null;
  const sessionJobActive = ['queued', 'running'].includes(sessionJob?.status);
  const [quickReplies, setQuickReplies] = useState(sessionJobActive ? [] : (sessionData?.result?.quick_replies || sessionData?.result?.task?.questions?.[0]?.options || []));
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // Keep the adapter identity stable for the lifetime of this workbench. The
  // local assistant runtime treats a new adapter as a new run context and can
  // abort an in-flight fetch when state updates (busy/result) cause a render.
  const adapter = useMemo(() => createStudioAdapter({
    sessionId: () => sessionId,
    getTask: () => taskRef.current,
    getArtifact: () => artifactRef.current,
    formatReport: creativeReport,
    formatError: formatGenerationError,
    onStart() {
      setQuickReplies([]);
      setBusy(true);
      setRunResult(null);
      setProgress({ label: '正在连接创作服务', startedAt: Date.now(), steps: [] });
    },
    onProgress(current) {
      setProgress(previous => {
        const steps = [...(previous?.steps || [])];
        if (current.stage !== 'accepted') {
          const pending = steps.findLastIndex(step => step.stage === current.stage && step.status === 'started');
          if (current.status !== 'started' && pending >= 0) steps[pending] = current;
          else steps.push(current);
        }
        return { ...previous, ...current, label: `${current.label}${current.status === 'success' ? '完成' : current.status === 'failed' ? '未通过' : '中…'}`, steps };
      });
    },
    onResult(data) {
      sessionUpdatedRef.current?.();
      setQuickReplies(data.status === 'needs_clarification' ? data.task?.questions?.[0]?.options || [] : data.quick_replies || []);
      setProgress(previous => ({ ...previous, request_id: data.request_id, label: ['needs_confirmation', 'needs_clarification'].includes(data.status) ? '等待你的补充或决定' : '处理完成', finishedAt: Date.now() }));
      if (data.task) taskRef.current = data.task;
      setRunResult(data);
      if (data.content) { artifactRef.current = data.content; setResult(data); }
    },
    onError(error, cancelled) {
      setQuickReplies([]);
      setProgress(previous => ({ ...previous, label: cancelled ? '已停止本次任务' : '本次创作未完成，请查看运行日志', finishedAt: Date.now() }));
      if (!cancelled) setRunResult({ status: 'error', code: error.code, message: error.message, request_id: error.request_id });
    },
    onFinish() { setBusy(false); },
  }), [sessionId]);
  const [backgroundJob, setBackgroundJob] = useState(sessionJob);
  useEffect(() => {
    if (busy) return;
    let disposed = false;
    let timer;
    async function poll() {
      try {
        const response = await fetch(`/api/v1/sessions/${sessionId}`);
        if (!response.ok) throw new Error('会话状态暂时不可用');
        const detail = await response.json();
        if (disposed) return;
        setBackgroundJob(detail.generation_job || null);
        if (detail.last_request_id !== sessionData?.last_request_id) {
          sessionUpdatedRef.current?.();
          return;
        }
      } catch { /* Reconnect on the next poll without stopping the task. */ }
      if (!disposed) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId, busy, sessionData?.last_request_id]);
  const backgroundActive = !busy && ['queued', 'running'].includes(backgroundJob?.status);
  async function copy() {
    try { await navigator.clipboard.writeText(creativeArticle(result)); messageApi.success('图文 Markdown 已复制'); } catch { messageApi.error('复制失败，请手动选择文案复制'); }
  }
  const initialMessages = restoreChatMessages(sessionData);
  if (sessionJobActive && sessionJob.user_text) {
    const lastUser = initialMessages.findLast(message => message.role === 'user');
    if (!lastUser || lastUser.content?.map(part => part.text || '').join('\n') !== sessionJob.user_text) {
      initialMessages.push({
        id: `job-${sessionJob.request_id}-user`,
        role: 'user',
        content: [{ type: 'text', text: sessionJob.user_text }],
      });
    }
    initialMessages.push({
      id: `job-${sessionJob.request_id}-progress`,
      role: 'assistant',
      content: [{ type: 'text', text: `**${sessionJob.progress?.label || '任务已排队，等待执行'}**\n\n后台任务正在继续，已等待 ${Math.floor((sessionJob.elapsed_ms || 0) / 1000)} 秒。` }],
      metadata: { custom: { studio_progress: true } },
    });
  }
  if (sessionData?.result?.content || sessionData?.result?.result_type === 'image_generation') {
    const lastAssistant = initialMessages.findLast(message => message.role === 'assistant');
    if (lastAssistant) lastAssistant.content = [{ type: 'text', text: creativeReport(sessionData.result) }];
  }
  return <div className="studio-workbench conversation-workbench"><CreativeThread adapter={adapter} initialMessages={initialMessages} quickReplies={quickReplies} onQuickReply={() => setQuickReplies([])}>{(runtime) => <>
    <div className="conversation-toolbar"><div><span className="live-dot" /> 助手对话 <span className="toolbar-subtitle">/ 内容与客户支持</span></div><Space wrap><RunLogs requestId={runResult?.request_id || progress?.request_id} /><ArticleDeliveryTools result={result} />{result?.content && <StudioButton variant="ghost" onClick={copy}><CopyOutlined /> 复制</StudioButton>}<StudioButton variant="outline" onClick={() => setEvidenceOpen(true)}><BookOpen size={14} /> 来源与核验 {result?.facts?.length || 0}</StudioButton>{backgroundActive && <Button size="small" onClick={async () => { await fetch(`/api/v1/generation-jobs/${backgroundJob.request_id}/cancel`, { method: 'POST' }); }}>停止任务</Button>}</Space></div>
    {!busy && backgroundJob?.result?.code === 'RUN_INTERRUPTED' && <Alert type="warning" showIcon message={backgroundJob.result.message} />}
    {result?.warnings?.some(warning => /图片生成未完成|图片生成子 Agent/.test(warning)) && <Alert type="warning" showIcon message="本次 AI 生图未完成，当前使用官方原图" description={result.warnings.filter(warning => /图片生成未完成|图片生成子 Agent/.test(warning)).join('；')} />}
  </>}</CreativeThread><Drawer title="来源与核验" open={evidenceOpen} onClose={() => setEvidenceOpen(false)} width={480}><p>核对产品依据后，再发布你的内容。</p>{result ? <><Tag color={result.validation?.status === 'pass' ? 'success' : 'warning'}>{result.validation?.status === 'pass' ? '基础规则检查通过' : '需要人工核对'}</Tag><List dataSource={result.facts || []} locale={{emptyText:'当前没有可引用的产品来源'}} renderItem={(item) => <List.Item><div><Text strong>{item.title}</Text><p>{item.source_path}</p></div></List.Item>} />{result.warnings?.length > 0 && <Alert type="warning" showIcon message="发布前确认" description={result.warnings.join('；')} />}<p className="muted">{result.generation_mode === 'llm' ? '本次由模型生成' : '尚未生成，等待补充信息'}</p></> : <Empty description="生成文案后，来源会显示在这里" />}</Drawer></div>;
}

function CustomerAssistWorkbench({ messageApi }) {
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [assistError, setAssistError] = useState('');
  const [pricePlanner, setPricePlanner] = useState(null);

  function openPricePlanner(solution = result?.solution?.price_solution, tier) {
    setPricePlanner({ solution, tier: tier || solution?.budget_fit || solution?.tiers?.[0],
      model: solution?.model || result?.solution?.model || form.getFieldValue('model'), budget: form.getFieldValue('budget') });
  }

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
    {!result.solution?.candidate_products?.length && <Alert
      type={result.solution?.status === 'insufficient_evidence' ? 'warning' : 'info'}
      showIcon
      message={result.solution?.status === 'needs_model_clarification'
        ? '本地知识库已找到资料，请先确认产品版本'
        : result.solution?.status === 'needs_staff_confirmation'
          ? '本地知识库已找到产品资料，需店员核对'
          : '暂不能形成具体型号推荐'}
      description={result.solution?.status === 'needs_model_clarification' ? '请确认系统版本。' : undefined}
    />}
    {result.solution?.candidate_models?.length > 0 && <div className="question-block"><Text strong>请选择客户关注的版本</Text><List size="small" dataSource={result.solution.candidate_models} renderItem={(item) => <List.Item actions={[<Button key="select" type="primary" disabled={loading} onClick={() => selectModel(item)}>选择并检索</Button>]}><Space><FileSearchOutlined /><Text>{item}</Text></Space></List.Item>} /></div>}
    {result.solution?.candidate_products?.length > 0 && <ProductRecommendations products={result.solution.candidate_products} segment={result.customer?.segment} alternatives={result.solution.recommendation_stage === 'budget_alternatives'} loading={loading} onSelect={(model, solution, tier) => { form.setFieldValue('model', model); openPricePlanner(solution, tier); }} onPrice={openPricePlanner} />}
    {result.clarification?.questions?.length > 0 && <div className="question-block"><Text strong>下一步沟通</Text><List size="small" dataSource={result.clarification.questions.slice(0, 2)} renderItem={(question) => <List.Item><FileSearchOutlined /> {question}</List.Item>} /></div>}
    {result.objection_responses?.length > 0 && <div className="question-block"><Text strong>客户关切与回应</Text><List size="small" dataSource={result.objection_responses.slice(0, 2)} renderItem={(item) => <List.Item><div><Text strong>{item.objection}</Text><Paragraph className="list-paragraph">{item.response}</Paragraph></div></List.Item>} /></div>}
    {result.solution?.price_solution?.status === 'available' && <section className="price-solution"><div className="price-solution-heading"><div><Title level={4}>价格参考</Title><Text type="secondary">{result.solution.price_solution.model} · VMall 参考价 · 门店价待核</Text></div><Button onClick={() => openPricePlanner()}>查门店优惠</Button></div>{result.solution.price_solution.budget_status === 'over_budget' && <Alert type="warning" showIcon message={`意向型号最低参考价 ¥${result.solution.price_solution.minimum_price}，超预算 ¥${result.solution.price_solution.budget_gap}`} description={result.solution.price_solution.budget_fit ? `同型号预算内配置：${result.solution.price_solution.budget_fit.configuration}，参考价 ¥${result.solution.price_solution.budget_fit.price}` : (result.solution?.candidate_products?.length ? '暂无同型号预算内配置，可比较预算内替代。' : '暂无已知的预算内替代，可先核实本店报价与可用优惠。')} />}{result.solution.price_solution.budget_status !== 'over_budget' && <Row gutter={[12, 12]}>{result.solution.price_solution.tiers.map((tier) => { const offerSummary = typeof tier.offer_summary === 'string' && tier.offer_summary.trim() && tier.offer_summary !== '未记录可确认的直降或赠品' ? tier.offer_summary.trim() : ''; return <Col xs={24} sm={12} key={`${tier.configuration}-${tier.price}`}><Card size="small" className={tier.recommended ? 'price-tier recommended' : 'price-tier'} title={<Space>{tier.label}{tier.recommended && <Tag color="green">预算内最高档</Tag>}</Space>}><Statistic value={tier.price} prefix="¥" precision={0} /><Paragraph className="price-tier-config">{tier.configuration}</Paragraph><Paragraph className="price-tier-conditions">{offerSummary ? `线上优惠参考：${offerSummary}。` : '线上优惠待核实'}<Button type="link" size="small" onClick={() => openPricePlanner(result.solution.price_solution, tier)}>核实门店权益</Button></Paragraph></Card></Col>; })}</Row>}<Alert className="price-solution-note" type="info" showIcon message="官网参考价，门店成交价与库存待确认" description={<span><a href={result.solution.price_solution.tiers[0]?.source_url} target="_blank" rel="noreferrer">查看官网</a></span>} /></section>}
    {result.solution?.price_solution?.status === 'needs_model_clarification' && <Alert className="question-block" type="warning" showIcon message="暂不能给出价格梯度" description={result.solution.price_solution.message} />}
    {result.solution?.price_solution?.status === 'unavailable' && <Alert className="question-block" type="info" showIcon message="暂无可用参考价，请确认该配置的门店报价" />}
    {result.solution?.model && <Button className="question-block" onClick={() => openPricePlanner()}>制定门店价格方案 · 对比线上线下</Button>}
    <Collapse className="staff-evidence" items={[{ key: 'evidence', label: <Space><SafetyCertificateOutlined />店员核验来源</Space>, children: <List dataSource={result.solution?.evidence || []} locale={{ emptyText: '暂无核验来源' }} renderItem={(item) => <List.Item><Text>{item.title}</Text>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">查看来源</a>}</List.Item>} /> }]} />
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
          <Paragraph type="secondary">载入演示需求（仅填表，点击生成后运行）</Paragraph>
          <Space wrap style={{ marginBottom: 16 }}>
            {[
              { label: '学生学习', budget: '7000', description: '大学生，常在图书馆用Word写论文，担心电脑太重；已有华为手机，希望传文件方便。尚无意向型号。' },
              { label: '职场办公', budget: '9000', description: '职场人士，经常出差和通勤，主要使用Excel处理表格、修改文档和会议演示，希望轻便，连接投影仪方便。尚无意向型号。' },
            ].map((example) => <Button key={example.label} disabled={loading} onClick={() => {
              form.setFieldsValue({ customer_description: example.description, budget: example.budget, model: '', customer_name: '', assignee: '' });
              setResult(null); setTicket(null); setAssistError(''); setPricePlanner(null);
            }}>{example.label}</Button>)}
          </Space>
          <Form.Item name="customer_description" label="客户描述" extra="记录用途、顾虑、已有设备和沟通阶段；请不要输入手机号等隐私信息。" rules={[{ required: true, message: '请填写客户描述' }]}><Input.TextArea rows={6} placeholder="例如：客户常在图书馆写论文，担心电脑太重……" /></Form.Item>
          <Form.Item name="model" label="意向型号（可选）"><Input placeholder="未确定时留空，先按用途和预算推荐" /></Form.Item>
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
      <Card title={<Space><FileSearchOutlined />客户成交辅助</Space>} className="panel-card result-card" extra={<Button icon={<PlayCircleOutlined />} onClick={() => setPricePlanner({ demo: true, model: form.getFieldValue('model'), budget: form.getFieldValue('budget') })}>演示门店优惠方案</Button>}>
        {assistError && <Alert type="error" showIcon message="本次模型处理未完成" description={assistError} />}
        {!result && !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入客户沟通情况，生成洞察、讲解与跟进草稿" className="empty-state" />}
        {loading && <Alert type="info" showIcon message="正在分析需求、检索资料并生成方案"  />}
        {result?.status === 'needs_clarification' && <Alert type="warning" showIcon message="需要补充客户描述" description={(result.questions || []).join('；')} />}
        {result?.customer && <>
          <Collapse size="small" items={[{ key: 'run', label: '运行记录', children: <ModelRunStatus result={result} /> }]} />
          {result.guardrails?.retrieval_warning && <Collapse className="result-alert" items={[{ key: 'verification', label: '店员核验提醒', children: result.guardrails.retrieval_warning }]} />}
          <div className="result-meta"><Tag color={result.solution?.status === 'needs_model_clarification' ? 'processing' : result.status === 'success' ? 'success' : 'warning'}>{result.solution?.status === 'needs_model_clarification' ? '等待确认产品版本' : result.status === 'success' ? '辅助方案已生成' : '部分结果，需人工核对'}</Tag><Text type="secondary">{result.request_id}</Text></div>
          <Title level={3}>客户洞察</Title>
          <Paragraph>{result.customer.summary}</Paragraph>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="客户类型">{result.customer.audience}</Descriptions.Item>
            <Descriptions.Item label="决策阶段">{result.customer.buying_stage}</Descriptions.Item>
            <Descriptions.Item label="核心需求"><Space wrap>{result.customer.needs?.map((item) => <Tag color="blue" key={item}>{item}</Tag>)}</Space></Descriptions.Item>
            <Descriptions.Item label="当前顾虑"><Space wrap>{result.customer.concerns?.map((item) => <Tag color="orange" key={item}>{item}</Tag>)}</Space></Descriptions.Item>
          </Descriptions>
          <Tabs className="customer-result-tabs" items={[{ key: 'solution', label: '推荐方案', children: solutionTab }, { key: 'script', label: '讲解与异议', children: scriptTab }, { key: 'follow-up', label: '1/3/7 天跟进', children: followUpTab }]} />
          <Divider /><Space><Button type="primary" icon={<PlusOutlined />} onClick={createTicket} disabled={Boolean(ticket)}> {ticket ? `已创建工单 ${ticket.id.slice(-6)}` : '创建客户跟进工单'} </Button><Text type="secondary">创建后可在工单列表中记录每次跟进和成交结果</Text></Space>
          <Badge status="processing" text="所有推荐、价格与跟进内容均须店员审核，不会自动发送" />
        </>}
        {pricePlanner && <StorePricePlanner context={pricePlanner} onClose={() => setPricePlanner(null)} />}
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

function KnowledgeBrowser({ messageApi, entryPath, onReturnToChat }) {
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
  useEffect(() => {
    if (!entryPath) { loadFolder(''); return; }
    let active = true;
    setDetail(null); setDetailLoading(true);
    postJson('/api/v1/knowledge/item', { media_id: `local:${entryPath}` })
      .then(data => { if (active) setDetail(data.item); })
      .catch(error => { if (active) messageApi.error(error.message || '引用来源读取失败'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [entryPath]);
  async function openItem(item) {
    if (item.kind === 'folder') return loadFolder(item.id);
    setDetailLoading(true);
    try { const data = await postJson('/api/v1/knowledge/item', { media_id: item.id, title: item.title, media_type: item.media_type }); setDetail(data.item); }
    catch (error) { messageApi.error(error.message || '知识条目读取失败'); }
    finally { setDetailLoading(false); }
  }
  return <section className="knowledge-workspace">
    {entryPath && <Button icon={<ArrowLeft size={15}/>} onClick={onReturnToChat}>返回对话</Button>}
    <div className="knowledge-page-heading"><div className="panel-eyebrow"><BookOpen size={15}/> 产品知识库 <span>KNOWLEDGE BASE</span></div><h2>华为 PC 全板块深度知识库 v7</h2><p>浏览产品事实、使用场景与服务资料；涉及实时价格和库存时请以华为商城页面为准。</p></div>
    {detail ? <div className="knowledge-reader"><Button icon={<ArrowLeft size={15}/>} onClick={() => loadFolder('')}>返回目录</Button><div className="knowledge-reader-title"><FileTextOutlined/><Title level={3}>{detail.title}</Title></div><div className="knowledge-reader-content"><MarkdownContent>{detail.content}</MarkdownContent></div></div> : <><Breadcrumb items={[{ title: '知识库' }, ...path.slice(1).map((item) => ({ title: item.name }))]} /><div className="knowledge-directory"><List loading={loading || detailLoading} dataSource={items} locale={{ emptyText: '当前目录为空' }} renderItem={(item) => <List.Item className="knowledge-item" onClick={() => openItem(item)}><List.Item.Meta avatar={item.kind === 'folder' ? <FolderOutlined className="folder-icon" /> : <FileOutlined className="file-icon" />} title={item.title} description={item.kind === 'folder' ? '打开分类' : '查看知识内容'} /><Tag color={item.kind === 'folder' ? 'blue' : 'default'}>{item.kind === 'folder' ? '分类' : '知识条目'}</Tag><ChevronRight size={16} className="knowledge-chevron"/></List.Item>} /></div></>}
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

function SessionJobIndicator({ job, seen }) {
  if (!job) return null;
  if (['running', 'queued'].includes(job.status)) return <span className="session-job-spinner" role="status" aria-label={job.status === 'queued' ? '等待生成' : '正在生成'} title={job.status === 'queued' ? '等待生成' : '正在生成'}/>;
  if (seen || job.status === 'cancelled') return null;
  if (['completed', 'succeeded', 'failed'].includes(job.status)) return <span className={`session-job-dot ${job.status === 'failed' ? 'failed' : ''}`} role="status" aria-label={job.status === 'failed' ? '生成失败，点击查看' : '有新回复'} title={job.status === 'failed' ? '生成失败，点击查看' : '有新回复'}/>;
  return null;
}

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [serviceStatus, setServiceStatus] = useState('连接中');
  const [workspace, setWorkspace] = useState('assistant');
  const [knowledgeEntry, setKnowledgeEntry] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [seenJobs, setSeenJobs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('studio-seen-jobs') || '{}') || {}; } catch { return {}; }
  });
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const sessionFetchVersion = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const job = sessions.find(item => item.id === sessionId)?.generation_job;
    if (workspace !== 'assistant' || !job?.request_id || !['completed', 'succeeded', 'failed', 'cancelled'].includes(job.status)) return;
    setSeenJobs(previous => previous[sessionId] === job.request_id ? previous : { ...previous, [sessionId]: job.request_id });
  }, [sessions, sessionId, workspace]);
  useEffect(() => { localStorage.setItem('studio-seen-jobs', JSON.stringify(seenJobs)); }, [seenJobs]);


  useEffect(() => {
    fetch('/health').then((response) => {
      setServiceStatus(response.ok ? '服务已连接' : '服务不可用');
    }).catch(() => setServiceStatus('服务不可用'));
  }, []);

  async function loadSessions(preferredId) {
    const version = ++sessionFetchVersion.current;
    setSessionLoading(true);
    try {
      const data = await sessionRequest('/api/v1/sessions');
      if (!Array.isArray(data.items)) throw new Error('会话列表格式异常，请重试。');
      let items = data.items;
      if (!items.length) items = [await createStudioSession()];
      const wanted = preferredId || sessionId || localStorage.getItem('studio-session-id');
      const selected = items.some(item => item.id === wanted) ? wanted : items[0].id;
      const detail = await sessionRequest(`/api/v1/sessions/${selected}`);
      if (version !== sessionFetchVersion.current) return;
      if (!detail.id || !Array.isArray(detail.messages)) throw new Error('会话数据格式异常，请重试。');
      setSessions(items); setSessionData(detail); setSessionId(selected); setSessionError('');
      localStorage.setItem('studio-session-id', selected);
    } catch (error) { setSessionError(error.message); }
    finally { setSessionLoading(false); }
  }
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => {
    let disposed = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/v1/sessions');
        const data = await response.json();
        if (!disposed && Array.isArray(data.items)) setSessions(data.items);
      } catch { /* Keep existing conversations during temporary disconnection. */ }
    }, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);

  async function createSession() {
    const version = ++sessionFetchVersion.current;
    try {
      const created = await createStudioSession();
      if (version !== sessionFetchVersion.current) return;
      setSessions(items => [created, ...items]); setSessionData(created); setSessionId(created.id); setSessionError(''); setWorkspace('assistant');
      localStorage.setItem('studio-session-id', created.id);
    } catch (error) { setSessionError(error.message); }
  }
  async function selectSession(id) {
    const version = ++sessionFetchVersion.current;
    try {
      const detail = await sessionRequest(`/api/v1/sessions/${id}`);
      if (version !== sessionFetchVersion.current) return;
      if (!detail.id || !Array.isArray(detail.messages)) throw new Error('会话数据格式异常，请重试。');
      setSessionData(detail); setSessionId(id); setSessionError(''); setWorkspace('assistant');
      localStorage.setItem('studio-session-id', id);
    } catch (error) { setSessionError(error.message); }
  }
  async function deleteSession(id) {
    try {
      await sessionRequest(`/api/v1/sessions/${id}`, { method: 'DELETE' });
      const remaining = sessions.filter(item => item.id !== id); setSessions(remaining);
      if (id === sessionId) { setSessionId(null); setSessionData(null); await loadSessions(remaining[0]?.id); }
    } catch (error) { setSessionError(error.message); }
  }

  return <KnowledgeNavigationContext.Provider value={path => { setKnowledgeEntry(path); setWorkspace('knowledge'); }}><Layout className={`app-shell studio-shell ${collapsed ? 'sidebar-collapsed' : ''} workspace-${workspace}`}>
    {contextHolder}
    <aside className="studio-sidebar"><a className="studio-brand" href="/" aria-label="PC Studio 首页"><div className="studio-logo"><Layers size={21} /></div><div>PC Studio<span>华为 PC · 增长工作台</span></div></a><StudioButton variant="outline" className="new-session" onClick={createSession}><Plus size={17} /> 新建对话<span>＋</span></StudioButton><div className="nav-caption">历史对话</div><div className="session-list">{sessions.slice(0, 8).map(item => <div className={`session-item ${item.id === sessionId ? 'active' : ''}`} key={item.id}><button onClick={() => selectSession(item.id)}><span className="session-title-text">{item.title || '新对话'}</span><SessionJobIndicator job={item.generation_job} seen={seenJobs[item.id] === item.generation_job?.request_id}/></button><button className="session-delete" onClick={() => deleteSession(item.id)} aria-label="删除会话">×</button></div>)}</div><div className="nav-caption">工作空间</div><nav><button className={workspace === 'tickets' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('tickets')}><FolderOpen size={16} /> 客户工单</button><button className={workspace === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('dashboard')}><ChartNoAxesCombined size={16} /> 经营看板</button><button className={workspace === 'spotlight' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspace('spotlight')}><Sparkles size={16} /> 新品速递</button><button className={workspace === 'knowledge' ? 'nav-item active' : 'nav-item'} onClick={() => { setKnowledgeEntry(null); setWorkspace('knowledge'); }}><BookOpen size={17} /> 产品知识库</button></nav><div className="sidebar-note"><span className="note-symbol">✳</span><h4>灵感有据，表达有度。</h4><p>从产品事实出发，<br />让每一次沟通更有价值。</p></div><div className="sidebar-bottom"><DropdownMenu.Root><DropdownMenu.Trigger className="profile-trigger"><div className="profile-avatar">S</div><div>Studio 工作空间<span>内容运营与门店团队</span></div><ChevronDown size={14}/></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="profile-menu" sideOffset={8}><DropdownMenu.Label>当前工作空间</DropdownMenu.Label><DropdownMenu.Item onSelect={() => messageApi.info('当前使用本地工作空间')}><Check size={14}/> 本地团队空间</DropdownMenu.Item><DropdownMenu.Separator/><DropdownMenu.Item onSelect={() => { setKnowledgeEntry(null); setWorkspace('knowledge'); }}><BookOpen size={14}/> 查看产品知识库</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></aside>
    <div className="studio-main"><header className="studio-topbar"><div><StudioButton variant="ghost" size="icon" aria-label="切换侧栏" onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={18}/></StudioButton><span className="breadcrumb-root">工作空间</span><span className="breadcrumb-slash">/</span><span>{{ assistant: '智能助手', tickets: '客户工单', dashboard: '经营看板', spotlight: '新品速递', knowledge: '产品知识库' }[workspace]}</span></div><div className="topbar-right"><span className={`service-indicator ${serviceStatus === '服务已连接' ? 'connected' : ''}`}><i/>{serviceStatus}</span><span className="workspace-badge">PC STUDIO</span></div></header>
    <Content className={`page-content ${workspace === 'knowledge' ? 'knowledge-page-content' : ''}`}>{workspace === 'knowledge' ? <KnowledgeBrowser key={knowledgeEntry || "knowledge"} messageApi={messageApi} entryPath={knowledgeEntry} onReturnToChat={() => setWorkspace("assistant")}/> : <><div className="studio-heading"><div><div className="overline">{workspace === 'assistant' ? 'STUDIO ASSISTANT' : workspace === 'tickets' ? 'CUSTOMER TICKETS' : 'SALES DASHBOARD'}</div><h1>{workspace === 'assistant' ? '说说你现在要处理的事。' : workspace === 'tickets' ? '把跟进变成可追踪的工单。' : '用数据看见成交进展。'}</h1><p>{workspace === 'assistant' ? '整理客户需求、准备成交方案，或策划一篇平台内容。' : workspace === 'tickets' ? '记录客户、安排跟进、沉淀成交结果。' : '查看工单状态、跟进漏斗和产品成交表现。'}</p></div>{workspace !== 'assistant' && <button className="knowledge-pill" onClick={() => { setKnowledgeEntry(null); setWorkspace('knowledge'); }}><span className="knowledge-icon"><BookOpen size={17}/></span><div>产品知识库<span>浏览产品资料与场景依据</span></div><ArrowUpRight size={16}/></button>}</div>
      {workspace === 'assistant' ? null : workspace === 'tickets' ? <TicketWorkbench messageApi={messageApi}/> : workspace === 'spotlight' ? <ProductSpotlight messageApi={messageApi}/> : <DashboardWorkbench messageApi={messageApi}/>}</>}
      <div hidden={workspace !== 'assistant'}>
        {sessionError && <Alert type="error" showIcon message="对话加载失败" description={sessionError} action={<Button onClick={() => loadSessions()} loading={sessionLoading}>重新连接</Button>} />}
        {!sessionId && sessionLoading && <div className="session-loading" role="status">正在加载对话…</div>}
        {sessionId && sessionData?.id === sessionId && <MarketingWorkbench key={`${sessionId}-${sessionData.last_request_id || 'new'}`} sessionId={sessionId} sessionData={sessionData} onSessionUpdated={() => loadSessions(sessionId)} messageApi={messageApi}/>}
      </div>
      <footer className="workspace-footer"><span>PC Studio · 每一份灵感，都值得认真表达。</span><span>AI 辅助创作，发布前请人工审核</span></footer></Content></div>
  </Layout></KnowledgeNavigationContext.Provider>;
}

export default App;
