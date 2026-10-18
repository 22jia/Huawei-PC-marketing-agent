import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive, ComposerPrimitive } from '@assistant-ui/react';
import { ArrowUp, Sparkles, Square, UserRound } from 'lucide-react';
import { Button } from './ui/button';
import { MarkdownContent } from './MarkdownContent';

function ArticleText({ text }) { return <MarkdownContent allowImages>{text}</MarkdownContent>; }

function UserMessage() {
  return <MessagePrimitive.Root className="conversation-message user-message"><div className="message-avatar"><UserRound size={15} /></div><div className="message-copy"><span className="message-byline">你</span><MessagePrimitive.Content /></div></MessagePrimitive.Root>;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="conversation-message assistant-message"><div className="message-avatar assistant-avatar"><Sparkles size={15} /></div><div className="message-copy"><span className="message-byline">Studio 助手</span><MessagePrimitive.Content components={{ Text: ArticleText }} /></div></MessagePrimitive.Root>;
}

export function CreativeThread({ adapter, children }) {
  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children(runtime)}<ThreadPrimitive.Root className="creative-thread"><ThreadPrimitive.Viewport className="thread-viewport"><ThreadPrimitive.Empty><div className="creative-empty"><div className="empty-orbit"><Sparkles size={27} strokeWidth={1.4} /></div><span className="overline">YOUR NEXT GOOD IDEA</span><h2>一个想法，<br />一篇好内容。</h2><p>把场景和灵感交给我。<br />让产品信息成为有温度的表达。</p><div className="empty-capabilities"><span>场景化创作</span><span>平台适配</span><span>来源可追溯</span></div></div></ThreadPrimitive.Empty><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></ThreadPrimitive.Viewport><ComposerPrimitive.Root className="thread-composer"><ComposerPrimitive.Input className="composer-input" placeholder="输入创作想法，或继续提出修改要求…" aria-label="创作要求" /><div className="composer-bottom"><span><Sparkles size={12} /> 与你的创作助手聊聊</span><ThreadPrimitive.If running={false}><ComposerPrimitive.Send asChild><Button size="icon" aria-label="发送创作要求"><ArrowUp size={18} /></Button></ComposerPrimitive.Send></ThreadPrimitive.If><ThreadPrimitive.If running><ComposerPrimitive.Cancel asChild><Button size="icon" aria-label="停止生成"><Square size={14} /></Button></ComposerPrimitive.Cancel></ThreadPrimitive.If></div></ComposerPrimitive.Root><p className="composer-note">AI 辅助创作 · 产品参数与发布内容请核对来源</p></ThreadPrimitive.Root></AssistantRuntimeProvider>;
}
