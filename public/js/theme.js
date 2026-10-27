import { transition } from './fx.js';

const KEY = 'tupi-theme';
const MODES = ['auto', 'light', 'dark'];
const LABELS = { auto: 'automático (segue o sistema)', light: 'claro', dark: 'escuro' };
const BAR_COLORS = { light: '#fffaf8', dark: '#14111a' };

let mode = 'auto';

function stored() {
  try { const saved = localStorage.getItem(KEY); return MODES.includes(saved) ? saved : 'auto'; }
  catch { return 'auto'; }
}

function store(value) {
  try { if (value === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, value); }
  catch { /* vale só nesta sessão */ }
}

function apply(value) {
  mode = value;
  const root = document.documentElement;
  if (value === 'auto') delete root.dataset.theme; else root.dataset.theme = value;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.dataset.original ??= meta.content;
    meta.content = value === 'auto' ? meta.dataset.original : BAR_COLORS[value];
  });
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.dataset.mode = value;
    const text = `Tema: ${LABELS[value]}. Clique para alternar.`;
    button.setAttribute('aria-label', text);
    button.title = text;
  });
}

export function initTheme() {
  apply(stored());
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      store(next);
      void transition(() => apply(next));
    });
  });
}
