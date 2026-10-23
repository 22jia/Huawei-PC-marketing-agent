export function customerPresentation(result) {
  if (result?.result_type !== 'customer_assist' || result.status !== 'success' || !result.solution) return undefined;
  return Object.fromEntries(['result_type', 'status', 'customer', 'solution', 'sales_script', 'objection_responses', 'follow_up_plan', 'guardrails', 'awaiting_ticket_consent'].map(key => [key, result[key]]));
}

export function restoreChatMessages(session) {
  const messages = session?.messages || [];
  const fallback = customerPresentation(session?.result);
  // Older sessions only stored the latest structured result. Match its exact
  // response so it cannot be attached to an unrelated assistant turn.
  const fallbackIndex = messages.findLastIndex(message => message.role === 'assistant' && message.content?.map(part => part.text || '').join('\n') === session.result?.reply);
  return messages.map((message, index) => ({
    id: message.id, role: message.role, content: message.content,
    metadata: message.metadata || (fallback && index === fallbackIndex ? { custom: { studio_customer: fallback } } : undefined),
  }));
}
