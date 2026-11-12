// Vigia dos arquivos da própria extensão, pra atualizar sem recarregar o VS
// Code (pedido do Nik, 2026-11-12). `ler()` devolve uma assinatura (ex.:
// mtimes) ou null se algo sumiu; `aoMudar(nova)` roda só quando a mudança
// ASSENTOU — mesma assinatura em duas checagens seguidas — porque a
// instalação extrai arquivo por arquivo. Puro (sem timer): quem chama
// decide o intervalo.
function criarVigia(ler, aoMudar) {
  let aplicada = ler();
  let anterior = aplicada;
  return function tick() {
    const atual = ler();
    if (atual != null && atual === anterior && atual !== aplicada) {
      aplicada = atual;
      aoMudar(atual);
    }
    anterior = atual;
  };
}

module.exports = { criarVigia };
