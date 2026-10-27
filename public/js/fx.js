import { animate } from '/vendor/motion.js';
import autoAnimate from '/vendor/auto-animate.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => reduced.matches;
const ease = [0.22, 1, 0.36, 1];
const spring = { type: 'spring', stiffness: 380, damping: 26 };

function run(el, keyframes, options) {
  if (!el || still()) return;
  try { animate(el, keyframes, options); } catch { /* animação é decorativa */ }
}

export function enterStagger(root, selector = '[data-enter]', step = 0.07) {
  root?.querySelectorAll(selector).forEach((el, index) => {
    run(el, { opacity: [0, 1], translate: ['0 18px', '0 0'], scale: [0.97, 1] }, { delay: index * step, duration: 0.6, ease });
  });
}

export function roomIn(room) {
  run(room.querySelector('.room-header'), { opacity: [0, 1], translate: ['0 -24px', '0 0'] }, { duration: 0.55, ease });
  run(room.querySelector('.screen-area'), { opacity: [0, 1], scale: [0.96, 1] }, { delay: 0.08, duration: 0.6, ease });
  run(room.querySelector('.room-toolbar'), { opacity: [0, 1], translate: ['0 40px', '0 0'] }, { delay: 0.18, ...spring });
  room.querySelectorAll('.tb').forEach((el, index) => run(el, { opacity: [0, 1], scale: [0.6, 1] }, { delay: 0.25 + index * 0.04, ...spring }));
}

export function pop(el) { run(el, { scale: [1, 1.35, 1] }, { duration: 0.4, ease }); }
export function swap(el) { run(el, { opacity: [0, 1], translate: ['0 6px', '0 0'] }, { duration: 0.35, ease }); }

export function shake(el) {
  if (!el || still()) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 520);
}

export function flash(el, className = 'copied', ms = 1400) {
  if (!el) return;
  el.classList.add(className);
  clearTimeout(flash[className]);
  flash[className] = setTimeout(() => el.classList.remove(className), ms);
}

export function toastProgress(bar, ms) {
  if (!bar) return;
  run(bar, { scaleX: [1, 0] }, { duration: ms / 1000, ease: 'linear' });
}

export function transition(update) {
  if (still() || document.hidden || typeof document.startViewTransition !== 'function') { update(); return Promise.resolve(); }
  return new Promise(resolve => {
    let done = false;
    const once = () => { if (!done) { done = true; update(); resolve(); } };
    setTimeout(once, 350);
    try {
      const viewTransition = document.startViewTransition(once);
      for (const promise of [viewTransition.ready, viewTransition.finished, viewTransition.updateCallbackDone]) promise.catch(() => {});
    } catch { once(); }
  });
}

function ripple(event) {
  const target = event.target.closest?.('.btn, .vb-btn, .reconnect-btn, .picker-option, .join-button, .more-menu-entry, .quality-presets button, .chat-sound-toggle, .copy-room-link, .file-pick, .file-cancel, .incoming-file button');
  if (!target || target.disabled || still()) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  target.append(dot);
  dot.addEventListener('animationend', () => dot.remove(), { once: true });
}

function magnet(button) {
  if (!button) return;
  button.addEventListener('pointermove', event => {
    if (still() || event.pointerType === 'touch') return;
    const rect = button.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * 0.08;
    const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
    run(button, { translate: `${x}px ${y}px` }, { duration: 0.2, ease: 'linear' });
  });
  button.addEventListener('pointerleave', () => run(button, { translate: '0px 0px' }, spring));
}

function listPlugin(el, action, oldCoords, newCoords) {
  const options = { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' };
  if (action === 'add') return new KeyframeEffect(el, [{ opacity: 0, transform: 'translateY(14px) scale(.9)' }, { opacity: 1, transform: 'none' }], options);
  if (action === 'remove') return new KeyframeEffect(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], options);
  const dx = oldCoords.left - newCoords.left;
  const dy = oldCoords.top - newCoords.top;
  return new KeyframeEffect(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], options);
}

export function animateList(el) {
  if (!el || still()) return;
  try { autoAnimate(el, listPlugin); } catch { /* lista funciona sem animação */ }
}

export function initFx() {
  document.addEventListener('pointerdown', ripple, { passive: true });
  magnet(document.getElementById('lobbyJoinBtn'));
  animateList(document.getElementById('messages'));
  animateList(document.getElementById('qualityDiagnostics'));
  enterStagger(document.getElementById('landing'));
}
