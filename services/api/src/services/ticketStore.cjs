const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
function read() { ensure(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); }
function write(items) { ensure(); fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8'); }
function id(prefix = 'ticket') { return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; }
function create(input) {
  const now = new Date().toISOString();
  const ticket = {
    id: id(), customer_name: String(input.customer_name || '未命名客户').trim(),
    customer_description: String(input.customer_description || '').trim(), model: String(input.model || '').trim(), assignee: String(input.assignee || '').trim(),
    store_name: String(input.store_name || '').trim(), needs_follow_up: input.needs_follow_up !== false,
    follow_up_days: Array.isArray(input.follow_up_days) ? input.follow_up_days.map(Number).filter((d) => [1, 3, 7].includes(d)) : [1, 3, 7],
    status: input.needs_follow_up === false ? 'new' : 'follow_up_pending', source: input.source || 'customer_assist',
    created_at: now, updated_at: now, last_follow_up_at: null,
    next_follow_up_at: input.needs_follow_up === false ? null : new Date(Date.now() + 86400000).toISOString(),
    follow_up_count: 0, result: null, deal_model: '', deal_amount: null, deal_date: null,
    follow_ups: [], assist_result: input.assist_result || null,
  };
  const items = read(); items.unshift(ticket); write(items); return ticket;
}
function get(ticketId) { return read().find((item) => item.id === ticketId) || null; }
function update(ticketId, changes) {
  const items = read(); const index = items.findIndex((item) => item.id === ticketId); if (index < 0) return null;
  const allowed = ['status', 'result', 'deal_model', 'deal_amount', 'deal_date', 'customer_name', 'model', 'assignee', 'needs_follow_up', 'next_follow_up_at'];
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(changes, key)) items[index][key] = changes[key];
  items[index].updated_at = new Date().toISOString(); write(items); return items[index];
}
function addFollowUp(ticketId, input) {
  const items = read(); const index = items.findIndex((item) => item.id === ticketId); if (index < 0) return null;
  const now = new Date().toISOString();
  const record = { id: id('follow'), date: input.date || now, method: input.method || '微信', summary: String(input.summary || '').trim(), customer_feedback: String(input.customer_feedback || '').trim(), next_action: String(input.next_action || '').trim(), next_follow_up_at: input.next_follow_up_at || null };
  items[index].follow_ups.push(record); items[index].follow_up_count = items[index].follow_ups.length; items[index].last_follow_up_at = record.date; items[index].next_follow_up_at = record.next_follow_up_at; if (!['won', 'lost', 'paused'].includes(items[index].status)) items[index].status = 'following_up'; items[index].updated_at = now; write(items); return items[index];
}
function list(query = {}) {
  let items = read(); if (query.status) items = items.filter((i) => i.status === query.status); if (query.model) items = items.filter((i) => i.model === query.model); if (query.q) { const q = String(query.q).toLowerCase(); items = items.filter((i) => `${i.customer_name} ${i.customer_description} ${i.model}`.toLowerCase().includes(q)); } return items;
}
function dashboard() {
  const items = read(); const won = items.filter((i) => i.status === 'won').length; const lost = items.filter((i) => i.status === 'lost').length;
  const product = {}; items.forEach((i) => { const key = i.model || '未填写'; product[key] = product[key] || { model: key, total: 0, won: 0 }; product[key].total += 1; if (i.status === 'won') product[key].won += 1; });
  return { total: items.length, pending_follow_up: items.filter((i) => ['follow_up_pending', 'following_up'].includes(i.status)).length, following_up: items.filter((i) => i.status === 'following_up').length, won, lost, conversion_rate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0, status_distribution: ['new', 'follow_up_pending', 'following_up', 'won', 'lost', 'paused'].map((status) => ({ status, count: items.filter((i) => i.status === status).length })), product_stats: Object.values(product).sort((a, b) => b.won - a.won || b.total - a.total), recent: items.slice(0, 8) };
}
module.exports = { create, get, update, addFollowUp, list, dashboard };
