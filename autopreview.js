// Markdown abre no preview mesmo vindo de link (pedido do Nik, 2026-11-12).
// O workbench.editorAssociations (*.md -> preview) só vale pra quem abre
// pelo comando genérico (Explorer); os links do painel do Claude Code,
// terminal e Copilot usam showTextDocument e caem no editor de texto. A
// extensão troca a aba pro preview logo depois de abrir.
//
// Exceções: só arquivo .md em disco, sem edição pendente, nunca diff; e
// quem volta pro texto de propósito ("Reopen Editor With… → Text Editor":
// o preview fecha e o texto abre, em qualquer ordem) fica no texto até
// fechar todas as abas daquele arquivo. Puro: a extensão traduz as abas do
// VS Code pra { tipo: 'texto'|'custom'|'diff'|..., uri, scheme, caminho,
// sujo, viewType }.
const PREVIEW = 'vscode.markdown.preview.editor';
const JANELA_VOLTA_MS = 1500;

function criarEstado() {
  return { manterTexto: new Set(), previewFechado: new Map(), textoAberto: new Map() };
}

function registrarEvento(estado, { abertas = [], fechadas = [], abertasAgora = [] }, agora) {
  for (const t of fechadas) if (t.tipo === 'custom' && t.viewType === PREVIEW) estado.previewFechado.set(t.uri, agora);
  for (const t of abertas) {
    if (t.tipo !== 'texto') continue;
    estado.textoAberto.set(t.uri, agora);
    const fechou = estado.previewFechado.get(t.uri);
    if (fechou != null && Math.abs(agora - fechou) <= JANELA_VOLTA_MS) estado.manterTexto.add(t.uri);
  }
  // Preview fechou logo DEPOIS do texto abrir (ordem inversa): também é volta.
  for (const t of fechadas) {
    if (t.tipo !== 'custom' || t.viewType !== PREVIEW) continue;
    const abriu = estado.textoAberto.get(t.uri);
    if (abriu != null && Math.abs(agora - abriu) <= JANELA_VOLTA_MS) estado.manterTexto.add(t.uri);
  }
  const aindaAbertas = new Set(abertasAgora);
  for (const uri of [...estado.manterTexto]) if (!aindaAbertas.has(uri)) estado.manterTexto.delete(uri);
}

function deveTrocar(estado, aba, agora) {
  if (!aba || aba.tipo !== 'texto' || aba.scheme !== 'file' || aba.sujo) return false;
  if (!/\.md$/i.test(aba.caminho || aba.uri)) return false;
  if (estado.manterTexto.has(aba.uri)) return false;
  const fechou = estado.previewFechado.get(aba.uri);
  return !(fechou != null && Math.abs(agora - fechou) <= JANELA_VOLTA_MS);
}

module.exports = { PREVIEW, criarEstado, registrarEvento, deveTrocar };
