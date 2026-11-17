// Eventos efêmeros: SCTP confiável/ordenado entrega uma vez; nunca guardar ou
// reenviar na reconexão. O estado de mídia/painéis não é uma nova ação.
const EVENTS = new Set(['screen-started', 'board-opened', 'youtube-opened']);

export class ActivityNotifications {
  constructor(chat) { this.chat = chat; this.channel = null; }

  publish(type) {
    if (!EVENTS.has(type)) return;
    void this.chat.playNotification('activity');
    if (this.channel?.readyState !== 'open') return;
    try { this.channel.send(type); } catch { /* Sem replay de avisos antigos. */ }
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onmessage = event => {
      if (this.channel !== channel || !EVENTS.has(event.data)) return;
      void this.chat.playNotification('activity');
    };
  }

  detach() {
    const channel = this.channel;
    this.channel = null;
    if (!channel) return;
    channel.onmessage = null;
    if (channel.readyState !== 'closed') channel.close();
  }
}
