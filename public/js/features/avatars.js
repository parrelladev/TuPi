// Avatares: 30 ícones de animais em SVG (public/assets/avatars). O id é o nome do arquivo sem extensão.
const ANIMALS = [
  ['elefante', 'Elefante'], ['urso', 'Urso'], ['gato', 'Gato'], ['cachorro', 'Cachorro'], ['raposa-em-pe', 'Raposa'],
  ['bisao', 'Bisão'], ['porco', 'Porco'], ['galinha', 'Galinha'], ['cavalo', 'Cavalo'], ['coruja', 'Coruja'],
  ['canguru-01', 'Canguru'], ['cervo', 'Cervo'], ['panda', 'Panda'], ['beija-flor', 'Beija-flor'], ['coelho', 'Coelho'],
  ['lobo', 'Lobo'], ['camaleao', 'Camaleão'], ['esquilo', 'Esquilo'], ['aguia', 'Águia'], ['cisne-01', 'Cisne'],
  ['rinoceronte', 'Rinoceronte'], ['gnu', 'Gnu'], ['javali', 'Javali'], ['rato', 'Rato'], ['camelo', 'Camelo'],
  ['raposa-sentada', 'Raposa-ruiva'], ['cisne-02', 'Cisne-branco'], ['pinguim', 'Pinguim'], ['canguru-02', 'Canguru-pardo'], ['galo', 'Galo']
];

export const AVATARS = ANIMALS.map(([id, name]) => ({ id, name, src: `/assets/avatars/${id}.svg` }));
export const AVATAR_IDS = AVATARS.map(avatar => avatar.id);
export const isAvatarId = id => AVATAR_IDS.includes(id);
export const avatarById = id => AVATARS.find(avatar => avatar.id === id) || AVATARS[0];
export const avatarMarkup = id => `<img src="${avatarById(id).src}" alt="" width="96" height="96" draggable="false" decoding="async" />`;
export const unknownAvatarMarkup = '<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><circle cx="48" cy="48" r="48" fill="#c9c2cf"/><circle cx="48" cy="38" r="15" fill="#f4f1f7"/><path d="M18 84c4-18 16-26 30-26s26 8 30 26z" fill="#f4f1f7"/></svg>';

export const NAME_MAX = 24;
export function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
export const defaultNameFor = avatarId => avatarById(avatarId).name;

const NAME_KEY = 'tupi-name';
export function loadCustomName() {
  try { return sanitizeName(localStorage.getItem(NAME_KEY) || ''); } catch { return ''; }
}
export function saveCustomName(name) {
  try { if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY); } catch { /* vale só nesta sessão */ }
}

const STORAGE_KEY = 'tupi-avatar';
export function loadAvatarId() {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (isAvatarId(saved)) return saved; } catch { /* sem armazenamento */ }
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}
export function saveAvatarId(id) { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* vale só nesta sessão */ } }
