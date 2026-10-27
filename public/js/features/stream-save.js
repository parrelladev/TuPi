// Grava um arquivo recebido direto no disco via Service Worker (o navegador trata como um download normal).
// Serve de alternativa ao showSaveFilePicker, que só existe em navegadores Chromium.
export function canStreamSave() {
  return 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller) && typeof ReadableStream !== 'undefined';
}

const OPEN_TIMEOUT_MS = 60_000;

export async function openStreamSave({ id, name, size, mime }, onCancel) {
  const { port1: port, port2 } = new MessageChannel();
  let ackWaiter = null;
  let cancelled = false;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  let ready;
  const readyPromise = new Promise(resolve => { ready = resolve; });
  const releaseAck = () => { const waiter = ackWaiter; ackWaiter = null; waiter?.(); };
  port.onmessage = ({ data }) => {
    if (data?.type === 'ready') ready();
    else if (data?.type === 'pulling') started();
    else if (data?.type === 'ack') releaseAck();
    else if (data?.type === 'cancel') { cancelled = true; releaseAck(); onCancel?.(); }
  };
  navigator.serviceWorker.controller.postMessage({ type: 'stream', id, name, size, mime }, [port2]);
  await Promise.race([readyPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker não respondeu')), 3000))]);

  const link = document.createElement('a');
  link.href = `/sw-download/${encodeURIComponent(id)}`;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // O navegador só começa a ler o stream depois que o usuário confirma o destino (quando ele pergunta).
  await Promise.race([startedPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Download não iniciado')), OPEN_TIMEOUT_MS))]);

  return {
    async write(buffer) {
      if (cancelled) throw new Error('Download cancelado');
      const acked = new Promise(resolve => { ackWaiter = resolve; });
      port.postMessage({ type: 'chunk', buffer }, [buffer]);
      await acked;
      if (cancelled) throw new Error('Download cancelado');
    },
    async close() { port.postMessage({ type: 'end' }); port.close(); },
    async abort() { port.postMessage({ type: 'abort' }); port.close(); }
  };
}
