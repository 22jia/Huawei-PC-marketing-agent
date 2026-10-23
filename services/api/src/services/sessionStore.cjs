const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { customerPresentation } = require('./customerPresentation.cjs');

const DATA_DIR = path.resolve(__dirname, '../../../../data/sessions');
const MAX_MESSAGES = 100;
const MAX_TEXT = 20000;
function ensure() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function file(id) { return /^[a-zA-Z0-9_-]+$/.test(id) ? path.join(DATA_DIR, `${id}.json`) : null; }
function id() { return `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; }
function cleanMessage(message) {
  const role = ['user', 'assistant', 'system'].includes(message?.role) ? message.role : 'user';
  const content = Array.isArray(message?.content) ? message.content.map(p => ({ type: 'text', text: String(p?.text || '').slice(0, MAX_TEXT) })) : [{ type: 'text', text: String(message?.content || '').slice(0, MAX_TEXT) }];
  const customer = role === 'assistant' ? message?.metadata?.custom?.studio_customer : null;
  return { id: message?.id || `msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`, role, content, created_at: message?.created_at || new Date().toISOString(), ...(customer?.result_type === 'customer_assist' && customer.solution ? { metadata: { custom: { studio_customer: customer } } } : {}) };
}
function write(session) { ensure(); const target = file(session.id); const temp = `${target}.tmp`; fs.writeFileSync(temp, JSON.stringify(session, null, 2), { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, target); }
function read(idValue) { const target = file(idValue); if (!target || !fs.existsSync(target)) return null; try { return JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return null; } }
function create(input = {}) { const now = new Date().toISOString(); const session = { id: id(), title: String(input.title || '新对话').slice(0, 80), created_at: now, updated_at: now, status: 'active', messages: [], task: null, artifact: null, result: null, last_request_id: null, conversation_mode: null, customer_task: null, awaiting_ticket_consent: false, awaiting_ticket_name: false }; write(session); return session; }
function list() { ensure(); return fs.readdirSync(DATA_DIR).filter(n => n.endsWith('.json')).map(n => read(n.slice(0, -5))).filter(Boolean).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(({ messages, artifact, result, ...s }) => s); }
function update(idValue, patch = {}) { const session = read(idValue); if (!session) return null; for (const key of ['title','status','task','artifact','result','last_request_id','conversation_mode','customer_task','awaiting_ticket_consent','awaiting_ticket_name']) if (Object.prototype.hasOwnProperty.call(patch, key)) session[key] = patch[key]; if (Array.isArray(patch.messages)) session.messages = patch.messages.map(cleanMessage).slice(-MAX_MESSAGES); session.updated_at = new Date().toISOString(); write(session); return session; }
function append(idValue, messages = [], patch = {}) {
  const session = read(idValue) || create({});
  // Preserve the legacy result on its own turn before the next result replaces it.
  const customer = customerPresentation(session.result);
  if (customer) {
    const previous = session.messages.findLast(message => message.role === 'assistant' && message.content.map(part => part.text).join('\n') === session.result.reply);
    if (previous && !previous.metadata?.custom?.studio_customer) previous.metadata = { custom: { studio_customer: customer } };
  }
  const next = [...session.messages, ...messages.map(cleanMessage)].slice(-MAX_MESSAGES);
  return update(session.id, { ...patch, messages: next });
}
function remove(idValue) { const target = file(idValue); if (!target || !fs.existsSync(target)) return false; fs.unlinkSync(target); return true; }
module.exports = { create, get: read, list, update, append, remove };
