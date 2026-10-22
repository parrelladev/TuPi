export class Signaling {
  constructor(onMessage, onClose, onError) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onError = onError;
    this.socket = null;
    this.roomId = null;
    this.intentional = false;
    this.attempt = 0;
    this.maxAttempts = 5;
    this.retryTimer = null;
  }

  connect(roomId) {
    this.roomId = roomId;
    this.intentional = false;
    this.attempt = 0;
    this.open();
  }

  open() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    try { socket = new WebSocket(`${protocol}//${location.host}/signal`); }
    catch (error) { this.scheduleRetry(error); return; }
    this.socket = socket;
    socket.onopen = () => this.send({ type: 'join', roomId: this.roomId });
    socket.onmessage = async event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'joined') this.attempt = 0;
        await this.onMessage(message);
      }
      catch (error) { this.onError?.(error); }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (this.intentional) return;
      this.onClose?.();
      this.scheduleRetry();
    };
  }

  scheduleRetry(error) {
    if (this.intentional || this.retryTimer) return;
    if (this.attempt >= this.maxAttempts) { this.onError?.(error || new Error('Limite de tentativas de reconexão atingido.')); return; }
    const delay = Math.min(1000 * (2 ** this.attempt), 15000);
    this.attempt++;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.open(); }, delay);
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close() {
    this.intentional = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    }
  }
}
