// Avatares inspirados na fauna e na cultura dos povos originários do Brasil (ilustrações próprias, geométricas e simples).
const circle = (fill) => `<circle cx="48" cy="48" r="48" fill="${fill}"/>`;

export const AVATARS = [
  {
    id: 'arara', name: 'Arara', color: '#e3262e',
    svg: `${circle('#1e8f6b')}
      <path d="M17 80C9 62 17 44 31 36l8 11c-9 8-12 20-8 33z" fill="#1d63d8"/>
      <path d="M79 80c8-18 0-36-14-44l-8 11c9 8 12 20 8 33z" fill="#ffc72c"/>
      <ellipse cx="48" cy="46" rx="25" ry="28" fill="#e3262e"/>
      <ellipse cx="48" cy="49" rx="17" ry="14" fill="#fff"/>
      <circle cx="39" cy="44" r="5.5" fill="#ffd23f"/><circle cx="39" cy="44" r="3" fill="#1a1a1a"/>
      <circle cx="57" cy="44" r="5.5" fill="#ffd23f"/><circle cx="57" cy="44" r="3" fill="#1a1a1a"/>
      <path d="M36 53c0-9 24-9 24 0 0 9-6 18-12 21-6-3-12-12-12-21z" fill="#f2ead9"/>
      <path d="M43 64c1 6 9 6 10 0-1 7-5 11-5 11s-4-4-5-11z" fill="#2b2b2b"/>`
  },
  {
    id: 'onca', name: 'Onça', color: '#f4a93b',
    svg: `${circle('#2f5fd0')}
      <circle cx="23" cy="27" r="11" fill="#f4a93b"/><circle cx="73" cy="27" r="11" fill="#f4a93b"/>
      <circle cx="23" cy="27" r="5" fill="#3a2418"/><circle cx="73" cy="27" r="5" fill="#3a2418"/>
      <circle cx="48" cy="52" r="31" fill="#f4a93b"/>
      <ellipse cx="48" cy="64" rx="15" ry="12" fill="#fff3dc"/>
      <path d="M41 56h14l-7 8z" fill="#2a1a14"/>
      <path d="M48 64v6m-7 0c3 4 11 4 14 0" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="37" cy="45" rx="4" ry="5" fill="#3a2418"/><ellipse cx="59" cy="45" rx="4" ry="5" fill="#3a2418"/>
      <circle cx="38.5" cy="43.5" r="1.4" fill="#fff"/><circle cx="60.5" cy="43.5" r="1.4" fill="#fff"/>
      <g fill="none" stroke="#3a2418" stroke-width="3" stroke-linecap="round">
        <circle cx="30" cy="62" r="3.2"/><circle cx="66" cy="62" r="3.2"/><circle cx="48" cy="30" r="3.2"/>
        <circle cx="36" cy="33" r="2.4"/><circle cx="60" cy="33" r="2.4"/>
      </g>`
  },
  {
    id: 'tucano', name: 'Tucano', color: '#ff9f1c',
    svg: `${circle('#17a2b8')}
      <circle cx="40" cy="52" r="27" fill="#20202a"/>
      <path d="M22 66c10 12 28 12 36 2l-6-14z" fill="#fff"/>
      <circle cx="42" cy="42" r="9" fill="#2f8cff"/><circle cx="42" cy="42" r="5" fill="#fff"/><circle cx="43" cy="42" r="3" fill="#111"/>
      <defs><linearGradient id="tb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff7a1c"/></linearGradient></defs>
      <path d="M46 40c16-8 38-4 44 10-6 12-26 16-44 10z" fill="url(#tb)"/>
      <path d="M46 52c14 2 30 0 44-2" stroke="#2b2b2b" stroke-width="2.4" fill="none"/>
      <ellipse cx="84" cy="51" rx="4" ry="3.4" fill="#e63946"/>`
  },
  {
    id: 'boto', name: 'Boto', color: '#f48fb1',
    svg: `${circle('#2a6fb5')}
      <path d="M0 70c10-6 16 6 24 0s14-6 24 0 14 6 24 0 16-6 24 0v26H0z" fill="#1d4f8c"/>
      <path d="M12 66C14 40 42 24 66 34c8 4 14 8 20 12-8 4-14 4-19 6-8 14-30 22-55 14z" fill="#f48fb1"/>
      <path d="M44 33c4-12 14-16 20-14-4 4-6 10-6 16z" fill="#e0709a"/>
      <path d="M20 66c8 6 22 6 34-2l-6 6c-10 4-22 4-28-4z" fill="#ffd6e4"/>
      <circle cx="66" cy="40" r="2.8" fill="#2b1a24"/><circle cx="67" cy="39" r="1" fill="#fff"/>
      <path d="M72 50c4-1 8-2 12-4" stroke="#c75a86" stroke-width="2" fill="none" stroke-linecap="round"/>`
  },
  {
    id: 'jabuti', name: 'Jabuti', color: '#7aa33a',
    svg: `${circle('#c4691d')}
      <rect x="22" y="66" width="10" height="12" rx="4" fill="#9fbf5a"/><rect x="60" y="66" width="10" height="12" rx="4" fill="#9fbf5a"/>
      <circle cx="78" cy="56" r="9" fill="#9fbf5a"/><circle cx="81" cy="54" r="2.4" fill="#1d1d1d"/>
      <path d="M14 68C14 32 78 32 78 68z" fill="#6b8e2f"/>
      <g fill="none" stroke="#f4e9b8" stroke-width="2.6" stroke-linejoin="round">
        <path d="M46 40l9 6v9l-9 6-9-6v-9z"/><path d="M46 40V32m9 14l8-4m-8 13l8 4m-17 2v8m-9-15l-8 4m8-13l-8-4"/>
      </g>
      <path d="M14 68h64" stroke="#f4e9b8" stroke-width="3"/>`
  },
  {
    id: 'cocar', name: 'Cocar', color: '#d83b9e',
    svg: `${circle('#5b3fb0')}
      <g transform="translate(0 6)">
        <g transform="rotate(-72 48 70)"><rect x="43.5" y="14" width="9" height="40" rx="4.5" fill="#1d63d8"/></g>
        <g transform="rotate(-54 48 70)"><rect x="43.5" y="12" width="9" height="42" rx="4.5" fill="#ffc72c"/></g>
        <g transform="rotate(-36 48 70)"><rect x="43.5" y="10" width="9" height="44" rx="4.5" fill="#e3262e"/></g>
        <g transform="rotate(-18 48 70)"><rect x="43.5" y="9" width="9" height="45" rx="4.5" fill="#fff"/></g>
        <g transform="rotate(0 48 70)"><rect x="43.5" y="8" width="9" height="46" rx="4.5" fill="#1d63d8"/></g>
        <g transform="rotate(18 48 70)"><rect x="43.5" y="9" width="9" height="45" rx="4.5" fill="#fff"/></g>
        <g transform="rotate(36 48 70)"><rect x="43.5" y="10" width="9" height="44" rx="4.5" fill="#e3262e"/></g>
        <g transform="rotate(54 48 70)"><rect x="43.5" y="12" width="9" height="42" rx="4.5" fill="#ffc72c"/></g>
        <g transform="rotate(72 48 70)"><rect x="43.5" y="14" width="9" height="40" rx="4.5" fill="#1d63d8"/></g>
        <rect x="24" y="58" width="48" height="14" rx="5" fill="#8a4b2b"/>
        <path d="M28 65l5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4" stroke="#f4e9b8" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
      </g>`
  }
];

export const AVATAR_IDS = AVATARS.map(avatar => avatar.id);
export const isAvatarId = id => AVATAR_IDS.includes(id);
export const avatarById = id => AVATARS.find(avatar => avatar.id === id) || AVATARS[0];
export const avatarMarkup = id => `<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><defs><clipPath id="clip-${id}"><circle cx="48" cy="48" r="48"/></clipPath></defs><g clip-path="url(#clip-${id})">${avatarById(id).svg}</g></svg>`;
export const unknownAvatarMarkup = '<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><circle cx="48" cy="48" r="48" fill="#c9c2cf"/><circle cx="48" cy="38" r="15" fill="#f4f1f7"/><path d="M18 84c4-18 16-26 30-26s26 8 30 26z" fill="#f4f1f7"/></svg>';

const STORAGE_KEY = 'tupi-avatar';
export function loadAvatarId() {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (isAvatarId(saved)) return saved; } catch { /* sem armazenamento */ }
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}
export function saveAvatarId(id) { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* vale só nesta sessão */ } }
