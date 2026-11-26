import { customerRpc, customerSignIn, customerSignOut, customerSignUp, hasCustomerSession } from './client.mjs';

const $ = id => document.getElementById(id);
const notice = $('notice');
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const day = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'America/Vancouver' });
const frequencies = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', bimonthly: 'Every two months' };
const orderStates = { open: 'Received', packing: 'Packing', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };
const deliveryMethods = { mail: 'Mail delivery', local: 'Local courier', pickup: 'Pickup' };
const actions = { pause: 'Pause', resume: 'Resume', skip: 'Skip next', cancel: 'Cancel subscription' };

function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function orderCard(order) {
  const card = text('article', '', 'panel');
  const date = order.scheduled_date ?? day.format(new Date(order.created_at));
  card.append(text('h3', `${order.id} · ${cad.format(order.bill.total / 100)}`),
    text('p', `${date} · ${deliveryMethods[order.fulfillment]} · ${orderStates[order.status]}`, 'muted'));
  const items = text('ul', '', 'item-list');
  for (const item of order.bill.lines) items.append(text('li', `${item.quantity} × ${item.name} · ${item.option}`));
  card.append(items);
  return card;
}

function subscriptionCard(sub) {
  const card = text('article', '', 'panel');
  card.append(text('h3', `${frequencies[sub.frequency]} · ${sub.status}`));
  if (sub.status === 'cancelled') return card;
  card.append(text('p', `Next scheduled order: ${sub.next_date}`, 'muted'));
  const controls = text('div', '', 'controls');
  for (const action of sub.status === 'active' ? ['pause', 'skip', 'cancel'] : ['resume', 'cancel']) {
    const button = text('button', actions[action], 'secondary');
    button.addEventListener('click', async () => {
      if (action === 'cancel' && !confirm('Cancel future sample orders for this subscription?')) return;
      for (const control of controls.children) control.disabled = true;
      try {
        await customerRpc('subscription_update', { id: sub.id, decision: action });
        render(await customerRpc('account'));
        notice.textContent = 'Subscription updated.';
      } catch (error) { showError(error); }
      finally { for (const control of controls.children) control.disabled = false; }
    });
    controls.append(button);
  }
  card.append(controls);
  return card;
}

function render(account) {
  $('access').hidden = Boolean(account);
  $('account').hidden = !account;
  const orders = account?.orders ?? [];
  const subscriptions = account?.subscriptions ?? [];
  $('orders').replaceChildren(...(orders.length ? orders.map(orderCard) : [text('p', 'No sample orders yet.', 'muted')]));
  $('subscriptions').replaceChildren(...(subscriptions.length ? subscriptions.map(subscriptionCard) : [text('p', 'No subscriptions yet.', 'muted')]));
}

function showError(error) {
  if (!hasCustomerSession()) render(null);
  notice.textContent = error.message;
}

for (const id of ['sign-in', 'sign-up']) {
  const form = $(id);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const fields = new FormData(form);
    form.elements.password.value = '';
    notice.textContent = '';
    button.disabled = true;
    try {
      if (id === 'sign-in') render(await customerSignIn(fields.get('email').trim(), fields.get('password')));
      else {
        await customerSignUp(fields.get('email').trim(), fields.get('password'));
        notice.textContent = 'Check your email for a confirmation link, then sign in.';
      }
    } catch (error) { showError(error); }
    finally { button.disabled = false; }
  });
}

$('sign-out').addEventListener('click', async () => {
  const revoke = customerSignOut();
  render(null);
  notice.textContent = 'Signed out.';
  await revoke;
});

if (location.hash) {
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  if (params.get('type') === 'signup') notice.textContent = 'Email confirmed. You can sign in.';
  if (params.has('error')) notice.textContent = 'The confirmation link is invalid or has expired.';
}
if (hasCustomerSession()) customerRpc('account').then(render).catch(showError);
