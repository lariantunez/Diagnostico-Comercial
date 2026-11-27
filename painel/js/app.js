// Estado, filtros e navegação.
(() => {
  const M = Motor;
  const $ = (id) => document.getElementById(id);

  const fonteDados = document.createElement("span");
  fonteDados.className = "fonte-dados";
  fonteDados.textContent = "Dados fictícios · demonstração";
  document.querySelector(".topo").prepend(fonteDados);

  const validos = M.mesesComDados;
  const ultimoDisponivel = validos.at(-1);
  const fim = validos.indexOf(ultimoDisponivel);
  const padraoS = validos.slice(Math.max(0, fim - 11), fim + 1);

  const estado = {
    S: new Set(padraoS), modo: "ano",
    nomeFantasia: new Set(), canal: new Set(), regiao: new Set(), uf: new Set(), vendedor: new Set(), familia: new Set(), categoria: new Set(), demonstradora: new Set(), geo: null, selecao: null, selecoes: [], soDemonstradora: false, soLancamentos: false,
    aba: (location.hash || "#geral").slice(1),
  };
  if (!Telas.some((t) => t.id === estado.aba)) estado.aba = "geral";

  // A página de importação (outra aba) avisa quando os dados mudam: aparece um aviso para recarregar o painel.
  if ("BroadcastChannel" in window) new BroadcastChannel("diagnostico-comercial").addEventListener("message", (ev) => {
    if (ev.data?.tipo !== "dados-atualizados" || document.getElementById("aviso-dados")) return;
    const aviso = UI.el("div", { class: "filtro-ativo", id: "aviso-dados" }, "<strong>Os dados do painel foram atualizados.</strong> Recarregue para ver a nova carga.");
    aviso.append(UI.el("button", { type: "button", class: "btn mini", onclick: () => location.reload() }, "Recarregar"));
    document.querySelector(".topo").after(aviso);
  });

  // Tema
  const tema = localStorage.getItem("dc-tema");
  if (tema) document.documentElement.dataset.theme = tema;
  $("tema").addEventListener("click", () => {
    const escuroAgora = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = escuroAgora ? "light" : "dark";
    localStorage.setItem("dc-tema", document.documentElement.dataset.theme);
    desenhar();
  });

  // Filtros
  const ordenarNomes = (lista) => lista.map((nome, id) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const clientesComMovimento = new Set([...M.F.c, ...M.O.c]);
  const nomesFantasia = [...new Set(M.clientes.filter((_, id) => clientesComMovimento.has(id)).map((cliente) => cliente.nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const vendedoresComVenda = new Set(M.F.v);
  const ctrls = {};
  ctrls.S = UI.seletorPeriodo($("f-periodo"), { periodos: M.periodos, comDados: validos, parcial: M.mesParcial, selecionados: estado.S, aoMudar: (s) => { estado.S = s; agendar(); } });
  const defs = [
    ["nomeFantasia", "f-nome-fantasia", "Nome fantasia", nomesFantasia.map((nome) => ({ id: nome, nome }))],
    ["canal", "f-canal", "Segmentação", ordenarNomes(M.dic.canal)],
    ["regiao", "f-regiao", "Região", ordenarNomes(M.dic.regiao)],
    ["uf", "f-uf", "UF", ordenarNomes(M.dic.uf)],
    ["vendedor", "f-vendedor", "Vendedor", M.vendedores.map((v, id) => ({ id, nome: v.nome })).filter((o) => vendedoresComVenda.has(o.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))],
    ["familia", "f-familia", "Família", ordenarNomes(M.dic.familia)],
    ["categoria", "f-categoria", "Categoria (linha)", ordenarNomes(M.dic.categoria).filter((o) => !M.catFora[o.id])], // sem ME TERCEIROS, POTE, TAMPA, TERCEIROS - MP
    // Lojas com agenda da demonstradora no período (ZVX/ZVY), com todo o faturamento da loja.
    ["demonstradora", "f-demonstradora", "Demonstradora", M.demonstradorasComAgenda.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))],
  ];
  for (const [chave, id, rotulo, opcoes] of defs) ctrls[chave] = UI.multi($(id), { rotulo, opcoes, aoMudar: (s) => { estado[chave] = s; agendar(); } });
  $("limpar").addEventListener("click", () => {
    for (const [chave] of defs) { estado[chave] = new Set(); ctrls[chave].definir([]); }
    estado.S = new Set(padraoS); ctrls.S.definir(padraoS);
    estado.modo = "ano";
    estado.geo = null;
    estado.selecao = null; estado.selecoes = [];
    estado.soDemonstradora = false;
    estado.soLancamentos = false;
    Telas.limparFiltros?.();
    document.querySelectorAll(".regras-clientes[open]").forEach((d) => { d.open = false; });
    agendar();
  });

  // Abas
  const nav = $("abas");
  for (const t of Telas) {
    const b = UI.el("button", { type: "button", role: "tab", "aria-selected": t.id === estado.aba ? "true" : "false", "data-id": t.id }, t.nome);
    b.addEventListener("click", () => { estado.aba = t.id; history.replaceState(null, "", `#${t.id}`); nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === t.id ? "true" : "false")); desenhar(); });
    nav.append(b);
  }

  function navegar(aba, detalhe = "todos", filtroTabela = null) {
    estado.aba = Telas.some((t) => t.id === aba) ? aba : "geral";
    window.__detalheCliente = detalhe;
    window.__filtroTabelaClientes = filtroTabela;
    window.__rolarTabela = Boolean(filtroTabela);
    history.replaceState(null, "", `#${estado.aba}`);
    nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === estado.aba ? "true" : "false"));
    desenhar();
    document.getElementById("conteudo").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.addEventListener("painel:navegar", (evento) => navegar(evento.detail?.aba, evento.detail?.filtro, evento.detail?.filtroTabela || null));
  // Clique numa categoria (ou outro item de filtro do menu) nas telas: filtra por ele; clicar de novo no mesmo item tira o filtro.
  window.addEventListener("painel:filtroMenu", (evento) => {
    // ids: vários itens de uma vez (ex.: vendedores que cresceram); aba: abre a aba da visão detalhada.
    const { chave, id, ids, aba } = evento.detail || {};
    if (!ctrls[chave]) return;
    const novos = new Set(ids || [id]);
    const mesmo = estado[chave].size === novos.size && [...novos].every((x) => estado[chave].has(x));
    estado[chave] = mesmo ? new Set() : novos;
    ctrls[chave].definir([...estado[chave]]);
    if (aba && !mesmo && aba !== estado.aba) {
      estado.aba = aba;
      history.replaceState(null, "", `#${aba}`);
      nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === aba ? "true" : "false"));
      document.getElementById("conteudo").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    agendar();
  });
  // Seleção por clique (clientes e/ou produtos): filtra o painel todo. Os cliques se acumulam (um filtro em cima do outro);
  // clicar de novo num item já aplicado tira só ele. detail: { rotulo, clientes?: [ids], produtos?: [ids], aba? } ou null = limpa tudo.
  // Clientes: interseção pelo nome fantasia (mesmo nome = mesmo cliente), ficando com os cadastros do último clique.
  const nomeSel = (c) => Fmt.chaveNome(M.clientes[c].nome) || `#${c}`;
  function combinarSelecoes(lista) {
    if (!lista.length) return null;
    const comCli = lista.filter((x) => x.clientes), comProd = lista.filter((x) => x.produtos);
    let clientes = null, produtos = null;
    if (comCli.length) {
      const nomes = comCli.slice(0, -1).map((x) => new Set([...x.clientes].map(nomeSel)));
      clientes = new Set([...comCli.at(-1).clientes].filter((c) => nomes.every((n) => n.has(nomeSel(c)))));
    }
    if (comProd.length) produtos = new Set([...comProd.at(-1).produtos].filter((p) => comProd.every((x) => x.produtos.has(p))));
    return { rotulo: lista.at(-1).rotulo, rotulos: lista.map((x) => x.rotulo), clientes, produtos };
  }
  window.addEventListener("painel:selecao", (evento) => {
    const s = evento.detail;
    const mesmo = Boolean(s && estado.selecoes.some((x) => x.rotulo === s.rotulo));
    if (!s) estado.selecoes = [];
    else if (mesmo) estado.selecoes = estado.selecoes.filter((x) => x.rotulo !== s.rotulo);
    else estado.selecoes = [...estado.selecoes, { rotulo: s.rotulo, clientes: s.clientes ? new Set(s.clientes) : null, produtos: s.produtos ? new Set(s.produtos) : null }];
    estado.selecao = combinarSelecoes(estado.selecoes);
    if (s?.aba && !mesmo && s.aba !== estado.aba) {
      estado.aba = s.aba;
      history.replaceState(null, "", `#${s.aba}`);
      nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === s.aba ? "true" : "false"));
      document.getElementById("conteudo").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    agendar();
  });
  // Botão "Apenas lojas com atendimento" (abas de clientes e de produtos): liga/desliga o filtro de lojas com demonstradora no painel todo.
  window.addEventListener("painel:demonstradora", () => {
    estado.soDemonstradora = !estado.soDemonstradora;
    estado.selecao = null; estado.selecoes = []; // a seleção por clique foi montada com a outra base de lojas
    agendar();
  });
  // Botão "Apenas produtos lançados" (abas de clientes e de produtos): liga/desliga o filtro de produtos lançados no
  // período (vendidos pela empresa no período e não no mesmo período do ano anterior) no painel todo.
  window.addEventListener("painel:lancamentos", () => {
    estado.soLancamentos = !estado.soLancamentos;
    agendar();
  });
  // Clique em estado, região ou cidade: filtra o painel todo. UF vai para o filtro do menu; região e cidade ficam em estado.geo.
  window.addEventListener("painel:filtroGeo", (evento) => {
    const { uf, geo, aba } = evento.detail || {};
    if (uf !== undefined) {
      estado.uf = new Set(uf ? M.dic.uf.map((nome, id) => (String(nome || "").trim().toUpperCase() === uf ? id : -1)).filter((id) => id >= 0) : []);
      ctrls.uf.definir([...estado.uf]);
    }
    if (geo !== undefined) estado.geo = geo;
    if (aba && aba !== estado.aba) {
      estado.aba = aba;
      history.replaceState(null, "", `#${aba}`);
      nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === aba ? "true" : "false"));
      document.getElementById("conteudo").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    agendar();
  });


  let R = null;
  let timer = null;
  function agendar() {
    $("conteudo").classList.add("ocupado");
    clearTimeout(timer);
    timer = setTimeout(recalcular, 60);
  }
  function recalcular() {
    if (!estado.S.size) {
      R = null;
      $("conteudo").classList.remove("ocupado");
      $("conteudo").innerHTML = `<p class="vazio">Selecione ao menos um mês no filtro de período.</p>`;
      return;
    }
    R = M.calcular(estado);
    desenhar();
  }
  function desenhar() {
    const alvo = $("conteudo");
    alvo.classList.remove("ocupado");
    if (!R) return;
    const tela = Telas.find((t) => t.id === estado.aba);
    const y = window.scrollY;
    alvo.innerHTML = "";
    try {
      tela.fn(R, alvo, desenhar);
    } catch (e) {
      console.error(e);
      alvo.innerHTML = `<p class="aviso"><strong>Erro ao montar a tela:</strong> ${Fmt.esc(e.message)}</p>`;
    }
    window.scrollTo(0, y);
    // Aberto pelo link de um slide: rola até o cartão da tabela e destaca por alguns segundos.
    if (cartaoAlvo) {
      const titulo = cartaoAlvo;
      cartaoAlvo = null;
      requestAnimationFrame(() => {
        const h2 = [...alvo.querySelectorAll(".cabecalho-cartao h2")].find((h) => h.textContent.trim() === titulo);
        const cartao = h2?.closest(".cartao");
        if (!cartao) return;
        cartao.scrollIntoView({ behavior: "smooth", block: "start" });
        cartao.classList.add("destaque-link");
        setTimeout(() => cartao.classList.remove("destaque-link"), 4000);
      });
    }
  }
  // Exportar apresentação (js/apresentacao.js): o cálculo atual (com todos os filtros) e a lista dos filtros aplicados.
  function filtrosAplicados() {
    const lista = [];
    for (const [chave, , rotulo, opcoes] of defs) {
      if (!estado[chave].size) continue;
      const nomes = opcoes.filter((o) => estado[chave].has(o.id)).map((o) => Fmt.nome(o.nome));
      lista.push([rotulo.replace(" (linha)", ""), nomes]);
    }
    if (estado.geo) lista.push(["Seleção geográfica", [Fmt.nome(estado.geo.rotulo)]]);
    if (estado.soDemonstradora) lista.push(["Lojas", ["Apenas lojas com atendimento de demonstradora"]]);
    if (estado.soLancamentos) lista.push(["Produtos", ["Apenas produtos lançados no período"]]);
    if (estado.selecao) lista.push(["Seleção no painel", (estado.selecao.rotulos || [estado.selecao.rotulo]).map((r) => Fmt.nome(r))]);
    return lista;
  }
  // Link "Abrir no painel" dos slides: guarda no servidor o estado atual (período, menu, cliques, seleção geográfica,
  // demonstradora e opções das abas) e devolve um endereço curto (#v=<código>). Filtros e cliques vão por nome
  // (nome fantasia, código do produto...), não pela posição interna, que muda a cada carga de dados.
  function estadoParaLink(extra = {}) {
    const filtros = {};
    for (const [chave, , , opcoes] of defs) if (estado[chave].size) filtros[chave] = opcoes.filter((o) => estado[chave].has(o.id)).map((o) => o.nome);
    const selecoes = estado.selecoes.map((s) => ({ rotulo: s.rotulo, clientes: s.clientes ? [...new Set([...s.clientes].map(nomeSel))] : null, produtos: s.produtos ? [...s.produtos].map((p) => M.produtos[p].cod) : null }));
    return { S: [...estado.S], filtros, geo: estado.geo ? { tipo: estado.geo.tipo, valor: estado.geo.valor } : null, soDemonstradora: estado.soDemonstradora, soLancamentos: estado.soLancamentos, selecoes, aba: estado.aba, interno: Telas.estadoInterno?.(), ...extra };
  }
  async function criarLink(extra) {
    return null; // demonstração sem servidor: sem link "Abrir no painel"
    const r = await fetch("api/visoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: estadoParaLink(extra) }) });
    if (!r.ok) throw new Error("Não foi possível criar o link do painel.");
    const { id } = await r.json();
    return `${location.origin}${location.pathname}#v=${id}`;
  }
  let cartaoAlvo = null; // título do cartão para rolar a tela depois de abrir pelo link
  async function abrirVisao(id) {
    try {
      const r = await fetch(`api/visoes/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("link não encontrado");
      const { estado: e } = await r.json();
      const S = (e.S || []).filter((p) => M.periodos.includes(p));
      if (S.length) { estado.S = new Set(S); ctrls.S.definir(S); }
      for (const [chave, , , opcoes] of defs) {
        const nomes = new Set(e.filtros?.[chave] || []);
        estado[chave] = new Set(opcoes.filter((o) => nomes.has(o.nome)).map((o) => o.id));
        ctrls[chave].definir([...estado[chave]]);
      }
      estado.geo = e.geo ? Telas.geoPorTipo(e.geo.tipo, e.geo.valor) : null;
      estado.soDemonstradora = Boolean(e.soDemonstradora);
      estado.soLancamentos = Boolean(e.soLancamentos);
      const codigos = new Map(M.produtos.map((p, i) => [p.cod, i]));
      estado.selecoes = (e.selecoes || []).map((s) => {
        const nomes = s.clientes ? new Set(s.clientes) : null;
        const clientes = nomes ? new Set() : null;
        if (nomes) for (let c = 0; c < M.nC; c += 1) if (nomes.has(nomeSel(c))) clientes.add(c);
        return { rotulo: s.rotulo, clientes, produtos: s.produtos ? new Set(s.produtos.map((cod) => codigos.get(cod)).filter((i) => i !== undefined)) : null };
      });
      estado.selecao = combinarSelecoes(estado.selecoes);
      Telas.definirEstadoInterno?.(e.interno);
      if (Telas.some((t) => t.id === e.aba)) estado.aba = e.aba;
      nav.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === estado.aba ? "true" : "false"));
      cartaoAlvo = e.cartao || null;
    } catch (erro) {
      const aviso = UI.el("div", { class: "filtro-ativo" }, `<strong>Não foi possível abrir o link da apresentação</strong> (${Fmt.esc(erro.message)}). O painel abriu sem os filtros.`);
      document.querySelector(".topo").after(aviso);
    }
    history.replaceState(null, "", `#${estado.aba}`);
    recalcular();
  }
  window.Painel = { resultado: () => R, filtrosAplicados, criarLink };

  let largura = window.innerWidth;
  window.addEventListener("resize", () => { if (Math.abs(window.innerWidth - largura) > 40) { largura = window.innerWidth; clearTimeout(timer); timer = setTimeout(desenhar, 150); } });

  // Endereço #v=<código>: veio do botão "Abrir no painel" de uma apresentação.
  const visao = /^#v=([A-Za-z0-9_-]+)$/.exec(location.hash)?.[1];
  if (visao) abrirVisao(visao); else recalcular();
  // Link de apresentação aberto com o painel já aberto na mesma aba (só o "#" muda, a página não recarrega).
  window.addEventListener("hashchange", () => { const v = /^#v=([A-Za-z0-9_-]+)$/.exec(location.hash)?.[1]; if (v) abrirVisao(v); });
})();
