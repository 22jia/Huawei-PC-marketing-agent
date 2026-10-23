const PLATFORMS = { xiaohongshu: '小红书', wechat: '公众号', wechat_moments: '朋友圈', douyin: '抖音', weibo: '微博', bilibili: 'B站' };

function titleFor(session, result, latestUser = '') {
  const task = result.task || session.task || {};
  const mode = result.conversation_mode || session.conversation_mode;
  const parts = mode === 'customer'
    ? ['成交辅助', task.model || result.customer_task?.model || '待定型号', task.audience || result.customer?.audience || '待定人群']
    : [PLATFORMS[task.platform] || '待定平台', task.audience || result.customer?.audience || '待定人群', task.model || result.customer_task?.model || '待定型号'];
  if (!result.task && !session.task && !result.customer) return String(latestUser || session.title || '新对话').slice(0, 36);
  return parts.join('-').slice(0, 80);
}

function ticketDecision(session, latestUser, createTicket) {
  const answer = String(latestUser || '').trim();
  if (!session.awaiting_ticket_consent && !session.awaiting_ticket_name) return null;
  if (session.awaiting_ticket_consent) {
    if (/^(暂不|不需要|不用|否|先不|取消)/.test(answer)) return { status: 'success', result_type: 'ticket_decision', reply: '好的，成交方案已保留在本次会话中。', awaiting_ticket_consent: false };
    if (!/^(需要|要|是|好|可以|创建|建工单|帮我建)/.test(answer)) return null;
    return { status: 'needs_clarification', result_type: 'ticket_decision', reply: '请告诉我客户备注名或称呼，方便在工单里识别。', awaiting_ticket_consent: false, awaiting_ticket_name: true };
  }
  if (!answer || /^(取消|暂不|不用)/.test(answer)) return { status: 'success', result_type: 'ticket_decision', reply: '已取消创建工单，成交方案仍保留在本次会话中。', awaiting_ticket_name: false };
  const customerTask = session.customer_task || {};
  const ticket = createTicket({ customer_name: answer.slice(0, 80), customer_description: customerTask.customer_description, model: customerTask.model, follow_up_days: customerTask.follow_up_days, assist_result: session.result, needs_follow_up: true, source: 'studio_conversation' });
  return { status: 'success', result_type: 'ticket_created', reply: `已为${ticket.customer_name}创建跟进工单，可到“客户工单”查看。`, ticket_id: ticket.id, awaiting_ticket_name: false };
}

module.exports = { titleFor, ticketDecision };
