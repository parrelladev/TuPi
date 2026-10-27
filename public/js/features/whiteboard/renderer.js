// Renderização SVG, coordenadas e navegação da área de trabalho.
const NS = "http://www.w3.org/2000/svg";
function toWorldPoint(board, e) {
  const r = board.svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - board.pan.x) / board.zoom, y: (e.clientY - r.top - board.pan.y) / board.zoom };
}
function createSvgNode(board, tag, attrs, parent = board.world) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.append(n);
  return n;
}
function drawElement(board, e, id, parent = board.world) {
  const g = board.node("g", { "data-id": id, transform: `translate(${e.x} ${e.y})` }, parent);
  const a = { stroke: e.color, "stroke-width": e.stroke, fill: e.fill };
  if (e.kind === "pen") {
    board.node("polyline", { ...a, fill: "none", points: e.points.map((p) => p.join(",")).join(" "), "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
  } else if (["line", "arrow"].includes(e.kind)) {
    const [p, q] = e.points.length > 1 ? e.points : [[0, 0], [e.w, e.h]];
    board.node("line", { ...a, x1: p[0], y1: p[1], x2: q[0], y2: q[1] }, g);
    if (e.kind === "arrow") {
      const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
      board.node("polyline", { ...a, fill: "none", points: [[q[0] - 18 * Math.cos(angle - 0.5), q[1] - 18 * Math.sin(angle - 0.5)], q, [q[0] - 18 * Math.cos(angle + 0.5), q[1] - 18 * Math.sin(angle + 0.5)]].map((p2) => p2.join(",")).join(" ") }, g);
    }
  } else if (e.kind === "circle") board.node("ellipse", { ...a, cx: e.w / 2, cy: e.h / 2, rx: e.w / 2, ry: e.h / 2 }, g);
  else if (e.kind === "rect" || e.kind === "sticky") board.node("rect", { ...a, width: e.w, height: e.h, rx: e.kind === "sticky" ? 5 : 0 }, g);
  if (["text", "sticky", "stamp"].includes(e.kind)) {
    const x = e.align === "center" ? e.w / 2 : e.align === "right" ? e.w - 10 : 10;
    const text = board.node("text", { x, y: e.size + 8, fill: e.color, "font-size": e.size, "font-family": "Arial, sans-serif", "font-weight": e.bold ? "bold" : "normal", "text-anchor": e.align === "center" ? "middle" : e.align === "right" ? "end" : "start" }, g);
    let lines = [];
    const max = Math.max(1, Math.floor((e.w - 20) / (e.size * 0.62)));
    for (const line of e.text.split("\n")) {
      if (!line) lines.push("");
      for (let i = 0; i < line.length; i += max) lines.push(line.slice(i, i + max));
    }
    for (const [line, i] of lines.map((v, i2) => [v, i2])) board.node("tspan", { x, dy: i ? e.size * 1.25 : 0 }, text).textContent = line;
  }
  if (board.panel.querySelector("#wbAuthors").checked) board.node("text", { x: 0, y: -8, fill: e.color, "font-size": 12 }, g).textContent = e.author || board.user?.name || "";
  return g;
}
function renderBoard(board) {
  board.updateProperties();
  board.world.replaceChildren();
  for (const [id, e2] of Object.entries(board.elements)) {
    if (board.drag?.id !== id || !board.drag.element) board.draw(e2, id);
  }
  if (board.drag?.element) board.draw(board.drag.element, board.drag.id);
  const e = board.elements[board.selected];
  if (e) {
    const g = board.node("g", { "data-id": board.selected });
    board.node("rect", { x: e.x - 4, y: e.y - 4, width: e.w + 8, height: e.h + 8, fill: "none", stroke: "#008aab", "stroke-dasharray": "5 4", "pointer-events": "none" }, g);
    board.node("rect", { x: e.x + e.w - 6, y: e.y + e.h - 6, width: 14, height: 14, fill: "#008aab", "data-resize": "true" }, g);
  }
  for (const c of board.cursors.values()) {
    const color = ["#c62828", "#6a1b9a", "#00796b"][c.id.charCodeAt(0) % 3];
    board.node("circle", { cx: c.x, cy: c.y, r: c.laser ? 14 : 5, fill: color, opacity: c.laser ? 0.65 : 1 });
    board.node("text", { x: c.x + 16, y: c.y, fill: color, "font-size": 14 }).textContent = c.name;
  }
  board.transform();
}
function transformViewport(board) {
  board.panel.querySelector("#wbZoom").textContent = Math.round(board.zoom * 100) + "%";
  board.world.setAttribute("transform", `translate(${board.pan.x} ${board.pan.y}) scale(${board.zoom})`);
}
function zoomViewport(board, factor) {
  board.zoom = Math.min(4, Math.max(0.1, board.zoom * factor));
  board.transform();
}
function getContentBounds(board) {
  const g = document.createElementNS(NS, "g");
  board.svg.append(g);
  for (const [id, e] of Object.entries(board.elements)) board.draw(e, id, g);
  const b = g.getBBox();
  g.remove();
  return { x: b.x - 30, y: b.y - 30, width: Math.max(100, b.width + 60), height: Math.max(100, b.height + 60) };
}
export {
  createSvgNode,
  drawElement,
  getContentBounds,
  renderBoard,
  toWorldPoint,
  transformViewport,
  zoomViewport
};
