import { App } from './app.js';

const root = document.getElementById('app');
new App(root).init().catch((e) => {
  console.error(e);
  const el = document.getElementById('ui');
  if (el && !el.querySelector('.fatal')) el.innerHTML = `<div class="fatal">Failed to start: ${String(e.message || e)}</div>`;
});
