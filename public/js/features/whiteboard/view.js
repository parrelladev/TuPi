// Interface, propriedades das ferramentas e atalhos exclusivos do quadro.
function mountWhiteboard(board) {
  board.panel = document.createElement("section");
  board.panel.id = "whiteboard";
  board.panel.className = "wb hidden";
  board.panel.setAttribute("aria-label", "Quadro Branco colaborativo");
  board.panel.classList.add("fx");
  const icon = (name) => '<i class="ph ' + name + '" aria-hidden="true"></i>';
  const button = (action, label, symbol, text = false) => '<button type="button" data-action="' + action + '" title="' + label + '" aria-label="' + label + '">' + icon(symbol) + (text ? "<span>" + label + "</span>" : "") + "</button>";
  board.panel.innerHTML = `<header class="wb-header">
<div class="wb-heading">
<span class="wb-heading-icon">${icon("ph-chalkboard-simple")}</span>
<strong>Quadro Branco</strong>
<span id="wbStatus" role="status">Conectando…</span>
</div>
<div class="wb-header-actions">${button("undo", "Desfazer", "ph-arrow-counter-clockwise")}${button("redo", "Refazer", "ph-arrow-clockwise")}<span class="wb-divider">
</span>${button("shortcuts", "Atalhos do quadro", "ph-keyboard")}<details class="wb-menu">
<summary title="Opções do quadro" aria-label="Opções do quadro">${icon("ph-dots-three-outline")}</summary>
<div class="wb-menu-content">
<strong>Opções do quadro</strong>${button("png", "Exportar PNG", "ph-image", true)}${button("pdf", "Exportar PDF", "ph-file-pdf", true)}${button("retry", "Tentar sincronizar", "ph-arrows-clockwise", true)}<label class="wb-authors"><input id="wbAuthors" type="checkbox">Mostrar autoria</label>
<div class="wb-permissions">
<label for="wbMembers">Participantes</label>
<select id="wbMembers" aria-label="Permissões do participante">
</select>${button("permission", "Alternar edição", "ph-lock-simple", true)}</div>${button("clear", "Limpar quadro", "ph-trash", true)}</div>
</details>
</div>
</header>
<div class="wb-workspace">
<div class="wb-tools" role="toolbar" aria-label="Ferramentas do quadro" aria-orientation="vertical">
</div>
<div class="wb-canvas">
<div class="wb-options" role="group" aria-label="Propriedades da ferramenta">
<span id="wbToolName">Seleção</span>
<span data-properties="stamp">
<label>Carimbo<select id="wbStamp">
<option>★</option>
<option>✓</option>
<option>➜</option>
<option>👍</option>
</select>
</label>
</span>
<span data-properties="color">
<label>Cor<input id="wbColor" type="color" value="#2457c5">
</label>
</span>
<span data-properties="fill">
<label>Fundo<input id="wbFill" type="color" value="#fff19c">
</label>
<label><input id="wbFilled" type="checkbox">Preencher</label>
</span>
<span data-properties="stroke">
<label>Traço<input id="wbStroke" type="number" min="1" max="30" value="3">
</label>
</span>
<span data-properties="text">
<label>Tamanho<input id="wbSize" type="number" min="8" max="120" value="24">
</label>
<label><input id="wbBold" type="checkbox"><b>Negrito</b>
</label>
<label>Alinhar<select id="wbAlign">
<option value="left">Esquerda</option>
<option value="center">Centro</option>
<option value="right">Direita</option>
</select>
</label>
</span>
<span data-properties="selection">${button("apply", "Aplicar estilo", "ph-check", true)}${button("delete", "Excluir elemento", "ph-trash")}</span>
<span id="wbToolHint">Selecione um elemento para editar</span>
</div>
<div class="wb-stage">
<svg tabindex="0" role="img" aria-label="Área de desenho. Arraste para desenhar; selecione para mover. Alça no canto redimensiona."><g class="wb-world"></g>
</svg>
<textarea class="wb-editor hidden" aria-label="Conteúdo do elemento" maxlength="4000">
</textarea>
<div class="wb-navigation" role="group" aria-label="Navegação do quadro">${button("out", "Diminuir zoom", "ph-minus")}<output id="wbZoom" aria-label="Zoom">100%</output>${button("in", "Aumentar zoom", "ph-plus")}<span class="wb-divider">
</span>${button("fit", "Ajustar à tela", "ph-corners-out")}</div>
</div>
</div>
</div>`;
  document.getElementById("stagePanel").append(board.panel);
  board.svg = board.panel.querySelector("svg");
  board.world = board.panel.querySelector(".wb-world");
  board.editor = board.panel.querySelector("textarea");
  board.toolLabels = { select: "Seleção", pen: "Lápis", text: "Texto", line: "Linha", arrow: "Seta", rect: "Retângulo", circle: "Círculo", sticky: "Nota adesiva", stamp: "Carimbo", laser: "Apontador a laser", eraser: "Borracha", pan: "Mover área" };
  const icons = { select: "ph-cursor", pen: "ph-pencil-simple", text: "ph-text-t", line: "ph-line-segment", arrow: "ph-arrow-up-right", rect: "ph-rectangle", circle: "ph-circle", sticky: "ph-note", stamp: "ph-star", laser: "ph-crosshair", eraser: "ph-eraser", pan: "ph-hand" };
  for (const [tool, label] of Object.entries(board.toolLabels)) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = icon(icons[tool]);
    b.title = label;
    b.setAttribute("aria-label", label);
    b.dataset.tool = tool;
    board.panel.querySelector(".wb-tools").append(b);
  }
  board.shortcuts = document.createElement("dialog");
  board.shortcuts.id = "wbShortcutsDialog";
  board.shortcuts.className = "shortcuts-dialog wb-shortcuts";
  board.shortcuts.setAttribute("aria-labelledby", "wbShortcutsTitle");
  const shortcuts = [["V", "Selecionar elementos"], ["P", "Desenhar com lápis"], ["T", "Criar texto"], ["Delete", "Excluir seleção"], ["Ctrl / ⌘ + Z", "Desfazer minha ação"], ["Ctrl / ⌘ + Shift + Z", "Refazer minha ação"], ["Espaço + arrastar", "Mover área do quadro"], ["Roda", "Aumentar ou diminuir zoom"], ["Duplo clique", "Editar texto, nota ou carimbo"]];
  board.shortcuts.innerHTML = '<div class="shortcuts-head"><h2 id="wbShortcutsTitle">' + icon("ph-keyboard") + 'Atalhos do quadro</h2><button class="btn btn-soft" type="button" aria-label="Fechar">' + icon("ph-x") + '</button></div><dl class="shortcuts-list">' + shortcuts.map(([key, label]) => "<div><dt>" + key.split(" + ").map((k) => "<kbd>" + k + "</kbd>").join(" + ") + "</dt><dd>" + label + "</dd></div>").join("") + '</dl><p class="shortcuts-note">Disponíveis na área do quadro. Enquanto você digita, os atalhos de edição ficam suspensos.</p>';
  board.panel.append(board.shortcuts);
  board.shortcuts.querySelector("button").onclick = () => board.shortcuts.close();
  board.shortcuts.addEventListener("click", (e) => {
    if (e.target === board.shortcuts) board.shortcuts.close();
  });
  board.panel.querySelector(".wb-menu").addEventListener("toggle", (e) => e.target.querySelector("summary").setAttribute("aria-expanded", String(e.target.open)));
  document.addEventListener("click", (e) => {
    const menu = board.panel.querySelector(".wb-menu");
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  board.panel.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tool) {
      board.finishEdit();
      board.selected = null;
      board.tool = b.dataset.tool;
      board.updateTools();
      board.svg.focus();
    } else board.action(b.dataset.action);
  });
  board.panel.querySelector("#wbAuthors").onchange = () => board.render();
  board.svg.addEventListener("pointerdown", (e) => board.down(e));
  board.svg.addEventListener("pointermove", (e) => board.move(e));
  board.svg.addEventListener("pointerup", (e) => board.up(e));
  board.svg.addEventListener("pointercancel", () => {
    board.drag = null;
    board.render();
  });
  board.svg.addEventListener("dblclick", (e) => {
    const id = e.target.closest("[data-id]")?.dataset.id;
    if (id) board.edit(id);
  });
  board.svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    board.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  board.editor.addEventListener("blur", () => board.finishEdit());
  document.addEventListener("keydown", (e) => {
    if (board.panel.classList.contains("hidden") || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.target !== board.svg) return;
    if (!["Space", "Delete", "Backspace", "Escape", "KeyV", "KeyP", "KeyT", "KeyZ"].includes(e.code)) return;
    e.stopImmediatePropagation();
    if (e.code === "Space") {
      e.preventDefault();
      board.space = true;
    }
    if (e.key === "Escape") {
      board.selected = null;
      board.tool = "select";
      board.updateTools();
      board.render();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      board.action("delete");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      board.history(e.shiftKey);
    }
    if (!e.ctrlKey && !e.metaKey && { v: "select", p: "pen", t: "text" }[e.key]) {
      board.tool = { v: "select", p: "pen", t: "text" }[e.key];
      board.updateTools();
    }
  }, true);
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") board.space = false;
  });
}
function readOptions(board) {
  const val = (id) => board.panel.querySelector("#wb" + id);
  return { color: val("Color").value, fill: val("Filled").checked ? val("Fill").value : "none", stroke: Math.max(1, Math.min(30, +val("Stroke").value || 3)), size: Math.max(8, Math.min(120, +val("Size").value || 24)), bold: val("Bold").checked, align: val("Align").value };
}
function updateTools(board) {
  for (const b of board.panel.querySelectorAll("[data-tool]")) b.setAttribute("aria-pressed", String(b.dataset.tool === board.tool));
  board.updateProperties();
}
function updateProperties(board) {
  const selected = board.tool === "select" && board.elements[board.selected], kind = selected?.kind || board.tool;
  const text = ["text", "sticky", "stamp"].includes(kind), shape = ["rect", "circle"].includes(kind);
  const visible = { color: text || shape || ["pen", "line", "arrow"].includes(kind), fill: shape || kind === "sticky", stroke: shape || ["pen", "line", "arrow", "sticky"].includes(kind), text, stamp: kind === "stamp", selection: !!selected };
  for (const el of board.panel.querySelectorAll("[data-properties]")) el.hidden = !visible[el.dataset.properties];
  board.panel.querySelector("#wbToolName").textContent = board.toolLabels[kind] || "Seleção";
  const hint = board.panel.querySelector("#wbToolHint");
  hint.hidden = visible.color;
  hint.textContent = { select: "Selecione um elemento para editar", pan: "Arraste para navegar", laser: "Pressione e mova para destacar", eraser: "Toque em um elemento para apagar" }[kind] || "";
}
function loadProperties(board, element) {
  if (!element) return;
  for (const [id, key] of Object.entries({ Color: "color", Fill: "fill", Stroke: "stroke", Size: "size", Align: "align" })) if (element[key] !== "none") board.panel.querySelector("#wb" + id).value = element[key];
  board.panel.querySelector("#wbBold").checked = element.bold;
  board.panel.querySelector("#wbFilled").checked = element.fill !== "none";
}
export {
  loadProperties,
  mountWhiteboard,
  readOptions,
  updateProperties,
  updateTools
};
