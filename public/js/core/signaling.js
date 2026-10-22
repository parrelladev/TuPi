export class Signaling {
  constructor(onMessage, onClose, onError) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onError = onError;
    this.socket = null;
  }

  connect(roomId) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/signal`);
    this.socket.onopen = () => this.send({ type: 'join', roomId });
    this.socket.onmessage = async event => {
      try { await this.onMessage(JSON.parse(event.data)); }
      catch (error) { console.error(error); this.onError?.(error); }
    };
    this.socket.onerror = event => this.onError?.(event);
    this.socket.onclose = () => this.onClose?.();
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    }
  }
}
