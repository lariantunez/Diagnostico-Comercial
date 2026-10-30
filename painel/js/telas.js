// Telas do painel. Cada tela recebe o resultado do motor (R) e o elemento onde desenhar.
const Telas = (() => {
  const M = Motor;
  const { el } = UI;
  const COR_STATUS = ["var(--series-1)", "var(--series-2)", "var(--muted-mark)", "var(--series-3)", "var(--series-4)", "var(--series-8)", "var(--mapa-estavel)", "var(--series-5)"];

  // ---------- Helpers ----------
  const sinal = (v) => (v > 0 ? "sobe" : v < 0 ? "desce" : "");
  const cVar = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `<span class="delta ${v === Infinity ? "sobe" : sinal(v)}">${Fmt.var(v)}</span>`);
  const cRs = (v) => Fmt.rs0(v);
  const cDRs = (v) => (Number.isFinite(v) ? `<span class="delta ${sinal(v)}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Fmt.rs0(Math.abs(v)).replace("R$ ", "R$ ")}</span>` : "—");
  const cPp = (v) => (Number.isFinite(v) ? `<span class="delta ${sinal(v)}">${Fmt.pp(v)}</span>` : "—");
  const cPct = (v) => Fmt.pct(v);
  const cNum = (v) => Fmt.num(v);
  // Variação de quantidade com sinal e cor (verde sobe, vermelho cai).
  const cDNum = (v) => (Number.isFinite(v) ? `<span class="delta ${sinal(v)}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Fmt.num(Math.abs(v))}</span>` : "—");
  const cPreco = (v) => (Number.isFinite(v) ? Fmt.rs(v) : "—");
  const taxa = (a, b) => (b > 0 ? a / b - 1 : a > 0 ? Infinity : null);
  const div0 = (a, b) => (b ? a / b : null);
  // Seleção por clique: filtra o painel todo (clientes e/ou produtos). Mesmo rótulo de novo = tira o filtro; null = limpa.
  const selecionar = (rotulo, extra = {}) => window.dispatchEvent(new CustomEvent("painel:selecao", { detail: rotulo ? { rotulo, ...extra } : null }));
  // Mesmo cálculo sem a seleção por clique: base para montar os grupos que podem ser selecionados.
  const cacheSemSel = new WeakMap();
  function semSelecao(R) {
    if (!R.f.selecao) return R;
    if (!cacheSemSel.has(R)) cacheSemSel.set(R, Motor.calcular({ ...R.f, selecao: null }));
    return cacheSemSel.get(R);
  }
  // Clientes de uma ou mais situações (id "0" ou "0,2"), com o mesmo critério da contagem dos cartões (R.ponte):
  // inclui quem só tem pedido (sem nota); funcionários ficam de fora.
  function idsSituacao(X, id) {
    const sts = String(id).split(",").map(Number), ids = [];
    for (let c = 0; c < M.nC; c += 1) if (X.cOK[c] && !X.funcionario[c] && sts.includes(X.status[c]) && (X.cli.valS[c] || X.cli.valC[c] || X.cli.compraS[c] || X.cli.compraC[c])) ids.push(c);
    return ids;
  }
  // Algum filtro de cliente ativo (menu, clique, mapa ou demonstradora): há cliente fora de cOK.
  const temFiltroCliente = (R) => { for (let c = 0; c < M.nC; c += 1) if (!R.cOK[c]) return true; return false; };
  // Cartões clicáveis: cada cartão recebe [rótulo, () => ids de clientes]; o clique filtra o painel e rola até a tabela de clientes.
  function cartoesClicaveis(resumo, acoes, rolar = "__rolarTabela") {
    [...resumo.children].forEach((k, i) => {
      const a = acoes[i];
      if (!a) return;
      k.classList.add("clicavel");
      if (window.__selRotulos?.includes(a[0])) k.classList.add("selecionado");
      k.title = "Clique para filtrar o painel por esses clientes";
      k.addEventListener("click", (ev) => { if (ev.target.closest("details")) return; window[rolar] = !window.__selRotulos?.includes(a[0]); selecionar(a[0], { clientes: a[1]() }); });
    });
  }
  const NOME_SITUACAO = { 0: "Cresceram", 2: "Mantiveram estáveis", "0,2": "Cresceram ou mantiveram estáveis", "2,6,7": "Ajustes/devoluções", 1: "Reduziram", 3: "Novos ou reativados", 7: "Pararam de comprar", 5: "Perdidos" };
  const selo = (txt, cor) => `<span class="selo" style="--c:${cor}">${Fmt.esc(txt)}</span>`;
  const nomeCliente = (c) => M.clientes[c].nome;
  const local = (c) => M.dic.municipio[M.clientes[c].mun];

  function textoPeriodo(lista) {
    if (!lista.length) return "—";
    if (lista.length === 1) return Fmt.mesLongo(lista[0]);
    const cont = lista.every((p, i) => i === 0 || M.desloca(lista[i - 1], 1) === p);
    return cont ? `${Fmt.mesLongo(lista[0])} - ${Fmt.mesLongo(lista.at(-1))}` : `${lista.length} meses (${Fmt.mesLongo(lista[0])} - ${Fmt.mesLongo(lista.at(-1))})`;
  }
  const textoComp = (R) => (R.temC ? textoPeriodo(R.C) : "sem período de comparação");
  // Balão no formato dos cartões para linhas com faturamento (valS × valC), usado em vendedores, categorias e produtos:
  // faturamento do período; linha divisória e o ano anterior em cinza; rodapé com a variação; indicadores da linha abaixo.
  const tipFaturamento = (l, R, extras = []) => UI.tipCartao({
    valor: Fmt.rs(l.valS), periodo: textoPeriodo(R.S),
    ...(R.temC ? { valorAnt: Fmt.rs(l.valC), periodoAnt: textoPeriodo(R.C), rodape: `${UI.delta(l.valS, l.valC)} <span class="tc-dif ${sinal(l.valS - l.valC)}">${Fmt.varRsCheio(l.valS - l.valC)}</span>` } : {}),
    extras,
  });

  function avisoComparacao(R, alvo) {
    if (R.sobreposto) { alvo.append(el("p", { class: "aviso" }, "<strong>Sem comparação:</strong> o período de comparação se sobrepõe ao período selecionado (acontece ao selecionar mais de 12 meses com “mesmo período do ano anterior”, ou todos os períodos). Use “Período imediatamente anterior” ou selecione até 12 meses.")); return; }
    if (R.cIncompleta) alvo.append(el("p", { class: "aviso" }, `<strong>Comparação incompleta:</strong> só ${R.C.length} dos ${R.S.length} meses equivalentes têm dados. O crescimento fica superestimado.`));
    if (!R.temC) alvo.append(el("p", { class: "aviso" }, "<strong>Sem período de comparação para o ano anterior.</strong>"));
  }
  function avisoPedidos(R, alvo) {
    if (R.filtroProduto) alvo.append(el("p", { class: "aviso" }, "<strong>Filtro de família/categoria ativo:</strong> a base de pedidos não tem produto, então <strong>pedidos e ticket médio</strong> consideram todos os produtos do cliente."));
  }

  // Meses exibidos nos gráficos de evolução: a partir do início da série contínua.
  function mesesGrafico(R) {
    const comDados = M.mesesComDados;
    let inicio = comDados[0];
    for (let i = comDados.length - 1; i > 0; i -= 1) if (M.desloca(comDados[i - 1], 1) !== comDados[i]) { inicio = comDados[i]; break; }
    const extra = new Set([...R.S, ...R.C]);
    // O mês parcial (em andamento) só entra se estiver selecionado, para não parecer uma queda.
    return comDados.filter((p) => (p >= inicio || extra.has(p)) && (p !== M.mesParcial || extra.has(p)));
  }

  function agruparClientes(R, chaveDe) {
    const g = new Map();
    const { cli, status } = R;
    for (let c = 0; c < M.nC; c += 1) {
      if (!cli.valS[c] && !cli.valC[c] && !cli.pedS[c] && !cli.pedC[c]) continue;
      const k = chaveDe(c);
      // funcS/funcC: faturamento de funcionários ("Outros clientes"), que entra no total do grupo.
      const a = g.get(k) || { k, funcS: 0, funcC: 0, valS: 0, valC: 0, ativosS: 0, ativosC: 0, novos: 0, reativados: 0, perdidos: 0, cresceram: 0, reduziram: 0, dNovos: 0, dReat: 0, dCresc: 0, dRed: 0, dPerd: 0, pedS: 0, pedC: 0, qpS: 0, qpC: 0 };
      a.valS += cli.valS[c]; a.valC += cli.valC[c]; a.pedS += cli.pedS[c]; a.pedC += cli.pedC[c]; a.qpS += cli.qpS[c]; a.qpC += cli.qpC[c];
      if (R.funcionario[c]) { a.funcS += cli.valS[c]; a.funcC += cli.valC[c]; }
      if (cli.compraS[c] && !R.funcionario[c]) a.ativosS += 1; // funcionário não é cliente
      if (cli.compraC[c] && !R.funcionario[c]) a.ativosC += 1;
      const d = cli.valS[c] - cli.valC[c];
      switch (status[c]) {
        case 0: a.cresceram += 1; a.dCresc += d; break;
        case 1: a.reduziram += 1; a.dRed += d; break;
        case 3: a.novos += 1; a.dNovos += d; break;
        case 4: a.reativados += 1; a.dReat += d; break;
        case 5: a.perdidos += 1; a.dPerd += d; break;
        default: break;
      }
      g.set(k, a);
    }
    return [...g.values()];
  }

  function linhasGrupo(R, grupos, nomeDe) {
    const tS = R.totS.val, tC = R.totC.val;
    return grupos.map((a) => ({
      nome: nomeDe(a.k), valS: a.valS, valC: a.valC, funcS: a.funcS, funcC: a.funcC, delta: a.valS - a.valC, var: R.temC ? taxa(a.valS, a.valC) : null,
      partS: div0(a.valS, tS), partC: R.temC ? div0(a.valC, tC) : null, contrib: R.temC ? div0(a.valS - a.valC, tC) : null,
      ativosS: a.ativosS, ativosC: a.ativosC, novos: a.novos + a.reativados, perdidos: a.perdidos,
      dNovos: a.dNovos + a.dReat, dPerd: a.dPerd, dCresc: a.dCresc, dRed: a.dRed,
      pedS: a.pedS, ticketS: div0(a.valS, a.pedS), ticketC: div0(a.valC, a.pedC), precoS: div0(a.valS, a.qpS), precoC: div0(a.valC, a.qpC),
    }));
  }

  const colunasGrupo = (titulo, R) => [
    { chave: "nome", titulo, classe: "texto-longo" },
    { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
    ...(R.temC ? [
      { chave: "valC", titulo: "Fat. comparação", num: true, fmt: cRs },
      { chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs },
      { chave: "var", titulo: "Cresc. %", num: true, fmt: cVar },
    ] : []),
    { chave: "partS", titulo: "Participação", num: true, fmt: cPct },
    ...(R.temC ? [{ chave: "contrib", titulo: "Contrib. cresc.", num: true, fmt: cPp, dica: "Crescimento do item dividido pelo faturamento total da comparação (pontos percentuais do crescimento total)" }] : []),
    { chave: "ativosS", titulo: "Clientes com compra", num: true, fmt: cNum },
    ...(R.temC ? [
      { chave: "ativosC", titulo: "Com compra ano ant.", num: true, fmt: cNum },
      { chave: "novos", titulo: "Novos + reativ.", num: true, fmt: cNum },
      { chave: "perdidos", titulo: "Deixaram", num: true, fmt: cNum },
    ] : []),
    { chave: "pedS", titulo: "Pedidos", num: true, fmt: cNum },
    { chave: "ticketS", titulo: "Ticket médio", num: true, fmt: cRs },
    { chave: "precoS", titulo: "Preço médio", num: true, fmt: cPreco },
  ];

  function barrasCrescimento(alvo, linhas, n = 10) {
    const pos = linhas.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, n);
    const neg = linhas.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, n).reverse();
    const itens = [...pos, ...neg].map((l) => ({ rotulo: l.nome, valor: l.delta, texto: Fmt.varRs(l.delta), tooltip: [["Faturamento", Fmt.rs0(l.valS)], ["Comparação", Fmt.rs0(l.valC)], ["Crescimento", Fmt.varRsCheio(l.delta)], ["Cresc. %", Fmt.var(l.var)]] }));
    return Graf.barrasH(alvo, { itens, divergente: true, larguraRotulo: 220 });
  }

  // Regras de classificação dos clientes (definidas com a área em 21/10/2026).
  const REGRAS_CLIENTES = `<details class="regras-clientes"><summary>Como os clientes são classificados</summary><table><thead><tr><th>Situação</th><th>Regra</th></tr></thead><tbody>
    <tr><td>Novo ou reativado</td><td>Comprou no período sem nenhuma compra antes, ou voltou a comprar depois de 12 meses ou mais sem compras.<br><em>Observação: o histórico da base começa em out/2023; um cliente que ficou inativo antes disso aparece sem compras anteriores, por isso novos e reativados são analisados juntos.</em></td></tr>
    <tr><td>Compra</td><td>Pedido ou nota de venda no mês. Devolução de outro pedido não tira a compra, mesmo que o faturamento líquido fique negativo</td></tr>
    <tr><td>Ativo</td><td>Comprou no período filtrado (pelo menos 1 pedido ou nota de venda)</td></tr>
    <tr><td>Perdido</td><td>Completou 12 meses sem comprar durante o período</td></tr>
    <tr><td>Cresceu / Reduziu</td><td>Faturamento do período × mesmo período do ano anterior, para os demais clientes</td></tr>
    <tr><td>Ajustes/devoluções</td><td>Só devolução ou crédito nos dois períodos, ou faturamento igual ao do ano anterior</td></tr>
    <tr><td>Funcionários</td><td>Não são clientes: ficam fora das contagens de clientes, mas o faturamento deles continua no total (entra em Ajustes/devoluções)</td></tr>
  </tbody></table></details>`;

  // Análises gerais: indicadores do topo, exibidos em todas as abas.
  // "Regra" do card Clientes cadastrados: como a SA1 bruta vira o total de clientes (números gravados na exportação).
  function regraCadastro(sa1) {
    const tr = sa1.tratamento || {}, n = (v) => Fmt.num(v || 0);
    // Mesmo visual da tabela "Como os clientes são classificados": etapa à esquerda, regra à direita.
    const linha = (rotulo, texto) => `<tr><td>${rotulo}</td><td>${texto}</td></tr>`;
    return `<details class="regra-card"><summary>Regra</summary><div class="regra-texto"><table><thead><tr><th>Etapa</th><th>Regra</th></tr></thead><tbody>`
      + linha("Base", `SA1: ${n(tr.lidos)} linhas no arquivo.`)
      + linha("Saem", `${n(tr.funcionarios)} CPFs de funcionário, ${n(tr.semCnpj)} sem CNPJ válido, ${n(tr.internas)} empresas internas, ${n(tr.testes)} teste, ${n(tr.naoClientes)} não clientes e ${n(tr.semVendedor)} sem vendedor; ${n(tr.duplicados)} duplicados juntados.`)
      + linha("Ficam", `${n(sa1.cadastros)} cadastros (filial + código + loja).`)
      + linha("Clientes", `Mesmo nome fantasia = 1 cliente: ${n(sa1.clientes)} clientes (${n(sa1.ativosCadastro)} com status Ativo no cadastro).`)
      + linha("Número fixo", "Não muda com filtros nem período.")
      + "</tbody></table></div></details>";
  }
  function analisesGerais(R, alvo, cicloAnterior = R.temC ? M.calcular({ ...R.f, S: new Set(R.C), SDemo: R.f.SDemo || R.f.S }) : null) {
    window.__selAtual = R.f.selecao?.rotulo || ""; // destaca o cartão/item selecionado
    window.__selRotulos = R.f.selecao?.rotulos || [];
    // Filtro "Apenas lojas com atendimento" (botão da aba de clientes) vale para o painel todo: aviso em todas as abas.
    if (R.f.soDemonstradora) {
      const aviso = el("div", { class: "filtro-ativo" }, "Filtro aplicado: <strong>Apenas lojas com atendimento de demonstradora</strong> no período.");
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => window.dispatchEvent(new CustomEvent("painel:demonstradora")) }, "Tirar filtro"));
      alvo.append(aviso);
    }
    // Filtros por clique acumulados: um selo por filtro (× tira só ele) e "Limpar filtros" tira todos.
    if (R.f.selecao) {
      const rotulos = R.f.selecao.rotulos || [R.f.selecao.rotulo];
      const aviso = el("div", { class: "filtro-ativo" }, rotulos.length > 1 ? "Filtros aplicados, um em cima do outro:" : "Filtro aplicado:");
      rotulos.forEach((r, i) => {
        if (i) aviso.append(el("span", { class: "filtro-seta" }, "›"));
        aviso.append(el("button", { type: "button", class: "filtro-selo", title: "Tirar este filtro", onclick: () => selecionar(r) }, `${Fmt.esc(Fmt.nome(r))} <span aria-hidden="true">×</span>`));
      });
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => selecionar(null) }, rotulos.length > 1 ? "Limpar filtros" : "Limpar filtro"));
      alvo.append(aviso);
    }
    const S = R.totS, C = R.temC ? R.totC : null;
    const comp = C ? textoComp(R) : "";
    const atualPeriodo = textoPeriodo(R.S);
    const k = el("div", { class: "kpis" });
    // Clientes cadastrados: total da SA1 (mesmo nome fantasia = 1 cliente); não depende do período.
    // Com filtro ou seleção, conta só os cadastrados dentro do filtro.
    const sa1 = M.D.cadastroSA1;
    const filtrado = temFiltroCliente(R);
    // Pedidos e produtos de funcionários ("Outros clientes" nos cartões): entram no total da empresa (igual ao ADV), mas não nas médias por cliente.
    // Clientes ativos (comprou no período) também se dividem em válidos e outros (funcionários).
    let pedFunc = 0, qFunc = 0, valFunc = 0, ativosFunc = 0, ativosFuncC = 0, perdFunc = 0;
    for (let c = 0; c < M.nC; c += 1) if (R.funcionario[c] && R.cOK[c]) { pedFunc += R.cli.pedS[c]; qFunc += R.cli.qS[c]; valFunc += R.cli.valS[c]; ativosFunc += R.cli.compraS[c]; ativosFuncC += R.cli.compraC[c]; perdFunc += R.cli.perdidoFunc[c]; }
    let perdFuncAnt = 0; if (cicloAnterior?.temC) for (let c = 0; c < M.nC; c += 1) if (cicloAnterior.funcionario[c] && cicloAnterior.cOK[c]) perdFuncAnt += cicloAnterior.cli.perdidoFunc[c];
    // Tickets divididos: faturamento ÷ pedidos (ou produtos) de cada grupo.
    const tk = (v, n, fmt) => (n ? fmt(v / n) : "—");
    // Partes clicáveis dos cartões: cada número filtra a página pelos clientes que o formam (clicar de novo tira).
    const parte = (chave, html) => `<span class="kpi-filtro" data-sel="${chave}">${html}</span>`;
    const divisao = (chave, validos, outros) => `${parte(`${chave}-validos`, `Clientes válidos: <strong>${validos}</strong>`)}<br>${parte(`${chave}-outros`, `Outros clientes: <strong>${outros}</strong>`)}`;
    const nCadastrados = sa1 ? (filtrado ? compraCadastrados(R)?.total ?? 0 : sa1.clientes) : 0;
    k.innerHTML = [
      // Clientes cadastrados é o único cartão estático (não filtra a página).
      sa1 ? UI.kpi({ rotulo: "Clientes cadastrados", valor: Fmt.num(filtrado ? nCadastrados : sa1.clientes), atualLegenda: filtrado ? "Da SA1, dentro do filtro aplicado" : "Total da SA1, sem filtros", extra: regraCadastro(sa1) }).replace("class=\"kpi", "class=\"kpi kpi-estatico") : "",
      UI.kpi({ rotulo: "Clientes ativos", valor: parte("ativos", `<span class="tem-tooltip" data-tooltip-ativos>${Fmt.num(S.ativos + ativosFunc)}</span>`), detalhe: divisao("ativos", Fmt.num(S.ativos), Fmt.num(ativosFunc)), atual: S.ativos + ativosFunc, comparado: C ? C.ativos + ativosFuncC : undefined, atualLegenda: atualPeriodo, compValor: C ? Fmt.num(C.ativos + ativosFuncC) : "", compLegenda: comp, semComparacao: "Não há dados no período anterior" }),
      UI.kpi({ rotulo: "Clientes perdidos", valor: parte("perdidos", Fmt.num(R.ponte[5].clientes + perdFunc)), detalhe: divisao("perdidos", Fmt.num(R.ponte[5].clientes), Fmt.num(perdFunc)), atual: R.ponte[5].clientes + perdFunc, comparado: cicloAnterior?.temC ? cicloAnterior.ponte[5].clientes + perdFuncAnt : undefined, inverter: true, atualLegenda: `Completaram 12 meses sem comprar em ${atualPeriodo}`, compValor: cicloAnterior?.temC ? Fmt.num(cicloAnterior.ponte[5].clientes + perdFuncAnt) : "", compLegenda: comp, semComparacao: cicloAnterior?.temC ? "" : "Não há dados no período anterior" }),
      UI.kpi({ rotulo: "Faturamento total", valor: parte("faturamento", Fmt.rsc(S.val)), detalhe: divisao("faturamento", Fmt.rsc(S.val - valFunc), Fmt.rsc(valFunc)), atual: S.val, comparado: C?.val, atualLegenda: atualPeriodo, compValor: C ? Fmt.rsc(C.val) : "", compLegenda: comp, semComparacao: "Não há dados no período anterior", heroi: true }),
      UI.kpi({ rotulo: "Pedidos realizados", valor: parte("pedidos", Fmt.num(S.ped)), atual: S.ped, comparado: C?.ped, atualLegenda: atualPeriodo, compValor: C ? Fmt.num(C.ped) : "", compLegenda: comp, semComparacao: "Não há dados no período anterior", detalhe: divisao("pedidos", Fmt.num(S.ped - pedFunc), Fmt.num(pedFunc)) }),
      UI.kpi({ rotulo: "Produtos faturados", valor: parte("produtos", Fmt.num(S.q)), atual: S.q, comparado: C?.q, atualLegenda: atualPeriodo, compValor: C ? Fmt.num(C.q) : "", compLegenda: comp, semComparacao: "Não há dados no período anterior", detalhe: divisao("produtos", Fmt.num(S.q - qFunc), Fmt.num(qFunc)) }),
      UI.kpi({ rotulo: "Ticket médio por pedido", valor: parte("pedidos", Fmt.rs0(S.ticket)), detalhe: divisao("pedidos", tk(S.val - valFunc, S.ped - pedFunc, Fmt.rs0), tk(valFunc, pedFunc, Fmt.rs0)), atual: S.ticket, comparado: C?.ticket, atualLegenda: atualPeriodo, compValor: C ? Fmt.rs0(C.ticket) : "", compLegenda: comp, semComparacao: "Não há dados no período anterior" }),
      UI.kpi({ rotulo: "Ticket médio por produto", valor: parte("produtos", S.q ? Fmt.rs4(S.val / S.q) : "—"), detalhe: divisao("produtos", tk(S.val - valFunc, S.q - qFunc, Fmt.rs4), tk(valFunc, qFunc, Fmt.rs4)), atual: S.q ? S.val / S.q : null, comparado: C ? (C.q ? C.val / C.q : null) : undefined, atualLegenda: atualPeriodo, compValor: C && C.q ? Fmt.rs4(C.val / C.q) : "", compLegenda: comp, semComparacao: C ? "" : "Não há dados no período anterior" }),
    ].join("");
    alvo.append(el("div", { class: "cabecalho-secao" }, "<h2>Análises gerais</h2>"), k);
    // Balão do número de clientes ativos: divisão por situação.
    const ativosPorSituacao = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let c = 0; c < R.cli.ativoS.length; c += 1) if (R.cli.ativoS[c] && R.cOK[c]) ativosPorSituacao[R.status[c]] += 1;
    const alvoAtivos = k.querySelector("[data-tooltip-ativos]");
    if (alvoAtivos) {
      const linhasTip = [["Cresceram", ativosPorSituacao[0]], ["Reduziram compras", ativosPorSituacao[1]], ["Novos ou reativados", ativosPorSituacao[3]], ["Manteve / ajustes", ativosPorSituacao[2] + ativosPorSituacao[4] + ativosPorSituacao[5] + ativosPorSituacao[6]]]
        .filter(([, n]) => n).map(([nome, n]) => [nome, Fmt.num(n)]);
      alvoAtivos.addEventListener("mousemove", (ev) => Graf.mostrarTooltip(ev, `Clientes válidos ativos: ${Fmt.num(S.ativos)}`, linhasTip));
      alvoAtivos.addEventListener("mouseleave", Graf.esconderTooltip);
    }
    // Clique numa parte do cartão (número principal ou linha "Clientes válidos"/"Outros clientes") filtra a página pelos
    // clientes que formam aquele número; os filtros se acumulam e clicar de novo tira. Outros clientes = funcionários (CPF).
    const R0 = semSelecao(R);
    const idsOnde = (cond) => { const ids = []; for (let c = 0; c < M.nC; c += 1) if (R0.cOK[c] && cond(c)) ids.push(c); return ids; };
    const func = (c) => R0.funcionario[c] === 1;
    const filtros = {
      ativos: ["Clientes ativos", () => idsOnde((c) => R0.cli.compraS[c])],
      "ativos-validos": ["Clientes ativos: clientes válidos", () => idsOnde((c) => R0.cli.compraS[c] && !func(c))],
      "ativos-outros": ["Clientes ativos: outros clientes", () => idsOnde((c) => R0.cli.compraS[c] && func(c))],
      perdidos: ["Clientes perdidos", () => idsOnde((c) => R0.status[c] === 5 || R0.cli.perdidoFunc[c])],
      "perdidos-validos": ["Clientes perdidos: clientes válidos", () => idsOnde((c) => R0.status[c] === 5)],
      "perdidos-outros": ["Clientes perdidos: outros clientes", () => idsOnde((c) => R0.cli.perdidoFunc[c] === 1)],
      faturamento: ["Clientes com faturamento no período", () => idsOnde((c) => R0.cli.valS[c] !== 0)],
      "faturamento-validos": ["Faturamento: clientes válidos", () => idsOnde((c) => R0.cli.valS[c] !== 0 && !func(c))],
      "faturamento-outros": ["Faturamento: outros clientes", () => idsOnde((c) => R0.cli.valS[c] !== 0 && func(c))],
      pedidos: ["Clientes com pedidos no período", () => idsOnde((c) => R0.cli.pedS[c] > 0)],
      "pedidos-validos": ["Pedidos: clientes válidos", () => idsOnde((c) => R0.cli.pedS[c] > 0 && !func(c))],
      "pedidos-outros": ["Pedidos: outros clientes", () => idsOnde((c) => R0.cli.pedS[c] > 0 && func(c))],
      produtos: ["Clientes com produtos faturados no período", () => idsOnde((c) => R0.cli.qS[c] !== 0)],
      "produtos-validos": ["Produtos: clientes válidos", () => idsOnde((c) => R0.cli.qS[c] !== 0 && !func(c))],
      "produtos-outros": ["Produtos: outros clientes", () => idsOnde((c) => R0.cli.qS[c] !== 0 && func(c))],
    };
    k.querySelectorAll("[data-sel]").forEach((alvoSel) => {
      const [rotulo, ids] = filtros[alvoSel.dataset.sel] || [];
      if (!rotulo) return;
      alvoSel.classList.add("clicavel");
      alvoSel.title = "Clique para filtrar a página por esses clientes";
      if (window.__selRotulos?.includes(rotulo)) { alvoSel.classList.add("selecionado"); alvoSel.closest(".kpi")?.classList.add("selecionado"); }
      alvoSel.addEventListener("click", (ev) => { ev.stopPropagation(); selecionar(rotulo, { clientes: ids() }); });
    });
  }

  // ---------- 1. Visão geral ----------
  // Desempenho dos vendedores (Visão geral): quantos cresceram, ficaram estáveis ou caíram (faixa de ±5%, igual ao mapa)
  // e ranking. Vendedor = "Código do vendedor" da linha faturada; clique no ranking abre a aba da equipe com o vendedor.
  let rankVend = "faturamento";
  function desempenhoVendedores(R, alvo, redesenhar) {
    const { vend } = R;
    const pAtual = textoPeriodo(R.S), pAnterior = textoPeriodo(R.C);
    const ls = [];
    for (let v = 0; v < M.nV; v += 1) {
      const valS = vend.valS[v], valC = vend.valC[v];
      if (valS <= 0 && valC <= 0) continue;
      const vr = taxa(valS, valC);
      const grupo = valC <= 0 ? 0 : valS <= 0 ? 2 : vr > FAIXA_ESTAVEL ? 0 : vr < -FAIXA_ESTAVEL ? 2 : 1;
      ls.push({ v, nome: Fmt.nome(M.vendedores[v].nome), valS, valC, delta: valS - valC, var: vr, grupo, partS: div0(valS, R.totS.val) });
    }
    const grupos = [["Cresceram", "acima de +5%", "var(--mapa-cresceu)"], ["Estáveis", "entre −5% e +5%", "var(--mapa-estavel)"], ["Caíram", "abaixo de −5%", "var(--mapa-caiu)"]]
      .map(([nome, faixa, cor], i) => { const g = ls.filter((l) => l.grupo === i); return { nome, faixa, cor, n: g.length, ids: g.map((l) => l.v), delta: g.reduce((s, l) => s + l.delta, 0) }; });
    // Clique: filtra a própria Visão geral pelos vendedores (filtro Vendedor do menu); clicar de novo tira o filtro.
    const filtrarVendedores = (ids) => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "vendedor", ids } }));
    const tip = (l) => tipFaturamento(l, R, [["Participação no faturamento geral", Fmt.pct(l.partS)]]);

    const c = UI.cartao("Desempenho dos vendedores", `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).`);
    alvo.append(c);
    // Total dos vendedores; com vendedor filtrado, o clique tira o filtro.
    // Total geral (igual ao cartão Faturamento total), não só a soma dos vendedores com faturamento positivo.
    totalCabecalho(c, R, [{ valS: R.totS.val, valC: R.totC.val }], R.f.vendedor?.size ? () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "vendedor", ids: [...R.f.vendedor] } })) : null, "Clique para mostrar todos os vendedores");
    const corpo = el("div", { class: "vendedores-layout" });
    c.append(corpo);

    // Meia-lua: cresceram (fora), estáveis, caíram (dentro).
    const colLua = el("div", { class: "coluna-lua" });
    corpo.append(colLua);
    colLua.append(el("h3", {}, "Vendedores por desempenho"));
    colLua.append(Graf.meiaLua(colLua, { total: ls.length, centro: Fmt.num(ls.length), legendaCentro: "vendedores", itens: grupos.map((g) => ({ rotulo: g.nome, valor: g.n, cor: g.cor, onClick: g.n ? () => filtrarVendedores(g.ids) : null, tooltip: [["Vendedores", Fmt.num(g.n)], ["% dos vendedores", Fmt.pct(div0(g.n, ls.length), 1)], ["Faixa de variação", g.faixa], ["Variação de faturamento R$", Fmt.varRsCheio(g.delta)]] })) }));
    colLua.querySelectorAll(".legenda-lua .item").forEach((it, i) => { if (grupos[i].n) { it.classList.add("clicavel"); it.addEventListener("click", () => filtrarVendedores(grupos[i].ids)); } });
    colLua.append(el("div", { class: "legenda-lua" }, grupos.map((g) => `<div class="item"><i style="--c:${g.cor}"></i><span class="nome">${g.nome} <small>(${g.faixa})</small></span><span class="n">${Fmt.num(g.n)}</span><span class="pct">${Fmt.pct(div0(g.n, ls.length), 1)}</span></div>`).join("")));

    // Ranking: maior faturamento, maior crescimento ou maior queda (R$).
    const colRank = el("div", { class: "coluna-ranking-vend" });
    corpo.append(colRank);
    const cabRank = el("div", { class: "cabecalho-ranking" });
    cabRank.append(el("h3", {}, "Ranking dos vendedores"));
    cabRank.append(UI.alternador([["faturamento", "Maior faturamento"], ["cresc", "Mais cresceram"], ["estaveis", "Ficaram estáveis"], ["queda", "Mais caíram"]], rankVend, (id) => { rankVend = id; redesenhar(); }));
    colRank.append(cabRank);
    const ordenado = rankVend === "faturamento" ? ls.slice().sort((a, b) => b.valS - a.valS)
      : rankVend === "cresc" ? ls.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta)
      : rankVend === "estaveis" ? ls.filter((l) => l.grupo === 1).sort((a, b) => b.valS - a.valS) : ls.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta);
    const top = ordenado.slice(0, 5);
    const porFaturamento = rankVend === "faturamento" || rankVend === "estaveis";
    const maxBarra = Math.max(...top.map((l) => Math.abs(porFaturamento ? l.valS : l.delta)), 1);
    const iniciais = (n) => n.split(/\s+/).filter((p) => p.length > 2 || /^\p{Lu}/u.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    const lista = el("ol", { class: "ranking-vend" }, top.map((l, i) => {
      const valorBarra = porFaturamento ? l.valS : l.delta;
      const corBarra = grupos[l.grupo].cor; // mesma cor da meia-lua: cresceu, estável ou caiu
      // Valor completo, sem arredondar: faturamento (ou a variação em R$, nos rankings de crescimento/queda).
      const principal = porFaturamento ? Fmt.rs(l.valS) : Fmt.varRsCheio(l.delta);
      const variacao = l.valC > 0 ? `<span class="var ${sinal(l.var)}">${l.var > 0 ? "▲" : l.var < 0 ? "▼" : ""} ${Fmt.pct(Math.abs(l.var), 1)}</span>` : `<span class="var sobe">novo</span>`;
      return `<li data-v="${l.v}"><span class="pos${i < 3 ? ` medalha m${i + 1}` : ""}">${i + 1}</span><span class="avatar" style="--c:${grupos[l.grupo].cor}">${Fmt.esc(iniciais(l.nome))}</span>`
        + `<span class="info"><span class="nome">${Fmt.esc(l.nome)}</span><span class="trilho"><span class="barra" style="width:${(Math.abs(valorBarra) / maxBarra * 100).toFixed(1)}%;background:${corBarra}"></span></span></span>`
        + `<span class="valor">${principal}</span>${variacao}</li>`;
    }).join("") || `<li class="vazio">Nenhum vendedor nesta lista.</li>`);
    colRank.append(lista);
    lista.querySelectorAll("li[data-v]").forEach((li) => {
      const l = top.find((x) => x.v === Number(li.dataset.v));
      li.addEventListener("mousemove", (ev) => Graf.mostrarTooltip(ev, l.nome, tip(l)));
      li.addEventListener("mouseleave", Graf.esconderTooltip);
      li.addEventListener("click", () => { Graf.esconderTooltip(); vendSel = l.v; filtrarVendedores([l.v]); });
    });
  }

  // Produtos em destaque (Visão geral): top 5 categorias (rosca), top 5 produtos (funil) e maiores impactos do reajuste (anéis).
  // Clique: categoria e produto filtram a própria Visão geral (sem trocar de aba); clicar de novo tira.
  const CORES_TOP = ["var(--series-1)", "var(--series-7)", "var(--series-4)", "var(--series-5)", "var(--series-2)"];
  function produtosDestaque(R, alvo) {
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const cats = linhasAnaliseProdutos(R, "categoria").filter((l) => l.valS > 0).sort((a, b) => b.valS - a.valS);
    const skus = linhasAnaliseProdutos(R, "sku").filter((l) => l.valS > 0).sort((a, b) => b.valS - a.valS);
    const total = cats.reduce((s, l) => s + l.valS, 0);
    const rsC = Fmt.rs; // valor completo
    const tip = (l) => tipFaturamento(l, R, [["Participação no faturamento geral", Fmt.pct(l.partS)], ["Produtos faturados", Fmt.num(l.qS)], ["Preço médio por produto", Fmt.rs(l.precoS)], ...(R.temC ? [["Reajuste de preço", Fmt.var(l.reajuste, 1)]] : [])]);
    // Categoria: filtra a própria Visão geral (filtro Categoria do menu); clicar de novo tira.
    const abrirCategoria = (l) => { nivelAP = "categoria"; skuSel = null; window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "categoria", ids: [l.k] } })); };
    // Produto: filtra a própria Visão geral pelo SKU; clicar de novo tira.
    const abrirSku = (l) => { nivelAP = "sku"; selecionar(`Produto: ${Fmt.nome(l.nome)}`, { produtos: [l.k] }); };

    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);
    // Top 5 categorias: rosca com a participação das 5 maiores no centro.
    const c1 = UI.cartao("Top 5 categorias mais vendidas", `Participação no faturamento de ${Fmt.esc(pAtual)}.`);
    grade.append(c1);
    // Total da rosca (todas as categorias); com categoria filtrada, o clique tira o filtro.
    const catSel = R.f.categoria?.size ? [...R.f.categoria] : null;
    totalCabecalho(c1, R, [{ valS: R.totS.val, valC: R.totC.val }], catSel ? () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "categoria", ids: catSel } })) : null, "Clique para mostrar todas as categorias");
    const top5 = cats.slice(0, 5), demais = cats.slice(5).reduce((s, l) => s + l.valS, 0);
    const fatias = top5.map((l, i) => ({ rotulo: l.nome, valor: l.valS, cor: CORES_TOP[i], tooltip: tip(l), onClick: () => abrirCategoria(l) }));
    if (demais > 0) fatias.push({ rotulo: "Demais categorias", valor: demais, cor: "var(--muted-mark)", tooltip: [["Faturamento", Fmt.rs(demais)], ["Participação no faturamento", Fmt.pct(div0(demais, total))], ["Categorias", Fmt.num(cats.length - 5)]] });
    const corpo1 = el("div", { class: "top-categorias" });
    c1.append(corpo1);
    // Legenda com o faturamento completo.
    corpo1.append(Graf.pizza(corpo1, { fatias, tamanho: 230, fmtValor: Fmt.rs, rotulosFatias: true, centro: { linhas: ["Representatividade", "no faturamento"] } }));

    // Top 5 produtos: funil pelo faturamento.
    const c2 = UI.cartao("Top 5 produtos mais vendidos", `Por faturamento em ${Fmt.esc(pAtual)}.`);
    grade.append(c2);
    totalCabecalho(c2, R, skus.slice(0, 5), null, "", "Faturamento dos 5 produtos");
    c2.append(Graf.funil(c2, { itens: skus.slice(0, 5).map((l, i) => ({ rotulo: l.nome, valor: l.valS, cor: CORES_TOP[i], texto: `${rsC(l.valS)} · ${Fmt.pct(l.partS, 1)} do faturamento · ${Fmt.num(l.qS)} un.`, tooltip: tip(l), onClick: () => abrirSku(l) })) }));
    // Reajuste por categoria: o clique filtra a própria Visão geral pela categoria.
    if (R.temC) cartaoImpactoReajuste(R, alvo, { aoClicar: (cat) => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "categoria", ids: [cat] } })), sel: R.f.categoria?.size === 1 ? [...R.f.categoria][0] : null });
  }

  function visaoGeral(R, alvo, redesenhar) {
    avisoComparacao(R, alvo); avisoPedidos(R, alvo);
    const S = R.totS, C = R.temC ? R.totC : null;
    const comp = C ? textoComp(R) : "";
    const atualPeriodo = textoPeriodo(R.S);
    const periodoAnterior = R.temC ? textoPeriodo(R.C) : "";
    const cicloAnterior = R.temC ? M.calcular({ ...R.f, S: new Set(R.C), SDemo: R.f.S }) : null;
    analisesGerais(R, alvo, cicloAnterior);

    // inverter: aumento desses clientes é ruim (vermelho) e queda é boa (verde).
    // indice: uma situação ou várias (ex.: [0, 2] = cresceram + mantiveram). Com partes, o cartão mostra cada situação
    // numa linha clicável (filtra a página só por ela). O número principal filtra pelo total do cartão.
    const detalhe = (classe, indice, titulo, texto, inverter = false, partes = null) => {
      const ids = [].concat(indice);
      const soma = (P) => ids.reduce((s, i) => s + P[i].clientes, 0);
      const atual = soma(R.ponte);
      const anterior = cicloAnterior?.temC ? soma(cicloAnterior.ponte) : null;
      const comparativo = anterior !== null
        ? `<div class="comparativo"><div class="valor-anterior">${Fmt.num(anterior)}</div><div class="periodo-anterior">${Fmt.esc(periodoAnterior)}</div></div>`
        : `<div class="comparativo sem-comparacao">Não há dados no período anterior</div>`;
      const linhasPartes = partes ? `<div class="detalhe-valor">${partes.map(([i, nome]) => `<span class="kpi-filtro clicavel" data-situacao="${i}" title="Clique para filtrar a página por esses clientes">${Fmt.esc(nome)}: <strong>${Fmt.num(R.ponte[i].clientes)}</strong></span>`).join("<br>")}</div>` : "";
      // 4 blocos (topo, ano anterior, descrição, rodapé) alinhados entre os cartões por subgrid.
      return `<div class="kpi ${classe}"><div class="kpi-topo"><div class="rotulo">${Fmt.esc(titulo)}</div><div class="linha-valor-atual"><div class="valor"><span class="kpi-filtro clicavel" data-situacao="${ids.join(",")}" title="Clique para filtrar a página por esses clientes">${Fmt.num(atual)}</span></div></div>${linhasPartes}<div class="periodo-atual">${Fmt.esc(atualPeriodo)}</div></div>${comparativo}<div class="descricao-status"><div class="comp">${Fmt.esc(texto)}</div></div><div class="kpi-pe">${anterior !== null ? `<div class="rodape-variacao">${UI.delta(atual, anterior, { inverter })}</div>` : ""}<div class="acao-kpi"><button class="btn ghost" type="button" data-detalhe="${ids.join(",")}">Visão detalhada</button></div></div></div>`;
    };
    const situacoes = el("section", { class: "bloco-situacoes" });
    situacoes.innerHTML = `<div class="cabecalho-secao"><h2>Movimentação da carteira de clientes</h2></div><div class="kpis kpis-status">${[
      detalhe("status-cresceu", [0, 2], "Clientes ativos que cresceram ou se mantiveram estáveis", "Faturamento maior ou igual ao do mesmo período do ano anterior", false, [[0, "Cresceram"], [2, "Mantiveram estáveis"]]),
      detalhe("status-reduziu", 1, "Clientes ativos que reduziram compras", "Faturamento menor que no mesmo período do ano anterior", true),
      detalhe("status-novo", 3, "Clientes ativos novos ou reativados", "Sem compra anterior ou voltaram após 12 meses ou mais sem comprar"),
      detalhe("status-perdido", 5, "Clientes perdidos", "Completaram 12 meses sem comprar durante o período", true),
    ].join("")}</div>${REGRAS_CLIENTES}`;
    const clientesSituacao = (id) => idsSituacao(semSelecao(R), id);
    situacoes.querySelectorAll("[data-detalhe]").forEach((botao) => botao.addEventListener("click", () => {
      const id = botao.dataset.detalhe;
      selecionar(`Situação: ${NOME_SITUACAO[id]}`, { clientes: clientesSituacao(id), aba: "clientes" });
    }));
    situacoes.querySelectorAll("[data-situacao]").forEach((alvoSel) => {
      const id = alvoSel.dataset.situacao, rotulo = `Situação: ${NOME_SITUACAO[id]}`;
      if (window.__selRotulos?.includes(rotulo)) { alvoSel.classList.add("selecionado"); alvoSel.closest(".kpi")?.classList.add("selecionado"); }
      alvoSel.addEventListener("click", () => selecionar(rotulo, { clientes: clientesSituacao(id) }));
    });
    alvo.append(situacoes);
    if (R.temC) composicaoCrescimento(R, alvo, atualPeriodo, periodoAnterior);
    if (R.temC) desempenhoSegmentacao(R, alvo, atualPeriodo, periodoAnterior);
    // Análise geográfica: mapa por estado; o clique filtra a própria Visão geral pelo estado (clicar de novo tira).
    const { ufSel } = selecaoGeo(R);
    cartaoMapa(semFiltroGeo(R), alvo, { titulo: "Desempenho por estado", destaque: ufSel, visiveis: ufsVisiveis(R), aoClicar: (uf) => alternarUF(R, uf) }); // filtra na própria Visão geral (sem trocar de aba)
    // Do macro para o micro: estados, vendedores e, por último, produtos.
    if (R.temC) desempenhoVendedores(R, alvo, redesenhar);
    produtosDestaque(R, alvo);
  }

  // Desempenho por segmentação (Visão geral): faturamento atual × ano anterior por segmentação, em colunas comparadas.
  // Base sem o filtro de segmentação, para as demais continuarem visíveis (apagadas); clique filtra o painel (de novo tira).
  function desempenhoSegmentacao(R, alvo, atualPeriodo, periodoAnterior) {
    const R0 = R.f.canal?.size ? M.calcular({ ...R.f, canal: new Set() }) : R;
    const grupos = agruparClientes(R0, (c) => M.clientes[c].canal);
    const ls = linhasGrupo(R0, grupos, (k) => M.dic.canal[k] || "(sem segmentação)")
      .map((l, i) => ({ ...l, k: grupos[i].k }))
      .filter((l) => l.valS > 0 || l.valC > 0)
      .sort((a, b) => b.valS - a.valS);
    if (!ls.length) { const vazio = UI.cartao("Desempenho por segmentação", `${Fmt.esc(atualPeriodo)} comparado com o ano anterior (${Fmt.esc(periodoAnterior)}).`); vazio.append(el("p", { class: "nota" }, "Sem faturamento para o filtro aplicado: R$ 0,00.")); alvo.append(vazio); return; }
    const card = UI.cartao("Desempenho por segmentação", `${Fmt.esc(atualPeriodo)} comparado com o ano anterior (${Fmt.esc(periodoAnterior)}).`);
    alvo.append(card);
    const sel = R.f.canal?.size ? R.f.canal : null;
    // Faturamento total (soma das segmentações do gráfico) no canto superior direito, para ver o todo.
    // Clique: com segmentação filtrada, tira o filtro e volta a mostrar todas.
    totalCabecalho(card, R, ls, sel ? () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "canal", ids: [...sel] } })) : null, "Clique para mostrar todas as segmentações");
    card.append(Graf.colunasComparadas(card, { legendaAtual: atualPeriodo, legendaAnterior: periodoAnterior, altura: 320, itens: [...ls.map((l) => ({
      rotulo: l.nome, atual: l.valS, anterior: l.valC, texto: Fmt.rs(l.valS), variacao: Fmt.var(l.var, 1), // valor completo, sem arredondar
      corVariacao: l.delta > 0 ? "var(--div-pos)" : l.delta < 0 ? "var(--div-neg)" : "var(--text-secondary)", apagado: Boolean(sel && !sel.has(l.k)),
      onClick: () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "canal", id: l.k } })),
      // Balão no formato dos cartões: total da segmentação (igual ao ADV) e, menor, a divisão em clientes válidos e outros
      // clientes (funcionários); linha divisória e o mesmo bloco do ano anterior; rodapé com a variação.
      tooltip: UI.tipCartao({
        valor: Fmt.rs(l.valS), divisao: [["Clientes válidos", Fmt.rs(l.valS - l.funcS)], ["Outros clientes", Fmt.rs(l.funcS)]], periodo: atualPeriodo,
        valorAnt: Fmt.rs(l.valC), divisaoAnt: [["Clientes válidos", Fmt.rs(l.valC - l.funcC)], ["Outros clientes", Fmt.rs(l.funcC)]], periodoAnt: periodoAnterior,
        rodape: `${UI.delta(l.valS, l.valC)} <span class="tc-dif ${sinal(l.delta)}">${Fmt.varRsCheio(l.delta)}</span>`,
        extras: [["Participação no faturamento", Fmt.pct(l.partS)], ["Clientes com compra", Fmt.num(l.ativosS)]],
      }),
    }))] }));
    // Legenda do gráfico no cabeçalho, logo abaixo do subtítulo (o dobro do espaço entre título e subtítulo).
    const legenda = card.querySelector(".grafico .legenda");
    if (legenda) { legenda.classList.add("legenda-cabecalho"); card.querySelector(".cabecalho-cartao > div").append(legenda); }
  }

  // Crescimento geral = ganhos − perdas, cada lado em uma pizza. A soma das situações fecha no total.
  function composicaoCrescimento(R, alvo, atualPeriodo, periodoAnterior) {
    const P = R.ponte;
    const crescimento = R.totS.val - R.totC.val;
    // Ganho/perda = faturamento do período − faturamento do mesmo período do ano anterior (não é o faturamento do período).
    const tip = (g, rotulo, valor = g.delta) => [["Clientes", Fmt.num(g.clientes)], [`Faturamento ${atualPeriodo}`, Fmt.rs(g.valS)], [`Faturamento ano anterior (${periodoAnterior})`, Fmt.rs(g.valC), "anterior"], [`${rotulo} (atual − ano anterior)`, Fmt.varRsCheio(valor)]];
    // Perdidos: separa o que deixaram de comprar das devoluções lançadas no período.
    const tipPerdidos = (g) => [...tip(g, "Perda"), ["Deixaram de comprar", Fmt.varRsCheio(-g.valC)], ["Devoluções no período", Fmt.varRsCheio(Math.min(0, g.valS))]];
    // Clientes estáveis e ajustes/devoluções entram no lado do seu sinal para a conta fechar.
    // "Pararam de comprar" (status 7) não tem grupo próprio (removido em 28/10/2026): o valor entra em ajustes/devoluções.
    const outros = P[2].delta + P[6].delta + P[7].delta;
    // Clique numa fatia: filtra o painel pelos clientes daquela situação (clicar de novo tira).
    const selSit = (id) => selecionar(`Situação: ${NOME_SITUACAO[id]}`, { clientes: idsSituacao(semSelecao(R), id) });
    const ajuste = Math.abs(outros) > 0.5
      ? { rotulo: "Ajustes/devoluções", valor: outros, cor: COR_STATUS[6], onClick: () => selSit("2,6,7"), tooltip: [["Clientes", Fmt.num(P[2].clientes + P[6].clientes + P[7].clientes)], ["Valor", Fmt.varRsCheio(outros)]] }
      : null;
    const fatiasGanho = [
      { rotulo: "Clientes ativos que cresceram", valor: P[0].delta, cor: COR_STATUS[0], tooltip: tip(P[0], "Ganho"), onClick: () => selSit("0") },
      { rotulo: "Clientes novos ou reativados", valor: P[3].delta, cor: COR_STATUS[3], tooltip: tip(P[3], "Ganho"), onClick: () => selSit("3") },
      ...(ajuste && outros > 0 ? [ajuste] : []),
    ];
    const fatiasPerda = [
      { rotulo: "Clientes ativos que reduziram compras", valor: P[1].delta, cor: COR_STATUS[1], tooltip: tip(P[1], "Perda"), onClick: () => selSit("1") },
      { rotulo: "Clientes perdidos", valor: P[5].delta, cor: COR_STATUS[5], tooltip: tipPerdidos(P[5]), onClick: () => selSit("5") },
      ...(ajuste && outros < 0 ? [ajuste] : []),
    ].map((f) => ({ ...f, valor: -f.valor })); // a pizza trabalha com o tamanho da perda
    const ganhos = fatiasGanho.reduce((a, f) => a + f.valor, 0);
    const perdas = fatiasPerda.reduce((a, f) => a + f.valor, 0);
    // Impacto % = variação do grupo ÷ |crescimento geral|; a soma das linhas fecha no crescimento geral.
    // Linhas das tabelas: data-sit = situações (ids do motor) cujos clientes formam o valor; o clique filtra a página.
    const sitGanhos = `0,3${outros > 0 ? ",2,6,7" : ""}`, sitPerdas = `1,5${outros < 0 ? ",2,6,7" : ""}`;
    const contrib = (rotulo, valor, cor, sit) => `<tr class="clicavel" data-sit="${sit}" data-rotulo="${Fmt.esc(rotulo)}" title="Clique para filtrar a página por esses clientes"><td><i style="--c:${cor}"></i>${Fmt.esc(rotulo)}</td><td class="${sinal(valor)}">${crescimento ? Fmt.var(valor / Math.abs(crescimento), 0) : "—"}</td><td class="${sinal(valor)}">${Fmt.varRsCheio(valor)}</td></tr>`;

    const c = UI.cartao("Composição do crescimento geral", `${Fmt.esc(atualPeriodo)} comparado com o ano anterior (${Fmt.esc(periodoAnterior)}). Ganhos e perdas = faturamento do período − faturamento do ano anterior.`);
    totalCabecalho(c, R, [{ valS: R.totS.val, valC: R.totC.val }]);
    const pizzas = el("div", { class: "composicao" });
    const colGanho = el("div");
    colGanho.append(Graf.pizza(colGanho, { fatias: fatiasGanho, centro: { valor: Fmt.rs(ganhos), legenda: "em ganhos" }, tituloLegenda: `Ganhos — ${Fmt.varRsCheio(ganhos)}` }));
    const colPerda = el("div");
    colPerda.append(Graf.pizza(colPerda, { fatias: fatiasPerda, centro: { valor: `−${Fmt.rs(perdas)}`, legenda: "em perdas" }, fmtValor: (v) => Fmt.varRsCheio(-v), tituloLegenda: `Perdas — ${Fmt.varRsCheio(-perdas)}` }));
    pizzas.append(colGanho, colPerda);
    const resumo = el("div", { class: "composicao composicao-resumo" }, `<div><h3>Fechamento</h3>
      <table class="tabela-contrib"><thead><tr><th>Item</th><th>Variação %</th><th>Valor R$</th></tr></thead><tbody>
        <tr class="clicavel" data-sit="${sitGanhos}" data-rotulo="Ganhos" title="Clique para filtrar a página por esses clientes"><td>Ganhos</td><td></td><td class="sobe">${Fmt.varRsCheio(ganhos)}</td></tr>
        <tr class="clicavel" data-sit="${sitPerdas}" data-rotulo="Perdas" title="Clique para filtrar a página por esses clientes"><td>Perdas</td><td></td><td class="desce">${Fmt.varRsCheio(-perdas)}</td></tr>
        <tr class="total clicavel" data-sit="0,1,2,3,5,6,7" data-rotulo="Crescimento geral" title="Clique para filtrar a página por esses clientes"><td>Crescimento geral</td><td class="${sinal(crescimento)}">${Fmt.var(taxa(R.totS.val, R.totC.val))}</td><td class="${sinal(crescimento)}">${Fmt.varRsCheio(crescimento)}</td></tr>
      </tbody></table></div>
      <div><h3>Contribuição por situação</h3>
      <table class="tabela-contrib"><thead><tr><th>Grupo</th><th>Impacto %</th><th>Impacto R$</th></tr></thead><tbody>
        ${contrib("Clientes ativos que cresceram", P[0].delta, COR_STATUS[0], "0")}
        ${contrib("Clientes novos ou reativados", P[3].delta, COR_STATUS[3], "3")}
        ${contrib("Clientes ativos que reduziram compras", P[1].delta, COR_STATUS[1], "1")}
        ${contrib("Clientes perdidos", P[5].delta, COR_STATUS[5], "5")}
        ${Math.abs(outros) > 0.5 ? contrib("Ajustes/devoluções", outros, COR_STATUS[6]) : ""}
      </tbody></table></div>`);
    // Crescimento geral em destaque abaixo do fechamento.
    const destaque = el("div", { class: "crescimento-destaque" }, `<span class="rotulo">Crescimento geral</span><span class="valor">${Fmt.varRsCheio(crescimento)}</span>${UI.delta(R.totS.val, R.totC.val)}<span class="periodo">${Fmt.esc(atualPeriodo)} em relação ao ano anterior (${Fmt.esc(periodoAnterior)})</span>`);
    destaque.classList.add("clicavel"); destaque.dataset.sit = "0,1,2,3,5,6,7"; destaque.dataset.rotulo = "Crescimento geral";
    destaque.title = "Clique para filtrar a página por esses clientes";
    // Rótulo do filtro: o da situação (igual ao clique na rosca) ou "Composição: <linha>" para os totais.
    [...resumo.querySelectorAll("tr[data-sit]"), destaque].forEach((alvoSel) => {
      const id = alvoSel.dataset.sit, rotulo = NOME_SITUACAO[id] ? `Situação: ${NOME_SITUACAO[id]}` : `Composição: ${alvoSel.dataset.rotulo}`;
      if (window.__selRotulos?.includes(rotulo)) alvoSel.classList.add("selecionado");
      alvoSel.addEventListener("click", () => selecionar(rotulo, { clientes: idsSituacao(semSelecao(R), id) }));
    });
    c.append(pizzas, resumo, destaque);
    alvo.append(c);
  }

  // ---------- 2. Clientes ----------
  // incluir: clientes que entram mesmo sem movimento (ex.: cadastrados que não compraram no período).
  function linhasClientes(R, incluir = null) {
    const { cli, status, catsS, catsC } = R;
    const tS = R.totS.val, tC = R.totC.val;
    const out = [];
    for (let c = 0; c < M.nC; c += 1) {
      if (R.funcionario[c]) continue; // funcionário não aparece nas listas de clientes
      if (!cli.valS[c] && !cli.valC[c] && !cli.pedS[c] && !cli.pedC[c] && !(incluir && incluir.has(c))) continue;
      const x = M.clientes[c];
      const vAtual = x.vend >= 0 ? M.vendedores[x.vend].nome : "—";
      out.push({
        c, nome: x.nome, chave: x.chave, local: M.dic.municipio[x.mun], canal: M.dic.canal[x.canal], regiao: M.dic.regiao[x.reg], rede: M.dic.rede[x.rede], vendedor: vAtual,
        valS: cli.valS[c], valC: cli.valC[c], delta: cli.valS[c] - cli.valC[c], var: R.temC ? taxa(cli.valS[c], cli.valC[c]) : null,
        partS: div0(cli.valS[c], tS), contrib: R.temC ? div0(cli.valS[c] - cli.valC[c], tC) : null,
        q: cli.qS[c], qp: cli.qpS[c], preco: div0(cli.valS[c], cli.qpS[c]), pedS: cli.pedS[c], pedC: cli.pedC[c], ticketS: div0(cli.valS[c], cli.pedS[c]), ticketC: div0(cli.valC[c], cli.pedC[c]),
        catsS: catsS[c], catsC: catsC[c], status: R.STATUS[status[c]], st: status[c],
        ultCompra: cli.ultCompraAteFim[c], valUlt: cli.valUltCompraAteFim[c], ultPedido: cli.ultPedidoAteFim[c], ultCompraGeral: cli.ultCompra[c],
        ...dadosDemonstradora(R, c),
      });
    }
    return out;
  }
  const colStatus = { chave: "status", titulo: "Situação", fmt: (v, r) => selo(v, COR_STATUS[r.st]) };
  // Atendimento de demonstradora no período (agendas mensais da loja, pelo nome fantasia).
  function dadosDemonstradora(R, c) {
    const meses = R.demo.meses(c);
    return { atendimento: meses ? "Sim" : "Não", demoMeses: meses, demonstradoras: meses ? R.demo.nomes(c).map(Fmt.nome).join(", ") : "" };
  }
  // Nomes cortados na célula: o balão mostra todas as demonstradoras, uma por linha.
  document.addEventListener("mousemove", (ev) => {
    const alvo = ev.target.closest?.("[data-demonstradoras]");
    if (alvo) { const nomes = alvo.dataset.demonstradoras.split(", "); Graf.mostrarTooltip(ev, `Demonstradoras no período (${nomes.length})`, nomes.map((n) => [n, ""])); }
  });
  document.addEventListener("mouseout", (ev) => { if (ev.target.closest?.("[data-demonstradoras]") && !ev.relatedTarget?.closest?.("[data-demonstradoras]")) Graf.esconderTooltip(); });
  const colunasDemonstradora = () => (M.temDemonstradoras ? [
    { chave: "atendimento", titulo: "Atendimento de demonstradora", fmt: (v) => (v === "Sim" ? `<span class="delta sobe">Sim</span>` : "Não") },
    { chave: "demonstradoras", titulo: "Demonstradoras no período", classe: "texto-longo", fmt: (v) => (v ? `<span class="tem-tooltip" data-demonstradoras="${Fmt.esc(v)}">${Fmt.esc(v)}</span>` : "—") },
    { chave: "demoMeses", titulo: "Meses com demonstradora", num: true, fmt: (v) => (v ? Fmt.num(v) : "—") },
  ] : []);

  function clientes(R, alvo, redesenhar) {
    // Botão no topo direito: filtra o painel todo para as lojas com agenda de demonstradora no período; clicar de novo tira.
    if (M.temDemonstradoras) {
      const barra = el("div", { class: "barra-aba" });
      const ligado = Boolean(R.f.soDemonstradora);
      barra.append(el("button", { type: "button", class: "btn btn-demonstradora", "aria-pressed": ligado ? "true" : "false",
        title: "Lojas com agenda de demonstradora em pelo menos um mês do período (a comparação usa as mesmas lojas)",
        onclick: () => window.dispatchEvent(new CustomEvent("painel:demonstradora")) }, ligado ? "✓ Apenas lojas com atendimento" : "Apenas lojas com atendimento"));
      alvo.append(barra);
    }
    avisoComparacao(R, alvo);
    analisesGerais(R, alvo);
    // Regras de classificação logo abaixo das análises gerais.
    alvo.append(el("div", { class: "regras-clientes-aba" }, REGRAS_CLIENTES));
    // Compra dos cadastrados e frequência de compra lado a lado.
    const gradeCompra = el("div", { class: "grade g2" });
    alvo.append(gradeCompra);
    cartaoCompraCadastrados(R, gradeCompra, redesenhar);
    // Resumo da frequência (4 cartões) abaixo dos dois gráficos, ocupando a largura toda.
    cartaoFrequencia(R, gradeCompra, redesenhar, alvo);
    // Todo clique (situação, barras, rosca, frequência, penetração, linha da tabela) filtra o painel todo; clicar de novo tira.
    const R0 = semSelecao(R);
    const rotuloSel = R.f.selecao?.rotulo || "";
    const fimS = R.S.at(-1);
    const mesesSem = (d) => { if (!d) return null; const s = String(d); return (Number(fimS.slice(0, 4)) - Number(s.slice(0, 4))) * 12 + Number(fimS.slice(4)) - Number(s.slice(4, 6)); };
    const sel = R.f.selecao?.clientes || null;
    const todas = linhasClientes(R, sel).filter((l) => l.valS || l.valC || (sel && sel.has(l.c)));
    const freq = frequenciaClientes(R);
    todas.forEach((l) => {
      l.qC = R.cli.qC[l.c];
      l.deltaQ = l.q - l.qC;
      l.varQ = R.temC ? taxa(l.q, l.qC) : null;
      l.mesesSem = mesesSem(l.ultCompra);
      l.mesesCompraS = freq.mesesS[l.c]; l.mesesCompraC = freq.mesesC[l.c];
      l.intervaloS = Number.isFinite(freq.intS[l.c]) ? freq.intS[l.c] : null;
    });
    const linhas = todas;
    const linhas0 = R0 === R ? todas : linhasClientes(R0).filter((l) => l.valS || l.valC);
    const porLinhas = (teste) => linhas0.filter(teste).map((l) => l.c);

    // Botões de situação (também filtram o painel todo).
    const opcoes = [["todos", "Todos"], ["0", "Cresceram"], ["1", "Reduziram"], ["3", "Novos ou reativados"], ["5", "Perdidos"]];
    const sitAtual = (opcoes.find(([id]) => id !== "todos" && rotuloSel === `Situação: ${NOME_SITUACAO[id]}`) || ["todos"])[0];
    const escolherSituacao = (id) => (id === "todos" ? selecionar(null) : selecionar(`Situação: ${NOME_SITUACAO[id]}`, { clientes: porLinhas((l) => String(l.st) === id) }));
    const cab = el("div", { class: "barra-situacao" });
    alvo.append(cab);
    cab.append(UI.alternador(opcoes, sitAtual, escolherSituacao));
    // Clique numa barra: seleciona o cliente, a faixa de variação ou a segmentação.
    const filtrar = (tipo, valor, rotulo) => selecionar(tipo === "cliente" ? `Cliente: ${Fmt.nome(rotulo)}` : rotulo, { clientes: tipo === "cliente" ? [valor]
      : tipo === "canal" ? porLinhas((l) => (l.canal || "(sem segmentação)") === valor) : porLinhas((FAIXAS_VARIACAO.find(([nome]) => nome === valor) || [null, () => false])[1]) });
    const linhasTabela = linhas;
    if (R.temC) graficosClientes(R, alvo, linhas, filtrar);
    cartaoPenetracao(R, alvo, redesenhar); // penetração das categorias, logo após crescimento por segmentação
    const tabela = UI.cartao("Análise detalhada dos clientes", `${rotuloSel ? Fmt.esc(Fmt.nome(rotuloSel)) : "Todos os clientes"}. Clique numa linha para filtrar o painel por esse cliente.`);
    tabela.querySelector(".cabecalho-cartao").append(UI.alternador(opcoes, sitAtual, escolherSituacao));
    alvo.append(tabela);
    if (window.__rolarTabela) { window.__rolarTabela = false; requestAnimationFrame(() => tabela.scrollIntoView({ behavior: "smooth", block: "start" })); }
    const rotuloCliente = (r) => `Cliente: ${Fmt.nome(r.nome)}`;
    // Um único cliente filtrado (mesmo nome fantasia, qualquer cadastro): a tabela abre dia a dia (base de pedidos), para conferir pedido e nota com o sistema.
    const umCliente = linhasTabela.length > 0 && new Set(linhasTabela.map((l) => chaveNome(l.nome))).size === 1;
    if (umCliente && temFiltroCliente(R)) { tabelaPedidosCliente(R, tabela, linhasTabela.reduce((m, l) => (l.valS > m.valS ? l : m))); cadastroGeral(R, alvo, redesenhar); return; }
    tabela.append(UI.tabela({ nomeArquivo: "analise_clientes", linhas: linhasTabela, limite: 200, linhasVisiveis: 20, ordem: sitAtual === "5" ? { chave: "valC", desc: true } : { chave: "valS", desc: true },
      aoClicar: (r) => selecionar(rotuloCliente(r), { clientes: [r.c] }), selecionada: (r) => rotuloSel === rotuloCliente(r), colunas: [
      { chave: "nome", titulo: "Cliente", classe: "texto-longo" },
      { chave: "local", titulo: "Cidade/UF" },
      { chave: "canal", titulo: "Segmentação" },
      { chave: "vendedor", titulo: "Vendedor" },
      ...colunasDemonstradora(),
      colStatus,
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
      ...(R.temC ? [
        { chave: "valC", titulo: "Faturamento mesmo período ano anterior", num: true, anterior: true, fmt: cRs },
        { chave: "delta", titulo: "Variação de faturamento R$", num: true, fmt: cDRs },
        { chave: "var", titulo: "Variação de faturamento %", num: true, fmt: cVar },
      ] : []),
      { chave: "partS", titulo: "Participação no faturamento geral", num: true, fmt: (v) => Fmt.pct(v, 2) },
      ...(R.temC ? [{ chave: "contrib", titulo: "Contribuição para o crescimento", num: true, fmt: cPp }] : []),
      { chave: "q", titulo: "Produtos faturados", num: true, fmt: cNum },
      ...(R.temC ? [
        { chave: "qC", titulo: "Produtos faturados mesmo período ano anterior", num: true, anterior: true, fmt: cNum },
        { chave: "deltaQ", titulo: "Variação de produtos faturados", num: true, fmt: cDNum },
        { chave: "varQ", titulo: "Variação de produtos faturados %", num: true, fmt: cVar },
      ] : []),
      { chave: "ultPedido", titulo: "Último pedido até o período", num: true, fmt: (v) => Fmt.data(v), csv: (v) => Fmt.data(v) },
      { chave: "mesesSem", titulo: "Meses sem comprar", num: true, fmt: cNum },
      { chave: "pedS", titulo: "Pedidos no período", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "pedC", titulo: "Pedidos mesmo período ano anterior", num: true, anterior: true, fmt: cNum }] : []),
      { chave: "mesesCompraS", titulo: "Meses com compra", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "mesesCompraC", titulo: "Meses com compra ano anterior", num: true, anterior: true, fmt: cNum }] : []),
      { chave: "intervaloS", titulo: "Intervalo médio entre compras (dias)", num: true, fmt: (v) => (v === null ? "—" : Fmt.num(v)) },
    ] }));
    cadastroGeral(R, alvo, redesenhar);
  }

  // Detalhe de um cliente: cada linha da base de pedidos (dia × vendedor) do período e do mesmo período do ano anterior.
  // A base não traz o número do pedido: o dia do pedido (quantidade) e o dia da nota (faturamento) vêm em linhas separadas.
  function tabelaPedidosCliente(R, cartao, linha) {
    const O = M.O, grupo = new Set();
    const nome = chaveNome(linha.nome);
    for (let c = 0; c < M.nC; c += 1) if (R.cOK[c] && chaveNome(M.clientes[c].nome) === nome) grupo.add(c);
    const vendOK = R.f.vendedor?.size ? R.f.vendedor : null;
    const tipo = (n, v) => (v < 0 ? "Devolução / estorno" : n && v ? "Pedido e nota no mesmo dia" : n ? "Pedido" : v ? "Nota fiscal (faturamento)" : "Sem valor");
    const linhas = [];
    for (let i = 0; i < O.n; i += 1) {
      if (!grupo.has(O.c[i]) || (vendOK && !vendOK.has(O.v[i]))) continue;
      const p = O.p[i], atual = R.inS[p], anterior = !atual && R.inC[p];
      if (!atual && !anterior) continue;
      const n = O.qtd[i], v = O.val[i] / 100, vend = M.vendedores[O.v[i]];
      linhas.push({ d: O.d[i], mes: M.periodos[p], periodo: atual ? "Período" : "Ano anterior", tipo: tipo(n, v), vendedor: vend ? `${vend.cod} · ${vend.nome}` : "—", ped: n, val: v });
    }
    const soma = (lado, campo) => linhas.filter((l) => l.periodo === lado).reduce((s, l) => s + l[campo], 0);
    const sub = cartao.querySelector(".cabecalho-cartao .sub");
    if (sub) sub.innerHTML = `<strong>${Fmt.esc(Fmt.nome(linha.nome))}</strong> · dia a dia. ${Fmt.esc(textoPeriodo(R.S))}: ${Fmt.num(soma("Período", "ped"))} pedidos e ${Fmt.rs(soma("Período", "val"))}${R.temC ? ` · ano anterior (${Fmt.esc(textoPeriodo(R.C))}): ${Fmt.num(soma("Ano anterior", "ped"))} pedidos e ${Fmt.rs(soma("Ano anterior", "val"))}` : ""}. Limpe o filtro para voltar à lista de clientes.`;
    cartao.append(UI.tabela({ nomeArquivo: `pedidos_${Fmt.nome(linha.nome)}`, linhas, linhasVisiveis: 20, ordem: { chave: "d", desc: true }, colunas: [
      { chave: "d", titulo: "Data", num: true, fmt: (v) => Fmt.data(v), csv: (v) => Fmt.data(v) },
      { chave: "mes", titulo: "Mês", fmt: (v) => Fmt.mesLongo(v), csv: (v) => Fmt.mesLongo(v) },
      { chave: "periodo", titulo: "Período" },
      { chave: "tipo", titulo: "Tipo", fmt: (v) => `<span class="delta ${v.startsWith("Devolução") ? "desce" : ""}">${Fmt.esc(v)}</span>` },
      { chave: "vendedor", titulo: "Vendedor" },
      { chave: "ped", titulo: "Qtd de pedidos", num: true, fmt: (v) => (v ? Fmt.num(v) : "—") },
      { chave: "val", titulo: "Faturamento", num: true, fmt: (v) => (v ? cRs(v) : "—") },
    ] }));
  }

  // Penetração das categorias na base ativa: dos clientes que compraram no período (sem funcionários), quantos compraram
  // cada categoria. A soma passa de 100% porque o mesmo cliente compra várias categorias. Oportunidade = ativos que não compram.
  function cartaoPenetracao(R, alvo, redesenhar) {
    const { cli, cliCat } = R, nCat = M.nCat;
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const baseS = [], baseC = [];
    for (let c = 0; c < M.nC; c += 1) {
      if (R.funcionario[c]) continue;
      if (cli.compraS[c]) baseS.push(c);
      if (R.temC && cli.compraC[c]) baseC.push(c);
    }
    const conta = (base, lado, k) => base.filter((c) => cliCat[lado][c * nCat + k] > 0).length;
    const ls = [];
    for (let k = 0; k < nCat; k += 1) {
      const n = conta(baseS, "S", k);
      const nAnt = R.temC ? conta(baseC, "C", k) : 0;
      if (!n && !nAnt) continue;
      const pen = n / baseS.length, penAnt = R.temC && baseC.length ? nAnt / baseC.length : null;
      ls.push({ k, nome: M.dic.categoria[k], n, nAnt, pen, penAnt, dPen: penAnt === null ? null : pen - penAnt, oportunidade: baseS.length - n });
    }
    ls.sort((a, b) => b.pen - a.pen);
    const mediaCats = (base, cats) => (base.length ? base.reduce((s, c) => s + cats[c], 0) / base.length : null);
    const catsMedS = mediaCats(baseS, R.catsS), catsMedC = R.temC ? mediaCats(baseC, R.catsC) : null;
    const umaS = baseS.filter((c) => R.catsS[c] === 1).length, umaC = R.temC ? baseC.filter((c) => R.catsC[c] === 1).length : null;

    const card = UI.cartao("Penetração das categorias nos clientes com compra", R.temC ? `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).` : `${Fmt.esc(pAtual)}.`);
    alvo.append(card);
    const resumo = el("div", { class: "kpis kpis-compactos" });
    resumo.innerHTML = [
      UI.kpi({ rotulo: "Clientes com compra", valor: Fmt.num(baseS.length), atual: baseS.length, comparado: R.temC ? baseC.length : undefined, compValor: R.temC ? Fmt.num(baseC.length) : "", compLegenda: pAnterior, extra: "Clientes com compra no período" }),
      UI.kpi({ rotulo: "Categorias por cliente", valor: catsMedS === null ? "—" : Fmt.num1(catsMedS), atual: catsMedS, comparado: catsMedC ?? undefined, compValor: R.temC && catsMedC !== null ? Fmt.num1(catsMedC) : "", compLegenda: pAnterior, extra: "Média de categorias compradas" }),
      UI.kpi({ rotulo: "Compram só 1 categoria", valor: Fmt.num(umaS), atual: umaS, comparado: umaC ?? undefined, inverter: true, compValor: R.temC ? Fmt.num(umaC) : "", compLegenda: pAnterior, extra: `${Fmt.pct(div0(umaS, baseS.length), 1)} dos clientes com compra` }),
      UI.kpi({ rotulo: "Categoria mais presente", valor: Fmt.esc(Fmt.nome(ls[0]?.nome || "—")), extra: ls[0] ? `${Fmt.pct(ls[0].pen, 1)} dos clientes com compra` : "" }),
    ].join("");
    card.append(resumo);
    {
      const R0 = semSelecao(R), b0 = []; for (let c = 0; c < M.nC; c += 1) if (!R0.funcionario[c] && R0.cli.compraS[c]) b0.push(c);
      const media0 = b0.length ? b0.reduce((s, c) => s + R0.catsS[c], 0) / b0.length : 0;
      const top = ls[0];
      cartoesClicaveis(resumo, [
        ["Clientes com compra no período", () => b0],
        [`Clientes com compra abaixo da média de categorias (${Fmt.num1(media0)})`, () => b0.filter((c) => R0.catsS[c] < media0)],
        ["Clientes com compra só em 1 categoria", () => b0.filter((c) => R0.catsS[c] === 1)],
        top ? [`Clientes que compram ${Fmt.nome(top.nome)}`, () => b0.filter((c) => R0.cliCat.S[c * nCat + top.k] > 0)] : null,
      ], "__rolarPenetracao");
    }

    // Barras: % da base ativa que compra cada categoria. Clique: tabela de clientes com quem ainda NÃO compra a categoria.
    const filtrar = (l) => {
      const R0 = semSelecao(R), ids = [];
      for (let c = 0; c < M.nC; c += 1) if (!R0.funcionario[c] && R0.cli.compraS[c] && !(R0.cliCat.S[c * nCat + l.k] > 0)) ids.push(c);
      window.__rolarPenetracao = R.f.selecao?.rotulo !== `Clientes com compra que não compram ${Fmt.nome(l.nome)}`;
      selecionar(`Clientes com compra que não compram ${Fmt.nome(l.nome)}`, { clientes: ids });
    };
    // Um anel por categoria (a partir de 1% da base): % no centro, variação e oportunidade embaixo. Clique: ativos que não compram.
    const rotuloPen = (l) => `Clientes com compra que não compram ${Fmt.nome(l.nome)}`;
    const selPen = R.f.selecao?.rotulo || "";
    const visiveis = ls.filter((l) => l.pen >= 0.01 || selPen === rotuloPen(l)); // a categoria selecionada fica visível para desmarcar
    // Partes clicáveis: o percentual filtra quem compra a categoria; "Oportunidade" filtra quem ainda não compra.
    const rotuloCompram = (l) => `Clientes com compra que compram ${Fmt.nome(l.nome)}`;
    const filtrarCompram = (l) => {
      const R0 = semSelecao(R), ids = [];
      for (let c = 0; c < M.nC; c += 1) if (!R0.funcionario[c] && R0.cli.compraS[c] && R0.cliCat.S[c * nCat + l.k] > 0) ids.push(c);
      window.__rolarPenetracao = R.f.selecao?.rotulo !== rotuloCompram(l);
      selecionar(rotuloCompram(l), { clientes: ids });
    };
    const sel = (rotulo) => Boolean(window.__selRotulos?.includes(rotulo));
    card.append(Graf.aneis(card, { tamanho: 104, espessura: 9, itens: visiveis.map((l) => ({
      rotulo: l.nome, fracao: l.pen, centro: Fmt.pct(l.pen, 0), cor: "var(--series-1)", onCentro: () => filtrarCompram(l), centroSel: sel(rotuloCompram(l)),
      selecionado: sel(rotuloPen(l)) || sel(rotuloCompram(l)),
      linhas: [...(l.dPen === null ? [] : [["vs ano anterior", `${l.dPen >= 0 ? "+" : "−"}${Fmt.num1(Math.abs(l.dPen) * 100)} p.p.`]]), ["Oportunidade", `${Fmt.num(l.oportunidade)} clientes`, () => filtrar(l), sel(rotuloPen(l))]],
      // Balão no formato dos cartões: clientes que compram a categoria e a penetração; linha; ano anterior; variação.
      tooltip: UI.tipCartao({
        valor: `${Fmt.num(l.n)} clientes compram`, divisao: [["Penetração", Fmt.pct(l.pen, 1)], ["Oportunidade (ainda não compram)", `${Fmt.num(l.oportunidade)} clientes`]], periodo: pAtual,
        ...(R.temC ? { valorAnt: `${Fmt.num(l.nAnt)} clientes compravam`, divisaoAnt: [["Penetração", Fmt.pct(l.penAnt, 1)]], periodoAnt: pAnterior,
          rodape: l.dPen === null ? "" : `Variação da penetração <span class="tc-dif ${sinal(l.dPen)}">${Fmt.pp(l.dPen)}</span>` } : {}),
      }),
    })) }));

    // Tabela detalhada: um cliente ativo por linha e uma coluna por categoria (valor comprado no período ou "—").
    // Os cliques nos cartões e anéis de penetração rolam até aqui. Clique numa linha: filtra o painel pelo cliente.
    const cats = visiveis;
    const tp = UI.cartao("Penetração por cliente e categoria");
    alvo.append(tp);
    const rotuloCliente = (r) => `Cliente: ${Fmt.nome(r.nome)}`;
    const linhasPen = baseS.map((c) => {
      const x = M.clientes[c];
      const r = { c, nome: x.nome, local: M.dic.municipio[x.mun], canal: M.dic.canal[x.canal], vendedor: x.vend >= 0 ? M.vendedores[x.vend].nome : "—",
        valS: cli.valS[c], catsS: R.catsS[c], catsC: R.temC ? R.catsC[c] : null, faltam: cats.filter((l) => !(cliCat.S[c * nCat + l.k] > 0)).length, ...dadosDemonstradora(R, c) };
      for (const l of cats) r[`k${l.k}`] = cliCat.S[c * nCat + l.k];
      return r;
    });
    const cCat = (v) => (v > 0 ? `<span class="tem-cat">${Fmt.rs(v)}</span>` : `<span class="sem-cat">—</span>`);
    tp.append(UI.tabela({ nomeArquivo: "penetracao_categorias_clientes", linhas: linhasPen, linhasVisiveis: 20, ordem: { chave: "valS", desc: true },
      aoClicar: (r) => selecionar(rotuloCliente(r), { clientes: [r.c] }), selecionada: (r) => R.f.selecao?.rotulo === rotuloCliente(r), colunas: [
        { chave: "nome", titulo: "Cliente", classe: "texto-longo" },
        { chave: "local", titulo: "Cidade/UF" },
        { chave: "canal", titulo: "Segmentação" },
        { chave: "vendedor", titulo: "Vendedor" },
        ...colunasDemonstradora(),
        { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
        { chave: "catsS", titulo: "Categorias compradas", num: true, fmt: cNum },
        ...(R.temC ? [{ chave: "catsC", titulo: "Categorias ano anterior", num: true, anterior: true, fmt: cNum }] : []),
        { chave: "faltam", titulo: "Categorias que não compra", num: true, fmt: cNum },
        ...cats.map((l) => ({ chave: `k${l.k}`, titulo: Fmt.nome(l.nome), num: true, fmt: cCat, csv: (v) => (v > 0 ? String(v.toFixed(2)).replace(".", ",") : "") })),
      ] }));
    if (window.__rolarPenetracao) { window.__rolarPenetracao = false; setTimeout(() => tp.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
  }

  // Frequência de compra (base de pedidos, com os filtros de cliente e vendedor): por cliente, meses com compra
  // (mês com pedido de valor > 0), dias com pedido e intervalo médio entre compras (dias entre a 1ª e a última ÷ compras − 1).
  const cacheFreq = new WeakMap();
  function frequenciaClientes(R) {
    if (cacheFreq.has(R)) return cacheFreq.get(R);
    const { O, nC, nP } = M;
    const mesS = new Uint8Array(nC * nP), mesC = new Uint8Array(nC * nP);
    const diasS = new Map(), diasC = new Map();
    const dia = (d) => { const s = String(d); return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))) / 86400000; };
    for (let i = 0; i < O.n; i += 1) {
      const c = O.c[i];
      // Mês com compra = pedido ou nota de venda (mesma regra do ativo). Intervalo entre compras: só dias de nota,
      // para o dia do pedido e o dia da nota do mesmo pedido não contarem como duas compras.
      const nota = O.val[i] > 0;
      if ((!nota && !O.qtd[i]) || !R.cOK[c] || !R.vOK[O.v[i]]) continue;
      const p = O.p[i];
      if (R.inS[p]) { mesS[c * nP + p] = 1; if (nota) { if (!diasS.has(c)) diasS.set(c, new Set()); diasS.get(c).add(dia(O.d[i])); } }
      if (R.inC[p]) { mesC[c * nP + p] = 1; if (nota) { if (!diasC.has(c)) diasC.set(c, new Set()); diasC.get(c).add(dia(O.d[i])); } }
    }
    const mesesS = new Int16Array(nC), mesesC = new Int16Array(nC), intS = new Float64Array(nC).fill(NaN), intC = new Float64Array(nC).fill(NaN);
    for (let c = 0; c < nC; c += 1) for (let p = 0; p < nP; p += 1) { mesesS[c] += mesS[c * nP + p]; mesesC[c] += mesC[c * nP + p]; }
    const intervalo = (dias, alvoArr) => { for (const [c, set] of dias) { if (set.size < 2) continue; const ds = [...set].sort((a, b) => a - b); alvoArr[c] = (ds.at(-1) - ds[0]) / (ds.length - 1); } };
    intervalo(diasS, intS); intervalo(diasC, intC);
    const r = { mesesS, mesesC, intS, intC, comprasS: (c) => diasS.get(c)?.size || 0, comprasC: (c) => diasC.get(c)?.size || 0 };
    cacheFreq.set(R, r);
    return r;
  }
  // Faixas pelo nº de meses com compra no período (n = meses do período).
  function faixasFrequencia(n) {
    const cortes = [[1, 1], [2, 3], [4, 6], [7, 11], [12, n - 1]].map(([a, b]) => [a, Math.min(b, n - 1)]).filter(([a, b]) => a <= b);
    const nome = (a, b) => (a === b ? `${a} ${a === 1 ? "mês" : "meses"}` : `${a} a ${b} meses`);
    return [...cortes.map(([a, b]) => ({ a, b, nome: nome(a, b) })), { a: n, b: n, nome: n === 1 ? "1 mês" : `Todos os ${n} meses` }];
  }
  function cartaoFrequencia(R, alvo, redesenhar, alvoResumo = alvo) {
    const f = frequenciaClientes(R);
    const nS = R.S.length, nC = R.C.length;
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const compradoresS = [], compradoresC = [];
    for (let c = 0; c < M.nC; c += 1) { if (R.funcionario[c]) continue; if (f.mesesS[c] > 0) compradoresS.push(c); if (f.mesesC[c] > 0) compradoresC.push(c); }
    const media = (lista, fn) => { const v = lista.map(fn).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const somaPedS = compradoresS.reduce((s, c) => s + R.cli.pedS[c], 0);
    const pedMedS = media(compradoresS, (c) => R.cli.pedS[c]), pedMedC = R.temC ? media(compradoresC, (c) => R.cli.pedC[c]) : null;
    const mesMedS = media(compradoresS, (c) => f.mesesS[c]), mesMedC = R.temC ? media(compradoresC, (c) => f.mesesC[c]) : null;
    const intMedS = media(compradoresS, (c) => f.intS[c]), intMedC = R.temC ? media(compradoresC, (c) => f.intC[c]) : null;
    const todoMesS = compradoresS.filter((c) => f.mesesS[c] === nS).length, todoMesC = R.temC ? compradoresC.filter((c) => f.mesesC[c] === nC).length : null;
    // Legenda: período atual e total, depois ano anterior e total.
    const legendaFreq = `${Fmt.esc(pAtual)}: <strong>${Fmt.num(compradoresS.length)} clientes</strong>${R.temC ? ` · Ano anterior (${Fmt.esc(pAnterior)}): <strong>${Fmt.num(compradoresC.length)} clientes</strong>` : ""}`;
    const c = UI.cartao("Frequência de compra: clientes válidos por meses com compra", legendaFreq);
    alvo.append(c);
    const um = (v) => (v === null ? "—" : Fmt.num1(v));
    const resumo = el("div", { class: "kpis kpis-compactos resumo-frequencia" });
    resumo.innerHTML = [
      UI.kpi({ rotulo: "Pedidos por cliente", valor: um(pedMedS), atual: pedMedS, comparado: pedMedC ?? undefined, compValor: R.temC ? um(pedMedC) : "", compLegenda: pAnterior, extra: `${Fmt.num(somaPedS)} pedidos válidos ÷ ${Fmt.num(compradoresS.length)} clientes válidos` }),
      UI.kpi({ rotulo: "Meses com compra", valor: `${um(mesMedS)} de ${nS}`, atual: mesMedS, comparado: mesMedC ?? undefined, compValor: R.temC ? `${um(mesMedC)} de ${nC}` : "", compLegenda: pAnterior, extra: "Média de meses com pedido" }),
      UI.kpi({ rotulo: "Intervalo entre compras", valor: intMedS === null ? "—" : `${Fmt.num(intMedS)} dias`, atual: intMedS, comparado: intMedC ?? undefined, inverter: true, compValor: R.temC && intMedC !== null ? `${Fmt.num(intMedC)} dias` : "", compLegenda: pAnterior, extra: "Média entre clientes com 2 compras ou mais" }),
      UI.kpi({ rotulo: "Compram todo mês", valor: Fmt.num(todoMesS), atual: todoMesS, comparado: todoMesC ?? undefined, compValor: R.temC ? Fmt.num(todoMesC) : "", compLegenda: pAnterior, extra: `${Fmt.pct(div0(todoMesS, compradoresS.length), 1)} dos clientes que compraram` }),
    ].join("");
    alvoResumo.append(resumo);
    {
      const R0 = semSelecao(R), f0 = frequenciaClientes(R0), comp0 = [];
      for (let cc = 0; cc < M.nC; cc += 1) if (!R0.funcionario[cc] && f0.mesesS[cc] > 0) comp0.push(cc);
      const med = (fn) => { const v = comp0.map(fn).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
      const mPed = med((cc) => R0.cli.pedS[cc]), mMes = med((cc) => f0.mesesS[cc]), mInt = med((cc) => f0.intS[cc]);
      cartoesClicaveis(resumo, [
        [`Abaixo da média de pedidos (${Fmt.num1(mPed)})`, () => comp0.filter((cc) => R0.cli.pedS[cc] < mPed)],
        [`Abaixo da média de meses com compra (${Fmt.num1(mMes)})`, () => comp0.filter((cc) => f0.mesesS[cc] < mMes)],
        [`Intervalo entre compras acima da média (${Fmt.num(mInt)} dias)`, () => comp0.filter((cc) => f0.intS[cc] > mInt)],
        ["Compram todo mês", () => comp0.filter((cc) => f0.mesesS[cc] === R0.S.length)],
      ]);
    }

    // Distribuição: clientes por nº de meses com compra; clique filtra a tabela de clientes (clicar de novo tira o filtro).
    const faixas = faixasFrequencia(nS), faixasC = R.temC ? faixasFrequencia(nC) : [];
    const contaC = (i) => { const fx = faixasC[i]; return fx ? compradoresC.filter((cc) => f.mesesC[cc] >= fx.a && f.mesesC[cc] <= fx.b).length : null; };
    const filtrar = (fx) => {
      const R0 = semSelecao(R), f0 = frequenciaClientes(R0), ids = [];
      for (let cc = 0; cc < M.nC; cc += 1) if (!R0.funcionario[cc] && f0.mesesS[cc] >= fx.a && f0.mesesS[cc] <= fx.b) ids.push(cc);
      selecionar(`Compraram em ${fx.nome.toLowerCase()}`, { clientes: ids });
    };
    const itens = faixas.map((fx, i) => {
      const ids = compradoresS.filter((cc) => f.mesesS[cc] >= fx.a && f.mesesS[cc] <= fx.b);
      const ant = contaC(i);
      return { rotulo: fx.nome, valor: ids.length, estado: "S", titulo: `Compraram em ${fx.nome.toLowerCase()}`, onClick: () => filtrar(fx, ids),
        tooltip: [[`Clientes ${pAtual}`, Fmt.num(ids.length)], ["% dos clientes que compraram", Fmt.pct(div0(ids.length, compradoresS.length), 1)], ...(ant !== null ? [[`Clientes ${pAnterior}`, Fmt.num(ant), "anterior"]] : [])] };
    });
    c.append(Graf.colunas(c, { itens, legenda: false, fmt: Fmt.num, rotulosValor: true, larguraMax: 90, altura: 320 }));
  }

  // Clientes cadastrados (SA1 válida, 1 por nome fantasia) × compra no período: comprou = teve pedido ou nota de venda no período,
  // somando todos os cadastros do mesmo nome fantasia. Filtros de cliente do menu (UF, segmentação...) restringem a base;
  // vendedor e produto valem para a compra. Usado no card da aba de clientes e no filtro do cadastro geral.
  const chaveNome = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  function compraCadastrados(R) {
    const g = M.D.cadastroGeral;
    if (!g) return null;
    const indice = new Map(M.clientes.map((cl, i) => [cl.chave, i]));
    const comprou = new Set();
    for (let c = 0; c < M.nC; c += 1) if (R.cli.compraS[c]) comprou.add(chaveNome(M.clientes[c].nome));
    const base = new Map(), todosValidos = new Set();
    for (const l of g.linhas) {
      if (!l[7]) continue;
      const k = chaveNome(l[2]);
      todosValidos.add(k);
      const c = indice.get(l[0]);
      if (c === undefined || !R.cOK[c]) continue;
      base.set(k, comprou.has(k));
    }
    const compraram = [...base.values()].filter(Boolean).length;
    // Linhas da tabela de clientes: quem comprou = cadastros com compra no período; quem não comprou = 1 cadastro por nome
    // (o de maior faturamento no ano anterior, se houver).
    const porNome = new Map();
    for (let c = 0; c < M.nC; c += 1) { if (!R.cOK[c]) continue; const k = chaveNome(M.clientes[c].nome); if (base.has(k)) { if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(c); } }
    const idsCompraram = [], idsNao = [];
    for (const [k, cs] of porNome) {
      if (base.get(k)) idsCompraram.push(...cs.filter((c) => R.cli.compraS[c]));
      else idsNao.push(cs.reduce((m, c) => (R.cli.valC[c] > R.cli.valC[m] ? c : m), cs[0]));
    }
    return { total: base.size, compraram, naoCompraram: base.size - compraram, comprou, idsCompraram, idsNao };
  }
  function cartaoCompraCadastrados(R, alvo, redesenhar) {
    const d = compraCadastrados(R);
    if (!d) return;
    const pAtual = textoPeriodo(R.S);
    const c = UI.cartao("Clientes válidos que compraram no período", `${Fmt.esc(pAtual)}.`);
    alvo.append(c);
    // Clique: filtra a tabela de clientes da aba (não o cadastro geral) e rola até ela; clicar de novo tira o filtro.
    const abrir = (filtro) => {
      const d0 = compraCadastrados(semSelecao(R));
      selecionar(filtro === "compraram" ? "Clientes válidos que compraram no período" : "Clientes válidos que não compraram no período", { clientes: filtro === "compraram" ? d0.idsCompraram : d0.idsNao });
    };
    const fatias = [
      { rotulo: "Compraram no período", valor: d.compraram, cor: "var(--div-pos)", onClick: () => abrir("compraram"), tooltip: [["Clientes", Fmt.num(d.compraram)], ["% dos clientes válidos", Fmt.pct(div0(d.compraram, d.total), 1)], ["Regra", "Pelo menos 1 pedido ou nota de venda no período"]] },
      { rotulo: "Não compraram no período", valor: d.naoCompraram, cor: "var(--muted-mark)", onClick: () => abrir("naoCompraram"), tooltip: [["Clientes", Fmt.num(d.naoCompraram)], ["% dos clientes válidos", Fmt.pct(div0(d.naoCompraram, d.total), 1)], ["Regra", "Nenhum pedido nem nota de venda no período"]] },
    ];
    const corpo = el("div", { class: "top-categorias compra-centro" });
    c.append(corpo);
    corpo.append(Graf.pizza(corpo, { fatias, tamanho: 320, fmtValor: (v) => `${Fmt.num(v)} clientes`, rotulosFatias: true, centro: { valor: Fmt.num(d.total), legenda: "clientes válidos" } }));
  }

  // Cadastro geral de clientes: a SA1 inteira, organizada, com a classificação usada no card "Clientes cadastrados".
  // Válido = cadastro da SA1 tratada; Inválido = desconsiderado, com o motivo. Não depende do período; segue os filtros de cliente.
  let filtroCadastro = "todos";
  let linhasCadastro = null;
  function cadastroGeral(R, alvo, redesenhar) {
    const g = M.D.cadastroGeral;
    if (!g) return;
    // Unificação: cadastros válidos com o mesmo nome fantasia (sem acento, espaço e pontuação) são 1 cliente.
    // O primeiro pelo ID fica "Válido" (é o que conta nos clientes cadastrados); os demais ficam "Unificado" e apontam para ele.
    if (!linhasCadastro) {
      const nomeChave = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      linhasCadastro = g.linhas.map(([id, razao, fantasia, documento, cidade, uf, vendedor, valido, motivo]) => ({
        id, razao, fantasia, documento, cidade, uf, vendedor, classificacao: valido ? "Válido" : "Inválido", motivo: valido ? "" : motivo,
      }));
      const grupos = new Map();
      for (const l of linhasCadastro.filter((x) => x.classificacao === "Válido").sort((a, b) => (a.id > b.id ? 1 : -1))) {
        const k = nomeChave(l.fantasia);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(l);
      }
      for (const [principal, ...outros] of grupos.values()) {
        if (!outros.length) continue;
        principal.motivo = `Cliente com ${outros.length + 1} cadastros (mesmo nome fantasia)`;
        for (const o of outros) { o.classificacao = "Unificado"; o.motivo = `Mesmo nome fantasia de ${principal.id}`; }
      }
    }
    // Com filtro ou seleção no painel, mostra só os cadastros dos clientes dentro do filtro.
    const indice = new Map(M.clientes.map((cl, i) => [cl.chave, i]));
    const noFiltro = temFiltroCliente(R) ? linhasCadastro.filter((l) => { const c = indice.get(l.id); return c !== undefined && R.cOK[c]; }) : linhasCadastro;
    const conta = (cl) => noFiltro.filter((l) => l.classificacao === cl).length;
    const nValidos = conta("Válido"), nUnif = conta("Unificado"), nInv = conta("Inválido");
    const porFiltro = { validos: "Válido", unificados: "Unificado", invalidos: "Inválido" };
    const linhas = porFiltro[filtroCadastro] ? noFiltro.filter((l) => l.classificacao === porFiltro[filtroCadastro]) : noFiltro;
    const c = UI.cartao("Cadastro geral de clientes");
    c.querySelector(".cabecalho-cartao").append(UI.alternador([["todos", "Todos"], ["validos", `Válidos (${Fmt.num(nValidos)})`], ["unificados", `Unificados (${Fmt.num(nUnif)})`], ["invalidos", `Inválidos (${Fmt.num(nInv)})`]], filtroCadastro, (id) => { filtroCadastro = id; redesenhar(); }));
    alvo.append(c);
    const cClass = (v) => `<span class="delta ${v === "Válido" ? "sobe" : v === "Inválido" ? "desce" : ""}">${v}</span>`;
    // Clique numa linha: filtra a página pelo cliente (todos os cadastros com o mesmo nome fantasia). Cadastro sem
    // venda nenhuma no histórico deixa a página zerada.
    const rotuloCad = (r) => `Cliente: ${Fmt.nome(r.fantasia || r.razao)}`;
    const cliqueCad = (r) => {
      const k = chaveNome(r.fantasia), ids = [];
      if (k) M.clientes.forEach((cl, i) => { if (chaveNome(cl.nome) === k) ids.push(i); });
      else if (indice.has(r.id)) ids.push(indice.get(r.id));
      selecionar(rotuloCad(r), { clientes: ids });
    };
    c.append(UI.tabela({ nomeArquivo: `cadastro_geral_clientes_${filtroCadastro}`, linhas, limite: 200, linhasVisiveis: 20, ordem: { chave: "id", desc: false }, aoClicar: cliqueCad, selecionada: (r) => window.__selRotulos?.includes(rotuloCad(r)), colunas: [
      { chave: "id", titulo: "ID Filial | Cliente | Loja" },
      { chave: "razao", titulo: "Razão social", classe: "texto-longo" },
      { chave: "fantasia", titulo: "Nome fantasia", classe: "texto-longo" },
      { chave: "documento", titulo: "CNPJ/CPF" },
      { chave: "cidade", titulo: "Cidade" },
      { chave: "uf", titulo: "UF" },
      { chave: "vendedor", titulo: "Vendedor" },
      { chave: "classificacao", titulo: "Classificação", fmt: cClass },
      { chave: "motivo", titulo: "Motivo da classificação" },
    ] }));
  }

  // Gráficos da análise por cliente; seguem o filtro de situação (linhas já filtradas).
  // Faixas de variação do faturamento do cliente (gráfico de distribuição e filtro da tabela).
  const FAIXAS_VARIACAO = [
    ["Sem compra ano anterior", (l) => l.valC <= 0 && l.valS > 0, "var(--div-pos)"],
    ["Cresceram mais de 50%", (l) => l.valC > 0 && l.var > 0.5, "var(--div-pos)"],
    ["Cresceram de 20% a 50%", (l) => l.valC > 0 && l.var > 0.2 && l.var <= 0.5, "var(--div-pos)"],
    ["Cresceram até 20%", (l) => l.valC > 0 && l.var > 0 && l.var <= 0.2, "var(--div-pos)"],
    ["Estáveis", (l) => l.valC > 0 && l.valS > 0 && l.var === 0, "var(--muted-mark)"],
    ["Caíram até 20%", (l) => l.valC > 0 && l.valS > 0 && l.var < 0 && l.var >= -0.2, "var(--div-neg)"],
    ["Caíram de 20% a 50%", (l) => l.valC > 0 && l.valS > 0 && l.var < -0.2 && l.var >= -0.5, "var(--div-neg)"],
    ["Caíram mais de 50%", (l) => l.valC > 0 && l.valS > 0 && l.var < -0.5, "var(--div-neg)"],
    ["Sem compra no período", (l) => l.valC > 0 && l.valS <= 0, "var(--div-neg)"],
  ];

  function graficosClientes(R, alvo, linhas, filtrar) {
    // Rótulos dos balões com o período a que cada número se refere.
    const pAtual = textoPeriodo(R.S), pAnterior = textoPeriodo(R.C);
    const crescGeral = R.totS.val - R.totC.val;
    const rsCurto = Fmt.varRsCheio; // valor completo
    const doCresc = (v) => (crescGeral ? Fmt.var(v / Math.abs(crescGeral), 1) : "—");
    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);

    // 1. Quem mais puxou o crescimento e a queda.
    const c1 = UI.cartao("Clientes que mais puxaram o crescimento e a queda");
    grade.append(c1);
    const pos = linhas.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
    const neg = linhas.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10).reverse();
    c1.append(Graf.barrasH(c1, { itens: [...pos, ...neg].map((l) => ({ onClick: () => filtrar("cliente", l.c, l.nome), rotulo: l.nome, valor: l.delta, texto: rsCurto(l.delta), textoCor: `(${doCresc(l.delta)})`, tooltip: [ // % na cor da barra
      [`Faturamento ${pAtual}`, Fmt.rs(l.valS)], [`Faturamento ${pAnterior}`, Fmt.rs(l.valC), "anterior"], ["Variação R$", Fmt.varRsCheio(l.delta)], ["Variação %", Fmt.var(l.var)],
      ["Participação no crescimento geral", doCresc(l.delta)], ["Situação", l.status], ["Segmentação", l.canal || "—"],
    ] })), divergente: true, larguraRotulo: 220, alturaBarra: 10, gap: 6 }));

    // 2. Distribuição por faixa de variação.
    const c2 = UI.cartao("Distribuição dos clientes por faixa de variação");
    grade.append(c2);
    c2.append(Graf.barrasH(c2, { itens: FAIXAS_VARIACAO.map(([nome, teste, cor]) => {
      const g = linhas.filter(teste);
      const d = g.reduce((s, l) => s + l.delta, 0);
      return { onClick: () => filtrar("faixa", nome, nome), rotulo: nome, valor: g.length, cor, texto: `${Fmt.num(g.length)} clientes · ${rsCurto(d)}`, tooltip: [["Clientes", Fmt.num(g.length)], ["Variação R$", Fmt.varRsCheio(d)], ["Participação no crescimento geral", doCresc(d)]] };
    }), larguraRotulo: 170 }));

    // 3. Crescimento ou queda por segmentação.
    const porCanal = new Map();
    for (const l of linhas) {
      const k = l.canal || "(sem segmentação)";
      const a = porCanal.get(k) || { nome: k, valS: 0, valC: 0, ativosS: 0, ativosC: 0 };
      a.valS += l.valS; a.valC += l.valC; if (l.valS > 0) a.ativosS += 1; if (l.valC > 0) a.ativosC += 1;
      porCanal.set(k, a);
    }
    const canaisLs = [...porCanal.values()].map((a) => ({ ...a, delta: a.valS - a.valC, var: taxa(a.valS, a.valC) })).sort((a, b) => b.delta - a.delta);
    const c3 = UI.cartao("Crescimento ou queda por segmentação");
    alvo.append(c3);
    c3.append(Graf.barrasH(c3, { itens: canaisLs.map((a) => ({ onClick: () => filtrar("canal", a.nome, a.nome), rotulo: a.nome, valor: a.delta, texto: rsCurto(a.delta), textoCor: `(${Fmt.var(a.var, 1)})`, tooltip: [
      [`Faturamento ${pAtual}`, Fmt.rs(a.valS)], [`Faturamento ${pAnterior}`, Fmt.rs(a.valC), "anterior"], ["Variação R$", Fmt.varRsCheio(a.delta)], ["Variação %", Fmt.var(a.var)],
      [`Clientes com compra ${pAtual}`, Fmt.num(a.ativosS)], [`Clientes com compra ${pAnterior}`, Fmt.num(a.ativosC), "anterior"], ["Participação no crescimento geral", doCresc(a.delta)],
    ] })), divergente: true, larguraRotulo: 240 }));
  }

  // ---------- 3. Histórico de clientes ----------
  let filtroStatus = -1;
  function historico(R, alvo, redesenhar) {
    avisoComparacao(R, alvo);
    const ls = linhasClientes(R);
    const fimS = R.S.at(-1);
    const mesesSem = (d) => { if (!d) return null; const s = String(d); return (Number(fimS.slice(0, 4)) - Number(s.slice(0, 4))) * 12 + Number(fimS.slice(4)) - Number(s.slice(4, 6)); };
    ls.forEach((l) => { l.mesesSem = mesesSem(l.ultCompra); });

    const k = el("div", { class: "kpis" });
    k.innerHTML = R.ponte.filter((g) => g.i !== 6 && (g.clientes || g.i !== 2) && (R.temC || g.i === 2 || g.i === 3)).map((g) => {
      const nome = !R.temC && g.i === 2 ? "Já eram clientes" : g.nome;
      return `<div class="kpi"><div class="rotulo">${selo(nome, COR_STATUS[g.i])}</div><div class="valor">${Fmt.num(g.clientes)}</div><div class="comp">${g.i === 5 || g.i === 7 ? `${Fmt.rs0(g.valC)} faturados na comparação` : `${Fmt.rs0(g.valS)} no período`}</div>${R.temC ? `<div class="delta ${sinal(g.delta)}">${Fmt.varRs(g.delta)} de variação</div>` : ""}</div>`;
    }).join("");
    alvo.append(k);

    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);
    const rec = UI.cartao("Recência: há quanto tempo o cliente comprou pela última vez", `Contado até ${Fmt.mesLongo(fimS)} (fim do período), para clientes com compra no período ou na comparação.`);
    grade.append(rec);
    const faixas = [["No último mês", 0, 0], ["1 a 2 meses", 1, 2], ["3 a 5 meses", 3, 5], ["6 a 11 meses", 6, 11], ["12 meses ou mais", 12, 9999]];
    rec.append(Graf.barrasH(rec, { itens: faixas.map(([nome, a, b]) => { const g = ls.filter((l) => l.mesesSem !== null && l.mesesSem >= a && l.mesesSem <= b); return { rotulo: nome, valor: g.length, texto: Fmt.num(g.length), tooltip: [["Clientes", Fmt.num(g.length)], ["Faturamento na comparação", Fmt.rs0(g.reduce((s, l) => s + l.valC, 0))]] }; }), larguraRotulo: 140 }));
    const exp = UI.cartao("Como cada cliente é classificado");
    exp.append(el("div", { class: "explica" }, `<ul>
      <li><strong>Cresceu / Reduziu / Manteve:</strong> comprou no período e na comparação; compara o faturamento dos dois.</li>
      <li><strong>Novo:</strong> comprou no período e nunca tinha comprado antes do início dele.</li>
      <li><strong>Reativado:</strong> comprou no período, não comprou na comparação, mas já tinha comprado antes.</li>
      <li><strong>Perdido:</strong> completou 12 meses sem comprar durante o período.</li>
      </ul><p>Última compra e último pedido vêm da base de pedidos (data do faturamento e data do pedido). Com períodos curtos (1 mês) a classificação fica sensível à sazonalidade de compra; para analisar a base de clientes, prefira 3, 6 ou 12 meses.</p>`));
    grade.append(exp);

    const t = UI.cartao("Rastreamento de clientes", "Filtre pela situação; a tabela traz a data e o valor da última compra e a data do último pedido.");
    alvo.append(t);
    const opcoes = [[-1, "Todos"], ...R.ponte.filter((g) => g.i !== 6 && g.clientes).map((g) => [g.i, `${g.nome} (${Fmt.num(g.clientes)})`])];
    t.querySelector(".cabecalho-cartao").append(UI.alternador(opcoes, filtroStatus, (id) => { filtroStatus = id; redesenhar(); }));
    const linhas = ls.filter((l) => l.st !== 6 && (filtroStatus < 0 || l.st === filtroStatus));
    t.append(UI.tabela({ nomeArquivo: "rastreamento_clientes", linhas, ordem: filtroStatus === 5 ? { chave: "valC", desc: true } : { chave: "valS", desc: true }, colunas: [
      { chave: "nome", titulo: "Cliente", classe: "texto-longo" }, { chave: "chave", titulo: "Filial|Cód|Loja" }, { chave: "local", titulo: "Cidade/UF" }, { chave: "canal", titulo: "Segmentação" }, { chave: "vendedor", titulo: "Vendedor (cadastro)" }, colStatus,
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, ...(R.temC ? [{ chave: "valC", titulo: "Fat. comparação", num: true, fmt: cRs }, { chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Cresc. %", num: true, fmt: cVar }] : []),
      { chave: "ultCompra", titulo: "Última compra", num: true, fmt: (v) => Fmt.data(v), csv: (v) => Fmt.data(v) },
      { chave: "valUlt", titulo: "Valor últ. compra", num: true, fmt: cRs },
      { chave: "ultPedido", titulo: "Último pedido", num: true, fmt: (v) => Fmt.data(v), csv: (v) => Fmt.data(v) },
      { chave: "mesesSem", titulo: "Meses sem comprar", num: true, fmt: cNum },
      { chave: "ultCompraGeral", titulo: "Última compra (geral)", num: true, fmt: (v) => Fmt.data(v), csv: (v) => Fmt.data(v), dica: "Última compra em toda a base, inclusive depois do período selecionado" },
    ] }));
  }

  // ---------- 4. Origem do crescimento ----------
  let dimOrigem = "canal";
  function origem(R, alvo, redesenhar) {
    avisoComparacao(R, alvo);
    if (!R.temC) return;
    const P = R.ponte;
    const passos = [
      { rotulo: "Faturamento\ncomparação", valor: R.totC.val, total: true },
      { rotulo: "Clientes\nnovos", valor: P[3].delta, tooltip: [["Clientes", Fmt.num(P[3].clientes)], ["Ganho", Fmt.varRsCheio(P[3].delta)]] },
      { rotulo: "Clientes\nreativados", valor: P[4].delta, tooltip: [["Clientes", Fmt.num(P[4].clientes)], ["Ganho", Fmt.varRsCheio(P[4].delta)]] },
      { rotulo: "Clientes que\ncresceram", valor: P[0].delta, tooltip: [["Clientes", Fmt.num(P[0].clientes)], ["Ganho", Fmt.varRsCheio(P[0].delta)]] },
      { rotulo: "Clientes que\nreduziram", valor: P[1].delta, tooltip: [["Clientes", Fmt.num(P[1].clientes)], ["Perda", Fmt.varRsCheio(P[1].delta)]] },
      { rotulo: "Pararam de\ncomprar", valor: P[7].delta, tooltip: [["Clientes", Fmt.num(P[7].clientes)], ["Perda", Fmt.varRsCheio(P[7].delta)]] },
      { rotulo: "Deixaram de\ncomprar", valor: P[5].delta, tooltip: [["Clientes", Fmt.num(P[5].clientes)], ["Perda", Fmt.varRsCheio(P[5].delta)]] },
      ...(Math.abs(P[2].delta) > 0.5 ? [{ rotulo: "Manteve", valor: P[2].delta }] : []),
      ...(Math.abs(P[6].delta) > 0.5 ? [{ rotulo: "Ajustes/\ndevoluções", valor: P[6].delta, tooltip: [["Clientes", Fmt.num(P[6].clientes)], ["Valor", Fmt.varRsCheio(P[6].delta)], ["O que é", "Clientes só com devoluções/créditos (valor líquido ≤ 0)"]] }] : []),
      { rotulo: "Faturamento\nperíodo", valor: R.totS.val, total: true },
    ];
    const delta = R.totS.val - R.totC.val;
    const c = UI.cartao("De onde veio o crescimento", `${textoPeriodo(R.S)} comparado com o ano anterior (${textoComp(R)}): ${Fmt.varRsCheio(delta)} (${Fmt.var(taxa(R.totS.val, R.totC.val))}).`);
    alvo.append(c);
    c.append(Graf.cascata(c, { passos, altura: 320 }));
    const ganho = P[3].delta + P[4].delta + P[0].delta, perda = P[1].delta + P[5].delta + P[7].delta;
    c.append(el("p", { class: "explica" }, `Ganhos: <strong>${Fmt.rs0(ganho)}</strong> (novos ${Fmt.rs0(P[3].delta)}, reativados ${Fmt.rs0(P[4].delta)}, crescimento da base ${Fmt.rs0(P[0].delta)}). Perdas: <strong>${Fmt.rs0(-perda)}</strong> (redução ${Fmt.rs0(-P[1].delta)}, clientes que deixaram de comprar ${Fmt.rs0(-P[5].delta)}).`));

    const tg = UI.cartao("Resumo por situação do cliente");
    alvo.append(tg);
    tg.append(UI.tabela({ busca: false, nomeArquivo: "origem_crescimento_resumo", linhas: P.filter((g) => g.clientes).map((g) => ({ nome: g.nome, st: g.i, clientes: g.clientes, valC: g.valC, valS: g.valS, delta: g.delta, pctDelta: delta ? g.delta / Math.abs(delta) : null })), ordem: { chave: "delta", desc: true }, colunas: [
      { chave: "nome", titulo: "Situação", fmt: (v, r) => selo(v, COR_STATUS[r.st]) }, { chave: "clientes", titulo: "Clientes", num: true, fmt: cNum }, { chave: "valC", titulo: "Fat. comparação", num: true, fmt: cRs },
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, { chave: "delta", titulo: "Variação R$", num: true, fmt: cDRs }, { chave: "pctDelta", titulo: "% da variação líquida", num: true, fmt: (v) => Fmt.var(v, 0) },
    ] }));

    const dims = { canal: ["Segmentação", (cc) => M.dic.canal[M.clientes[cc].canal]], regiao: ["Região", (cc) => M.dic.regiao[M.clientes[cc].reg]], uf: ["UF", (cc) => M.dic.uf[M.clientes[cc].uf]], vendedor: ["Vendedor (cadastro)", (cc) => { const v = M.clientes[cc].vend; return v >= 0 ? M.vendedores[v].nome : "(sem vendedor)"; }], rede: ["Rede", (cc) => M.dic.rede[M.clientes[cc].rede]] };
    const td = UI.cartao("Origem do crescimento por recorte", "Quanto cada grupo ganhou com novos/reativados e com clientes que cresceram, e quanto perdeu com redução e clientes que deixaram de comprar.");
    td.querySelector(".cabecalho-cartao").append(UI.alternador(Object.entries(dims).map(([k, [n]]) => [k, n]), dimOrigem, (id) => { dimOrigem = id; redesenhar(); }));
    alvo.append(td);
    const [nomeDim, fn] = dims[dimOrigem];
    const linhas = linhasGrupo(R, agruparClientes(R, fn), (x) => x);
    td.append(UI.tabela({ nomeArquivo: `origem_crescimento_${dimOrigem}`, linhas, ordem: { chave: "delta", desc: true }, colunas: [
      { chave: "nome", titulo: nomeDim, classe: "texto-longo" }, { chave: "valC", titulo: "Fat. comparação", num: true, fmt: cRs }, { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
      { chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Cresc. %", num: true, fmt: cVar },
      { chave: "dNovos", titulo: "Novos + reativ. R$", num: true, fmt: cDRs }, { chave: "novos", titulo: "Qtd novos + reativ.", num: true, fmt: cNum },
      { chave: "dCresc", titulo: "Cresceram R$", num: true, fmt: cDRs }, { chave: "dRed", titulo: "Reduziram R$", num: true, fmt: cDRs },
      { chave: "dPerd", titulo: "Deixaram R$", num: true, fmt: cDRs }, { chave: "perdidos", titulo: "Qtd deixaram", num: true, fmt: cNum },
    ] }));
  }

  // ---------- 5. Produtos ----------
  let nivelProd = "produto";
  let itemSel = null;
  function leitura(dp, dq) {
    if (!Number.isFinite(dp) || !Number.isFinite(dq)) return "—";
    if (dp > 0.02 && dq < -0.02) return "Preço subiu, volume caiu";
    if (dp > 0.02 && dq >= -0.02) return "Preço subiu sem perder volume";
    if (dp < -0.02 && dq > 0.02) return "Preço caiu, volume subiu";
    if (dp < -0.02 && dq <= 0.02) return "Preço caiu sem ganhar volume";
    return dq > 0.02 ? "Preço estável, volume subiu" : dq < -0.02 ? "Preço estável, volume caiu" : "Estável";
  }
  function linhasProdutos(R, nivel) {
    const g = new Map();
    const { prod } = R;
    for (let i = 0; i < M.nPr; i += 1) {
      if (!prod.valS[i] && !prod.valC[i] && !prod.qS[i] && !prod.qC[i]) continue;
      const p = M.produtos[i];
      const k = nivel === "produto" ? i : nivel === "categoria" ? p.cat : p.fam;
      const a = g.get(k) || { k, valS: 0, valC: 0, qS: 0, qC: 0, qpS: 0, qpC: 0, cliS: 0, cliC: 0, n: 0 };
      a.valS += prod.valS[i]; a.valC += prod.valC[i]; a.qS += prod.qS[i]; a.qC += prod.qC[i]; a.qpS += prod.qpS[i]; a.qpC += prod.qpC[i]; a.n += 1;
      if (nivel === "produto") { a.cliS = prod.cliS[i]; a.cliC = prod.cliC[i]; }
      g.set(k, a);
    }
    const tS = R.totS.val;
    return [...g.values()].map((a) => {
      const p = nivel === "produto" ? M.produtos[a.k] : null;
      const precoS = div0(a.valS, a.qpS), precoC = div0(a.valC, a.qpC);
      const dq = R.temC ? taxa(a.qpS, a.qpC) : null, dp = R.temC && precoS && precoC ? precoS / precoC - 1 : null;
      return {
        k: a.k, nome: p ? p.desc : nivel === "categoria" ? M.dic.categoria[a.k] : M.dic.familia[a.k], cod: p ? p.cod : "",
        categoria: p ? M.dic.categoria[p.cat] : "", familia: p ? M.dic.familia[p.fam] : "", cadastro: p ? M.dic.statusProduto[p.status] : "", lanc: p && p.lanc ? Fmt.mesLongo(p.lanc) : "",
        qS: a.qS, qC: a.qC, qpS: a.qpS, qpC: a.qpC, dq, precoS, precoC, dp, valS: a.valS, valC: a.valC, delta: a.valS - a.valC, var: R.temC ? taxa(a.valS, a.valC) : null,
        partS: div0(a.valS, tS), cliS: a.cliS, itens: a.n, leitura: R.temC ? leitura(dp, dq) : "—",
      };
    });
  }
  function produtos(R, alvo, redesenhar) {
    avisoComparacao(R, alvo);
    const cab = UI.cartao("Desempenho de produtos", "Volume em peças pagas (sem bonificação) e preço médio sem bonificação. Clique numa linha para ver a evolução mensal.");
    cab.querySelector(".cabecalho-cartao").append(UI.alternador([["produto", "Produto"], ["categoria", "Categoria (linha)"], ["familia", "Família"]], nivelProd, (id) => { nivelProd = id; itemSel = null; redesenhar(); }));
    alvo.append(cab);
    const ls = linhasProdutos(R, nivelProd);
    if (itemSel === null || !ls.some((l) => l.k === itemSel)) itemSel = ls.slice().sort((a, b) => b.valS - a.valS)[0]?.k ?? null;

    if (R.temC) {
      const comp = ls.filter((l) => Number.isFinite(l.dp) && Number.isFinite(l.dq) && l.qpC > 0);
      const relevantes = comp.sort((a, b) => b.valS - a.valS).slice(0, nivelProd === "produto" ? 120 : 60);
      const grade = el("div", { class: "grade g2" });
      cab.append(grade);
      const d1 = el("div");
      d1.innerHTML = `<h3>Variação de preço × variação de volume</h3><p class="nota">Cada ponto é um ${nivelProd === "produto" ? "produto (os 120 de maior faturamento)" : nivelProd}. À direita: preço subiu; acima: volume subiu. Valores acima de ±100% ficam na borda.</p>`;
      grade.append(d1);
      d1.append(Graf.dispersao(d1, { pontos: relevantes.map((l) => ({ x: l.dp, y: l.dq, rotulo: l.nome, tooltip: [["Var. preço", Fmt.var(l.dp)], ["Var. peças", Fmt.var(l.dq)], ["Preço", `${Fmt.rs(l.precoC)} → ${Fmt.rs(l.precoS)}`], ["Peças", `${Fmt.num(l.qpC)} → ${Fmt.num(l.qpS)}`], ["Faturamento", Fmt.rs0(l.valS)]] })), rotX: "Variação do preço médio", rotY: "Variação de peças" }));
      const d2 = el("div");
      d2.innerHTML = `<h3>Quem mais cresceu e caiu (R$)</h3><p class="nota">Os 8 maiores de cada lado.</p>`;
      grade.append(d2);
      d2.append(barrasCrescimento(d2, ls, 8));
    }

    const det = el("div", { class: "grade g2" });
    const item = ls.find((l) => l.k === itemSel);
    if (item) {
      const serie = M.serieItem(R, nivelProd, item.k);
      const meses = mesesGrafico(R);
      const idx = meses.map((p) => M.pIdx.get(p));
      const dest = meses.map((p, i) => (R.S.includes(p) ? i : -1)).filter((i) => i >= 0);
      const c1 = UI.cartao(`Peças pagas por mês: ${item.nome}`);
      const c2 = UI.cartao(`Preço médio por mês: ${item.nome}`);
      det.append(c1, c2);
      alvo.append(det);
      c1.append(Graf.linhas(c1, { x: meses.map(Fmt.mes), series: [{ nome: "Peças pagas", valores: idx.map((i) => serie.qp[i]), cor: "var(--series-1)" }], fmtTip: Fmt.num, destaque: dest }));
      c2.append(Graf.linhas(c2, { x: meses.map(Fmt.mes), series: [{ nome: "Preço médio s/ bonif.", valores: idx.map((i) => (serie.qp[i] > 0 ? serie.val[i] / serie.qp[i] : null)), cor: "var(--series-2)" }], fmt: (v) => Fmt.num1(v), fmtTip: Fmt.rs, destaque: dest, zeroBase: false }));
    }

    const t = UI.cartao("Tabela de produtos");
    alvo.append(t);
    const colsProd = nivelProd === "produto" ? [{ chave: "cod", titulo: "Código" }, { chave: "nome", titulo: "Produto", classe: "texto-longo" }, { chave: "categoria", titulo: "Categoria" }, { chave: "familia", titulo: "Família" }, { chave: "lanc", titulo: "Lançamento (1ª venda)" }, { chave: "cadastro", titulo: "Cadastro" }]
      : [{ chave: "nome", titulo: nivelProd === "categoria" ? "Categoria" : "Família" }, { chave: "itens", titulo: "Produtos", num: true, fmt: cNum }];
    t.append(UI.tabela({ nomeArquivo: `produtos_${nivelProd}`, linhas: ls, ordem: { chave: "valS", desc: true }, aoClicar: (r) => { itemSel = r.k; redesenhar(); }, selecionada: (r) => r.k === itemSel, colunas: [
      ...colsProd,
      { chave: "qpS", titulo: "Peças pagas", num: true, fmt: cNum }, ...(R.temC ? [{ chave: "qpC", titulo: "Peças ano ant.", num: true, fmt: cNum }, { chave: "dq", titulo: "Var. peças", num: true, fmt: cVar }] : []),
      { chave: "precoS", titulo: "Preço médio", num: true, fmt: cPreco }, ...(R.temC ? [{ chave: "precoC", titulo: "Preço ano ant.", num: true, fmt: cPreco }, { chave: "dp", titulo: "Var. preço", num: true, fmt: cVar }] : []),
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, ...(R.temC ? [{ chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Cresc. %", num: true, fmt: cVar }] : []),
      { chave: "partS", titulo: "Participação", num: true, fmt: (v) => Fmt.pct(v, 2) },
      ...(nivelProd === "produto" ? [{ chave: "cliS", titulo: "Clientes compradores", num: true, fmt: cNum }] : []),
      { chave: "qS", titulo: "Peças c/ brindes", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "leitura", titulo: "Leitura preço × volume" }] : []),
    ] }));
  }

  // ---------- 6. Mix ----------
  function mix(R, alvo) {
    avisoComparacao(R, alvo); avisoPedidos(R, alvo);
    const { cli, catsS, catsC, cliCat } = R;
    const nCat = M.nCat;
    const ativosS = [], ambos = [];
    for (let c = 0; c < M.nC; c += 1) {
      if (cli.compraS[c]) ativosS.push(c);
      if (cli.compraS[c] && cli.compraC[c]) ambos.push(c);
    }
    const media = (lista, arr) => (lista.length ? lista.reduce((s, c) => s + arr[c], 0) / lista.length : null);
    const ativosC = []; for (let c = 0; c < M.nC; c += 1) if (cli.compraC[c]) ativosC.push(c);
    const k = el("div", { class: "kpis" });
    k.innerHTML = [
      UI.kpi({ rotulo: "Categorias por cliente com compra (média)", valor: Fmt.num1(media(ativosS, catsS)), atual: media(ativosS, catsS), comparado: R.temC ? media(ativosC, catsC) : null, atualLegenda: textoPeriodo(R.S), compValor: R.temC ? Fmt.num1(media(ativosC, catsC)) : "", compLegenda: R.temC ? textoComp(R) : "", semComparacao: "Não há dados no período anterior" }),
      UI.kpi({ rotulo: "Categorias vendidas", atualLegenda: textoPeriodo(R.S), valor: Fmt.num([...Array(nCat).keys()].filter((j) => ativosS.some((c) => cliCat.S[c * nCat + j] > 0)).length) }),
    ].join("");
    alvo.append(k);

    if (R.temC) {
      const grupos = [["Ampliou o mix", (c) => catsS[c] > catsC[c]], ["Manteve o nº de categorias", (c) => catsS[c] === catsC[c]], ["Reduziu o mix", (c) => catsS[c] < catsC[c]]];
      const linhas = grupos.map(([nome, fn]) => {
        const cs = ambos.filter(fn);
        const vS = cs.reduce((s, c) => s + cli.valS[c], 0), vC = cs.reduce((s, c) => s + cli.valC[c], 0);
        const pS = cs.reduce((s, c) => s + cli.pedS[c], 0), pC = cs.reduce((s, c) => s + cli.pedC[c], 0);
        return { nome, clientes: cs.length, valS: vS, valC: vC, delta: vS - vC, var: taxa(vS, vC), ticketS: div0(vS, pS), ticketC: div0(vC, pC), dTicket: pS && pC ? (vS / pS) / (vC / pC) - 1 : null, pedS: pS, pedC: pC, dPed: taxa(pS, pC) };
      });
      const c = UI.cartao("Impacto da mudança de mix nos pedidos", `Clientes que compraram nos dois períodos (${Fmt.num(ambos.length)}), separados pela variação no número de categorias compradas.`);
      alvo.append(c);
      c.append(Graf.barrasH(c, { itens: linhas.map((l) => ({ rotulo: l.nome, valor: l.dTicket ?? 0, texto: `${Fmt.var(l.dTicket)} no ticket`, tooltip: [["Clientes", Fmt.num(l.clientes)], ["Ticket médio", `${Fmt.rs0(l.ticketC)} → ${Fmt.rs0(l.ticketS)}`], ["Pedidos", `${Fmt.num(l.pedC)} → ${Fmt.num(l.pedS)}`], ["Faturamento", Fmt.varRsCheio(l.delta)]] })), divergente: true, fmt: Fmt.var, larguraRotulo: 200 }));
      c.append(UI.tabela({ busca: false, nomeArquivo: "mix_impacto", linhas, ordem: { chave: "delta", desc: true }, colunas: [
        { chave: "nome", titulo: "Grupo" }, { chave: "clientes", titulo: "Clientes", num: true, fmt: cNum }, { chave: "valC", titulo: "Fat. comparação", num: true, fmt: cRs }, { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
        { chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Cresc. %", num: true, fmt: cVar },
        { chave: "pedC", titulo: "Pedidos ano ant.", num: true, fmt: cNum }, { chave: "pedS", titulo: "Pedidos", num: true, fmt: cNum }, { chave: "dPed", titulo: "Var. pedidos", num: true, fmt: cVar },
        { chave: "ticketC", titulo: "Ticket ano ant.", num: true, fmt: cRs }, { chave: "ticketS", titulo: "Ticket", num: true, fmt: cRs }, { chave: "dTicket", titulo: "Var. ticket", num: true, fmt: cVar },
      ] }));
    }

    const pen = [];
    for (let j = 0; j < nCat; j += 1) {
      let nS = 0, nCc = 0, vS = 0, vC = 0;
      for (const c of ativosS) { if (cliCat.S[c * nCat + j] > 0) nS += 1; vS += cliCat.S[c * nCat + j]; }
      for (const c of ativosC) { if (cliCat.C[c * nCat + j] > 0) nCc += 1; vC += cliCat.C[c * nCat + j]; }
      if (!vS && !vC) continue;
      const penS = div0(nS, ativosS.length), penC = R.temC ? div0(nCc, ativosC.length) : null;
      pen.push({ nome: M.dic.categoria[j], compradores: nS, penS, penC, dPen: R.temC ? penS - penC : null, partS: div0(vS, R.totS.val), partC: R.temC ? div0(vC, R.totC.val) : null, dPart: R.temC ? div0(vS, R.totS.val) - div0(vC, R.totC.val) : null, valS: vS, valC: vC, var: R.temC ? taxa(vS, vC) : null });
    }
    const cp = UI.cartao("Mix por categoria", "Penetração = % dos clientes com compra no período que compraram a categoria. Participação = peso da categoria no faturamento.");
    alvo.append(cp);
    if (R.temC) cp.append(Graf.barrasH(cp, { itens: pen.filter((p) => p.compradores || p.penC).sort((a, b) => b.dPen - a.dPen).map((p) => ({ rotulo: p.nome, valor: p.dPen, texto: Fmt.pp(p.dPen), tooltip: [["Penetração", `${Fmt.pct(p.penC)} → ${Fmt.pct(p.penS)}`], ["Participação", `${Fmt.pct(p.partC)} → ${Fmt.pct(p.partS)}`]] })), divergente: true, fmt: Fmt.pp, larguraRotulo: 240, alturaBarra: 10, gap: 6 }));
    cp.append(UI.tabela({ busca: false, nomeArquivo: "mix_categorias", linhas: pen, ordem: { chave: "valS", desc: true }, colunas: [
      { chave: "nome", titulo: "Categoria" }, { chave: "compradores", titulo: "Clientes compradores", num: true, fmt: cNum }, { chave: "penS", titulo: "Penetração", num: true, fmt: cPct },
      ...(R.temC ? [{ chave: "penC", titulo: "Penetração ano ant.", num: true, fmt: cPct }, { chave: "dPen", titulo: "Var. penetração", num: true, fmt: cPp }] : []),
      { chave: "partS", titulo: "Participação", num: true, fmt: cPct }, ...(R.temC ? [{ chave: "partC", titulo: "Particip. ano ant.", num: true, fmt: cPct }, { chave: "dPart", titulo: "Var. particip.", num: true, fmt: cPp }] : []),
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, ...(R.temC ? [{ chave: "var", titulo: "Cresc. %", num: true, fmt: cVar }] : []),
    ] }));

    const tc = UI.cartao("Mix por cliente", "Categorias compradas no período e na comparação, com as categorias que entraram e saíram do pedido do cliente.");
    alvo.append(tc);
    const linhasCli = [];
    for (let c = 0; c < M.nC; c += 1) {
      if (!(cli.compraS[c]) && !(cli.compraC[c])) continue;
      const ent = [], sai = [];
      for (let j = 0; j < nCat; j += 1) {
        const s = cliCat.S[c * nCat + j] > 0, cc = cliCat.C[c * nCat + j] > 0;
        if (R.temC && s && !cc) ent.push(M.dic.categoria[j]);
        if (R.temC && !s && cc) sai.push(M.dic.categoria[j]);
      }
      let top = -1, vTop = 0;
      for (let j = 0; j < nCat; j += 1) if (cliCat.S[c * nCat + j] > vTop) { vTop = cliCat.S[c * nCat + j]; top = j; }
      linhasCli.push({ nome: nomeCliente(c), local: local(c), canal: M.dic.canal[M.clientes[c].canal], catsS: catsS[c], catsC: catsC[c], dCats: catsS[c] - catsC[c], principal: top >= 0 ? M.dic.categoria[top] : "—", pPrincipal: div0(vTop, cli.valS[c]), entraram: ent.join(", "), sairam: sai.join(", "), valS: cli.valS[c], valC: cli.valC[c], delta: cli.valS[c] - cli.valC[c], ticketS: div0(cli.valS[c], cli.pedS[c]), ticketC: div0(cli.valC[c], cli.pedC[c]) });
    }
    tc.append(UI.tabela({ nomeArquivo: "mix_clientes", linhas: linhasCli, ordem: { chave: "valS", desc: true }, colunas: [
      { chave: "nome", titulo: "Cliente", classe: "texto-longo" }, { chave: "local", titulo: "Cidade/UF" }, { chave: "canal", titulo: "Segmentação" },
      { chave: "catsS", titulo: "Categorias", num: true, fmt: cNum }, ...(R.temC ? [{ chave: "catsC", titulo: "Categ. ano ant.", num: true, fmt: cNum }, { chave: "dCats", titulo: "Variação", num: true, fmt: (v) => `<span class="delta ${sinal(v)}">${Fmt.varNum(v)}</span>` }] : []),
      { chave: "principal", titulo: "Categoria principal" }, { chave: "pPrincipal", titulo: "% da principal", num: true, fmt: cPct },
      ...(R.temC ? [{ chave: "entraram", titulo: "Categorias que entraram", classe: "texto-longo" }, { chave: "sairam", titulo: "Categorias que saíram", classe: "texto-longo" }] : []),
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, ...(R.temC ? [{ chave: "delta", titulo: "Cresc. R$", num: true, fmt: cDRs }] : []),
      { chave: "ticketS", titulo: "Ticket", num: true, fmt: cRs }, ...(R.temC ? [{ chave: "ticketC", titulo: "Ticket ano ant.", num: true, fmt: cRs }] : []),
    ] }));
  }

  // ---------- 7. Preço × Mix × Volume ----------
  let nivelPvm = "categoria";
  function precoMix(R, alvo, redesenhar) {
    avisoComparacao(R, alvo);
    if (!R.temC) return;
    const r = M.pvm(R, nivelPvm);
    const e = r.ef;
    const delta = R.totS.val - R.totC.val;
    const nomeItem = nivelPvm === "produto" ? "produtos" : "categorias";
    const c = UI.cartao("Quanto do crescimento veio de preço, de mix e de volume", `${textoPeriodo(R.S)} comparado com o ano anterior (${textoComp(R)}). Variação total: ${Fmt.varRsCheio(delta)}.`);
    c.querySelector(".cabecalho-cartao").append(UI.alternador([["categoria", "Mix de categorias"], ["produto", "Mix de produtos"]], nivelPvm, (id) => { nivelPvm = id; redesenhar(); }));
    alvo.append(c);
    const passos = [
      { rotulo: "Faturamento\ncomparação", valor: R.totC.val, total: true },
      { rotulo: "Volume", valor: e.volume },
      { rotulo: `Mix de\n${nomeItem}`, valor: e.mix },
      { rotulo: "Preço", valor: e.preco },
      { rotulo: `${nivelPvm === "produto" ? "Produtos" : "Categorias"}\nnovos`, valor: e.novos },
      { rotulo: `Saíram\ndo período`, valor: e.saidas },
      ...(Math.abs(e.outros) > 1 ? [{ rotulo: "Ajustes sem\nquantidade", valor: e.outros }] : []),
      { rotulo: "Faturamento\nperíodo", valor: R.totS.val, total: true },
    ];
    c.append(Graf.cascata(c, { passos, altura: 320 }));
    const pctDe = (v) => (delta ? ` (${Fmt.var(v / Math.abs(delta), 0)} da variação)` : "");
    c.append(el("div", { class: "explica" }, `<ul>
      <li><strong>Volume (${Fmt.varRsCheio(e.volume)}${pctDe(e.volume)}):</strong> efeito de vender mais ou menos peças pagas (${Fmt.num(r.QCK)} → ${Fmt.num(r.QSK)}), mantendo o mix e os preços da comparação.</li>
      <li><strong>Mix (${Fmt.varRsCheio(e.mix)}${pctDe(e.mix)}):</strong> efeito da mudança na participação de cada ${nivelPvm === "produto" ? "produto" : "categoria"} nas peças vendidas. Positivo = o mix migrou para itens de preço médio maior.</li>
      <li><strong>Preço (${Fmt.varRsCheio(e.preco)}${pctDe(e.preco)}):</strong> efeito da variação do preço médio sem bonificação de cada ${nivelPvm === "produto" ? "produto" : "categoria"}${nivelPvm === "categoria" ? " (inclui a troca de produtos dentro da categoria)" : ""}.</li>
      <li><strong>Novos / saíram:</strong> ${nomeItem} vendidos em só um dos períodos, sem base de comparação de preço.</li>
      </ul>`));

    const porCat = new Map();
    for (const it of r.itens) {
      const cat = nivelPvm === "produto" ? M.produtos[it.k].cat : it.k;
      const a = porCat.get(cat) || { nome: M.dic.categoria[cat], vol: 0, mix: 0, preco: 0, novo: 0, saida: 0, outro: 0, delta: 0, RS: 0, RC: 0, QS: 0, QC: 0 };
      a.vol += it.vol; a.mix += it.mix; a.preco += it.preco; a.novo += it.novo; a.saida += it.saida; a.outro += it.outro; a.delta += it.delta; a.RS += it.RS; a.RC += it.RC; a.QS += it.QS; a.QC += it.QC;
      porCat.set(cat, a);
    }
    const linhas = [...porCat.values()].map((a) => ({ ...a, precoS: div0(a.RS, a.QS), precoC: div0(a.RC, a.QC), dp: a.QS && a.QC ? (a.RS / a.QS) / (a.RC / a.QC) - 1 : null, dq: taxa(a.QS, a.QC) }));
    const g = UI.cartao("Efeito preço por categoria", "Quanto o preço médio de cada categoria somou ou tirou do faturamento.");
    alvo.append(g);
    g.append(Graf.barrasH(g, { itens: linhas.filter((l) => Math.abs(l.preco) > 1).sort((a, b) => b.preco - a.preco).map((l) => ({ rotulo: l.nome, valor: l.preco, texto: Fmt.varRs(l.preco), tooltip: [["Preço médio", `${Fmt.rs(l.precoC)} → ${Fmt.rs(l.precoS)}`], ["Var. preço", Fmt.var(l.dp)], ["Var. peças", Fmt.var(l.dq)]] })), divergente: true, larguraRotulo: 240, alturaBarra: 10, gap: 6 }));
    const t = UI.cartao("Decomposição por categoria");
    alvo.append(t);
    t.append(UI.tabela({ nomeArquivo: `preco_mix_volume_${nivelPvm}`, linhas, ordem: { chave: "delta", desc: true }, colunas: [
      { chave: "nome", titulo: "Categoria" }, { chave: "RC", titulo: "Fat. comparação", num: true, fmt: cRs }, { chave: "RS", titulo: "Faturamento", num: true, fmt: cRs }, { chave: "delta", titulo: "Variação R$", num: true, fmt: cDRs },
      { chave: "vol", titulo: "Efeito volume", num: true, fmt: cDRs }, { chave: "mix", titulo: "Efeito mix", num: true, fmt: cDRs }, { chave: "preco", titulo: "Efeito preço", num: true, fmt: cDRs },
      { chave: "novo", titulo: "Novos", num: true, fmt: cDRs }, { chave: "saida", titulo: "Saíram", num: true, fmt: cDRs },
      { chave: "dq", titulo: "Var. peças", num: true, fmt: cVar }, { chave: "precoC", titulo: "Preço ano ant.", num: true, fmt: cPreco }, { chave: "precoS", titulo: "Preço", num: true, fmt: cPreco }, { chave: "dp", titulo: "Var. preço", num: true, fmt: cVar },
    ] }));
  }

  // ---------- 8. Geografia ----------
  let nivelGeo = "uf";
  // ---------- Análises por produtos ----------
  // Categoria (grupo SBM) ou SKU. Preço médio = faturamento ÷ produtos faturados, igual ao card de Análises gerais.
  // Reajuste = quanto o mesmo produto ficou mais caro: Σ faturamento atual ÷ Σ (produtos faturados atuais × preço médio do ano anterior) − 1,
  // só com SKUs vendidos nos dois períodos (assim a troca de mix não entra como reajuste).
  let nivelAP = "categoria";
  let reajCat = null; // categoria clicada nos anéis de reajuste: filtra a tabela de SKUs
  let skuSel = null; // SKU vindo do clique na Visão geral: a tabela mostra só ele até limpar
  function linhasAnaliseProdutos(R, nivel) {
    const { prod } = R;
    const g = new Map();
    let tS = 0, tC = 0;
    for (let i = 0; i < M.nPr; i += 1) {
      if (!prod.valS[i] && !prod.valC[i] && !prod.qS[i] && !prod.qC[i]) continue;
      const p = M.produtos[i];
      const k = nivel === "sku" ? i : p.cat;
      const a = g.get(k) || { k, valS: 0, valC: 0, qS: 0, qC: 0, reajAtual: 0, reajBase: 0, itens: 0 };
      a.valS += prod.valS[i]; a.valC += prod.valC[i]; a.qS += prod.qS[i]; a.qC += prod.qC[i]; a.itens += 1;
      if (prod.qS[i] > 0 && prod.qC[i] > 0 && prod.valS[i] > 0 && prod.valC[i] > 0) { a.reajAtual += prod.valS[i]; a.reajBase += prod.qS[i] * (prod.valC[i] / prod.qC[i]); }
      tS += prod.valS[i]; tC += prod.valC[i];
      g.set(k, a);
    }
    return [...g.values()].map((a) => {
      const p = nivel === "sku" ? M.produtos[a.k] : null;
      const precoS = div0(a.valS, a.qS), precoC = div0(a.valC, a.qC);
      return {
        k: a.k, cat: p ? p.cat : a.k, nome: p ? p.desc : M.dic.categoria[a.k], cod: p ? p.cod : "", categoria: p ? M.dic.categoria[p.cat] : "", itens: a.itens,
        valS: a.valS, valC: a.valC, delta: a.valS - a.valC, var: R.temC ? taxa(a.valS, a.valC) : null,
        partS: div0(a.valS, tS), partC: R.temC ? div0(a.valC, tC) : null, dPart: R.temC ? (div0(a.valS, tS) || 0) - (div0(a.valC, tC) || 0) : null,
        qS: a.qS, qC: a.qC, dq: R.temC ? taxa(a.qS, a.qC) : null, precoS, precoC,
        reajuste: R.temC && a.reajBase > 0 ? a.reajAtual / a.reajBase - 1 : null,
        impacto: R.temC && a.reajBase > 0 ? a.reajAtual - a.reajBase : null, // R$ que o faturamento mudou só pelo preço
      };
    });
  }
  // Por mês do período: faturamento e produtos faturados de cada SKU (com os filtros do menu), para o reajuste mês a mês.
  function reajusteMensal(R) {
    const { F, nP, nPr } = M;
    const val = new Float64Array(nPr * nP), q = new Float64Array(nPr * nP);
    for (let i = 0; i < F.n; i += 1) {
      if (!R.cOK[F.c[i]] || !R.prOK[F.pr[i]] || !R.vOK[F.v[i]]) continue;
      const j = F.pr[i] * nP + F.p[i];
      val[j] += F.val[i] / 100; q[j] += F.q[i] / 100;
    }
    return R.S.map((per) => {
      const p = M.pIdx.get(per), ant = M.desloca(per, -12), pc = M.pIdx.get(ant);
      let atual = 0, base = 0, valA = 0, qA = 0, valAnt = 0, qAnt = 0;
      const prods = []; // SKUs vendidos no mês e no mesmo mês do ano anterior (base do reajuste)
      for (let pr = 0; pr < nPr; pr += 1) {
        const v = val[pr * nP + p], qq = q[pr * nP + p];
        valA += v; qA += qq;
        if (pc === undefined) continue;
        const vc = val[pr * nP + pc], qc = q[pr * nP + pc];
        valAnt += vc; qAnt += qc;
        if (v > 0 && qq > 0 && vc > 0 && qc > 0) { atual += v; base += qq * (vc / qc); prods.push(pr); }
      }
      return { per, ant, prods, reajuste: base > 0 ? atual / base - 1 : null, precoS: div0(valA, qA), precoC: div0(valAnt, qAnt) };
    });
  }
  // Maiores impactos do reajuste de preço por categoria (anéis). Usado na Visão geral e na aba de produtos.
  function cartaoImpactoReajuste(R, alvo, { aoClicar, sel = null }) {
    const pAtual = textoPeriodo(R.S), pAnterior = textoPeriodo(R.C);
    const tip = (l) => [[`Faturamento ${pAtual}`, Fmt.rs(l.valS)], [`Faturamento ${pAnterior}`, Fmt.rs(l.valC), "anterior"], ["Reajuste de preço", Fmt.var(l.reajuste, 1)], ["Impacto do reajuste", Fmt.varRsCheio(l.impacto)], ["Preço médio", Fmt.rs(l.precoS)], ["Preço médio ano anterior", Fmt.rs(l.precoC), "anterior"]];
    const cats = linhasAnaliseProdutos(R, "categoria");
    const skus = linhasAnaliseProdutos(R, "sku").filter((l) => Number.isFinite(l.impacto) && l.valS > 0 && l.valC > 0);
    const totalProd = cats.reduce((s, l) => s + Math.max(0, l.valS), 0);
    const impactoTotal = skus.reduce((s, l) => s + l.impacto, 0);
    const c5 = UI.cartao("Maiores impactos do reajuste de preço por categoria", `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).`);
    alvo.append(c5);
    c5.append(el("div", { class: "crescimento-destaque destaque-reajuste" }, `<span class="rotulo">Impacto total do reajuste</span><span class="valor">${Fmt.varRsCheio(impactoTotal)}</span><span class="delta ${sinal(impactoTotal)}">${Fmt.pct(Math.abs(div0(impactoTotal, totalProd) || 0), 1)} do faturamento de produtos</span><span class="periodo">Quanto o faturamento mudou só pelo preço, nos SKUs vendidos nos dois períodos.</span>`));
    const maiores = cats.filter((l) => l.impacto > 0).sort((a, b) => b.impacto - a.impacto).slice(0, 5);
    const maxReaj = Math.max(...maiores.map((l) => l.reajuste), 0.01);
    const nReaj = (cat) => skus.filter((s) => s.cat === cat && s.reajuste > 0).length;
    c5.append(Graf.aneis(c5, { itens: maiores.map((l) => ({ rotulo: l.nome, fracao: l.reajuste / maxReaj, centro: Fmt.var(l.reajuste, 1), cor: "var(--div-pos)", tooltip: tip(l), onClick: () => aoClicar(l.k),
      selecionado: sel === l.k, apagado: sel !== null && sel !== l.k,
      linhas: [["Impacto", Fmt.varRsCheio(l.impacto)], ["SKUs com reajuste", Fmt.num(nReaj(l.k))]] })) }));
    return { cats, skus };
  }

  function analiseProdutos(R, alvo, redesenhar) {
    avisoComparacao(R, alvo);
    analisesGerais(R, alvo);
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const sku = nivelAP === "sku";
    const nomeNivel = sku ? "SKU" : "categoria";
    const ls = linhasAnaliseProdutos(R, nivelAP);
    // Categoria: o clique filtra o painel todo pelo filtro "Categoria (linha)" do menu; clicar de novo tira o filtro.
    const catSel = R.f.categoria?.size === 1 ? [...R.f.categoria][0] : null;
    const filtrarCategoria = (cat) => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "categoria", id: cat } }));
    const cliqueLinha = sku ? (l) => selecionar(`Produto: ${Fmt.nome(l.nome)}`, { produtos: [l.k] }) : (l) => filtrarCategoria(l.k);
    const rotuloProd = (l) => `Produto: ${Fmt.nome(l.nome)}`;
    const rsCurto = Fmt.varRsCheio; // valor completo
    const tip = (l) => tipFaturamento(l, R, [["Participação no faturamento", Fmt.pct(l.partS)], ...(R.temC ? [["Participação ano anterior", Fmt.pct(l.partC)]] : []),
      ["Produtos faturados", Fmt.num(l.qS)], ["Preço médio por produto", Fmt.rs(l.precoS)], ...(R.temC ? [["Preço médio ano anterior", Fmt.rs(l.precoC)], ["Reajuste de preço", Fmt.var(l.reajuste, 1)]] : [])]);

    const barra = el("div", { class: "barra-situacao" });
    alvo.append(barra);
    barra.append(UI.alternador([["categoria", "Categorias"], ["sku", "SKU"]], nivelAP, (id) => { nivelAP = id; skuSel = null; redesenhar(); }));
    if (catSel !== null) {
      const aviso = el("div", { class: "filtro-ativo" }, `Filtro aplicado: <strong>${Fmt.esc(Fmt.nome(M.dic.categoria[catSel]))}</strong>. Clique de novo na categoria para voltar aos valores gerais.`);
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => filtrarCategoria(catSel) }, "Limpar filtro"));
      alvo.append(aviso);
    }

    // 1. Faturamento e crescimento/queda.
    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);
    const c1 = UI.cartao(`Faturamento por ${nomeNivel}`, R.temC ? `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).` : "");
    grade.append(c1);
    const topo = ls.slice().sort((a, b) => b.valS - a.valS).slice(0, 20);
    c1.append(Graf.barrasH(c1, { itens: topo.map((l) => ({ onClick: cliqueLinha ? () => cliqueLinha(l) : null, rotulo: l.nome, valor: l.valS, texto: Fmt.rs(l.valS), textoCor: `(${Fmt.pct(l.partS, 1)})`, tooltip: tip(l) })), larguraRotulo: 230, alturaBarra: 10, gap: 6 }));
    if (R.temC) {
      const c2 = UI.cartao(`Crescimento ou queda por ${nomeNivel}`, `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).`);
      grade.append(c2);
      const pos = ls.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
      const neg = ls.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10).reverse();
      c2.append(Graf.barrasH(c2, { itens: [...pos, ...neg].map((l) => ({ onClick: cliqueLinha ? () => cliqueLinha(l) : null, rotulo: l.nome, valor: l.delta, texto: rsCurto(l.delta), textoCor: `(${Fmt.var(l.var, 1)})`, tooltip: tip(l) })), divergente: true, larguraRotulo: 230, alturaBarra: 10, gap: 6 }));
    }

    // 2. Tabela: participação, crescimento, produtos faturados e preço médio.
    const t = UI.cartao(`Participação e crescimento por ${nomeNivel}`);
    alvo.append(t);
    const colsNome = sku ? [{ chave: "cod", titulo: "Código" }, { chave: "nome", titulo: "Produto", classe: "texto-longo" }, { chave: "categoria", titulo: "Categoria" }]
      : [{ chave: "nome", titulo: "Categoria", classe: "texto-longo" }, { chave: "itens", titulo: "SKUs com venda", num: true, fmt: cNum }];
    const skuFoco = sku && skuSel !== null ? ls.find((l) => l.k === skuSel) : null;
    if (skuFoco) {
      const aviso = el("div", { class: "filtro-ativo" }, `Produto selecionado: <strong>${Fmt.esc(Fmt.nome(skuFoco.nome))}</strong>`);
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => { skuSel = null; redesenhar(); } }, "Ver todos os SKUs"));
      t.append(aviso);
    }
    t.append(UI.tabela({ nomeArquivo: `produtos_${nivelAP}`, linhas: skuFoco ? [skuFoco] : ls, limite: 200, linhasVisiveis: 20, ordem: { chave: "valS", desc: true }, aoClicar: cliqueLinha, selecionada: sku ? (r) => R.f.selecao?.rotulo === rotuloProd(r) : (r) => r.k === catSel, colunas: [
      ...colsNome,
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
      ...(R.temC ? [{ chave: "valC", titulo: "Faturamento mesmo período ano anterior", num: true, anterior: true, fmt: cRs }, { chave: "delta", titulo: "Variação de faturamento R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Variação de faturamento %", num: true, fmt: cVar }] : []),
      { chave: "partS", titulo: "Participação no faturamento", num: true, fmt: cPct },
      ...(R.temC ? [{ chave: "partC", titulo: "Participação ano anterior", num: true, anterior: true, fmt: cPct }, { chave: "dPart", titulo: "Variação de participação", num: true, fmt: cPp }] : []),
      { chave: "qS", titulo: "Produtos faturados", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "qC", titulo: "Produtos faturados ano anterior", num: true, anterior: true, fmt: cNum }, { chave: "dq", titulo: "Variação de produtos faturados %", num: true, fmt: cVar }] : []),
      { chave: "precoS", titulo: "Preço médio por produto", num: true, fmt: Fmt.rs },
      ...(R.temC ? [{ chave: "precoC", titulo: "Preço médio ano anterior", num: true, anterior: true, fmt: Fmt.rs }, { chave: "reajuste", titulo: "Reajuste de preço %", num: true, fmt: cVar }] : []),
    ] }));

    if (!R.temC) return;
    // 3. Reajuste de preço: por categoria/SKU e mês a mês.
    const grade2 = el("div", { class: "grade g2" });
    alvo.append(grade2);
    const c3 = UI.cartao(sku ? "Maiores reajustes e reduções de preço por SKU" : "Reajuste de preço por categoria", `${Fmt.esc(pAtual)} comparado com o ano anterior (${Fmt.esc(pAnterior)}).`);
    grade2.append(c3);
    const comReaj = ls.filter((l) => Number.isFinite(l.reajuste) && l.valS > 0 && l.valC > 0);
    // SKU: só os 100 de maior faturamento, para não destacar itens com venda irrelevante.
    const base = sku ? comReaj.sort((a, b) => b.valS - a.valS).slice(0, 100) : comReaj;
    const itensReaj = sku
      ? [...base.filter((l) => l.reajuste > 0).sort((a, b) => b.reajuste - a.reajuste).slice(0, 10), ...base.filter((l) => l.reajuste < 0).sort((a, b) => a.reajuste - b.reajuste).slice(0, 10).reverse()]
      : base.sort((a, b) => b.reajuste - a.reajuste);
    c3.append(Graf.barrasH(c3, { itens: itensReaj.map((l) => ({ onClick: cliqueLinha ? () => cliqueLinha(l) : null, rotulo: l.nome, valor: l.reajuste, texto: Fmt.var(l.reajuste, 1), tooltip: tip(l) })), divergente: true, fmt: (v) => Fmt.var(v, 1), larguraRotulo: 230, alturaBarra: 10, gap: 6 }));

    const meses = reajusteMensal(R);
    const c4 = UI.cartao("Evolução do reajuste de preço", "Cada mês comparado com o mesmo mês do ano anterior.");
    grade2.append(c4);
    // Clique num mês: filtra o painel pelos SKUs vendidos no mês e no mesmo mês do ano anterior (base do reajuste do mês).
    const filtrarMes = (m) => selecionar(`Reajuste de ${Fmt.mes(m.per)}: SKUs vendidos em ${Fmt.mes(m.per)} e ${Fmt.mes(m.ant)}`, { produtos: m.prods });
    c4.append(Graf.colunas(c4, { legenda: false, fmt: (v) => Fmt.var(v, 0), itens: meses.map((m) => ({ onClick: () => filtrarMes(m), rotulo: Fmt.mes(m.per), valor: m.reajuste ?? 0, estado: "S", cor: (m.reajuste ?? 0) >= 0 ? "var(--div-pos)" : "var(--div-neg)", titulo: `${Fmt.mes(m.per)} × ${Fmt.mes(m.ant)}`,
      tooltip: [["Reajuste de preço", Fmt.var(m.reajuste, 1)], [`Preço médio ${Fmt.mes(m.per)}`, Fmt.rs(m.precoS)], [`Preço médio ${Fmt.mes(m.ant)}`, Fmt.rs(m.precoC), "anterior"]] })) }));
    c4.append(Graf.linhas(c4, { aoClicar: (i) => filtrarMes(meses[i]), x: meses.map((m) => Fmt.mes(m.per)), zeroBase: false, fmt: (v) => Fmt.num1(v), fmtTip: Fmt.rs, series: [
      { nome: `Preço médio ${pAtual}`, valores: meses.map((m) => m.precoS), cor: "var(--series-1)" },
      { nome: `Preço médio ${pAnterior}`, valores: meses.map((m) => m.precoC), cor: "var(--muted-mark)" },
    ] }));

    // 4. Maiores impactos do reajuste por categoria (anéis); clique filtra a tabela de SKUs logo abaixo. Clicar de novo tira o filtro.
    reajCat = null;
    const { cats, skus } = cartaoImpactoReajuste(R, alvo, { aoClicar: (cat) => filtrarCategoria(cat), sel: catSel });
    if (reajCat !== null && !cats.some((l) => l.k === reajCat)) reajCat = null;

    // Tabela de SKUs: preço, reajuste e impacto de cada produto (só a categoria clicada, se houver).
    const linhasReaj = reajCat === null ? skus : skus.filter((l) => l.cat === reajCat);
    const tr = UI.cartao(reajCat === null ? "Impacto do reajuste por SKU" : `Impacto do reajuste por SKU: ${Fmt.nome(M.dic.categoria[reajCat])}`);
    alvo.append(tr);
    alvo.insertBefore(t, tr); // as duas tabelas ficam no fim da aba, depois dos gráficos
    if (window.__rolarReajuste) { window.__rolarReajuste = false; requestAnimationFrame(() => tr.scrollIntoView({ behavior: "smooth", block: "start" })); }
    if (reajCat !== null) {
      const aviso = el("div", { class: "filtro-ativo" }, `Filtro aplicado: <strong>${Fmt.esc(Fmt.nome(M.dic.categoria[reajCat]))}</strong> (${Fmt.num(linhasReaj.length)} SKUs)`);
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => alternarReaj(reajCat) }, "Limpar filtro"));
      tr.append(aviso);
    }
    tr.append(UI.tabela({ nomeArquivo: reajCat === null ? "impacto_reajuste_sku" : `impacto_reajuste_${M.dic.categoria[reajCat]}`, linhas: linhasReaj, limite: 200, linhasVisiveis: 15, ordem: { chave: "impacto", desc: true }, aoClicar: (r) => selecionar(rotuloProd(r), { produtos: [r.k] }), selecionada: (r) => R.f.selecao?.rotulo === rotuloProd(r), colunas: [
      { chave: "cod", titulo: "Código" }, { chave: "nome", titulo: "Produto", classe: "texto-longo" }, { chave: "categoria", titulo: "Categoria" },
      { chave: "precoS", titulo: "Preço médio", num: true, fmt: Fmt.rs }, { chave: "precoC", titulo: "Preço médio ano anterior", num: true, anterior: true, fmt: Fmt.rs },
      { chave: "reajuste", titulo: "Reajuste de preço %", num: true, fmt: cVar }, { chave: "impacto", titulo: "Impacto do reajuste R$", num: true, fmt: cDRs },
      { chave: "qS", titulo: "Produtos faturados", num: true, fmt: cNum }, { chave: "qC", titulo: "Produtos faturados ano anterior", num: true, anterior: true, fmt: cNum },
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs }, { chave: "valC", titulo: "Faturamento mesmo período ano anterior", num: true, anterior: true, fmt: cRs },
    ] }));
  }

  // ---------- Análises geográficas ----------
  const UF_REGIAO = { AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
    AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
    DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste", ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste", PR: "Sul", RS: "Sul", SC: "Sul" };
  const UF_PRIORITARIAS = ["SP", "RJ", "MG", "PR", "SC", "RS"];
  const NOME_UF = Object.fromEntries((typeof MAPA_BRASIL !== "undefined" ? MAPA_BRASIL.estados : []).map((e) => [e.uf, e.nome]));
  // Faixa de estabilidade do mapa: variação entre -5% e +5% em relação ao ano anterior.
  const FAIXA_ESTAVEL = 0.05;
  const ufDoCliente = (c) => { const u = String(M.dic.uf[M.clientes[c].uf] || "").trim().toUpperCase(); return UF_REGIAO[u] ? u : "Sem UF"; };
  // Seleção geográfica ativa: UF única do filtro do menu e/ou região/cidade escolhida nos gráficos (R.f.geo).
  const selecaoGeo = (R) => {
    const ufs = new Set([...(R.f.uf || [])].map((id) => String(M.dic.uf[id] || "").trim().toUpperCase()));
    return { ufSel: ufs.size === 1 ? [...ufs][0] : null, geo: R.f.geo || null };
  };
  const filtrarGeo = (detalhe) => window.dispatchEvent(new CustomEvent("painel:filtroGeo", { detail: detalhe }));
  // Clicar no estado já selecionado tira a seleção; noutro estado, filtra por ele.
  const alternarUF = (R, uf, aba) => filtrarGeo(selecaoGeo(R).ufSel === uf ? { uf: null, geo: null } : { uf, geo: null, aba });
  // Mesmo cálculo sem a seleção geográfica, para os gráficos que servem de seletor mostrarem todos os estados/regiões.
  // Estados que ficam visíveis nos gráficos quando há filtro de UF ou seleção geográfica (null = todos).
  const ufsVisiveis = (R) => (R.f.uf?.size || R.f.geo ? new Set(linhasPor(R, ufDoCliente).map((l) => l.nome)) : null);
  const cacheGeo = new WeakMap();
  function semFiltroGeo(R, manterUF = false) {
    if (!R.f.geo && (manterUF || !R.f.uf?.size)) return R;
    const cache = cacheGeo.get(R) || {};
    cacheGeo.set(R, cache);
    const k = manterUF ? "uf" : "todos";
    if (!cache[k]) cache[k] = M.calcular({ ...R.f, geo: null, uf: manterUF ? R.f.uf : new Set() });
    return cache[k];
  }

  function situacaoUF(l, R) {
    if (!l || (l.valS <= 0 && l.valC <= 0)) return { nome: "Sem vendas", cor: "var(--mapa-sem)" };
    if (!R.temC) return { nome: "Sem comparação", cor: "var(--mapa-estavel)" };
    if (l.valC <= 0 && l.valS > 0) return { nome: "Cresceu", cor: "var(--mapa-cresceu)" };
    if (l.var > FAIXA_ESTAVEL) return { nome: "Cresceu", cor: "var(--mapa-cresceu)" };
    if (l.var < -FAIXA_ESTAVEL) return { nome: "Caiu", cor: "var(--mapa-caiu)" };
    return { nome: "Estável", cor: "var(--mapa-estavel)" };
  }
  // Balão dos estados/regiões no formato dos cartões (igual ao da segmentação): total e divisão em clientes válidos e
  // outros clientes, período; linha divisória e o ano anterior; rodapé com a variação; situação e indicadores abaixo.
  const tipGeo = (l, R, situacao = null) => {
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const divisao = (v, f) => [["Clientes válidos", Fmt.rs(v - (f || 0))], ["Outros clientes", Fmt.rs(f || 0)]];
    return UI.tipCartao({
      valor: Fmt.rs(l.valS), divisao: divisao(l.valS, l.funcS), periodo: pAtual,
      ...(R.temC ? { valorAnt: Fmt.rs(l.valC), divisaoAnt: divisao(l.valC, l.funcC), periodoAnt: pAnterior, rodape: `${UI.delta(l.valS, l.valC)} <span class="tc-dif ${sinal(l.delta)}">${Fmt.varRsCheio(l.delta)}</span>` } : {}),
      extras: [...(situacao ? [["Situação", situacao]] : []), ["Participação no faturamento", Fmt.pct(l.partS)], ["Clientes com compra", Fmt.num(l.ativosS)], ["Pedidos realizados", Fmt.num(l.pedS)]],
    });
  };
  const linhasPor = (R, chaveDe) => linhasGrupo(R, agruparClientes(R, chaveDe), (x) => x);
  const colunasGeo = (titulo, R) => [
    { chave: "nome", titulo, classe: "texto-longo" },
    { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
    ...(R.temC ? [{ chave: "valC", titulo: "Faturamento mesmo período ano anterior", num: true, anterior: true, fmt: cRs }, { chave: "delta", titulo: "Variação de faturamento R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Variação de faturamento %", num: true, fmt: cVar }] : []),
    { chave: "partS", titulo: "Participação no faturamento geral", num: true, fmt: cPct },
    { chave: "ativosS", titulo: "Clientes com compra", num: true, fmt: cNum },
    ...(R.temC ? [{ chave: "ativosC", titulo: "Clientes com compra ano anterior", num: true, anterior: true, fmt: cNum }, { chave: "novos", titulo: "Novos ou reativados", num: true, fmt: cNum }, { chave: "perdidos", titulo: "Clientes perdidos", num: true, fmt: cNum }] : []),
    { chave: "pedS", titulo: "Pedidos realizados", num: true, fmt: cNum },
    { chave: "ticketS", titulo: "Ticket médio por pedido", num: true, fmt: cRs },
  ];

  // Faturamento total do gráfico (soma das linhas ls: valS × valC) no canto superior direito do cartão, com o faturamento
  // do ano anterior em cinza e a variação vs período anterior. limpar: com item filtrado, o clique tira o filtro.
  function totalCabecalho(card, R, ls, limpar = null, dica = "", rotulo = "Faturamento total") {
    const totS = ls.reduce((s, l) => s + l.valS, 0), totC = ls.reduce((s, l) => s + (l.valC || 0), 0);
    const anterior = R.temC ? `<span class="anterior">${Fmt.rs(totC)} · ${Fmt.esc(textoPeriodo(R.C))}</span>${UI.delta(totS, totC)}` : "";
    // Linhas com funcS (faturamento de funcionários): mostra a separação em clientes válidos e outros clientes.
    const funcS = ls.some((l) => l.funcS !== undefined) ? ls.reduce((s, l) => s + (l.funcS || 0), 0) : null;
    const divisao = funcS === null ? "" : `<span class="divisao">Clientes válidos: <strong>${Fmt.rs(totS - funcS)}</strong> · Outros clientes: <strong>${Fmt.rs(funcS)}</strong></span>`;
    const total = el("div", { class: `total-cabecalho${limpar ? " clicavel" : ""}`, title: limpar ? dica : "" },
      `<span class="rotulo">${Fmt.esc(rotulo)}</span><span class="valor">${Fmt.rs(totS)}</span>${divisao}${anterior}`);
    if (limpar) total.addEventListener("click", limpar);
    card.querySelector(".cabecalho-cartao").append(total);
  }

  // Mapa + destaques (estados que mais cresceram e caíram). Usado na Visão geral e na aba geográfica.
  function cartaoMapa(R, alvo, { titulo, aoClicar, destaque = null, visiveis = null }) {
    const sub = R.temC ? `${Fmt.esc(textoPeriodo(R.S))} comparado com o ano anterior (${Fmt.esc(textoPeriodo(R.C))}).` : "";
    const ls = linhasPor(R, ufDoCliente).filter((l) => l.nome !== "Sem UF" && (!visiveis || visiveis.has(l.nome)));
    const porUF = new Map(ls.map((l) => [l.nome, l]));
    const dados = {};
    const contagem = { Cresceu: 0, Caiu: 0, "Estável": 0, "Sem vendas": 0, "Sem comparação": 0 };
    for (const uf of Object.keys(UF_REGIAO)) {
      // Com filtro de estado/região/cidade, os demais estados ficam apagados e fora da legenda.
      if (visiveis && !visiveis.has(uf)) { dados[uf] = { cor: "var(--mapa-sem)", titulo: `${NOME_UF[uf] || uf} (${uf})`, tooltip: [["Fora do filtro aplicado", ""]] }; continue; }
      const l = porUF.get(uf), sit = situacaoUF(l, R);
      contagem[sit.nome] += 1;
      dados[uf] = { cor: sit.cor, titulo: `${NOME_UF[uf] || uf} (${uf}) — ${sit.nome}`, tooltip: l && (l.valS || l.valC) ? tipGeo(l, R) : [["Sem vendas no período", ""]] };
    }
    const c = UI.cartao(titulo, sub);
    alvo.append(c);
    // Total dos estados do mapa; com um estado selecionado, o clique no total tira a seleção.
    const ufsSel = destaque ? [].concat(destaque instanceof Set ? [...destaque] : destaque) : [];
    totalCabecalho(c, R, ls, ufsSel.length === 1 && aoClicar ? () => aoClicar(ufsSel[0]) : null, "Clique para mostrar todos os estados");
    const legenda = [["Cresceu (acima de +5%)", "var(--mapa-cresceu)", contagem.Cresceu], ["Estável (entre −5% e +5%)", "var(--mapa-estavel)", contagem["Estável"]], ["Caiu (abaixo de −5%)", "var(--mapa-caiu)", contagem.Caiu], ["Sem vendas", "var(--mapa-sem)", contagem["Sem vendas"]]];
    const legendaMapa = el("div", { class: "legenda-mapa" }, legenda.filter(([, , n]) => n || !R.temC).map(([nome, cor, n]) => `<span><i style="--c:${cor}"></i>${nome}: <strong>${n} ${n === 1 ? "estado" : "estados"}</strong></span>`).join(""));
    const layout = el("div", { class: "mapa-layout" });
    c.append(layout);
    const colMapa = el("div");
    layout.append(colMapa);
    const corpoMapa = el("div", { class: "mapa-corpo" });
    corpoMapa.append(legendaMapa, Graf.mapaBrasil(corpoMapa, { dados, aoClicar, destaque }));
    colMapa.append(el("h3", {}, "Mapa por crescimento"), corpoMapa);
    const colRank = el("div", { class: "coluna-ranking" });
    layout.append(colRank);
    // Ranking dos 10 estados com maior faturamento (detalhes completos na aba Análises Geográficas).
    colRank.append(el("h3", {}, "Ranking dos estados por faturamento"));
    const top = ls.slice().sort((a, b) => b.valS - a.valS).slice(0, 10);
    const lista = el("ol", { class: "ranking-uf" }, top.map((l, i) => {
      const sit = situacaoUF(l, R);
      const variacao = R.temC ? (l.valC > 0 ? `<span class="var ${sinal(l.var)}">${l.var > 0 ? "▲" : l.var < 0 ? "▼" : ""} ${Fmt.pct(Math.abs(l.var), 1)}</span>` : `<span class="var sobe">novo</span>`) : "";
      return `<li data-uf="${l.nome}"${(destaque instanceof Set ? destaque.has(l.nome) : destaque === l.nome) ? ' class="selecionada"' : ""}><span class="pos">${i + 1}º</span><i style="--c:${sit.cor}"></i><span class="nome">${Fmt.esc(NOME_UF[l.nome] || l.nome)} <small>${l.nome}</small></span><span class="valor">${Fmt.rs(l.valS)}</span><span class="part">${Fmt.pct(l.partS, 1)}</span>${variacao}</li>`;
    }).join(""));
    colRank.append(lista);
    lista.querySelectorAll("li").forEach((li) => {
      const l = top.find((x) => x.nome === li.dataset.uf);
      li.addEventListener("mousemove", (ev) => Graf.mostrarTooltip(ev, `${NOME_UF[l.nome] || l.nome} (${l.nome})`, tipGeo(l, R)));
      li.addEventListener("mouseleave", Graf.esconderTooltip);
      if (aoClicar) { li.classList.add("clicavel"); li.addEventListener("click", () => { Graf.esconderTooltip(); aoClicar(l.nome); }); }
    });
    return c;
  }

  function geografia(R, alvo, redesenhar) {
    avisoComparacao(R, alvo); avisoPedidos(R, alvo);
    // Seleção ativa (estado, região, "Outras" ou cidade): filtra a página toda; clicar de novo no mesmo item tira a seleção.
    // Os seletores (regiões, mapa e tabela por estado) usam o cálculo sem a seleção, para continuar mostrando todos.
    const { ufSel, geo } = selecaoGeo(R);
    const R0 = semFiltroGeo(R);
    const selecionarUF = (uf) => alternarUF(R, uf);
    const selecionarGrupo = (tipo, valor, rotulo, ok) => filtrarGeo({ uf: tipo === "cidade" ? undefined : null, geo: geo?.tipo === tipo && geo.valor === valor ? null : { tipo, valor, rotulo, ok } });
    const selecionarRegiao = (nome) => selecionarGrupo("regiao", nome, `Região ${nome}`, (c) => UF_REGIAO[ufDoCliente(c)] === nome);
    const selecionarOutras = () => selecionarGrupo("outras", "Outras", "Outras (demais estados)", (c) => !UF_PRIORITARIAS.includes(ufDoCliente(c)));
    const selecionarCidade = (nome) => selecionarGrupo("cidade", nome, nome, (c) => (M.dic.municipio[M.clientes[c].mun] || "(sem cidade)") === nome);
    const rotuloSel = [ufSel ? `${NOME_UF[ufSel] || ufSel} (${ufSel})` : "", Fmt.nome(geo?.rotulo || "")].filter(Boolean).join(" · ");
    // Aviso único: seleção geográfica + filtros do menu que continuam valendo (segmentação, vendedor, categoria...), um selo por item.
    const menuGeo = [["nomeFantasia", (id) => id], ["canal", (id) => M.dic.canal[id]], ["regiao", (id) => M.dic.regiao[id]], ["vendedor", (id) => M.vendedores[id]?.nome],
      ["familia", (id) => M.dic.familia[id]], ["categoria", (id) => M.dic.categoria[id]], ...(ufSel ? [] : [["uf", (id) => M.dic.uf[id]]])];
    const selosMenu = menuGeo.flatMap(([chave, nomeDe]) => [...(R.f[chave] || [])].map((id) => ({ chave, id, nome: String(nomeDe(id) || "") })));
    const tirarMenu = (chave, id) => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave, ids: [...R.f[chave]].filter((x) => x !== id) } }));
    if (rotuloSel || selosMenu.length) {
      const n = (rotuloSel ? 1 : 0) + selosMenu.length;
      const aviso = el("div", { class: "filtro-ativo" }, n > 1 ? "Filtros aplicados, um em cima do outro:" : "Filtro aplicado:");
      const selo = (texto, tirar) => { if (aviso.querySelector(".filtro-selo")) aviso.append(el("span", { class: "filtro-seta" }, "›")); aviso.append(el("button", { type: "button", class: "filtro-selo", title: "Tirar este filtro", onclick: tirar }, `${Fmt.esc(Fmt.nome(texto))} <span aria-hidden="true">×</span>`)); };
      if (rotuloSel) selo(rotuloSel, () => filtrarGeo({ uf: null, geo: null }));
      selosMenu.forEach((s) => selo(s.nome, () => tirarMenu(s.chave, s.id)));
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => { if (rotuloSel) filtrarGeo({ uf: null, geo: null }); new Set(selosMenu.map((s) => s.chave)).forEach((chave) => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave, ids: [] } }))); } }, n > 1 ? "Limpar filtros" : "Limpar filtro"));
      alvo.append(aviso);
    }
    analisesGerais(R, alvo);
    const ufsDestaque = geo && geo.tipo !== "cidade" ? new Set(Object.keys(UF_REGIAO).filter((u) => (geo.tipo === "regiao" ? UF_REGIAO[u] === geo.valor : !UF_PRIORITARIAS.includes(u)))) : ufSel;
    // Tabelas: só as linhas da seleção, com os valores do total geral (participação sobre o faturamento geral).
    const soSelecao = (linhas, chaveDe) => { if (!ufSel && !geo) return linhas; const ok = new Set(linhasPor(R, chaveDe).map((l) => l.nome)); return linhas.filter((l) => ok.has(l.chave ?? l.nome)); };
    const apagado = (marcado) => Boolean((ufSel || (geo && geo.tipo !== "cidade")) && !marcado);

    // Regiões importantes: SP, RJ, MG, PR, SC, RS e as demais como "Outras".
    const priMarcada = (uf) => (uf === "Outras" ? geo?.tipo === "outras" : uf === ufSel);
    const cliquePri = (uf) => (uf === "Outras" ? selecionarOutras() : selecionarUF(uf));
    const chavePri = (c) => { const u = ufDoCliente(c); return UF_PRIORITARIAS.includes(u) ? u : "Outras"; };
    const pri = linhasPor(R0, chavePri)
      .sort((a, b) => (a.nome === "Outras") - (b.nome === "Outras") || b.valS - a.valS)
      .map((l) => ({ ...l, uf: l.nome, nome: l.nome === "Outras" ? "Outras (demais estados)" : `${NOME_UF[l.nome] || l.nome} (${l.nome})` }));
    const cp = UI.cartao("Regiões importantes");
    alvo.append(cp);
    // Barra = faturamento; cor = situação (cresceu, caiu ou estável, igual ao mapa); % = participação no faturamento geral.
    cp.append(Graf.barrasH(cp, { itens: soSelecao(pri.map((l) => ({ ...l, chave: l.uf })), chavePri).map((l) => ({ onClick: () => cliquePri(l.uf), apagado: apagado(priMarcada(l.uf)), rotulo: l.nome, valor: l.valS, cor: situacaoUF(l, R0).cor, texto: Fmt.rs(l.valS), textoCor: `(${Fmt.pct(l.partS, 1)})`, tooltip: tipGeo(l, R0, situacaoUF(l, R0).nome) })), larguraRotulo: 220, alturaBarra: 12, gap: 8 }));
    cp.append(UI.tabela({ nomeArquivo: "regioes_prioritarias", linhas: soSelecao(pri.map((l) => ({ ...l, chave: l.uf })), chavePri), busca: false, ordem: { chave: "valS", desc: true }, aoClicar: (r) => cliquePri(r.uf), selecionada: (r) => priMarcada(r.uf), colunas: colunasGeo("Estado", R0) }));

    // Desempenho por região (macrorregiões do IBGE, pela UF do cliente).
    const chaveReg = (c) => UF_REGIAO[ufDoCliente(c)] || "Sem UF";
    const reg = linhasPor(R0, chaveReg);
    const regMarcada = (nome) => (geo?.tipo === "regiao" ? geo.valor === nome : Boolean(ufSel) && UF_REGIAO[ufSel] === nome);
    const cliqueReg = (nome) => nome !== "Sem UF" && selecionarRegiao(nome);
    const cr = UI.cartao("Desempenho por região");
    alvo.append(cr);
    // Mesmo padrão das regiões importantes: barra = faturamento, cor = situação, % = participação no faturamento geral.
    cr.append(Graf.barrasH(cr, { itens: soSelecao(reg, chaveReg).slice().sort((a, b) => b.valS - a.valS).map((l) => ({ onClick: l.nome !== "Sem UF" ? () => cliqueReg(l.nome) : null, apagado: apagado(regMarcada(l.nome)), rotulo: l.nome, valor: l.valS, cor: situacaoUF(l, R0).cor, texto: Fmt.rs(l.valS), textoCor: `(${Fmt.pct(l.partS, 1)})`, tooltip: tipGeo(l, R0, situacaoUF(l, R0).nome) })), larguraRotulo: 160, alturaBarra: 12, gap: 8 }));
    cr.append(UI.tabela({ nomeArquivo: "desempenho_regiao", linhas: soSelecao(reg, chaveReg), busca: false, ordem: { chave: "valS", desc: true }, aoClicar: (r) => cliqueReg(r.nome), selecionada: (r) => regMarcada(r.nome), colunas: colunasGeo("Região", R0) }));

    // Desempenho por estado: mapa + tabela.
    cartaoMapa(R0, alvo, { titulo: "Desempenho por estado", aoClicar: selecionarUF, destaque: ufsDestaque, visiveis: ufsVisiveis(R) });
    const est = linhasPor(R0, ufDoCliente).map((l) => ({ ...l, uf: l.nome, nome: l.nome === "Sem UF" ? "Sem UF" : `${NOME_UF[l.nome] || l.nome} (${l.nome})` }));
    const ce = UI.cartao("Tabela por estado");
    alvo.append(ce);
    ce.append(UI.tabela({ nomeArquivo: "desempenho_estado", linhas: soSelecao(est.map((l) => ({ ...l, chave: l.uf })), ufDoCliente), limite: 200, linhasVisiveis: 15, ordem: { chave: "valS", desc: true }, aoClicar: (r) => r.uf !== "Sem UF" && selecionarUF(r.uf), selecionada: (r) => (ufsDestaque instanceof Set ? ufsDestaque.has(r.uf) : r.uf === ufSel), colunas: colunasGeo("Estado", R0) }));

    // Desempenho por cidade: cidades da seleção (estado/região); com uma cidade escolhida, mostra as demais da mesma seleção.
    const chaveCid = (c) => M.dic.municipio[M.clientes[c].mun] || "(sem cidade)";
    const cidades = soSelecao(linhasPor(R0, chaveCid), chaveCid);
    const local = ufSel ? `${NOME_UF[ufSel] || ufSel} (${ufSel})` : geo && geo.tipo !== "cidade" ? geo.rotulo : "";
    const cc = UI.cartao(local ? `Desempenho por cidade: ${local}` : "Desempenho por cidade", local ? `${Fmt.num(cidades.length)} cidades.` : "");
    if (ufSel || geo) cc.querySelector(".cabecalho-cartao").append(el("button", { type: "button", class: "btn ghost", onclick: () => filtrarGeo({ uf: null, geo: null }) }, "Ver todas as cidades"));
    alvo.append(cc);
    cc.append(UI.tabela({ nomeArquivo: ufSel ? `desempenho_cidades_${ufSel}` : "desempenho_cidades", linhas: cidades, limite: 200, linhasVisiveis: 20, ordem: { chave: "valS", desc: true }, aoClicar: (r) => selecionarCidade(r.nome), selecionada: (r) => geo?.tipo === "cidade" && geo.valor === r.nome, colunas: colunasGeo("Cidade/UF", R0) }));
  }

  // ---------- 9. Canais ----------
  function canais(R, alvo) {
    avisoComparacao(R, alvo); avisoPedidos(R, alvo);
    const ls = linhasGrupo(R, agruparClientes(R, (c) => M.dic.canal[M.clientes[c].canal]), (x) => x);
    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);
    const c1 = UI.cartao("Participação no faturamento por segmentação", "Segmentação comercial do cliente.");
    grade.append(c1);
    c1.append(Graf.barrasH(c1, { itens: ls.slice().sort((a, b) => b.valS - a.valS).map((l) => ({ rotulo: l.nome, valor: l.partS, texto: Fmt.pct(l.partS), tooltip: [["Faturamento", Fmt.rs0(l.valS)], ["Participação ano anterior", Fmt.pct(l.partC)]] })), fmt: Fmt.pct }));
    if (R.temC) {
      const c2 = UI.cartao("Contribuição de cada segmentação para o crescimento", "Pontos percentuais do crescimento total.");
      grade.append(c2);
      c2.append(Graf.barrasH(c2, { itens: ls.slice().sort((a, b) => b.contrib - a.contrib).map((l) => ({ rotulo: l.nome, valor: l.contrib, texto: Fmt.pp(l.contrib), textoCor: `(${Fmt.var(l.var)})`, tooltip: [["Cresc. R$", Fmt.varRsCheio(l.delta)], ["Cresc. %", Fmt.var(l.var)]] })), divergente: true, fmt: Fmt.pp }));
    }
    const t = UI.cartao("Tabela por segmentação");
    alvo.append(t);
    t.append(UI.tabela({ nomeArquivo: "segmentacoes", busca: false, linhas: ls, ordem: { chave: "valS", desc: true }, colunas: colunasGrupo("Segmentação", R) }));
  }

  // ---------- 10. Equipe comercial ----------
  let vendSel = null;
  // ---------- Análise da Equipe Comercial ----------
  // Vendedor = "Código do vendedor" da linha faturada. Clientes contados pelo que compraram com o vendedor.
  function equipe(R, alvo, redesenhar) {
    // Nomes dos vendedores do filtro do menu: um nome, ou os dois primeiros em ordem alfabética "e mais N".
    // Nome com a primeira letra de cada palavra em maiúscula; partículas (da, de, do, das, dos, e) em minúsculas.
    const nomeProprio = (s) => String(s || "").toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => (i > 0 && ["da", "de", "do", "das", "dos", "e"].includes(p) ? p : p.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase()))).join(" ");
    const nomeVendedoresFiltrados = () => { const nomes = [...R.f.vendedor].map((v) => nomeProprio(M.vendedores[v]?.nome)).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")); return nomes.length <= 2 ? nomes.join(", ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`; };
    avisoComparacao(R, alvo); avisoPedidos(R, alvo);
    // Vendedores filtrados (menu ou clique na Visão geral): aviso com botão para voltar à equipe toda.
    if (R.f.vendedor?.size) {
      const aviso = el("div", { class: "filtro-ativo" }, `Filtro aplicado: <strong>${Fmt.esc(nomeVendedoresFiltrados())}</strong>. Clique de novo no gráfico da Visão geral ou limpe o filtro para ver a equipe toda.`);
      aviso.append(el("button", { type: "button", class: "btn mini", onclick: () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "vendedor", ids: [...R.f.vendedor] } })) }, "Limpar filtro"));
      alvo.append(aviso);
    }
    analisesGerais(R, alvo);
    const { vend, vendCli, status, vendCat } = R;
    const nCat = M.nCat;
    const pAtual = textoPeriodo(R.S), pAnterior = R.temC ? textoPeriodo(R.C) : "";
    const porV = new Map();
    for (const [k, [vS, vC]] of vendCli) {
      const v = Math.floor(k / 8192), c = k % 8192;
      if (R.funcionario[c]) continue; // funcionário não entra na carteira
      const a = porV.get(v) || { ativosS: 0, ativosC: 0, novos: 0, perdidos: 0 };
      if (vS > 0) { a.ativosS += 1; if (status[c] === 3) a.novos += 1; }
      if (vC > 0) { a.ativosC += 1; if (status[c] === 5) a.perdidos += 1; }
      porV.set(v, a);
    }
    const tS = R.totS.val;
    const ls = [];
    for (let v = 0; v < M.nV; v += 1) {
      if (!vend.valS[v] && !vend.valC[v] && !vend.pedS[v]) continue;
      const a = porV.get(v) || { ativosS: 0, ativosC: 0, novos: 0, perdidos: 0 };
      let top = -1, vTop = 0;
      for (let j = 0; j < nCat; j += 1) if (vendCat.S[v * nCat + j] > vTop) { vTop = vendCat.S[v * nCat + j]; top = j; }
      ls.push({ v, nome: M.vendedores[v].nome, valS: vend.valS[v], valC: vend.valC[v], delta: vend.valS[v] - vend.valC[v], var: R.temC ? taxa(vend.valS[v], vend.valC[v]) : null,
        partS: div0(vend.valS[v], tS), ativosS: a.ativosS, ativosC: a.ativosC, novos: a.novos, perdidos: a.perdidos,
        pedS: vend.pedS[v], pedC: vend.pedC[v], ticketS: div0(vend.valS[v], vend.pedS[v]), ticketC: div0(vend.valC[v], vend.pedC[v]),
        ticketProdS: div0(vend.valS[v], vend.qS[v]), ticketProdC: div0(vend.valC[v], vend.qC[v]),
        principal: top >= 0 ? M.dic.categoria[top] : "—", pPrincipal: div0(vTop, vend.valS[v]) });
    }
    if (vendSel !== null && !ls.some((l) => l.v === vendSel)) vendSel = null;
    const selecionar = (v) => { vendSel = null; window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "vendedor", ids: [v] } })); };
    const rsCurto = Fmt.varRsCheio; // valor completo
    const tip = (l) => tipFaturamento(l, R, [["Participação no faturamento", Fmt.pct(l.partS)], ["Clientes com compra", Fmt.num(l.ativosS)], ["Novos ou reativados", Fmt.num(l.novos)], ["Pedidos realizados", Fmt.num(l.pedS)], ["Ticket médio por pedido", Fmt.rs(l.ticketS)]]);


    const grade = el("div", { class: "grade g2" });
    alvo.append(grade);
    const c1 = UI.cartao("Faturamento por vendedor");
    grade.append(c1);
    c1.append(Graf.barrasH(c1, { itens: ls.slice().sort((a, b) => b.valS - a.valS).slice(0, 20).map((l) => ({ onClick: () => selecionar(l.v), rotulo: l.nome, valor: l.valS, texto: Fmt.rs(l.valS), textoCor: `(${Fmt.pct(l.partS, 1)})`, tooltip: tip(l) })), larguraRotulo: 230, alturaBarra: 10, gap: 6 }));
    if (R.temC) {
      const c2 = UI.cartao("Crescimento por vendedor");
      grade.append(c2);
      const pos = ls.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
      const neg = ls.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10).reverse();
      c2.append(Graf.barrasH(c2, { itens: [...pos, ...neg].map((l) => ({ onClick: () => selecionar(l.v), rotulo: l.nome, valor: l.delta, texto: rsCurto(l.delta), textoCor: `(${Fmt.var(l.var, 1)})`, tooltip: tip(l) })), divergente: true, larguraRotulo: 230, alturaBarra: 10, gap: 6 }));
    }

    const t = UI.cartao("Equipe comercial");
    alvo.append(t);
    t.append(UI.tabela({ nomeArquivo: "equipe_comercial", linhas: ls, limite: 200, linhasVisiveis: 20, ordem: { chave: "valS", desc: true }, aoClicar: (r) => selecionar(r.v), selecionada: (r) => r.v === vendSel, colunas: [
      { chave: "nome", titulo: "Vendedor", classe: "texto-longo" },
      { chave: "valS", titulo: "Faturamento", num: true, fmt: cRs },
      ...(R.temC ? [{ chave: "valC", titulo: "Faturamento mesmo período ano anterior", num: true, anterior: true, fmt: cRs }, { chave: "delta", titulo: "Variação de faturamento R$", num: true, fmt: cDRs }, { chave: "var", titulo: "Variação de faturamento %", num: true, fmt: cVar }] : []),
      { chave: "partS", titulo: "Participação no faturamento geral", num: true, fmt: cPct },
      { chave: "ativosS", titulo: "Clientes com compra", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "ativosC", titulo: "Clientes com compra ano anterior", num: true, anterior: true, fmt: cNum }, { chave: "novos", titulo: "Novos ou reativados", num: true, fmt: cNum }, { chave: "perdidos", titulo: "Clientes perdidos", num: true, fmt: cNum }] : []),
      { chave: "pedS", titulo: "Pedidos realizados", num: true, fmt: cNum },
      ...(R.temC ? [{ chave: "pedC", titulo: "Pedidos ano anterior", num: true, anterior: true, fmt: cNum }] : []),
      { chave: "ticketS", titulo: "Ticket médio por pedido", num: true, fmt: cRs },
      ...(R.temC ? [{ chave: "ticketC", titulo: "Ticket por pedido ano anterior", num: true, anterior: true, fmt: cRs }] : []),
      { chave: "ticketProdS", titulo: "Ticket médio por produto", num: true, fmt: Fmt.rs4 },
      ...(R.temC ? [{ chave: "ticketProdC", titulo: "Ticket por produto ano anterior", num: true, anterior: true, fmt: Fmt.rs4 }] : []),
      { chave: "principal", titulo: "Categoria principal" }, { chave: "pPrincipal", titulo: "% da categoria principal", num: true, fmt: cPct },
    ] }));

    // Carteira de clientes do vendedor selecionado (ou da equipe/filtro): situação pelo que o cliente comprou com o vendedor.
    const selCart = ls.find((l) => l.v === vendSel);
    const vendOK = new Set((selCart ? [selCart] : ls).map((l) => l.v));
    const porCliente = new Map();
    for (const [k, [vS, vC]] of vendCli) {
      const v = Math.floor(k / 8192), cl = k % 8192;
      if (!vendOK.has(v) || R.funcionario[cl]) continue;
      const a = porCliente.get(cl) || [0, 0];
      a[0] += vS; a[1] += vC;
      porCliente.set(cl, a);
    }
    const grupos = [
      { nome: "Clientes ativos que cresceram", cor: COR_STATUS[0], n: 0, d: 0, ids: [] },
      { nome: "Clientes ativos que reduziram compras", cor: COR_STATUS[1], n: 0, d: 0, ids: [] },
      { nome: "Clientes novos ou reativados", cor: COR_STATUS[3], n: 0, d: 0, ids: [] },
      { nome: "Clientes perdidos", cor: COR_STATUS[5], n: 0, d: 0, ids: [] },
      { nome: "Sem compra com o vendedor no período", cor: COR_STATUS[2], n: 0, d: 0, ids: [] },
      { nome: "Ajustes/devoluções", cor: COR_STATUS[6], n: 0, d: 0, ids: [] },
    ];
    for (const [cl, [vS, vC]] of porCliente) {
      if (!vS && !vC) continue;
      // Só devolução/crédito nos dois períodos entra em ajustes, para o total fechar com a variação de faturamento.
      const g = vS > 0 ? (status[cl] === 3 ? 2 : vS >= vC ? 0 : 1) : vC <= 0 ? 5 : status[cl] === 5 ? 3 : 4;
      grupos[g].n += 1; grupos[g].d += vS - vC; grupos[g].ids.push(cl);
    }
    const totalCli = grupos.reduce((s, g) => s + g.n, 0), ativosCli = grupos[0].n + grupos[1].n + grupos[2].n;
    const nomeCart = selCart ? nomeProprio(selCart.nome) : (R.f.vendedor && R.f.vendedor.size ? nomeVendedoresFiltrados() : "toda a equipe");
    const cc = UI.cartao(`Carteira de clientes: ${nomeCart}`);
    if (selCart) cc.querySelector(".cabecalho-cartao").append(el("button", { type: "button", class: "btn ghost", onclick: () => { vendSel = null; window.__rolarMix = true; redesenhar(); } }, "Ver toda a equipe"));
    alvo.insertBefore(cc, grade); // carteira em primeiro, logo abaixo das análises gerais
    const resumo = el("div", { class: "kpis kpis-compactos" });
    resumo.innerHTML = [
      UI.kpi({ rotulo: "Total de clientes", valor: Fmt.num(totalCli), extra: "Compraram no período ou no ano anterior" }),
      UI.kpi({ rotulo: "Clientes com compra", valor: Fmt.num(ativosCli), extra: "Compraram no período" }),
      UI.kpi({ rotulo: "Novos ou reativados", valor: Fmt.num(grupos[2].n), extra: "Já incluídos nos clientes com compra" }),
      UI.kpi({ rotulo: "Clientes perdidos", valor: Fmt.num(grupos[3].n), extra: "Completaram 12 meses sem comprar" }),
    ].join("");
    // Linha colorida no topo de cada cartão, com as mesmas cores da tabela de situação.
    ["var(--muted-mark)", "var(--series-7)", grupos[2].cor, grupos[3].cor].forEach((cor, i) => { resumo.children[i].style.borderTop = `3px solid ${cor}`; });
    cc.append(resumo);
    cartoesClicaveis(resumo, [
      [`Carteira de ${nomeCart}: todos os clientes`, () => grupos.flatMap((g) => g.ids)],
      [`Carteira de ${nomeCart}: clientes com compra`, () => [...grupos[0].ids, ...grupos[1].ids, ...grupos[2].ids]],
      [`Carteira de ${nomeCart}: ${grupos[2].nome}`, () => grupos[2].ids],
      [`Carteira de ${nomeCart}: ${grupos[3].nome}`, () => grupos[3].ids],
    ]);
    const linhaG = (g) => `<tr class="clicavel" data-grupo="${grupos.indexOf(g)}" title="Ver estes clientes na aba Análise por cliente"><td><i style="--c:${g.cor}"></i>${Fmt.esc(g.nome)}</td><td>${Fmt.num(g.n)}</td><td>${totalCli ? Fmt.pct(g.n / totalCli, 1) : "—"}</td><td class="${sinal(g.d)}">${R.temC ? Fmt.varRsCheio(g.d) : "—"}</td></tr>`;
    cc.append(el("div", { class: "tabela-carteira" }, `<table class="tabela-contrib"><thead><tr><th>Situação</th><th>Clientes</th><th>% dos clientes</th><th>Variação de faturamento R$</th></tr></thead><tbody>${grupos.filter((g) => g.n).map(linhaG).join("")}<tr class="total clicavel" data-grupo="todos" title="Ver estes clientes na aba Análise por cliente"><td>Total</td><td>${Fmt.num(totalCli)}</td><td>100%</td><td class="${sinal(grupos.reduce((s, g) => s + g.d, 0))}">${R.temC ? Fmt.varRsCheio(grupos.reduce((s, g) => s + g.d, 0)) : "—"}</td></tr></tbody></table>`));
    // Clique numa linha: abre a aba de clientes com a tabela filtrada nesses clientes.
    cc.querySelectorAll("tr.clicavel").forEach((tr) => tr.addEventListener("click", () => {
      const k = tr.dataset.grupo, ids = k === "todos" ? grupos.flatMap((g) => g.ids) : grupos[Number(k)].ids;
      const rotulo = `Carteira de ${nomeCart}: ${k === "todos" ? "todos os clientes" : grupos[Number(k)].nome}`;
      selecionar(rotulo, { clientes: ids, aba: "clientes" });
    }));

    // Mix: só funciona com vendedor selecionado (clique ou filtro de Vendedor do menu). Sem seleção, barras em 0%.
    const equipeS = new Float64Array(nCat), equipeC = new Float64Array(nCat);
    let totEqS = 0, totEqC = 0;
    for (const l of ls) for (let j = 0; j < nCat; j += 1) { equipeS[j] += vendCat.S[l.v * nCat + j]; equipeC[j] += vendCat.C[l.v * nCat + j]; }
    for (let j = 0; j < nCat; j += 1) { totEqS += equipeS[j]; totEqC += equipeC[j]; }
    const sel = ls.find((l) => l.v === vendSel);
    const filtroVend = Boolean(R.f.vendedor && R.f.vendedor.size);
    const ativo = Boolean(sel) || filtroVend;
    const zero = (p) => (p === null || Math.abs(p) < 0.0005 ? 0 : p);
    const cats = [];
    for (let j = 0; j < nCat; j += 1) {
      const vS = sel ? vendCat.S[sel.v * nCat + j] : equipeS[j], vC = sel ? vendCat.C[sel.v * nCat + j] : equipeC[j];
      if (vS || vC) cats.push({ k: j, nome: M.dic.categoria[j], vS, vC, pS: zero(div0(vS, sel ? sel.valS : totEqS)), pC: zero(div0(vC, sel ? sel.valC : totEqC)), pEq: zero(div0(equipeS[j], totEqS)) });
    }
    const semVendaAtual = ativo && (sel ? sel.valS : totEqS) <= 0 && (sel ? sel.valC : totEqC) > 0;
    const titulo = sel ? `Mix vendido: ${nomeProprio(sel.nome)}` : filtroVend ? `Mix vendido: ${nomeVendedoresFiltrados()}` : "Mix vendido: Selecione o vendedor para analisar o mix";
    const sub = !ativo ? "" : sel ? "Quanto cada categoria representa no faturamento do vendedor, comparado com a equipe." : "Quanto cada categoria representa no faturamento dos vendedores selecionados no menu.";
    const c = UI.cartao(titulo, sub + (semVendaAtual ? " Sem faturamento no período atual; aparecem só as participações do ano anterior." : ""));
    if (sel) c.querySelector(".cabecalho-cartao").append(el("button", { type: "button", class: "btn ghost", onclick: () => { vendSel = null; window.__rolarMix = true; redesenhar(); } }, "Limpar seleção"));
    alvo.append(c);
    const ordem = cats.sort((a, b) => (ativo ? b.vS - a.vS : b.nome.localeCompare(a.nome) * -1));
    // Clique numa categoria: filtra o painel pela categoria (menu Categoria; clicar de novo tira).
    const filtrarCat = (x) => () => window.dispatchEvent(new CustomEvent("painel:filtroMenu", { detail: { chave: "categoria", ids: [x.k] } }));
    c.append(Graf.barrasH(c, { itens: ordem.map((x) => ativo ? ({ onClick: filtrarCat(x), rotulo: x.nome, valor: x.pS,
      texto: sel ? `${Fmt.pct(x.pS, 1)} (equipe ${Fmt.pct(x.pEq, 1)})` : R.temC ? `${Fmt.pct(x.pS, 1)} (ano anterior ${Fmt.pct(x.pC, 1)})` : Fmt.pct(x.pS, 1),
      tooltip: [[`Faturamento ${pAtual}`, Fmt.rs(x.vS)], [`Participação ${pAtual}`, Fmt.pct(x.pS)], ...(R.temC ? [[`Faturamento ${pAnterior}`, Fmt.rs(x.vC), "anterior"], [`Participação ${pAnterior}`, Fmt.pct(x.pC), "anterior"]] : []), ...(sel ? [["Participação na equipe", Fmt.pct(x.pEq)]] : [])] })
      : ({ onClick: filtrarCat(x), rotulo: x.nome, valor: 0, texto: Fmt.pct(0, 1), tooltip: [["Selecione um vendedor", "para ver o mix"]] })), fmt: Fmt.pct, larguraRotulo: 260, alturaBarra: 10, gap: 6 }));
      if (window.__rolarMix) { window.__rolarMix = false; requestAnimationFrame(() => cc.scrollIntoView({ behavior: "smooth", block: "start" })); }
  }
  // ---------- 11. Qualidade dos dados ----------
  function qualidade(R, alvo) {
    const F = M.F;
    const porStatus = new Map(); const porCadastroCli = [0, 0];
    for (let i = 0; i < F.n; i += 1) {
      const st = M.produtos[F.pr[i]].status;
      porStatus.set(st, (porStatus.get(st) || 0) + F.val[i] / 100);
      porCadastroCli[M.clientes[F.c[i]].cadastro] += F.val[i] / 100;
    }
    const total = porCadastroCli[0] + porCadastroCli[1];
    const c = UI.cartao("Cobertura dos cadastros", "Todo o faturamento entra no painel. Produtos e clientes fora do cadastro processado aparecem com as informações da própria base de faturamento.");
    alvo.append(c);
    c.append(UI.tabela({ busca: false, nomeArquivo: "qualidade_produtos", linhas: [...porStatus].map(([st, v]) => ({ nome: M.dic.statusProduto[st], produtos: M.produtos.filter((p) => p.status === st).length, val: v, part: v / total })), ordem: { chave: "val", desc: true }, colunas: [
      { chave: "nome", titulo: "Situação do produto no cadastro" }, { chave: "produtos", titulo: "Produtos faturados", num: true, fmt: cNum }, { chave: "val", titulo: "Faturamento (toda a base)", num: true, fmt: cRs }, { chave: "part", titulo: "% do total", num: true, fmt: (v) => Fmt.pct(v, 2) },
    ] }));
    const n0 = M.clientes.filter((x) => !x.cadastro).length;
    c.append(el("div", { class: "explica" }, `<ul>
      <li><strong>Clientes fora do cadastro SA1 processado:</strong> ${Fmt.num(n0)} códigos, ${Fmt.rs0(porCadastroCli[0])} (${Fmt.pct(porCadastroCli[0] / total, 2)} do faturamento). Aparecem na segmentação “(Fora do cadastro)”.</li>
      <li><strong>Produtos sem GTIN ou com cadastro incompleto</strong> permanecem no faturamento e são classificados com os dados disponíveis na SB1/SBM.</li>
      <li><strong>Período:</strong> a série contínua começa em ${Fmt.mesLongo(mesesGrafico({ S: [], C: [] })[0])}. Há poucos registros soltos antes disso (ex.: jan/2019).${M.mesParcial ? ` ${Fmt.mesLongo(M.mesParcial)} é um mês parcial (em andamento).` : ""}</li>
      <li><strong>Pedidos:</strong> contados pela data do pedido; faturamento pela data da nota (base “QTD Pedidos”). O ticket médio do mês = faturamento do mês ÷ pedidos do mês.</li>
      <li><strong>Preço médio:</strong> coluna “Preço Médio s/ Bonif.” da base; peças pagas = faturamento ÷ preço s/ bonificação. Peças bonificadas = peças faturadas − peças pagas.</li>
      </ul><p class="nota">Dados gerados em ${new Date(M.D.geradoEm).toLocaleString("pt-BR")} a partir de: ${Object.values(M.D.origem).map(Fmt.esc).join(" · ")}</p>`));
  }

  const telas = [
    { id: "geral", nome: "Visão geral", fn: visaoGeral },
    { id: "clientes", nome: "Análise por cliente", fn: clientes },
    { id: "produtos", nome: "Análises por produtos", fn: analiseProdutos },
    { id: "equipe", nome: "Análise da Equipe Comercial", fn: equipe },
    { id: "geografia", nome: "Análises Geográficas", fn: geografia },
  ];
  // "Limpar filtros": zera também os filtros internos das telas (situação, clique nos gráficos, seleções e alternadores).
  telas.limparFiltros = () => {
    window.__detalheCliente = "todos";
    window.__filtroTabelaClientes = null;
    window.__rolarTabela = false;
    filtroStatus = -1; dimOrigem = "canal"; nivelProd = "produto"; itemSel = null; nivelPvm = "categoria"; nivelGeo = "uf"; vendSel = null; nivelAP = "categoria"; rankVend = "faturamento"; skuSel = null; reajCat = null; filtroCadastro = "todos";
  };
  return telas;
})();
