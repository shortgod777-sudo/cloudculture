const form = document.querySelector('#message');
const status = document.querySelector('#status');
const hosted = document.querySelector('meta[name="cloud-culture-hosted"]')
  ? await import('./client.mjs')
  : null;
form.elements.order.value = new URLSearchParams(location.search).get('order')?.slice(0, 30) ?? '';
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Saving…';
  try {
    const fields = Object.fromEntries(new FormData(form));
    if (hosted) await hosted.rpc('message', fields);
    else {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    }
    form.reset();
    status.textContent = 'Message saved in the demo inbox.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
