import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive, ComposerPrimitive, useAuiState } from '@assistant-ui/react';
import { CustomerConversationResult } from './CustomerConversationResult';
import { ArrowUp, Sparkles, Square, UserRound } from 'lucide-react';
import { Button } from './ui/button';
import { MarkdownContent } from './MarkdownContent';
import { platformChoiceValue } from '../lib/platformChoice.mjs';

function ArticleText({ text }) {
  return <MarkdownContent allowImages>{text}</MarkdownContent>;
}

function UserMessage() {
  return <MessagePrimitive.Root className="conversation-message user-message"><div className="message-avatar"><UserRound size={15} /></div><div className="message-copy"><span className="message-byline">你</span><MessagePrimitive.Content /></div></MessagePrimitive.Root>;
}

function AssistantMessage() {
  const customer = useAuiState(s => s.message.metadata?.custom?.studio_customer);
  return <MessagePrimitive.Root className="conversation-message assistant-message"><div className="message-avatar assistant-avatar"><Sparkles size={15} /></div><div className="message-copy"><span className="message-byline">Studio 助手</span>{customer?.solution ? <CustomerConversationResult result={customer} /> : <MessagePrimitive.Content components={{ Text: ArticleText }} />}</div></MessagePrimitive.Root>;
}

export function CreativeThread({ adapter, children, initialMessages = [], quickReplies = [], onQuickReply }) {
  const runtime = useLocalRuntime(adapter, { initialMessages });

  function chooseReply(option) {
    runtime.thread.composer.setText('');
    runtime.thread.append({ role: 'user', content: [{ type: 'text', text: platformChoiceValue(option) }], startRun: true });
    onQuickReply?.(option);
  }

  return <AssistantRuntimeProvider runtime={runtime}>
    {children(runtime)}
    <ThreadPrimitive.Root className="creative-thread">
      <ThreadPrimitive.Viewport className="thread-viewport">
        <ThreadPrimitive.Empty>
          <div className="creative-empty">
            <div className="empty-orbit"><Sparkles size={27} strokeWidth={1.4} /></div>
            <span className="overline">STUDIO ASSISTANT</span>
            <h2>一个对话，<br />处理门店工作。</h2>
            <p>描述客户需求或内容想法。<br />助手会判断任务，并逐步追问关键信息。</p>
            <div className="empty-capabilities"><span>客户成交建议</span><span>平台内容创作</span><span>资料有据可查</span></div>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>
      {quickReplies.length > 0 && <div className="thread-quick-replies" aria-label="选择一个回答">
        <span>选择一项，或直接输入你的想法</span>
        <div>{quickReplies.map((option, index) => <Button key={`${option}-${index}`} variant="outline" onClick={() => chooseReply(option)}>{option}</Button>)}</div>
      </div>}
      <ComposerPrimitive.Root className="thread-composer">
        <ComposerPrimitive.Input className="composer-input" placeholder="描述客户需求，或说说想创作什么…" aria-label="输入需求" />
        <div className="composer-bottom">
          <span><Sparkles size={12} /> 与 Studio 助手对话</span>
          <ThreadPrimitive.If running={false}><ComposerPrimitive.Send asChild><Button size="icon" aria-label="发送消息"><ArrowUp size={18} /></Button></ComposerPrimitive.Send></ThreadPrimitive.If>
        <ThreadPrimitive.If running><Button size="icon" aria-label="停止生成" onClick={async () => { await adapter.cancelCurrent?.(); runtime.thread.cancelRun(); }}><Square size={14} /></Button></ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
      <p className="composer-note">产品信息、价格和跟进计划请以实际资料核对</p>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
