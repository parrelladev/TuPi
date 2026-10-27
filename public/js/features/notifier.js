// Chama a atenção quando algo acontece com a aba em segundo plano: título piscando e notificação do navegador.
export class Notifier {
  constructor() {
    this.baseTitle = document.title;
    this.timer = null;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.stop(); });
    window.addEventListener('focus', () => this.stop());
  }

  // Precisa ser chamado dentro de um clique (por exemplo, em "Participar agora").
  async requestPermission() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    try { await Notification.requestPermission(); } catch { /* o usuário pode ignorar */ }
  }

  inBackground() { return document.hidden || !document.hasFocus(); }

  attention(title, body = '') {
    if (!this.inBackground()) return;
    this.flash(title);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, { body, tag: 'tupi', icon: '/assets/icon-192.png' });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch { /* alguns navegadores móveis exigem service worker */ }
  }

  flash(text) {
    this.stop();
    let on = true;
    document.title = `● ${text}`;
    this.timer = setInterval(() => { on = !on; document.title = on ? `● ${text}` : this.baseTitle; }, 1000);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    document.title = this.baseTitle;
  }
}
