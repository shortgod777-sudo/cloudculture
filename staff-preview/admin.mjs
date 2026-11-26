const $ = selector => document.querySelector(selector);
const status = $('#status');
const login = $('#login');
const hosted = document.querySelector('meta[name="cloud-culture-hosted"]')
  ? await import('./client.mjs')
  : null;
let key = '';
let data = { orders: [], subscriptions: [], messages: [] };
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const money = cents => cad.format(cents / 100);
const dateTime = value => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Vancouver' }).format(new Date(value));
const paymentLabels = { etransfer: 'Interac e-Transfer', paypal: 'PayPal', usdc: 'USDC on Base' };
const frequencyLabels = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', bimonthly: 'Every two months' };
const fulfillmentLabels = { mail: 'Mail delivery', local: 'Local courier', pickup: 'Pickup' };
const label = value => value.charAt(0).toUpperCase() + value.slice(1);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function facts(entries) {
  const list = element('dl', undefined, 'facts');
  for (const [name, value] of entries) {
    const group = element('div');
    group.append(element('dt', name), element('dd', value));
    list.append(group);
  }
  return list;
}

function selection(name, values, current) {
  const wrap = element('label', name, 'inline-label');
  const select = element('select');
  for (const value of values) {
    const option = element('option', label(value));
    option.value = value;
    select.append(option);
  }
  select.value = current;
  wrap.append(select);
  return { wrap, select };
}

function actionButton(text, run, type) {
  const button = element('button', text, type);
  button.type = 'button';
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Saving…';
    try { const message = await run(); await refresh(); status.textContent = message ?? 'Saved.'; }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  return button;
}

async function request(path, method = 'GET', body) {
  if (hosted) {
    if (path === 'dashboard') return hosted.rpc('dashboard');
    if (path === 'run-due') return hosted.rpc('run_due');
    const [category, id] = path.split('/');
    if (category === 'orders') return hosted.rpc('order_update', { ...body, id });
    if (category === 'subscriptions') return hosted.rpc('subscription_update', { id, decision: body.action });
    if (category === 'messages') return hosted.rpc('message_update', { ...body, id });
    throw new Error('Unknown dashboard action.');
  }
  const response = await fetch('/api/admin/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed.');
  return result;
}

function orderCard(order) {
  const card = element('article', undefined, 'panel');
  const id = order.id;
  const addr = order.address;
  card.append(element('h3', `${id} · ${money(order.bill.total)}`),
    element('p', `${label(order.status)} · ${label(order.payment_status)} payment · ${dateTime(order.created_at)}`, 'muted'),
    facts([
      ['Customer', order.contact.name], ['Email', order.contact.email], ['Phone', order.contact.phone],
      ['Delivery', fulfillmentLabels[order.fulfillment]],
      ['Delivery address', addr ? `${addr.street}, ${addr.city}, ${addr.postal}, ${addr.country}` : 'Pickup'],
      ...(order.fulfillment === 'local' && addr?.instructions ? [['Delivery instructions', addr.instructions]] : []),
      ['Payment method', paymentLabels[order.payment_method]],
      ['Scheduled shipment', order.scheduled_date ?? 'One-time order'], ['Subscription', order.subscription_id ?? '—']
    ]));
  const details = element('details');
  details.append(element('summary', 'Items and totals'));
  const items = element('ul', undefined, 'item-list');
  for (const item of order.bill.lines) items.append(element('li', `${item.quantity} × ${item.name} · ${item.option} · ${money(item.unitCents * item.quantity)}`));
  details.append(items, facts([
    ['Subtotal', money(order.bill.subtotal)], ['Promo', money(order.bill.promoDiscount)],
    ['Subscription savings', money(order.bill.subscriptionDiscount)], ['Shipping', money(order.bill.shipping)],
    ['Demo tax', money(order.bill.tax)], ['Total', money(order.bill.total)]
  ]));
  const payment = selection('Payment', ['awaiting','paid','refunded'], order.payment_status);
  const fulfillment = selection('Order status', ['open','packing','fulfilled','cancelled'], order.status);
  const controls = element('div', undefined, 'controls');
  controls.append(payment.wrap, fulfillment.wrap, actionButton('Save order', async () => {
    await request('orders/' + id, 'PATCH', { paymentStatus: payment.select.value, status: fulfillment.select.value });
  }));
  card.append(details, controls);
  return card;
}

function subscriptionCard(sub) {
  const card = element('article', undefined, 'panel');
  card.append(element('h3', sub.contact.name + ' · ' + frequencyLabels[sub.frequency]),
    element('p', `${label(sub.status)} · ${sub.contact.email}`, 'muted'),
    facts([['Next scheduled shipment', sub.status === 'cancelled' ? '—' : sub.next_date], ['Subscription', sub.id]]));
  if (sub.status !== 'cancelled') {
    const controls = element('div', undefined, 'controls');
    const actions = sub.status === 'paused' ? ['resume','skip','cancel'] : ['pause','skip','cancel'];
    for (const action of actions) {
      const button = actionButton(action === 'skip' ? 'Skip next' : label(action), async () => {
        if (action === 'cancel' && !window.confirm('Cancel future demo orders for this subscription?')) return 'Subscription left active as configured.';
        await request('subscriptions/' + sub.id,'PATCH',{ action });
      }, action === 'cancel' ? 'secondary' : undefined);
      controls.append(button);
    }
    card.append(controls);
  }
  return card;
}

function messageCard(message) {
  const card = element('article', undefined, 'panel');
  card.append(element('h3', `${message.name} · ${label(message.status)}`),
    element('p', `${message.email} · ${dateTime(message.created_at)}${message.order_id ? ' · ' + message.order_id : ''}`, 'muted'),
    element('p', message.body, 'message-body'));
  const messageStatus = selection('Status', ['unread','read','resolved'], message.status);
  const note = element('label', 'Internal note');
  const input = element('textarea');
  input.value = message.note;
  input.maxLength = 3000;
  note.append(input);
  const controls = element('div', undefined, 'controls');
  controls.append(messageStatus.wrap, actionButton('Save message', async () => {
    await request('messages/' + message.id, 'PATCH', { status: messageStatus.select.value, note: input.value });
  }));
  card.append(note, controls);
  return card;
}

function renderOrders() {
  const term = $('#search').value.trim().toLowerCase();
  const orders = data.orders.filter(o => [o.id, o.contact.name, o.contact.email].some(v => v.toLowerCase().includes(term)));
  $('#order-list').replaceChildren(...(orders.length ? orders.map(orderCard) : [element('p','No matching orders yet.','muted')]));
}

async function refresh() {
  data = await request('dashboard');
  for (const name of ['orders','subscriptions','messages']) {
    const button = document.querySelector(`[data-view="${name}"]`);
    button.textContent = `${label(name)} (${data[name].length})`;
  }
  renderOrders();
  $('#subscription-list').replaceChildren(...(data.subscriptions.length ? data.subscriptions.map(subscriptionCard) : [element('p','No subscriptions yet.','muted')]));
  $('#message-list').replaceChildren(...(data.messages.length ? data.messages.map(messageCard) : [element('p','No messages yet.','muted')]));
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (hosted) await hosted.signIn($('#staff-email').value.trim(), $('#key').value);
    else key = $('#key').value.trim();
    await refresh();
    login.reset();
    login.hidden = true;
    $('#dashboard').hidden = false;
    status.textContent = 'Dashboard unlocked.';
  } catch (error) {
    key = '';
    status.textContent = error.message;
  }
});
for (const button of document.querySelectorAll('[data-view]')) {
  button.onclick = () => {
    for (const option of document.querySelectorAll('[data-view]')) option.setAttribute('aria-pressed', String(option === button));
    for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== button.dataset.view;
  };
}
$('#search').addEventListener('input', renderOrders);
$('#refresh').onclick = async () => {
  try { await refresh(); status.textContent = 'Dashboard refreshed.'; }
  catch (error) { status.textContent = error.message; }
};
$('#run-due').onclick = async () => {
  try {
    const result = await request('run-due', 'POST');
    await refresh();
    status.textContent = `${result.created} due demo orders created.`;
  } catch (error) { status.textContent = error.message; }
};
$('#lock').onclick = async () => {
  if (hosted) await hosted.signOut();
  location.reload();
};
if (hosted) {
  const backup = $('#backup');
  backup.addEventListener('submit', async event => {
    event.preventDefault();
    const button = backup.querySelector('button');
    button.disabled = true;
    try {
      const { encryptBackup } = await import('./backup.mjs');
      const snapshot = await hosted.rpc('export');
      const encrypted = await encryptBackup(snapshot, $('#backup-passphrase').value);
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }));
      const link = element('a');
      link.href = url;
      link.download = `cloud-culture-backup-${new Date().toISOString().slice(0,10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      backup.reset();
      status.textContent = 'Encrypted backup downloaded.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  if (hosted.hasSession()) {
    try { await refresh(); login.hidden = true; $('#dashboard').hidden = false; }
    catch (error) { await hosted.signOut(); status.textContent = error.message; }
  }
}
