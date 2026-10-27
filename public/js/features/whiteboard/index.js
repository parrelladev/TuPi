// Estado, sincronização, histórico e ciclo de vida do quadro branco.
import { mountWhiteboard, readOptions, updateTools, updateProperties, loadProperties } from "./view.js";
import { toWorldPoint, createSvgNode, drawElement, renderBoard, transformViewport, zoomViewport, getContentBounds } from "./renderer.js";
import { exportBoard } from "./export.js";
const clone = (value) => value ? structuredClone(value) : null;
class Whiteboard {
  constructor(send) {
    this.send = send;
    this.elements = {};
    this.versions = {};
    this.revision = 0;
    this.undo = [];
    this.redo = [];
    this.pending = new Map();
    this.online = false;
    this.tool = "select";
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.cursors = new Map();
    mountWhiteboard(this);
    this.timer = setInterval(() => {
      let changed = false;
      for (const [id, c] of this.cursors) if (Date.now() - c.time > 1800) {
        this.cursors.delete(id);
        changed = true;
      }
      if (changed && !this.panel.classList.contains("hidden")) this.render();
    }, 500);
    this.updateTools();
  }
  status(text) {
    this.panel.querySelector("#wbStatus").textContent = text;
  }
  isOpen() {
    return !this.panel.classList.contains("hidden");
  }
  requestPanel(open) {
    if (!this.online) return;
    this.send({ type: "board-panel", open });
  }
  setPanelOpen(open) {
    if (open === this.isOpen()) return;
    if (open) this.open(false); else this.close();
  }
  open(focus = true) {
    this.panel.classList.remove("hidden");
    this.onModeChange?.(true);
    this.send({ type: "board-get" });
    if (focus) this.svg.focus();
    this.render();
  }
  close() {
    const changed = this.isOpen();
    this.finishEdit();
    this.shortcuts.close();
    this.panel.querySelector(".wb-menu").open = false;
    this.panel.classList.add("hidden");
    if (changed) this.onModeChange?.(false);
  }
  disconnect() {
    this.online = false;
    this.pending.clear();
    this.status("Desconectado — reconecte e confira o estado antes de editar");
    this.close();
  }
  handle(m) {
    if (m.type === "board-panel") { this.sharedPanelOpen = m.open; this.setPanelOpen(m.open); }
    if (m.type === "board-session") {
      sessionStorage.setItem("tupi-board-token", m.token);
      this.user = m.user;
      this.host = m.host;
      this.online = true;
    }
    if (m.type === "board-members") {
      this.members = m.members;
      const me = m.members.find((u) => u.id === this.user?.id);
      if (me) {
        this.host = me.host;
        this.user = me;
      }
      const select = this.panel.querySelector("#wbMembers");
      select.replaceChildren();
      for (const u of m.members.filter((u2) => u2.id !== this.user?.id)) {
        const o = document.createElement("option");
        o.value = u.id;
        o.textContent = `${u.name}: ${u.edit ? "edição" : "visualização"}`;
        select.append(o);
      }
      this.panel.querySelector('[data-action="permission"]').disabled = !this.host;
      this.panel.querySelector('[data-action="clear"]').disabled = !this.host;
      this.status(this.user?.edit || this.host ? "Conectado · salvo" : "Somente visualização");
    }
    if (m.type === "board-state") {
      if (typeof m.panelOpen === "boolean") { this.sharedPanelOpen = m.panelOpen; this.setPanelOpen(m.panelOpen); }
      this.elements = m.elements;
      this.versions = m.versions;
      this.revision = m.revision;
      this.pending.clear();
      this.status("Conectado · salvo");
      this.render();
    }
    if (m.type === "board-update") {
      const before = clone(this.elements[m.id]);
      if (m.element) this.elements[m.id] = m.element;
      else delete this.elements[m.id];
      this.versions[m.id] = m.version;
      this.revision = m.revision;
      const p = this.pending.get(m.request);
      if (p && m.actor === this.user?.id) {
        this.pending.delete(m.request);
        if (p.history) {
          const source = p.history.target === this.redo ? this.undo : this.redo;
          const previous = [...source].reverse().find((entry) => entry.id === m.id);
          if (previous) previous.version = m.version;
          p.history.target.push({ id: m.id, before: p.history.before, after: p.history.after, version: m.version });
        } else {
          this.undo.push({ id: m.id, before, after: clone(m.element), version: m.version });
          this.redo = [];
        }
      }
      this.status(this.pending.size ? "Salvando…" : "Conectado · salvo");
      this.render();
    }
    if (m.type === "board-error") {
      this.pending.delete(m.request);
      this.status(m.message + " Use Tentar sincronizar.");
      this.render();
    }
    if (m.type === "board-presence" && m.id !== this.user?.id) {
      this.cursors.set(m.id, { ...m, time: Date.now() });
      this.render();
    }
  }
  allowed() {
    if (!this.online) {
      this.status("Sem conexão. Tente sincronizar.");
      return false;
    }
    if (!this.host && !this.user?.edit) {
      this.status("Somente visualização");
      return false;
    }
    return true;
  }
  put(id, element, history, version = this.versions[id] || 0) {
    if (!this.allowed() || [...this.pending.values()].some((p) => p.id === id)) return;
    const request = crypto.randomUUID();
    this.pending.set(request, { id, history });
    this.status("Salvando…");
    this.send({ type: "board-put", id, element, version, request });
    setTimeout(() => {
      if (this.pending.has(request)) this.status("Sem confirmação de salvamento. Tente sincronizar.");
    }, 6e3);
  }
  history(redo) {
    const source = redo ? this.redo : this.undo;
    const entry = source.at(-1);
    if (!entry || !this.allowed()) return;
    if (this.versions[entry.id] !== entry.version) {
      this.status("Elemento alterado por outra ação. Histórico preservado para evitar sobrescrever.");
      return;
    }
    source.pop();
    this.put(entry.id, clone(redo ? entry.after : entry.before), { target: redo ? this.undo : this.redo, before: entry.before, after: entry.after }, entry.version);
  }
  options() {
    return readOptions(this);
  }
  updateTools() {
    return updateTools(this);
  }
  updateProperties() {
    return updateProperties(this);
  }
  loadProperties(element) {
    return loadProperties(this, element);
  }
  point(e) {
    return toWorldPoint(this, e);
  }
  down(e) {
    if (e.button !== 0) return;
    this.finishEdit();
    this.svg.setPointerCapture(e.pointerId);
    const p = this.point(e), id = e.target.closest("[data-id]")?.dataset.id;
    if (this.space || this.tool === "pan") {
      this.drag = { pan: true, start: { x: e.clientX, y: e.clientY }, original: { ...this.pan } };
      return;
    }
    if (this.tool === "laser") return;
    if (this.tool === "select") {
      this.selected = id;
      this.loadProperties(this.elements[id]);
      this.updateProperties();
      if (id && this.allowed()) this.drag = { id, start: p, original: clone(this.elements[id]), resize: e.target.dataset.resize === "true" };
      this.render();
      return;
    }
    if (!this.allowed()) return;
    if (this.tool === "eraser") {
      if (id) this.put(id, null);
      return;
    }
    const kind = this.tool;
    const element = { kind, x: p.x, y: p.y, w: kind === "text" || kind === "sticky" ? 240 : kind === "stamp" ? 64 : 1, h: kind === "sticky" ? 160 : kind === "text" ? 80 : kind === "stamp" ? 48 : 1, text: kind === "stamp" ? this.panel.querySelector("#wbStamp").value : "", points: [[0, 0]], ...this.options() };
    if (kind === "sticky") element.fill = this.panel.querySelector("#wbFill").value;
    const key = crypto.randomUUID();
    this.drag = { id: key, start: p, element };
    this.render();
  }
  move(e) {
    const p = this.point(e);
    if (this.online && Date.now() - (this.lastPresence || 0) > 70) {
      this.lastPresence = Date.now();
      this.send({ type: "board-presence", ...p, laser: this.tool === "laser" && e.buttons === 1 });
    }
    const d = this.drag;
    if (!d) return;
    if (d.pan) {
      this.pan = { x: d.original.x + e.clientX - d.start.x, y: d.original.y + e.clientY - d.start.y };
      this.transform();
      return;
    }
    if (d.original) {
      d.element = clone(d.original);
      if (d.resize) {
        d.element.w = Math.max(10, d.original.w + p.x - d.start.x);
        d.element.h = Math.max(10, d.original.h + p.y - d.start.y);
        d.element.points = d.original.points.map(([x, y]) => [x * d.element.w / d.original.w, y * d.element.h / d.original.h]);
      } else {
        d.element.x += p.x - d.start.x;
        d.element.y += p.y - d.start.y;
      }
    } else if (d.element.kind === "pen") {
      if (d.element.points.length < 1500) d.element.points.push([p.x - d.start.x, p.y - d.start.y]);
      const xs = d.element.points.map((v) => v[0]), ys = d.element.points.map((v) => v[1]);
      d.element.w = Math.max(1, ...xs) - Math.min(0, ...xs);
      d.element.h = Math.max(1, ...ys) - Math.min(0, ...ys);
    } else if (!["text", "sticky", "stamp"].includes(d.element.kind)) {
      d.element.x = Math.min(p.x, d.start.x);
      d.element.y = Math.min(p.y, d.start.y);
      d.element.w = Math.max(1, Math.abs(p.x - d.start.x));
      d.element.h = Math.max(1, Math.abs(p.y - d.start.y));
      d.element.points = [[d.start.x - d.element.x, d.start.y - d.element.y], [p.x - d.element.x, p.y - d.element.y]];
    }
    this.render();
  }
  up() {
    const d = this.drag;
    this.drag = null;
    if (d?.element) {
      if (d.element.kind === "pen" && !d.original) {
        const minX = Math.min(...d.element.points.map((p) => p[0])), minY = Math.min(...d.element.points.map((p) => p[1]));
        d.element.x += minX;
        d.element.y += minY;
        d.element.points = d.element.points.map(([x, y]) => [x - minX, y - minY]);
      }
      this.selected = d.id;
      this.put(d.id, d.element);
      if (["text", "sticky"].includes(d.element.kind) && !d.original) this.edit(d.id, d.element);
    }
    this.render();
  }
  edit(id, draft) {
    const e = draft || this.elements[id];
    if (!e || !["text", "sticky", "stamp"].includes(e.kind) || !this.allowed()) return;
    this.editing = { id, element: clone(e) };
    this.editor.value = e.text;
    this.editor.classList.remove("hidden");
    this.editor.focus();
  }
  finishEdit() {
    if (!this.editing) return;
    const { id, element } = this.editing;
    this.editing = null;
    element.text = this.editor.value;
    this.editor.classList.add("hidden");
    const wait = () => {
      if (!this.online) return;
      if ([...this.pending.values()].some((p) => p.id === id)) {
        setTimeout(wait, 150);
        return;
      }
      this.put(id, element);
    };
    wait();
  }
  node(tag, attrs, parent = this.world) {
    return createSvgNode(this, tag, attrs, parent);
  }
  draw(e, id, parent = this.world) {
    return drawElement(this, e, id, parent);
  }
  render() {
    return renderBoard(this);
  }
  transform() {
    return transformViewport(this);
  }
  zoomAt(factor) {
    return zoomViewport(this, factor);
  }
  bounds() {
    return getContentBounds(this);
  }
  action(action) {
    if (action === "shortcuts") {
      this.panel.querySelector(".wb-menu").open = false;
      this.shortcuts.showModal();
      return;
    }
    if (action === "close") return this.close();
    if (action === "retry") {
      this.send({ type: "board-get" });
      return;
    }
    if (action === "undo" || action === "redo") return this.history(action === "redo");
    if (action === "delete" && this.selected) return this.put(this.selected, null);
    if (action === "apply" && this.elements[this.selected]) return this.put(this.selected, { ...this.elements[this.selected], ...this.options() });
    if (action === "clear" && this.host && confirm("Remover todo o conteúdo do quadro?")) this.send({ type: "board-clear", revision: this.revision });
    if (action === "permission" && this.host) {
      const id = this.panel.querySelector("#wbMembers").value;
      const member = this.members.find((u) => u.id === id);
      if (member) this.send({ type: "board-permission", user: id, edit: !member.edit });
    }
    if (action === "in" || action === "out") this.zoomAt(action === "in" ? 1.2 : 1 / 1.2);
    if (action === "fit") {
      const b = this.bounds(), r = this.svg.getBoundingClientRect();
      this.zoom = Math.min(4, r.width / b.width, r.height / b.height);
      this.pan = { x: (r.width - b.width * this.zoom) / 2 - b.x * this.zoom, y: (r.height - b.height * this.zoom) / 2 - b.y * this.zoom };
      this.transform();
    }
    if (action === "png" || action === "pdf") void this.export(action);
  }
  export(format) {
    return exportBoard(this, format);
  }
}
export {
  Whiteboard
};
