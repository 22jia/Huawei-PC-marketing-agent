function customerPresentation(result) {
  if (result?.result_type !== 'customer_assist' || result.status !== 'success' || !result.solution) return undefined;
  return Object.fromEntries(['result_type', 'status', 'customer', 'solution', 'sales_script', 'objection_responses', 'follow_up_plan', 'guardrails', 'awaiting_ticket_consent'].map(key => [key, result[key]]));
}
module.exports = { customerPresentation };
