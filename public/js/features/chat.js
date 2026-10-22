export class Chat {
  constructor(ui) {
    this.ui = ui;
    this.channel = null;
    ui.$('chatForm').addEventListener('submit', event => this.sendFromForm(event));
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onopen = () => this.ui.setChatConnected(true);
    channel.onclose = () => this.ui.setChatConnected(false);
    channel.onerror = () => this.ui.notify('O canal de mensagens apresentou um erro.');
    channel.onmessage = event => {
      if (typeof event.data === 'string' && event.data.length <= 4000) this.ui.addMessage('Convidado', event.data);
    };
  }

  sendFromForm(event) {
    event.preventDefault();
    const input = this.ui.$('chatInput');
    const text = input.value.trim();
    if (!text || this.channel?.readyState !== 'open') return;
    try {
      this.channel.send(text);
      this.ui.addMessage('Você', text, true);
      input.value = '';
    } catch { this.ui.notify('Não foi possível enviar a mensagem.'); }
  }

  detach() {
    const channel = this.channel;
    this.channel = null;
    if (!channel) return;
    channel.onmessage = null;
    channel.onopen = null;
    channel.onclose = null;
    channel.onerror = null;
    if (channel.readyState !== 'closed') channel.close();
  }
}
