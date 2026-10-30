// Componentes de interface: filtros, indicadores, cartões e tabelas.
const UI = (() => {
  const el = (tag, attrs = {}, html = "") => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  };

  const abertos = new Set();
  document.addEventListener("click", (ev) => {
    for (const a of abertos) if (!a.raiz.contains(ev.target)) { a.fechar(); }
  });

  // Seleção múltipla com busca. opcoes: [{id, nome}]
  function multi(container, { rotulo, opcoes, selecionados = new Set(), aoMudar }) {
    container.innerHTML = "";
    container.append(el("span", { class: "rotulo" }, Fmt.esc(rotulo)));
    const raiz = el("div", { class: "multi" });
    const botao = el("button", { type: "button", "aria-haspopup": "listbox" });
    const painel = el("div", { class: "painel" });
    painel.hidden = true;
    raiz.append(botao, painel);
    container.append(raiz);
    let sel = new Set(selecionados);
    const texto = () => {
      if (!sel.size) return "Todos";
      if (sel.size === 1) return Fmt.nome(opcoes.find((o) => o.id === [...sel][0])?.nome) || "1 selecionado";
      return `${sel.size} selecionados`;
    };
    const atualizarBotao = () => { botao.textContent = texto(); botao.title = sel.size ? opcoes.filter((o) => sel.has(o.id)).map((o) => Fmt.nome(o.nome)).join(", ") : "Todos"; };
    const render = (filtro = "") => {
      const f = filtro.toLowerCase();
      painel.innerHTML = "";
      const busca = el("input", { class: "busca", type: "search", placeholder: "Buscar…", value: filtro });
      busca.addEventListener("input", () => { render(busca.value); const b = painel.querySelector(".busca"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
      const topo = el("div", { class: "topo-painel" });
      topo.append(el("button", { type: "button", class: "btn mini", onclick: () => { sel = new Set(); mudou(); render(filtro); } }, "Todos"));
      if (f) topo.append(el("button", { type: "button", class: "btn mini", onclick: () => { opcoes.filter((o) => o.nome.toLowerCase().includes(f)).forEach((o) => sel.add(o.id)); mudou(); render(filtro); } }, "Marcar resultado"));
      painel.append(busca, topo);
      for (const o of opcoes.filter((x) => x.nome.toLowerCase().includes(f)).slice(0, 400)) {
        const lb = el("label", { class: "opcao" });
        const cb = el("input", { type: "checkbox" });
        cb.checked = sel.has(o.id);
        cb.addEventListener("change", () => { if (cb.checked) sel.add(o.id); else sel.delete(o.id); mudou(); });
        lb.append(cb, document.createTextNode(Fmt.nome(o.nome)));
        painel.append(lb);
      }
    };
    const mudou = () => { atualizarBotao(); aoMudar(new Set(sel)); };
    const ctrl = { raiz, fechar: () => { painel.hidden = true; abertos.delete(ctrl); } };
    botao.addEventListener("click", () => {
      if (!painel.hidden) { ctrl.fechar(); return; }
      for (const a of [...abertos]) a.fechar();
      render(); painel.hidden = false; abertos.add(ctrl); painel.querySelector(".busca").focus();
    });
    atualizarBotao();
    return { definir(s) { sel = new Set(s); atualizarBotao(); } };
  }

  // Seletor de períodos: no máximo 12 meses, preservando a extremidade escolhida.
  function seletorPeriodo(container, { periodos, comDados, parcial, selecionados, aoMudar }) {
    container.innerHTML = "";
    container.append(el("span", { class: "rotulo" }, "Período"));
    const raiz = el("div", { class: "multi periodo" });
    const botao = el("button", { type: "button", "aria-expanded": "false" });
    const painel = el("div", { class: "painel periodo-painel" });
    painel.hidden = true;
    raiz.append(botao, painel);
    container.append(raiz);

    const validos = periodos.filter((p) => new Set(comDados).has(p));
    let aplicado = new Set(selecionados);
    let sel = new Set(selecionados);
    let scrollMeses = null;
    let focoMes = null;

    const mesAno = (p) => Fmt.mesLongo(p);
    const ordenados = () => [...sel].filter((p) => validos.includes(p)).sort();
    const texto = () => {
      const s = ordenados();
      if (!s.length) return "Selecione o período";
      if (s.length === 1) return mesAno(s[0]);
      const continuo = s.every((p, i) => i === 0 || Motor.desloca(s[i - 1], 1) === p);
      return continuo ? `${mesAno(s[0])} - ${mesAno(s.at(-1))}` : `${s.length} meses selecionados`;
    };
    const inicioMes = (p) => `${p.slice(0, 4)}-${p.slice(4, 6)}-01`;
    const fimMes = (p) => {
      const ano = Number(p.slice(0, 4));
      const mes = Number(p.slice(4, 6));
      return `${p.slice(0, 4)}-${p.slice(4, 6)}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
    };
    const periodoDaData = (v) => String(v || "").slice(0, 7).replace("-", "");
    const dataPt = (v) => {
      const [a, m, d] = String(v || "").split("-");
      if (!a || !m || !d) return "";
      const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
      const dt = new Date(Number(a), Number(m) - 1, Number(d));
      return `${nomes[dt.getDay()]}, ${d} ${Fmt.MESES[Number(m) - 1]} ${a}`;
    };
    const intervalo = (ini, fim, ancora) => {
      let i = validos.indexOf(ini);
      let f = validos.indexOf(fim);
      if (i < 0 || f < 0) return ordenados();
      if (i > f) [i, f] = [f, i];
      if (f - i > 11) {
        if (ancora === "inicio") f = i + 11;
        else i = f - 11;
      }
      return validos.slice(i, f + 1);
    };
    const mudou = () => { botao.textContent = texto(); };

    const render = () => {
      painel.innerHTML = "";

      const mesesWrap = el("div", { class: "periodo-navegacao" });
      const anterior = el("button", { type: "button", class: "periodo-seta", "aria-label": "Meses anteriores" }, "‹");
      const faixa = el("div", { class: "periodo-faixa" });
      const proximo = el("button", { type: "button", class: "periodo-seta", "aria-label": "Próximos meses" }, "›");
      faixa.addEventListener("scroll", () => { scrollMeses = faixa.scrollLeft; }, { passive: true });

      const limitarAdicao = (lista, novo) => {
        const ordem = [...new Set(lista)].filter((p) => validos.includes(p)).sort();
        if (ordem.length <= 12) return ordem;
        const anteriores = ordenados();
        if (!anteriores.length || novo > anteriores.at(-1)) return ordem.slice(-12);
        if (novo < anteriores[0]) return ordem.slice(0, 12);
        const pos = validos.indexOf(novo);
        const distanciaInicio = Math.abs(pos - validos.indexOf(anteriores[0]));
        const distanciaFim = Math.abs(validos.indexOf(anteriores.at(-1)) - pos);
        return distanciaInicio <= distanciaFim ? ordem.slice(0, 12) : ordem.slice(-12);
      };

      validos.forEach((p) => {
        const ativo = sel.has(p);
        faixa.append(el("button", {
          type: "button",
          class: `periodo-mes${ativo ? " ativo" : ""}`,
          "aria-pressed": String(ativo),
          "data-periodo": p,
          title: p === parcial ? "Mês parcial (em andamento)" : mesAno(p),
        }, `<span>${Fmt.MESES[Number(p.slice(4, 6)) - 1]}${p === parcial ? "*" : ""}</span><small>${p.slice(0, 4)}</small>`));
      });

      const pintarSelecao = () => {
        faixa.querySelectorAll(".periodo-mes").forEach((item) => {
          const ativo = sel.has(item.dataset.periodo);
          item.classList.toggle("ativo", ativo);
          item.setAttribute("aria-pressed", String(ativo));
        });
      };
      const alternarMes = (p) => {
        if (sel.has(p)) sel.delete(p);
        else sel = new Set(limitarAdicao([...sel, p], p));
      };

      let inicioArraste = null;
      let moveu = false;
      faixa.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        const item = ev.target.closest(".periodo-mes");
        if (!item) return;
        inicioArraste = item.dataset.periodo;
        moveu = false;
        faixa.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      faixa.addEventListener("pointermove", (ev) => {
        if (!inicioArraste || !faixa.hasPointerCapture(ev.pointerId)) return;
        const item = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".periodo-mes");
        if (!item || !faixa.contains(item) || item.dataset.periodo === inicioArraste) return;
        moveu = true;
        const fimArraste = item.dataset.periodo;
        focoMes = fimArraste;
        sel = new Set(intervalo(inicioArraste, fimArraste, fimArraste < inicioArraste ? "fim" : "inicio"));
        pintarSelecao();
      });
      const finalizarSelecao = (ev) => {
        if (!inicioArraste) return;
        if (!moveu) {
          focoMes = inicioArraste;
          alternarMes(inicioArraste);
        }
        inicioArraste = null;
        if (faixa.hasPointerCapture(ev.pointerId)) faixa.releasePointerCapture(ev.pointerId);
        mudou();
        atualizarSemMover();
      };
      faixa.addEventListener("pointerup", finalizarSelecao);
      faixa.addEventListener("pointercancel", () => {
        inicioArraste = null;
        moveu = false;
      });
      faixa.addEventListener("click", (ev) => {
        if (ev.detail !== 0) return;
        const item = ev.target.closest(".periodo-mes");
        if (!item) return;
        focoMes = item.dataset.periodo;
        alternarMes(item.dataset.periodo);
        mudou();
        atualizarSemMover();
      });
      anterior.addEventListener("click", () => faixa.scrollBy({ left: -300, behavior: "smooth" }));
      proximo.addEventListener("click", () => faixa.scrollBy({ left: 300, behavior: "smooth" }));
      mesesWrap.append(anterior, faixa, proximo);

      const campoData = (rotulo, valor, aoAlterar) => {
        const grupo = el("label", { class: "periodo-data" });
        grupo.append(el("span", {}, rotulo));
        const input = el("input", {
          type: "date",
          value: valor,
          min: inicioMes(validos[0]),
          max: fimMes(validos.at(-1)),
        });
        const detalhe = el("small", {}, dataPt(valor));
        input.addEventListener("change", () => {
          detalhe.textContent = dataPt(input.value);
          aoAlterar(periodoDaData(input.value));
        });
        grupo.append(input, detalhe);
        return grupo;
      };
      const montarDatas = () => {
        const atual = ordenados();
        const de = atual[0] || validos.at(-1), ate = atual.at(-1) || validos.at(-1);
        const bloco = el("div", { class: "periodo-datas" });
        bloco.append(
          campoData("De:", inicioMes(de), (p) => {
            sel = new Set(intervalo(p, ate, "inicio"));
            mudou();
            atualizarSemMover();
          }),
          campoData("Até:", fimMes(ate), (p) => {
            sel = new Set(intervalo(de, p, "fim"));
            mudou();
            atualizarSemMover();
          })
        );
        return bloco;
      };
      let datas = montarDatas();
      // A faixa de meses fica parada durante a seleção: só repinta os meses, refaz as datas e o botão.
      const atualizarSemMover = () => {
        pintarSelecao();
        const novas = montarDatas();
        datas.replaceWith(novas);
        datas = novas;
        aplicar.disabled = !sel.size;
        focoMes = null;
      };

      painel.append(mesesWrap, datas);
      painel.append(el("p", { class: "nota periodo-nota" }, `Selecione até 12 meses. Ao ampliar o intervalo, o mês da extremidade oposta é retirado.${parcial ? ` * ${Fmt.mesLongo(parcial)} é parcial.` : ""}`));
      const acoes = el("div", { class: "periodo-acoes" });
      const cancelar = el("button", {
        type: "button",
        class: "btn ghost",
        onclick: () => ctrl.fechar(),
      }, "Cancelar");
      const aplicar = el("button", {
        type: "button",
        class: "btn primario",
        onclick: () => {
          aplicado = new Set(sel);
          botao.textContent = texto();
          aoMudar(new Set(aplicado));
          ctrl.fechar();
        },
      }, "Aplicar filtro");
      aplicar.disabled = !sel.size;
      acoes.append(cancelar, aplicar);
      painel.append(acoes);
      requestAnimationFrame(() => {
        if (scrollMeses === null) {
          const ultimoAtivo = faixa.querySelector(".periodo-mes.ativo:last-of-type");
          faixa.scrollLeft = ultimoAtivo ? Math.max(0, ultimoAtivo.offsetLeft + ultimoAtivo.offsetWidth - faixa.clientWidth) : 0;
          scrollMeses = faixa.scrollLeft;
          return;
        }
        faixa.scrollLeft = scrollMeses;
        if (!focoMes) return;
        const item = faixa.querySelector(`[data-periodo="${focoMes}"]`);
        const seguinte = item?.nextElementSibling;
        const limite = faixa.getBoundingClientRect();
        if (seguinte && seguinte.getBoundingClientRect().right > limite.right) {
          faixa.scrollLeft += seguinte.getBoundingClientRect().right - limite.right + 4;
        } else if (item && item.getBoundingClientRect().left < limite.left) {
          faixa.scrollLeft -= limite.left - item.getBoundingClientRect().left + 4;
        }
        scrollMeses = faixa.scrollLeft;
        focoMes = null;
      });
    };

    const ctrl = {
      raiz,
      fechar: () => {
        painel.hidden = true;
        botao.setAttribute("aria-expanded", "false");
        abertos.delete(ctrl);
      },
    };
    botao.addEventListener("click", () => {
      if (!painel.hidden) {
        ctrl.fechar();
        return;
      }
      for (const a of [...abertos]) a.fechar();
      render();
      painel.hidden = false;
      botao.setAttribute("aria-expanded", "true");
      abertos.add(ctrl);
    });
    botao.textContent = texto();
    return {
      definir(s) {
        sel = new Set(s);
        botao.textContent = texto();
      },
    };
  }

  // Toda variação é contra o mesmo período do ano anterior ("período anterior" no texto), para não confundir com o valor do período.
  const REF_COMP = "vs período anterior";
  // Corpo de balão no formato dos cartões: valor do período, divisão em linhas menores e período; linha divisória;
  // ano anterior (em cinza) no mesmo formato; rodapé com a variação e linhas extras. divisao: [[rótulo, valor]].
  function tipCartao({ valor, divisao = [], periodo = "", valorAnt = null, divisaoAnt = [], periodoAnt = "", rodape = "", extras = [] }) {
    const linhas = (ls) => ls.map(([k, v]) => `<div class="tc-div">${Fmt.esc(k)}: <strong>${Fmt.esc(v)}</strong></div>`).join("");
    return `<div class="tip-cartao"><div class="tc-valor">${Fmt.esc(valor)}</div>${linhas(divisao)}<div class="tc-periodo">${Fmt.esc(periodo)}</div>`
      + (valorAnt !== null ? `<div class="tc-anterior"><div class="tc-valor">${Fmt.esc(valorAnt)}</div>${linhas(divisaoAnt)}<div class="tc-periodo">${Fmt.esc(periodoAnt)}</div></div>` : "")
      + (rodape ? `<div class="tc-rodape">${rodape}</div>` : "")
      + (extras.length ? `<div class="tc-extras">${extras.map(([k, v]) => `<div class="t-linha"><span>${Fmt.esc(k)}</span><span>${Fmt.esc(v)}</span></div>`).join("")}</div>` : "")
      + "</div>";
  }

  function delta(valor, comparado, { inverter = false, formato = "pct", referencia = REF_COMP } = {}) {
    if (comparado === undefined) return "";
    if (comparado === null) return `<span class="delta">sem comparação</span>`;
    const d = formato === "pp" ? valor - comparado : Fmt.taxa(valor, comparado);
    if (d === null || Number.isNaN(d)) return `<span class="delta">—</span>`;
    const bom = inverter ? d < 0 : d > 0;
    const cls = d === 0 ? "" : bom ? "sobe" : "desce";
    const seta = d > 0 ? "▲" : d < 0 ? "▼" : "";
    const movimento = d > 0 ? "Cresceu" : d < 0 ? "Caiu" : "Estável";
    return `<span class="delta ${cls}">${seta} ${movimento} ${formato === "pp" ? Fmt.pp(Math.abs(d)).replace(/^\+/, "") : Fmt.pct(Math.abs(d))}${referencia ? ` <span class="delta-ref">${referencia}</span>` : ""}</span>`;
  }

  // Indicador com valor atual, variacao e valor do mesmo periodo do ano anterior.
  function kpi({ rotulo, valor, atual, comparado, extra = "", detalhe = "", heroi = false, inverter = false, atualLegenda = "", compValor = "", compLegenda = "", semComparacao = "" }) {
    const blocoComparacao = compValor
      ? `<div class="comparativo"><div class="valor-anterior">${compValor}</div>${compLegenda ? `<div class="periodo-anterior">${Fmt.esc(compLegenda)}</div>` : ""}</div>`
      : semComparacao
        ? `<div class="comparativo sem-comparacao">${Fmt.esc(semComparacao)}</div>`
        : "";
    const variacao = delta(atual, comparado, { inverter });
    // Ordem: valor atual e detalhe, período; linha separando o ano anterior; variação no rodapé do cartão.
    // Sempre 4 blocos (topo, extra, ano anterior, rodapé): na grade de cartões eles se alinham entre si (subgrid).
    // O período atual fica no pé do topo (logo acima da linha) e o ano anterior no pé do cartão, acima da variação.
    return `<div class="kpi kpi-grade${heroi ? " heroi" : ""}"><div class="kpi-topo"><div class="rotulo">${Fmt.esc(rotulo)}</div><div class="linha-valor-atual"><div class="valor">${valor}</div></div>${detalhe ? `<div class="detalhe-valor">${detalhe}</div>` : ""}${atualLegenda ? `<div class="periodo-atual">${Fmt.esc(atualLegenda)}</div>` : ""}</div><div class="kpi-extra">${extra ? `<div class="comp">${extra}</div>` : ""}</div><div class="kpi-anterior">${blocoComparacao}</div><div class="rodape-variacao">${variacao}</div></div>`;
  }

  function cartao(titulo, subtitulo = "", acoes = null) {
    const c = el("section", { class: "cartao" });
    const cab = el("div", { class: "cabecalho-cartao" }, `<div><h2>${Fmt.esc(titulo)}</h2>${subtitulo ? `<p class="sub">${subtitulo}</p>` : ""}</div>`);
    if (acoes) cab.append(acoes);
    c.append(cab);
    return c;
  }

  function alternador(opcoes, atual, aoMudar) {
    const g = el("div", { class: "alternador", role: "group" });
    for (const [id, nome] of opcoes) {
      g.append(el("button", { type: "button", class: "btn mini", "aria-pressed": id === atual ? "true" : "false", onclick: () => aoMudar(id) }, Fmt.esc(nome)));
    }
    return g;
  }

  // Tabela ordenável, com busca, paginação e exportação CSV.
  // colunas: [{chave, titulo, num, fmt(v,row), csv(v,row), classe}]
  // linhasVisiveis: altura da área ajustada para exibir essa quantidade de linhas (padrão 20); o restante rola dentro da tabela.
  // Sem "Mostrar mais": a rolagem vai até o fim. "limite" é aceito só por compatibilidade.
  // Tabelas grandes (acima de VIRTUAL_MIN linhas) desenham só as linhas à vista e uma folga; espaçadores acima e abaixo
  // mantêm o tamanho da rolagem. Busca, ordenação, clique e CSV continuam usando todas as linhas.
  const VIRTUAL_MIN = 300, FOLGA = 40;
  function tabela({ colunas, linhas, ordem = null, busca = true, limite = 0, nomeArquivo = "tabela", aoClicar = null, selecionada = null, linhasVisiveis = 20 }) {
    const raiz = el("div", { class: "tabela-bloco" });
    let ord = ordem || { chave: colunas.find((c) => c.num)?.chave, desc: true };
    let termo = "";
    let atuais = [], alturaLinha = 31, janela = [-1, -1];
    const largurasMin = [];
    const barra = el("div", { class: "barra-tabela" });
    const wrap = el("div", { class: "tabela-wrap" });
    const contagem = el("span", { class: "contagem" });
    if (busca) {
      const inp = el("input", { type: "search", placeholder: "Buscar na tabela…" });
      inp.addEventListener("input", () => { termo = inp.value.toLowerCase(); desenhar(); });
      barra.append(inp);
    }
    barra.append(el("button", { type: "button", class: "btn mini", onclick: exportar }, "Exportar CSV"), contagem);
    raiz.append(barra, wrap);

    function filtradas() {
      let ls = linhas;
      if (termo) {
        const textuais = colunas.filter((c) => !c.num);
        ls = ls.filter((r) => textuais.some((c) => String(r[c.chave] ?? "").toLowerCase().includes(termo)));
      }
      if (ord.chave) {
        const k = ord.chave, s = ord.desc ? -1 : 1;
        const val = (r) => { const v = r[k]; return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? (typeof v === "number" && v === Infinity ? Number.MAX_VALUE : -Number.MAX_VALUE) : v; };
        ls = ls.slice().sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * s; });
      }
      return ls;
    }
    // Melhor divisão do título em 2 linhas pelas palavras; a largura é a da linha mais longa, com folga
    // para letras largas em negrito e para a seta de ordenação.
    function larguraDuasLinhas(titulo) {
      const palavras = titulo.split(" ");
      let melhor = titulo.length;
      for (let i = 1; i < palavras.length; i += 1) {
        melhor = Math.min(melhor, Math.max(palavras.slice(0, i).join(" ").length, palavras.slice(i).join(" ").length));
      }
      return Math.ceil(melhor * 1.15) + 3;
    }
    const linhaHtml = (r, i) => {
      let h = `<tr data-i="${i}"${selecionada && selecionada(r) ? ' class="selecionada"' : ""}${aoClicar ? ' style="cursor:pointer"' : ""}>`;
      for (const c of colunas) {
        const v = r[c.chave];
        const t = c.fmt ? c.fmt(v, r) : Fmt.esc(v ?? "");
        h += `<td class="${c.num ? "num" : ""} ${c.classe || ""}${c.anterior ? " anterior" : ""}">${t}</td>`;
      }
      return `${h}</tr>`;
    };
    const espaco = (n) => (n > 0 ? `<tr class="espaco" aria-hidden="true"><td colspan="${colunas.length}" style="height:${n * alturaLinha}px"></td></tr>` : "");
    // Corpo da tabela virtual: só a janela de linhas em volta da rolagem atual.
    function desenharCorpo(forcar = false) {
      const corpo = wrap.querySelector("tbody");
      if (!corpo) return;
      const vistas = Math.ceil((wrap.clientHeight || 560) / alturaLinha);
      const ini = Math.max(0, Math.floor(wrap.scrollTop / alturaLinha) - FOLGA);
      const fim = Math.min(atuais.length, ini + vistas + 2 * FOLGA);
      if (!forcar && ini === janela[0] && fim === janela[1]) return;
      janela = [ini, fim];
      let h = espaco(ini);
      for (let i = ini; i < fim; i += 1) h += linhaHtml(atuais[i], i);
      corpo.innerHTML = h + espaco(atuais.length - fim);
      // Colunas só alargam (nunca encolhem) conforme novas linhas aparecem, para não pularem durante a rolagem.
      wrap.querySelectorAll("th").forEach((th, j) => { const w = th.offsetWidth; if (w > (largurasMin[j] || 0)) { largurasMin[j] = w; th.style.minWidth = `${w}px`; } });
    }
    wrap.addEventListener("scroll", () => { if (atuais.length > VIRTUAL_MIN) desenharCorpo(); }, { passive: true });
    wrap.addEventListener("click", (ev) => { const tr = aoClicar && ev.target.closest("tbody tr[data-i]"); if (tr) aoClicar(atuais[Number(tr.dataset.i)]); });
    function desenhar() {
      const ls = filtradas();
      atuais = ls;
      const virtual = ls.length > VIRTUAL_MIN;
      contagem.textContent = `${Fmt.num(ls.length)} linhas`;
      let h = "<table><thead><tr>";
      for (const c of colunas) {
        const sort = ord.chave === c.chave ? (ord.desc ? "descending" : "ascending") : "none";
        // Título com no máximo 2 linhas: largura mínima ≈ metade do texto (títulos curtos ficam numa linha só).
        const largura = c.titulo.length <= 16 ? "" : ` style="min-width:${larguraDuasLinhas(c.titulo)}ch"`;
        h += `<th class="${[c.num ? "num" : "", c.anterior ? "anterior" : ""].filter(Boolean).join(" ")}" data-k="${c.chave}" aria-sort="${sort}" title="${Fmt.esc(c.dica || "")}"${largura}>${Fmt.esc(c.titulo)}</th>`;
      }
      h += "</tr></thead><tbody>";
      if (!virtual) ls.forEach((r, i) => { h += linhaHtml(r, i); });
      h += "</tbody></table>";
      wrap.innerHTML = h;
      largurasMin.forEach((w, j) => { const th = wrap.querySelectorAll("th")[j]; if (th && w) th.style.minWidth = `${w}px`; });
      if (virtual) desenharCorpo(true);
      // Com a tabela na tela: mede a altura real da linha e redesenha a janela se ela for diferente da estimada.
      if (virtual) requestAnimationFrame(() => {
        const linha = wrap.querySelector("tbody tr[data-i]");
        if (linha && linha.offsetHeight && linha.offsetHeight !== alturaLinha) { alturaLinha = linha.offsetHeight; desenharCorpo(true); }
      });
      if (linhasVisiveis) requestAnimationFrame(() => {
        const cab = wrap.querySelector("thead"), linha = wrap.querySelector("tbody tr[data-i]");
        if (!cab || !linha) return;
        wrap.style.maxHeight = `${Math.ceil(cab.offsetHeight + linha.offsetHeight * linhasVisiveis) + 2}px`;
        // Soma a altura da barra de rolagem horizontal, que ocupa espaço dentro da área.
        const barra = wrap.offsetHeight - wrap.clientHeight;
        if (barra > 0) wrap.style.maxHeight = `${Math.ceil(cab.offsetHeight + linha.offsetHeight * linhasVisiveis) + 2 + barra}px`;
      });
      wrap.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
        const k = th.dataset.k;
        ord = { chave: k, desc: ord.chave === k ? !ord.desc : Boolean(colunas.find((c) => c.chave === k).num) };
        desenhar();
      }));
    }
    function exportar() {
      const ls = filtradas();
      const esc = (t) => { const s = String(t ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const num = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v).replace(".", ",") : v ?? "");
      const out = [colunas.map((c) => esc(c.titulo)).join(";")];
      for (const r of ls) out.push(colunas.map((c) => esc(c.csv ? c.csv(r[c.chave], r) : c.num ? num(r[c.chave]) : r[c.chave])).join(";"));
      const blob = new Blob([`﻿${out.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `${nomeArquivo}.csv` });
      document.body.append(a); a.click(); a.remove();
    }
    desenhar();
    return raiz;
  }

  const legenda = (itens) => `<div class="legenda">${itens.map(([nome, cor]) => `<span><i style="--c:${cor}"></i>${Fmt.esc(nome)}</span>`).join("")}</div>`;

  return { el, multi, seletorPeriodo, kpi, delta, tipCartao, cartao, alternador, tabela, legenda };
})();
