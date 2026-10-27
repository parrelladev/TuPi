"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
class Whiteboard {
  constructor(directory) {
    this.file = path.join(directory, "whiteboard.json");
    this.state = { revision: 0, elements: {}, versions: {} };
    this.sessions = new Map();
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  join(ws, token, name, host) {
    let session = typeof token === "string" && this.sessions.get(token);
    if (!session) {
      token = crypto.randomBytes(32).toString("hex");
      session = { id: crypto.randomUUID(), name: String(name || "Participante").slice(0, 60), edit: true };
      this.sessions.set(token, session);
    }
    ws.boardUser = session;
    ws.boardHost = host;
    return { type: "board-session", token, user: session, host };
  }
  snapshot() {
    return { type: "board-state", ...this.state };
  }
  commit(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(next), { mode: 384 });
    fs.renameSync(this.file + ".tmp", this.file);
    this.state = next;
  }
  handle(ws, msg, members, send) {
    const reply = (data) => send(ws, data);
    const broadcast = (data) => {
      for (const peer of members) send(peer, data);
    };
    const fail = (message) => reply({ type: "board-error", request: msg.request, message });
    if (!ws.inLobby || !ws.boardUser) return fail("Entre no lobby para acessar o quadro.");
    if (msg.room && msg.room !== "lobby") return fail("Sala não autorizada.");
    const user = ws.boardUser;
    if (msg.type === "board-get") {
      reply(this.snapshot());
      return;
    }
    if (msg.type === "board-presence") {
      if (![msg.x, msg.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5)) return;
      broadcast({ type: "board-presence", id: user.id, name: user.name, x: msg.x, y: msg.y, laser: !!msg.laser && (user.edit || ws.boardHost) });
      return;
    }
    if (msg.type === "board-permission") {
      if (!ws.boardHost) return fail("Somente o anfitrião pode alterar permissões.");
      for (const session of this.sessions.values()) if (session.id === msg.user) session.edit = !!msg.edit;
      broadcast({ type: "board-members", members: [...members].map((p) => ({ ...p.boardUser, host: p.boardHost })) });
      return;
    }
    if (!user.edit && !ws.boardHost) return fail("Você está em modo somente visualização.");
    try {
      if (msg.type === "board-clear") {
        if (!ws.boardHost) return fail("Somente o anfitrião pode limpar o quadro.");
        if (msg.revision !== this.state.revision) return fail("O quadro mudou. Confira e tente novamente.");
        const revision2 = this.state.revision + 1;
        this.commit({ revision: revision2, elements: {}, versions: Object.fromEntries(Object.keys(this.state.versions).map((id2) => [id2, revision2])) });
        broadcast(this.snapshot());
        return;
      }
      if (msg.type !== "board-put") return;
      const id = msg.id;
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return fail("Identificador inválido.");
      if ((this.state.versions[id] || 0) !== msg.version) return fail("Outra pessoa alterou este elemento. Sua alteração não foi aplicada; tente novamente.");
      let element = null;
      if (msg.element !== null) {
        const e = msg.element;
        if (!e || !["pen", "text", "sticky", "line", "arrow", "rect", "circle", "stamp"].includes(e.kind) || ![e.x, e.y, e.w, e.h, e.size, e.stroke].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e4) || e.w < 1 || e.h < 1 || e.size < 8 || e.size > 120 || e.stroke < 1 || e.stroke > 30 || !/^#[0-9a-f]{6}$/i.test(e.color) || !(e.fill === "none" || /^#[0-9a-f]{6}$/i.test(e.fill)) || typeof e.text !== "string" || e.text.length > 4e3 || !["left", "center", "right"].includes(e.align) || !Array.isArray(e.points) || e.points.length > 1500 || e.points.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every((n) => Number.isFinite(n) && Math.abs(n) <= 2e4))) return fail("Elemento inválido ou muito grande.");
        const old = this.state.elements[id];
        element = { kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h, size: e.size, stroke: e.stroke, color: e.color, fill: e.fill, text: e.text, align: e.align, bold: !!e.bold, points: e.points, author: old?.author || user.name, authorId: old?.authorId || user.id };
        if (!old && Object.keys(this.state.elements).length >= 2e3) return fail("Limite de 2000 elementos atingido.");
      }
      const revision = this.state.revision + 1;
      const next = { revision, elements: { ...this.state.elements }, versions: { ...this.state.versions, [id]: revision } };
      if (element) next.elements[id] = element;
      else delete next.elements[id];
      if (JSON.stringify(next).length > 8 * 1024 * 1024) return fail("O quadro atingiu o limite de armazenamento.");
      this.commit(next);
      broadcast({ type: "board-update", id, element, version: revision, revision, request: msg.request, actor: user.id });
    } catch {
      fail("Falha ao salvar. Tente novamente.");
    }
  }
}
module.exports = { Whiteboard };
