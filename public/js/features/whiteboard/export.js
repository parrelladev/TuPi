// Exportação local em PNG e PDF, sem arquivos públicos no servidor.
const NS = "http://www.w3.org/2000/svg";
async function exportBoard(board, format) {
  try {
    if (!board.online) throw new Error("Reconecte antes de exportar.");
    const b = board.bounds();
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
    svg.setAttribute("width", b.width);
    svg.setAttribute("height", b.height);
    for (const [id, e] of Object.entries(board.elements)) board.draw(e, id, svg);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    try {
      image.src = url;
      await image.decode();
      const scale = Math.min(2, 12e3 / b.width, 12e3 / b.height, Math.sqrt(32e6 / (b.width * b.height)));
      if (scale < 0.5) throw new Error("Quadro muito extenso para exportar com legibilidade.");
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(b.width * scale);
      canvas.height = Math.ceil(b.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob;
      if (format === "png") blob = await new Promise((resolve) => canvas.toBlob(resolve));
      else blob = createPdf(canvas);
      if (!blob) throw new Error("Não foi possível gerar o arquivo.");
      const download = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = download;
      a.download = `quadro-branco.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(download), 1e4);
      board.status("Exportação concluída");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    board.status("Falha na exportação: " + e.message + " Tente novamente.");
  }
}
function createPdf(canvas) {
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const parts = [];
  let length = 0;
  const offsets = [0];
  const add = (v) => {
    const b = typeof v === "string" ? encoder.encode(v) : v;
    parts.push(b);
    length += b.length;
  };
  add("%PDF-1.4\n");
  const w = 1440, h = w * canvas.height / canvas.width;
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>`];
  objects.forEach((o, i) => {
    offsets.push(length);
    add(`${i + 1} 0 obj
${o}
endobj
`);
  });
  offsets.push(length);
  add(`4 0 obj
<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>
stream
`);
  add(bytes);
  add("\nendstream\nendobj\n");
  const stream = `q ${w} 0 0 ${h} 0 0 cm /Im Do Q`;
  offsets.push(length);
  add(`5 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj
`);
  const start = length;
  add(`xref
0 6
0000000000 65535 f 
${offsets.slice(1).map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer
<< /Size 6 /Root 1 0 R >>
startxref
${start}
%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}
export {
  createPdf,
  exportBoard
};
