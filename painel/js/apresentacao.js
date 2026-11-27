// Exportar apresentação: botão no topo do painel. Monta um PowerPoint com "prints" dos próprios cartões do painel,
// com os filtros aplicados. Cada aba é uma lista (Análises gerais conta como uma aba, pois aparece em todas); ao abrir a
// lista aparecem os gráficos/análises da aba para marcar ou desmarcar. Cada aba é desenhada numa área invisível da página
// (mesmo código das telas): os cartões viram imagens (html-to-image) e as tabelas viram tabelas do PowerPoint, com
// as completas num apêndice no fim.
// Bibliotecas em js/vendor (carregadas só na hora de exportar): PptxGenJS 3.12.0 e html-to-image 1.11.11.
(() => {
  // Largura da área invisível (px): leitura de uma tela comum, com letra legível no slide. As regras do CSS feitas para
  // telas muito largas (texto em linha única) ficam anuladas dentro da área (.area-captura no app.css), senão o texto
  // sairia dos cartões quando quem exporta usa um monitor grande.
  const largura = () => 1360;
  const GERAIS = "gerais";
  // Cadastro geral de clientes: conferência técnica da SA1, não vai para apresentação.
  const NAO_EXPORTAR = new Set(["Cadastro geral de clientes"]);
  // Tabelas: só as primeiras linhas entram na foto (a tabela rola dentro do cartão); cortar o resto deixa a foto rápida.
  const LINHAS_FOTO = 22;
  // Cartões com seletor de visões: cada visão vira um print (as vazias ficam de fora). Opção interna da tela
  // (Telas.estadoInterno), valores e o sinal de lista vazia.
  const VISOES = {
    "Desempenho dos vendedores": { chave: "rankVend", valores: ["faturamento", "cresc", "estaveis", "queda"], vazio: ".ranking-vend .vazio" },
  };
  const LARGURAS_EXTRAS = [1700, 2100, 2600]; // larguras testadas para cartões altos
  const LARGURAS_ABA = [1360, 1700, 2100]; // larguras testadas para a aba inteira (a que melhor preenche os slides)
  const LARGURA_VISAO = 1000; // cada visão é desenhada mais estreita e as visões viram uma grade (2×2) num print só
  const abas = () => [{ id: GERAIS, nome: "Análises gerais" }, ...Telas.map((t) => ({ id: t.id, nome: t.nome }))];

  // Escolha guardada só na memória da página: por aba, se está marcada e quais itens foram desmarcados.
  const escolha = new Map([[GERAIS, { marcada: true, fora: new Set() }], ["geral", { marcada: true, fora: new Set() }]]);
  const escolhaDe = (id) => { if (!escolha.has(id)) escolha.set(id, { marcada: false, fora: new Set() }); return escolha.get(id); };
  let tituloSalvo = "Resultados comerciais";

  // ---------- Desenhar uma aba fora da tela e achar os cartões ----------
  const doisQuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function desenharAba(id, R, larguraArea = largura()) {
    const area = document.createElement("div");
    area.className = "area-captura";
    area.style.cssText = `position:fixed;left:-30000px;top:0;width:${larguraArea}px;pointer-events:none;`;
    (document.querySelector(".viz-root") || document.body).append(area);
    // As telas usam alguns sinais globais para rolar a página; aqui não pode rolar nada.
    const sinais = ["__rolarTabela", "__rolarMix", "__rolarReajuste", "__selAtual", "__selRotulos"].map((k) => [k, window[k]]);
    window.__rolarTabela = false; window.__rolarMix = false; window.__rolarReajuste = false;
    try { Telas.find((t) => t.id === (id === GERAIS ? "geral" : id)).fn(R, area, () => {}); }
    finally { for (const [k, v] of sinais) window[k] = v; }
    await doisQuadros();
    return area;
  }
  // Cartões de Análises gerais: a faixa .kpis logo abaixo do título "Análises gerais".
  function faixaGerais(area) {
    const h = [...area.querySelectorAll(".cabecalho-secao h2")].find((x) => x.textContent.trim() === "Análises gerais");
    const k = h?.parentElement?.nextElementSibling;
    return k?.classList.contains("kpis") ? k : null;
  }
  // Itens da aba: cartões, blocos de seção e faixas de cartões de primeiro nível (sem contar os de Análises gerais).
  function itensDaAba(id, area) {
    if (id === GERAIS) {
      const k = faixaGerais(area);
      return k ? [...k.children].filter((e) => e.classList.contains("kpi")).map((e, i) => ({ nome: e.querySelector(".rotulo")?.textContent.trim() || `Cartão ${i + 1}`, el: e })) : [];
    }
    const gerais = faixaGerais(area);
    const sel = ".cartao, .bloco-situacoes, .kpis";
    const blocos = [...area.querySelectorAll(sel)].filter((e) => e !== gerais && !e.parentElement.closest(sel)
      && !NAO_EXPORTAR.has(e.querySelector(":scope > .cabecalho-cartao h2")?.textContent.trim()));
    const itens = [], vistos = new Map();
    for (const e of blocos) {
      let nome = e.querySelector(":scope > .cabecalho-cartao h2, :scope > .cabecalho-secao h2")?.textContent.trim();
      if (!nome) nome = itens.length ? `${itens.at(-1).nome}: resumo` : "Resumo";
      const n = (vistos.get(nome) || 0) + 1;
      vistos.set(nome, n);
      itens.push({ nome: n > 1 ? `${nome} (${n})` : nome, el: e });
    }
    return itens;
  }

  // ---------- Fotos ----------
  function carregar(src, global) {
    if (window[global]) return Promise.resolve();
    return new Promise((ok, erro) => {
      const sc = document.createElement("script");
      sc.src = src;
      sc.onload = () => ok();
      sc.onerror = () => erro(new Error("Não foi possível carregar o gerador de PowerPoint."));
      document.head.append(sc);
    });
  }
  const semBotoes = (n) => !(n.classList && (n.classList.contains("btn-entenda") || n.classList.contains("janela-explica")));
  // A área é uma cópia feita só para a foto: pode cortar as linhas que ficariam fora da parte visível da tabela.
  const cortarLinhas = (el) => el.querySelectorAll("tbody").forEach((tb) => { while (tb.rows.length > LINHAS_FOTO) tb.deleteRow(-1); });
  async function foto(el, fundo) {
    cortarLinhas(el);
    const w = el.offsetWidth, h = el.offsetHeight;
    const dados = await window.htmlToImage.toPng(el, { pixelRatio: 2, backgroundColor: fundo, filter: semBotoes, width: w, height: h, style: { margin: "0" }, skipFonts: true });
    return { dados, w, h };
  }

  // ---------- Slides ----------
  const TEMAS = {
    claro: { fundo: "E8ECF1", tinta: "0F172A", sec: "334155", muted: "5A6576", linha: "C9D1DC", acento: "2C5D94", cab: "E2E7EE", celula: "F7F9FB", pos: "2E9E4F", neg: "D94545" },
    escuro: { fundo: "0D0D0D", tinta: "FFFFFF", sec: "C3C2B7", muted: "898781", linha: "383835", acento: "6C9BD2", cab: "232321", celula: "1A1A19", pos: "2F9E44", neg: "E66767" },
  };
  const FONTE = "Segoe UI", FONTE_T = "Segoe UI Semibold";
  const corta = (s, n) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

  function capa(pptx, info) {
    const s = pptx.addSlide();
    s.background = { color: "1E3A5F" };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: "4A86C5" }, line: { color: "4A86C5", width: 0 } });
    const t = (txt, y, h, o) => s.addText(txt, { x: 0.9, y, w: 11.6, h, fontFace: FONTE, margin: 0, valign: "top", ...o });
    t("DIAGNÓSTICO COMERCIAL", 1.55, 0.4, { fontFace: FONTE_T, fontSize: 13, color: "9DB9DA", charSpacing: 3 });
    t(info.titulo, 2.0, 1.3, { fontFace: FONTE_T, fontSize: 40, color: "FFFFFF" });
    const linha = (rot, val) => [{ text: rot, options: { color: "9DB9DA" } }, { text: val, options: { color: "FFFFFF", bold: true, breakLine: true } }];
    t([...linha("Período analisado: ", info.pAtual), ...(info.pAnterior ? linha("Comparado com: ", info.pAnterior) : [])], 3.45, 0.8, { fontSize: 15, paraSpaceAfter: 4 });
    t("Filtros aplicados", 4.55, 0.3, { fontSize: 11, color: "9DB9DA", fontFace: FONTE_T });
    const filtros = info.filtros.length ? info.filtros.map(([r, v]) => `${r}: ${corta(v.join(", "), 120)}`) : ["Sem filtros: empresa toda (todos os clientes, vendedores e produtos)"];
    t(filtros.slice(0, 6).join("\n"), 4.85, 1.3, { fontSize: 12, color: "FFFFFF" });
    // Último dia com dados (base de pedidos, data AAAAMMDD), em vez de avisar que o último mês está em andamento.
    let ultimoDia = 0;
    for (let i = 0; i < Motor.O.n; i += 1) if (Motor.O.d[i] > ultimoDia) ultimoDia = Motor.O.d[i];
    t(`Gerado em ${new Date().toLocaleDateString("pt-BR")} · Dados até ${Fmt.data(String(ultimoDia))}`, 6.7, 0.3, { fontSize: 10, color: "9DB9DA" });
  }

  // Sumário no padrão ABNT (NBR 6027): título centralizado, indicativo numérico à esquerda (1, 2, 2.1...), seções
  // primárias em maiúsculas e negrito, pontilhado até o número da página alinhado à direita. Se não couber, continua no
  // slide seguinte. A largura do texto é medida no navegador (mesma fonte do PowerPoint) para o pontilhado fechar certo.
  const LINHAS_SUMARIO = 18;
  const medidor = document.createElement("canvas").getContext("2d");
  const larguraTexto = (txt, negrito, pt) => { medidor.font = `${negrito ? "bold " : ""}${pt * 96 / 72}px "${FONTE}"`; return medidor.measureText(txt).width / 96; };
  function sumario(pptx, T, entradas) {
    const xNum = 1.0, xTit = 1.75, xPag = 11.75, wPag = 0.6, fim = xPag + wPag - 0.4;
    for (let ini = 0; ini < entradas.length; ini += LINHAS_SUMARIO) {
      const s = pptx.addSlide({ masterName: "PAINEL" });
      s.addText("SUMÁRIO", { x: 0.6, y: 0.4, w: 12.13, h: 0.6, fontFace: FONTE, bold: true, fontSize: 20, color: T.tinta, align: "center", margin: 0 });
      entradas.slice(ini, ini + LINHAS_SUMARIO).forEach((e, i) => {
        const y = 1.3 + i * 0.3, pt = e.primaria ? 12 : 11.5, negrito = e.primaria;
        let titulo = e.primaria ? e.titulo.toUpperCase() : e.titulo;
        const disponivel = (fim - xTit) * 0.98; // folga para diferenças de desenho entre navegador e PowerPoint
        while (larguraTexto(titulo, negrito, pt) > disponivel - 0.4 && titulo.length > 4) titulo = `${titulo.slice(0, -2)}…`;
        const ponto = larguraTexto(" .", false, pt);
        const n = Math.max(2, Math.floor((disponivel - larguraTexto(titulo, negrito, pt)) / ponto));
        const base = { fontFace: FONTE, fontSize: pt, color: T.tinta, margin: 0, valign: "middle", h: 0.3, y };
        s.addText(e.numero, { ...base, x: xNum, w: xTit - xNum, bold: negrito });
        s.addText([{ text: titulo, options: { bold: negrito } }, { text: " .".repeat(n), options: { bold: false, color: T.muted } }], { ...base, x: xTit, w: fim - xTit + 0.1, fit: "none", wrap: false });
        s.addText(String(e.pagina), { ...base, x: xPag, w: wPag, align: "right", bold: negrito });
      });
    }
  }

  // Área útil do slide (pol.) e encaixe. Em cada aba, gráficos (prints) e tabelas seguem a ordem do painel e são
  // empilhados nos slides conforme o tamanho de cada um: uma tabela ocupa só a altura das linhas que tem (com filtro,
  // pode ser bem baixa) e o espaço que sobra recebe o próximo item. Prints seguidos podem ficar lado a lado. Todos os
  // prints de um slide usam a mesma escala (letra do mesmo tamanho), de no mínimo 70% do tamanho na largura toda.
  const CAIXA = { x: 0.4, y: 0.58, w: 12.53, h: 6.32 }, VAO = 0.18;
  // Prints seguidos de um slide = linhas (os de uma linha ficam lado a lado; as linhas, empilhadas).
  const MODOS = { 1: [[1]], 2: [[2], [1, 1]], 3: [[3], [1, 1, 1], [1, 2], [2, 1]], 4: [[2, 2], [4], [1, 3], [3, 1]] };
  function planoSlide(blocos, minimo) {
    const tabs = blocos.filter((b) => b.tipo === "tabela");
    if (blocos.length > 1 && tabs.some((b) => b.cheia)) return null; // tabela que enche o slide fica sozinha
    const partes = [];
    for (const b of blocos) {
      const ultima = partes.at(-1);
      if (b.tipo === "foto") { if (ultima?.imgs) ultima.imgs.push(b.img); else partes.push({ imgs: [b.img] }); }
      else partes.push({ tab: b });
    }
    const grupos = partes.filter((x) => x.imgs);
    if (grupos.some((g) => g.imgs.length > 4)) return null;
    const alturaTabs = tabs.reduce((a, b) => a + b.altura, 0);
    let melhor = null;
    const avaliar = (gi, escolhas) => {
      if (gi < grupos.length) { for (const m of MODOS[grupos[gi].imgs.length]) avaliar(gi + 1, [...escolhas, m]); return; }
      const linhasImg = grupos.map((g, k) => { const ls = []; let i = 0; for (const n of escolhas[k]) { ls.push(g.imgs.slice(i, i + n)); i += n; } return ls; });
      const todas = linhasImg.flat(), nLinhas = todas.length + tabs.length;
      const livre = CAIXA.h - alturaTabs - VAO * (nLinhas - 1);
      let escala = 0;
      if (todas.length) {
        if (livre <= 0.4) return;
        escala = Math.min(...todas.map((l) => (CAIXA.w - VAO * (l.length - 1)) / l.reduce((a, i) => a + i.w, 0)),
          livre / todas.reduce((a, l) => a + Math.max(...l.map((i) => i.h)), 0));
        if (blocos.length > 1 && escala < minimo) return;
      } else if (livre < -0.001) return;
      const area = todas.flat().reduce((a, i) => a + i.w * i.h, 0) * escala * escala + alturaTabs * CAIXA.w;
      const ocupa = area / (CAIXA.w * CAIXA.h);
      if (!melhor || ocupa > melhor.ocupa) melhor = { blocos, partes, linhasImg, escala, ocupa };
    };
    avaliar(0, []);
    return melhor;
  }
  // Divide os blocos da aba (em ordem) em slides: menos slides possível (sem buracos) e, empatando, a divisão que
  // mais ocupa os slides.
  function montarSlides(blocos, larguraPainel) {
    const minimo = 0.7 * (CAIXA.w / larguraPainel);
    const n = blocos.length, melhor = new Array(n + 1).fill(null);
    melhor[n] = { slides: 0, ocupa: 0, plano: [] };
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let k = 1; k <= 6 && i + k <= n; k += 1) {
        const p = planoSlide(blocos.slice(i, i + k), minimo), resto = melhor[i + k];
        if (!p || !resto) continue;
        const cand = { slides: resto.slides + 1, ocupa: resto.ocupa + p.ocupa, plano: [p, ...resto.plano] };
        if (!melhor[i] || cand.slides < melhor[i].slides || (cand.slides === melhor[i].slides && cand.ocupa > melhor[i].ocupa)) melhor[i] = cand;
      }
    }
    return melhor[0].plano;
  }
  function slideMisto(pptx, T, tag, periodo, p) {
    const s = pptx.addSlide({ masterName: "PAINEL" });
    s.addText(tag, { x: 0.4, y: 0.18, w: 8, h: 0.3, fontFace: FONTE_T, fontSize: 10, color: T.acento, charSpacing: 1.5, margin: 0 });
    s.addText(periodo, { x: 6.4, y: 0.18, w: 6.53, h: 0.3, fontFace: FONTE, fontSize: 9.5, color: T.muted, align: "right", margin: 0 });
    // Fator de cada linha de prints: linhas com largura quase igual à mais larga (até 5% menor) são ampliadas um pouco,
    // sem distorcer, para todas terminarem nas mesmas bordas (desde que ainda caibam na altura do slide).
    const larguraLinha = (l, f = 1) => l.reduce((a, im) => a + im.w * p.escala * f, 0) + VAO * (l.length - 1);
    // Se ampliar não couber na altura, as linhas mais largas é que são reduzidas um pouco até a largura da menor delas.
    const linhas = p.linhasImg.flat(), larguras = linhas.map((l) => larguraLinha(l)), maior = Math.max(0, ...larguras);
    const parecidas = linhas.filter((l, k) => larguras[k] >= maior * 0.95);
    const igualar = (alvo) => new Map(linhas.map((l) => {
      const w = larguraLinha(l);
      return [l, parecidas.includes(l) && Math.abs(w - alvo) > 0.001 ? (alvo - VAO * (l.length - 1)) / (w - VAO * (l.length - 1)) : 1];
    }));
    let fator = igualar(maior);
    const alturaLinha = (l) => Math.max(...l.map((im) => im.h)) * p.escala * fator.get(l);
    let gi = 0;
    const alturasDe = () => { gi = 0; return p.partes.map((parte) => (parte.tab ? [parte.tab.altura] : p.linhasImg[gi++].map(alturaLinha))).flat(); };
    let todas = alturasDe(), total = todas.reduce((a, h) => a + h, 0) + VAO * (todas.length - 1);
    if (total > CAIXA.h) { fator = igualar(Math.min(...parecidas.map((l) => larguraLinha(l)))); todas = alturasDe(); total = todas.reduce((a, h) => a + h, 0) + VAO * (todas.length - 1); }
    let y = CAIXA.y + Math.max(0, (CAIXA.h - total) / 2);
    gi = 0;
    for (const parte of p.partes) {
      if (parte.tab) { desenharTabela(s, pptx, T, parte.tab, y); y += parte.tab.altura + VAO; continue; }
      for (const l of p.linhasImg[gi++]) {
        const f = fator.get(l), hl = alturaLinha(l), totW = larguraLinha(l, f);
        let x = CAIXA.x + (CAIXA.w - totW) / 2;
        for (const im of l) {
          const w = im.w * p.escala * f, h = im.h * p.escala * f;
          s.addImage({ data: im.dados, x, y, w, h }); // lado a lado alinhados pelo topo
          x += w + VAO;
        }
        y += hl + VAO;
      }
    }
  }

  // ---------- Tabelas ----------
  // No slide, a tabela entra legível (letra de 8 a 10 pt) com as colunas e linhas que couberem; o botão "Abrir no painel"
  // abre a tabela completa no painel com os mesmos filtros, e a planilha baixada junto traz todas as tabelas completas
  // (para usar sem internet).
  const tabelasDe = (el) => [...el.querySelectorAll(".tabela-bloco")].filter((b) => typeof b.dadosTabela === "function");
  // Converte a tabela do painel (colunas + todas as linhas, na ordem da tela, com os mesmos formatos) em textos e cores:
  // verde/vermelho das variações e cinza das colunas do ano anterior. Guarda também os valores brutos (planilha).
  function dadosTabela({ colunas, linhas }) {
    const tmp = document.createElement("div");
    const celula = (c, r) => {
      const v = r[c.chave], html = c.fmt ? String(c.fmt(v, r) ?? "") : Fmt.esc(v ?? "");
      if (!/[<&]/.test(html)) return { t: html, cor: c.anterior ? "muted" : null };
      tmp.innerHTML = html;
      const cor = tmp.querySelector(".sobe, .cor-pos") ? "pos" : tmp.querySelector(".desce, .cor-neg") ? "neg" : c.anterior ? "muted" : null;
      return { t: tmp.textContent.trim(), cor };
    };
    return { colunas, brutas: linhas, cab: colunas.map((c) => c.titulo), num: colunas.map((c) => Boolean(c.num)), linhas: linhas.map((r) => colunas.map((c) => celula(c, r))) };
  }
  const CAB_TAB = 0.66; // título, aviso e botão acima da tabela
  const TAB = { h: 6.32 - CAB_TAB };
  function layoutTabela(tab) {
    const margem = 0.1, base = 10;
    // Largura de cada coluna a 10 pt: título em até 2 linhas, números inteiros (com folga), textos até 2,6 pol.
    const larg = tab.cab.map((titulo, k) => {
      const palavras = titulo.split(" ");
      let tituloW = larguraTexto(titulo, true, base);
      for (let i = 1; i < palavras.length; i += 1) tituloW = Math.min(tituloW, Math.max(larguraTexto(palavras.slice(0, i).join(" "), true, base), larguraTexto(palavras.slice(i).join(" "), true, base)));
      let corpo = 0;
      for (const l of tab.linhas) corpo = Math.max(corpo, larguraTexto(l[k].t, false, base));
      corpo *= tab.num[k] ? 1.12 : 1.15; // mesma folga usada ao abreviar: o PowerPoint desenha um pouco mais largo
      return Math.max(tituloW, Math.min(corpo, tab.num[k] ? 9 : 2.6));
    });
    // Maior letra (10 a 8 pt) em que todas as colunas cabem; se nem a 8 pt couberem, as primeiras colunas que couberem.
    const prefixo = (pt) => { let soma = 0, n = 0; for (const w of larg) { soma += w * pt / base + margem; if (soma > CAIXA.w) break; n += 1; } return n; };
    let pt = 10;
    while (pt > 8 && prefixo(pt) < larg.length) pt -= 0.5;
    const ncols = Math.max(1, prefixo(pt));
    let colW = larg.slice(0, ncols).map((w) => w * pt / base + margem);
    const total = colW.reduce((a, w) => a + w, 0);
    colW = colW.map((w) => w * CAIXA.w / total); // ocupa a largura toda do slide
    const linhasTitulo = (titulo, w) => {
      let n = 1, atual = 0;
      for (const palavra of titulo.split(" ")) {
        const lp = larguraTexto(`${palavra} `, true, pt);
        if (atual && atual + lp > w) { n += 1; atual = 0; }
        atual += lp;
        while (atual > w) { n += 1; atual -= w; }
      }
      return n;
    };
    const cabLinhas = Math.max(1, ...tab.cab.slice(0, ncols).map((t, k) => linhasTitulo(t, colW[k] - 0.12)));
    const rowH = pt / 72 * 1.5 + 0.05, cabH = pt / 72 * 1.25 * cabLinhas + 0.1;
    const porSlide = Math.max(3, Math.floor((TAB.h - 0.1 - cabH) / rowH) - 1); // uma linha de folga antes do rodapé
    return { pt, ncols, colW, rowH, cabH, porSlide };
  }
  // Altura que a tabela ocupa no slide: título/aviso + cabeçalho + as linhas mostradas (no máximo as que cabem sozinhas).
  function medirTabela(b) {
    const n = b.tabela.linhas.length;
    b.cheia = n >= b.lay.porSlide;
    b.altura = CAB_TAB + b.lay.cabH + Math.max(1, Math.min(n, b.lay.porSlide)) * b.lay.rowH + 0.04;
  }
  function desenharTabela(s, pptx, T, b, y0) {
    const lay = b.lay, tab = b.tabela, n = tab.linhas.length, total = tab.cab.length, fim = Math.min(n, lay.porSlide);
    s.addText(b.nome, { x: CAIXA.x, y: y0, w: 10.2, h: 0.34, fontFace: FONTE_T, fontSize: 13, color: T.tinta, margin: 0 });
    if (b.link) {
      // Botão: fundo e texto sem link (texto de link sairia azul e sublinhado) e, por cima, uma forma transparente
      // com o link, para o clique valer no botão inteiro.
      const botao = { x: 10.83, y: y0 - 0.04, w: 2.1, h: 0.4 };
      s.addText("Abrir no painel  ↗", { ...botao, shape: pptx.ShapeType.roundRect, rectRadius: 0.08, fill: { color: T.acento }, line: { color: T.acento, width: 0 },
        fontFace: FONTE_T, fontSize: 11, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      s.addShape(pptx.ShapeType.rect, { ...botao, fill: { color: "FFFFFF", transparency: 100 }, line: { type: "none" }, hyperlink: { url: b.link, tooltip: "Abre o painel com os mesmos filtros, nesta tabela" } });
    }
    const partes = !n ? ["Sem linhas para o filtro aplicado"] : [
      fim < n ? `Mostrando ${Fmt.num(fim)} de ${Fmt.num(n)} linhas` : `${Fmt.num(n)} ${n === 1 ? "linha" : "linhas"}`,
      ...(lay.ncols < total ? [`${lay.ncols} de ${total} colunas`] : []),
    ];
    const completa = fim < n || lay.ncols < total ? ` · tabela completa ${b.link ? "no painel (botão ao lado) e " : ""}na planilha, aba "${b.abaPlanilha}"` : "";
    s.addText(`${partes.join(" e ")}${completa}`, { x: CAIXA.x, y: y0 + 0.35, w: 10.2, h: 0.26, fontFace: FONTE, fontSize: 9.5, color: T.muted, margin: 0 });
    const borda = [{ type: "none" }, { type: "none" }, { type: "solid", pt: 0.5, color: T.linha }, { type: "none" }];
    // Texto mais largo que a coluna é abreviado com "…" (folga de 15%: o PowerPoint desenha um pouco mais largo).
    const cabe = (t, k) => {
      const max = lay.colW[k] - 0.1;
      if (tab.num[k] || larguraTexto(t, false, lay.pt) * 1.15 <= max) return t;
      let r = t;
      while (r.length > 1 && larguraTexto(`${r}…`, false, lay.pt) * 1.15 > max) r = r.slice(0, -1);
      return `${r}…`;
    };
    const cor = { pos: T.pos, neg: T.neg, muted: T.muted };
    const linhas = [tab.cab.slice(0, lay.ncols).map((t, k) => ({ text: t, options: { bold: true, color: T.sec, fill: { color: T.cab }, align: tab.num[k] ? "right" : "left", valign: "bottom", border: borda } }))];
    for (const l of tab.linhas.slice(0, fim)) linhas.push(l.slice(0, lay.ncols).map((c, k) => ({ text: cabe(c.t, k), options: { color: cor[c.cor] || T.tinta, fill: { color: T.celula }, align: tab.num[k] ? "right" : "left", valign: "middle", border: borda } })));
    s.addTable(linhas, { x: CAIXA.x, y: y0 + CAB_TAB, w: lay.colW.reduce((a, w) => a + w, 0), colW: lay.colW, rowH: [lay.cabH, ...Array(linhas.length - 1).fill(lay.rowH)], fontFace: FONTE, fontSize: lay.pt, margin: [0.02, 0.05, 0.02, 0.05], autoPage: false });
  }

  // ---------- Planilha com as tabelas completas ----------
  // Uma aba por tabela da apresentação, com todas as linhas e colunas. Números ficam como números (dá para somar,
  // filtrar e ordenar) no formato do painel: R$, %, p.p.; variações em verde/vermelho; ano anterior em cinza.
  const nomeAba = (nome, usados) => {
    let base = String(nome).replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim() || "Tabela"; // limite de 31 caracteres do Excel
    let n = 2, final = base;
    while (usados.has(final.toLowerCase())) { const suf = ` (${n})`; final = `${base.slice(0, 31 - suf.length)}${suf}`; n += 1; }
    usados.add(final.toLowerCase());
    return final;
  };
  function formatoColuna(tab, k) {
    const c = tab.colunas[k];
    if (c.csv || !c.num) return { texto: true };
    const i = tab.brutas.findIndex((r) => typeof r[c.chave] === "number" && Number.isFinite(r[c.chave]));
    if (i < 0) return { texto: true };
    const t = tab.linhas[i][k].t, dec = ((t.split(",")[1] || "").match(/\d/g) || []).length, zeros = dec ? `.${"0".repeat(dec)}` : "";
    let fmt = `#,##0${zeros}`, mult = 1;
    if (/R\$/.test(t)) fmt = `"R$" #,##0${zeros}`;
    else if (/p\.p\./.test(t)) { fmt = `0${zeros}" p.p."`; mult = 100; }
    else if (/%/.test(t)) fmt = `0${zeros}%`;
    const colorida = tab.linhas.some((l) => l[k].cor === "pos" || l[k].cor === "neg");
    if (colorida) fmt = `[Color10]+${fmt};[Red]-${fmt};${fmt}`;
    return { fmt, mult, cinza: Boolean(c.anterior) };
  }
  async function gerarPlanilha(info, tabelas, nomeArquivo) {
    await carregar("js/vendor/exceljs.min.js", "ExcelJS");
    const wb = new window.ExcelJS.Workbook();
    wb.creator = "Diagnóstico Comercial";
    const resumo = wb.addWorksheet("Filtros");
    resumo.columns = [{ width: 26 }, { width: 90 }];
    const linhasResumo = [["Diagnóstico Comercial", info.titulo], ["Período analisado", info.pAtual], ...(info.pAnterior ? [["Comparado com", info.pAnterior]] : []),
      ...(info.filtros.length ? info.filtros.map(([r, v]) => [`Filtro: ${r}`, v.join(", ")]) : [["Filtros", "Sem filtros (empresa toda)"]]),
      ["Gerado em", new Date().toLocaleString("pt-BR")], ["Dados até", Fmt.data(String(Math.max(...Motor.O.d)))], [], ["Tabelas", ""]];
    linhasResumo.forEach((l) => resumo.addRow(l));
    resumo.getColumn(1).font = { bold: true };
    for (const b of tabelas) {
      resumo.addRow([b.abaPlanilha, `${b.aba} · ${b.nome} (${Fmt.num(b.tabela.linhas.length)} linhas)`]);
      const tab = b.tabela, ws = wb.addWorksheet(b.abaPlanilha, { views: [{ state: "frozen", ySplit: 1 }] });
      const formatos = tab.cab.map((_, k) => formatoColuna(tab, k));
      ws.columns = tab.cab.map((titulo, k) => ({ header: titulo, width: Math.min(50, Math.max(10, titulo.length * 0.6, ...tab.linhas.slice(0, 500).map((l) => l[k].t.length)) + 2) }));
      tab.brutas.forEach((r, i) => {
        ws.addRow(tab.colunas.map((c, k) => {
          const f = formatos[k], v = r[c.chave];
          if (c.csv) return c.csv(v, r);
          return !f.texto && typeof v === "number" && Number.isFinite(v) ? Number((v * f.mult).toFixed(8)) : tab.linhas[i][k].t; // sem resíduo de ponto flutuante
        }));
      });
      formatos.forEach((f, k) => {
        const col = ws.getColumn(k + 1);
        if (f.fmt) col.numFmt = f.fmt;
        if (f.cinza) col.font = { color: { argb: "FF7A8594" } };
        if (!f.texto) col.alignment = { horizontal: "right" };
      });
      const cab = ws.getRow(1);
      cab.font = { bold: true }; cab.alignment = { vertical: "bottom", wrapText: true }; cab.height = 32;
      cab.eachCell((cel) => { cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E7EE" } }; });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tab.cab.length } };
    }
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nomeArquivo;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ---------- Coleta de uma aba ----------
  // Desenha a aba na largura pedida e monta os blocos (prints e tabelas) dos itens escolhidos. Com fotografar = false
  // só mede os cartões (rápido), para comparar larguras; as tabelas e as visões, que não mudam com a largura da aba,
  // ficam guardadas em cache entre as medições.
  async function coletarAba(aba, R, larguraAba, fotografar, cache, fundo, avancar) {
    const area = await desenharAba(aba.id, R, larguraAba), blocos = [];
    try {
      const fora = escolhaDe(aba.id).fora;
      const itens = itensDaAba(aba.id, area).filter((it) => !fora.has(it.nome));
      const medida = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });
      for (const [j, it] of itens.entries()) {
        avancar(`${it.nome} — ${j + 1} de ${itens.length}…`);
        // Tabelas viram tabelas do PowerPoint; o resto do cartão (gráfico, resumo) vai em print. Cartão que só tem a
        // tabela não vira print.
        const tabs = tabelasDe(it.el);
        tabs.forEach((b) => { b.style.display = "none"; });
        const cab = it.el.querySelector(":scope > .cabecalho-cartao");
        const visoes = VISOES[it.nome];
        if (visoes) {
          // Visões do seletor numa grade (até 2 por linha), um print só; visão sem dados não entra.
          const chave = `visoes|${it.nome}`;
          if (!fotografar && cache.has(chave)) { const c = cache.get(chave); if (c) blocos.push({ tipo: "foto", nome: it.nome, j, img: { ...c } }); }
          else {
            const interno = Telas.estadoInterno(), areas = [], cartoes = [];
            try {
              for (const valor of visoes.valores) {
                Telas.definirEstadoInterno({ ...interno, [visoes.chave]: valor });
                const area2 = await desenharAba(aba.id, R, LARGURA_VISAO);
                areas.push(area2);
                const el = itensDaAba(aba.id, area2).find((x) => x.nome === it.nome)?.el;
                if (el && !el.querySelector(visoes.vazio)) cartoes.push(el);
              }
              if (cartoes.length) {
                const colunas = Math.min(2, cartoes.length), vao = 16;
                // A área fica fora da tela; o print é da grade de dentro (fotografar a própria área copiaria a posição
                // fora da tela e a imagem sairia vazia).
                const caixaFora = document.createElement("div"), grade = document.createElement("div");
                caixaFora.className = "area-captura";
                caixaFora.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;";
                grade.style.cssText = `width:${colunas * LARGURA_VISAO + (colunas - 1) * vao}px;display:grid;grid-template-columns:repeat(${colunas}, ${LARGURA_VISAO}px);gap:${vao}px;align-items:stretch;`; // cartões da mesma linha com a mesma altura (alinhados)
                caixaFora.append(grade);
                (document.querySelector(".viz-root") || document.body).append(caixaFora);
                areas.push(caixaFora);
                // Sem a margem entre cartões do painel (só o primeiro não tem), para os cartões da grade ficarem alinhados.
                cartoes.forEach((c) => { c.style.margin = "0"; grade.append(c); });
                await doisQuadros();
                const img = fotografar ? await foto(grade, fundo) : medida(grade);
                cache.set(chave, { w: img.w, h: img.h });
                blocos.push({ tipo: "foto", nome: it.nome, j, img });
              } else cache.set(chave, null);
            } finally { areas.forEach((a) => a.remove()); Telas.definirEstadoInterno(interno); }
          }
        } else if (!tabs.length || it.el.offsetHeight - (cab ? cab.offsetHeight : 0) > 90) {
          if (!fotografar) blocos.push({ tipo: "foto", nome: it.nome, j, img: medida(it.el) });
          else {
            // Cartão mais alto que o formato do slide (ex.: grade de anéis): testa desenhar mais largo, para o conteúdo
            // se redistribuir em menos fileiras, e fica com a largura em que o cartão aparece maior no slide.
            const tamanho = (el) => Math.min(CAIXA.w / el.offsetWidth, CAIXA.h / el.offsetHeight);
            let melhorEl = it.el, melhor = tamanho(it.el), extra = null;
            if (it.el.offsetWidth / it.el.offsetHeight < CAIXA.w / CAIXA.h * 0.8) {
              for (const larg of LARGURAS_EXTRAS.filter((x) => x > larguraAba)) {
                const area3 = await desenharAba(aba.id, R, larg);
                const el = itensDaAba(aba.id, area3).find((x) => x.nome === it.nome)?.el;
                if (el) tabelasDe(el).forEach((b) => { b.style.display = "none"; });
                if (el && tamanho(el) > melhor * 1.05) { if (extra) extra.remove(); extra = area3; melhorEl = el; melhor = tamanho(el); }
                else area3.remove();
              }
            }
            try { blocos.push({ tipo: "foto", nome: it.nome, j, img: await foto(melhorEl, fundo) }); } finally { if (extra) extra.remove(); }
          }
        }
        tabs.forEach((b, k) => {
          // Tabela: dados e medidas não mudam com a largura da aba (ficam em cache).
          const chave = `tabela|${it.nome}|${k}`;
          if (!cache.has(chave)) {
            const t = { tipo: "tabela", nome: it.nome, j, aba: aba.nome, abaId: aba.id, tabela: dadosTabela(b.dadosTabela()) };
            t.lay = layoutTabela(t.tabela); medirTabela(t);
            cache.set(chave, t);
          }
          blocos.push(cache.get(chave));
        });
      }
    } finally { area.remove(); }
    return blocos;
  }

  // ---------- Geração ----------
  async function gerar({ titulo, tema, aoAvancar = () => {} }) {
    await carregar("js/vendor/pptxgen.bundle.js", "PptxGenJS");
    await carregar("js/vendor/html-to-image.js", "htmlToImage");
    const R = window.Painel?.resultado();
    if (!R) throw new Error("Selecione ao menos um mês no filtro de período.");
    const escolhidas = abas().filter((a) => escolhaDe(a.id).marcada);
    if (!escolhidas.length) throw new Error("Marque ao menos uma aba ou um gráfico.");
    const info = {
      titulo, filtros: window.Painel.filtrosAplicados(), pAtual: Telas.textoPeriodo(R.S), pAnterior: R.temC ? Telas.textoPeriodo(R.C) : "",
      parcial: R.S.includes(Motor.mesParcial) ? Motor.mesParcial : null,
    };
    const periodo = info.pAnterior ? `${info.pAtual} vs ${info.pAnterior}` : info.pAtual;
    const T = TEMAS[tema];

    // Tema dos prints: troca o tema da página só durante a geração e depois volta.
    const raiz = document.documentElement, temaAntes = raiz.dataset.theme;
    raiz.dataset.theme = tema === "escuro" ? "dark" : "light";
    const fotos = []; // { aba, nomes, blocos: [{ tipo: "foto", img } | { tipo: "tabela", tabela }] }
    try {
      for (const [i, aba] of escolhidas.entries()) {
        aoAvancar(`Fotografando ${aba.nome} (${i + 1} de ${escolhidas.length})…`);
        const area = await desenharAba(aba.id, R);
        try {
          const fundo = getComputedStyle(document.querySelector(".viz-root")).backgroundColor, fundoPagina = fundo;
          const fora = escolhaDe(aba.id).fora;
          const itens = itensDaAba(aba.id, area).filter((it) => !fora.has(it.nome));
          const blocos = [];
          if (aba.id === GERAIS) {
            // Uma faixa só com os cartões escolhidos, lado a lado (como no painel).
            const k = faixaGerais(area), manter = new Set(itens.map((it) => it.el));
            if (k && manter.size) {
              [...k.children].forEach((e) => { if (!manter.has(e)) e.remove(); });
              k.style.gridTemplateColumns = `repeat(${Math.min(4, manter.size)}, minmax(0, 1fr))`; // até 4 por linha: cartões largos, sem texto saindo
              await doisQuadros();
              blocos.push({ tipo: "foto", nome: itens.map((it) => it.nome).join(", "), j: 0, img: await foto(k, fundo) });
            }
          } else {
            // Largura da aba: desenha em algumas larguras só medindo os cartões, simula o encaixe e escolhe a que dá
            // menos slides e mais área ocupada (sem deixar a letra abaixo do mínimo); depois fotografa nessa largura.
            const base = largura(), minimo = 0.7 * (CAIXA.w / base), cache = new Map();
            let escolhida = base, melhor = null;
            for (const larg of LARGURAS_ABA) {
              aoAvancar(`Organizando ${aba.nome} (${i + 1} de ${escolhidas.length})…`);
              const medidos = await coletarAba(aba, R, larg, false, cache, fundoPagina, () => {});
              const plano = montarSlides(medidos, base);
              const legivel = larg === base || plano.every((p) => !p.linhasImg.flat().length || p.escala >= minimo * 0.999);
              const nota = { slides: plano.length, ocupa: plano.reduce((a, p) => a + p.ocupa, 0) };
              if (legivel && (!melhor || nota.slides < melhor.slides || (nota.slides === melhor.slides && nota.ocupa > melhor.ocupa + 0.05))) { melhor = nota; escolhida = larg; }
            }
            blocos.push(...await coletarAba(aba, R, escolhida, true, cache, fundoPagina, (t) => aoAvancar(`Fotografando ${aba.nome} (${i + 1} de ${escolhidas.length}): ${t}`)));
          }
          if (blocos.length) fotos.push({ aba, nomes: itens.map((it) => it.nome), blocos });
        } finally { area.remove(); }
      }
    } finally {
      if (temaAntes) raiz.dataset.theme = temaAntes; else delete raiz.dataset.theme;
    }
    if (!fotos.length) throw new Error("Nenhum gráfico escolhido tem conteúdo para o filtro aplicado.");

    // Tabelas: link "Abrir no painel" (mesmos filtros, rola até a tabela) e aba na planilha.
    const tabelas = fotos.flatMap((f) => f.blocos.filter((b) => b.tipo === "tabela"));
    const usados = new Set(["filtros"]);
    let semLink = false;
    for (const [k, b] of tabelas.entries()) {
      aoAvancar(`Preparando as tabelas (${k + 1} de ${tabelas.length})…`);
      b.lay = layoutTabela(b.tabela);
      medirTabela(b);
      b.abaPlanilha = nomeAba(b.nome, usados);
      try { b.link = await window.Painel.criarLink({ aba: b.abaId, cartao: b.nome }); } catch { b.link = null; semLink = true; }
    }

    aoAvancar("Montando o PowerPoint…");
    const pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = titulo;
    pptx.subject = `Diagnóstico Comercial · ${periodo}`;
    const resumoFiltros = info.filtros.length ? `Filtros: ${info.filtros.map(([r, v]) => `${r}: ${v.join(", ")}`).join("; ")}` : "Sem filtros (empresa toda)";
    pptx.defineSlideMaster({
      title: "PAINEL", background: { color: T.fundo },
      objects: [
        { rect: { x: 0.4, y: 7.02, w: 12.53, h: 0.01, fill: { color: T.linha }, line: { color: T.linha, width: 0 } } },
        { text: { text: corta(`Diagnóstico Comercial · ${periodo} · ${resumoFiltros}`, 170), options: { x: 0.4, y: 7.07, w: 11.6, h: 0.28, fontFace: FONTE, fontSize: 8, color: T.muted, margin: 0 } } },
      ],
      slideNumber: { x: 12.43, y: 7.07, w: 0.5, h: 0.28, fontFace: FONTE, fontSize: 9, color: T.muted, align: "right" },
    });
    capa(pptx, info);
    // Páginas: capa = 1, sumário, slides de cada aba (gráficos e tabelas na ordem do painel, encaixados sem buracos).
    // Análises gerais é um slide só, com os cartões escolhidos como subseções na mesma página.
    const larguraPainel = largura(); // base da letra legível: print na largura normal da área ocupando o slide todo
    let pagina = 2 + Math.ceil(fotos.reduce((t, f) => t + 1 + f.nomes.length, 0) / LINHAS_SUMARIO);
    const entradas = [], slides = [];
    fotos.forEach((f, i) => {
      const ABA = f.aba.nome.toUpperCase();
      entradas.push({ numero: `${i + 1}`, titulo: f.aba.nome, pagina, primaria: true });
      if (f.aba.id === GERAIS) {
        f.nomes.forEach((nome, j) => entradas.push({ numero: `${i + 1}.${j + 1}`, titulo: nome, pagina }));
        f.blocos.forEach((b) => { slides.push({ tag: `${i + 1} ${ABA}`, p: planoSlide([b], 0) }); pagina += 1; });
        return;
      }
      const numeroDe = new Map();
      const registrar = (j, nome) => { if (!numeroDe.has(j)) { numeroDe.set(j, `${i + 1}.${numeroDe.size + 1}`); entradas.push({ numero: numeroDe.get(j), titulo: nome, pagina }); } return numeroDe.get(j); };
      for (const p of montarSlides(f.blocos, larguraPainel)) {
        const numeros = [...new Set(p.blocos.map((b) => registrar(b.j, b.nome)))];
        slides.push({ tag: `${numeros.join(", ")} ${ABA}`, p });
        pagina += 1;
      }
    });
    sumario(pptx, T, entradas);
    for (const sl of slides) slideMisto(pptx, T, sl.tag, periodo, sl.p);
    const hoje = new Date().toISOString().slice(0, 10);
    const S = R.S.slice().sort(), per = [S[0], S.at(-1)].map((p) => `${p.slice(0, 4)}-${p.slice(4)}`).join("_a_");
    await pptx.writeFile({ fileName: `Diagnostico_Comercial_${per}_${hoje}.pptx`, compression: true }); // compactado: tabelas grandes geram muito XML
    if (tabelas.length) {
      aoAvancar("Montando a planilha com as tabelas completas…");
      await gerarPlanilha(info, tabelas, `Diagnostico_Comercial_${per}_${hoje}_tabelas.xlsx`);
    }
    return { semLink };
  }

  // ---------- Janela de escolha ----------
  const el = (tag, attrs = {}, html = "") => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } if (html) e.innerHTML = html; return e; };

  function abrir() {
    const R = window.Painel?.resultado();
    const filtros = window.Painel?.filtrosAplicados() || [];
    const fundo = el("div", { class: "modal-fundo" });
    const janela = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "titulo-exportar" });
    fundo.append(janela);
    let ocupado = false;
    // Miniatura ao passar o mouse no nome do gráfico: as abas abertas na lista ficam desenhadas fora da tela enquanto a
    // janela está aberta; a foto pequena é tirada na primeira vez e guardada (uma de cada vez, na ordem).
    const areas = [], miniaturas = new Map();
    let fila = Promise.resolve(), sobre = null;
    const dica = el("div", { class: "miniatura-grafico", hidden: "" });
    const posicionar = (ev) => {
      const w = dica.offsetWidth || 400, h = dica.offsetHeight || 260;
      let x = ev.clientX + 18, y = ev.clientY + 14;
      if (x + w > innerWidth - 8) x = ev.clientX - w - 18;
      if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
      dica.style.left = `${Math.max(8, x)}px`; dica.style.top = `${y}px`;
    };
    function miniatura(chave, elemento) {
      if (!miniaturas.has(chave)) {
        const p = fila.then(async () => {
          await carregar("js/vendor/html-to-image.js", "htmlToImage");
          cortarLinhas(elemento);
          const w = elemento.offsetWidth, h = elemento.offsetHeight;
          const fundoPag = getComputedStyle(document.querySelector(".viz-root") || document.body).backgroundColor;
          return window.htmlToImage.toPng(elemento, { pixelRatio: Math.min(1, 800 / Math.max(w, 1)), backgroundColor: fundoPag, filter: semBotoes, width: w, height: h, style: { margin: "0" }, skipFonts: true });
        });
        fila = p.catch(() => {});
        miniaturas.set(chave, p);
      }
      return miniaturas.get(chave);
    }
    function ligarMiniatura(rot, chave, elemento) {
      rot.addEventListener("mouseenter", async (ev) => {
        sobre = chave;
        dica.hidden = false;
        dica.innerHTML = '<span class="carregando">Carregando miniatura…</span>';
        posicionar(ev);
        try {
          const dados = await miniatura(chave, elemento);
          if (sobre !== chave) return;
          dica.innerHTML = "";
          const img = el("img", { alt: "" });
          img.onload = () => posicionar(ev);
          img.src = dados;
          dica.append(img);
        } catch { if (sobre === chave) dica.innerHTML = '<span class="carregando">Miniatura indisponível.</span>'; }
      });
      rot.addEventListener("mousemove", posicionar);
      rot.addEventListener("mouseleave", () => { sobre = null; dica.hidden = true; });
    }
    const fechar = () => { if (ocupado) return; fundo.remove(); dica.remove(); areas.forEach((a) => a.remove()); document.removeEventListener("keydown", tecla); };
    const tecla = (ev) => { if (ev.key === "Escape") fechar(); };
    document.addEventListener("keydown", tecla);
    fundo.addEventListener("click", (ev) => { if (ev.target === fundo) fechar(); });

    janela.append(el("h2", { id: "titulo-exportar" }, "Exportar apresentação"));
    const periodo = R ? `Período: <strong>${Fmt.esc(Telas.textoPeriodo(R.S))}</strong>${R.temC ? ` comparado com <strong>${Fmt.esc(Telas.textoPeriodo(R.C))}</strong>` : " (sem período de comparação)"}` : "Selecione ao menos um mês no filtro de período.";
    janela.append(el("div", { class: "modal-resumo" }, `<div>${periodo}</div><div>${filtros.length ? `Filtros aplicados: ${filtros.map(([r, v]) => `<strong>${Fmt.esc(r)}:</strong> ${Fmt.esc(corta(v.join(", "), 90))}`).join(" · ")}` : "Sem filtros: <strong>empresa toda</strong>"}</div><div class="nota-filtro">Os gráficos saem como estão no painel, com os filtros aplicados agora. Tabelas entram com as linhas e colunas que couberem no slide; as tabelas completas vão numa planilha Excel baixada junto. Para mudar, feche esta janela e ajuste os filtros.</div>`));

    const linhaCampos = el("div", { class: "modal-campos" });
    const campo = el("label", { class: "campo" }, "<span>Título da apresentação</span>");
    const entrada = el("input", { type: "text", maxlength: "80" });
    entrada.value = tituloSalvo;
    campo.append(entrada);
    const temaAtual = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark" ? "escuro" : "claro";
    const campoTema = el("div", { class: "campo" }, `<span>Cores dos gráficos</span><div class="opcoes-tema">
      <label><input type="radio" name="tema-apresentacao" value="claro"${temaAtual === "claro" ? " checked" : ""}> Claro</label>
      <label><input type="radio" name="tema-apresentacao" value="escuro"${temaAtual === "escuro" ? " checked" : ""}> Escuro</label></div>`);
    linhaCampos.append(campo, campoTema);
    janela.append(linhaCampos);

    // Uma lista por aba: caixa da aba (marca/desmarca tudo) e seta que abre os gráficos da aba.
    const listas = el("div", { class: "lista-abas" });
    const contagens = new Map(); // id -> { total, atualizar }
    // Botão único que alterna: com tudo marcado vira "Desmarcar todos"; senão, "Marcar todos".
    const botaoTodos = el("button", { type: "button", class: "btn ghost" });
    const tudoMarcado = () => abas().every((a) => { const e = escolhaDe(a.id); return e.marcada && !e.fora.size; });
    const rotularTodos = () => { botaoTodos.textContent = tudoMarcado() ? "Desmarcar todos" : "Marcar todos"; };
    for (const aba of abas()) {
      const est = escolhaDe(aba.id);
      const bloco = el("div", { class: "lista-aba" });
      const topo = el("div", { class: "lista-aba-topo" });
      const cx = el("input", { type: "checkbox", "aria-label": `Incluir ${aba.nome}` });
      cx.checked = est.marcada;
      const abre = el("button", { type: "button", class: "lista-aba-abrir", "aria-expanded": "false" }, `<span class="seta">▸</span> ${Fmt.esc(aba.nome)}`);
      const conta = el("span", { class: "lista-aba-conta" });
      topo.append(cx, abre, conta);
      const corpo = el("div", { class: "lista-aba-itens", hidden: "" });
      bloco.append(topo, corpo);
      listas.append(bloco);
      let itens = null, caixas = [];
      const atualizar = () => {
        // Lista ainda fechada: a caixa da aba acompanha a seleção (marcada, parcial ou vazia).
        if (!itens) { conta.textContent = est.marcada ? (est.fora.size ? "parcial" : "todos") : ""; cx.checked = est.marcada; cx.indeterminate = est.marcada && est.fora.size > 0; rotularTodos(); return; }
        const n = est.marcada ? itens.filter((it) => !est.fora.has(it)).length : 0;
        conta.textContent = `${n} de ${itens.length}`;
        cx.checked = n > 0; cx.indeterminate = n > 0 && n < itens.length;
        caixas.forEach((c) => { c.checked = est.marcada && !est.fora.has(c.dataset.nome); });
        rotularTodos();
      };
      contagens.set(aba.id, atualizar);
      cx.addEventListener("change", () => { est.marcada = cx.checked; est.fora.clear(); atualizar(); });
      abre.addEventListener("click", async () => {
        const aberto = abre.getAttribute("aria-expanded") === "true";
        abre.setAttribute("aria-expanded", aberto ? "false" : "true");
        corpo.hidden = aberto;
        if (aberto || itens || !R) return;
        corpo.innerHTML = '<p class="nota-filtro">Carregando os gráficos da aba…</p>';
        const area = await desenharAba(aba.id, R);
        areas.push(area); // fica desenhada para as miniaturas; sai ao fechar a janela
        const elementos = itensDaAba(aba.id, area);
        itens = elementos.map((it) => it.nome);
        corpo.innerHTML = itens.length ? "" : '<p class="nota-filtro">Nenhum gráfico nesta aba para o filtro aplicado.</p>';
        caixas = itens.map((nome) => {
          const c = el("input", { type: "checkbox" });
          c.dataset.nome = nome;
          c.addEventListener("change", () => {
            if (c.checked) { if (!est.marcada) { est.marcada = true; itens.forEach((x) => est.fora.add(x)); } est.fora.delete(nome); } else est.fora.add(nome);
            if (itens.every((x) => est.fora.has(x))) { est.marcada = false; est.fora.clear(); }
            atualizar();
          });
          const rot = el("label", {});
          // Tabelas: mostra o tamanho (no slide entram as linhas que couberem; completas no painel e na planilha).
          const elemento = elementos.find((it) => it.nome === nome).el;
          const nLinhas = tabelasDe(elemento).reduce((a, b) => a + b.dadosTabela().linhas.length, 0);
          const texto = el("span", {}, `${Fmt.esc(nome)}${nLinhas ? ` <small>(tabela com ${Fmt.num(nLinhas)} ${nLinhas === 1 ? "linha" : "linhas"})</small>` : ""}`);
          rot.append(c, texto);
          ligarMiniatura(texto, `${aba.id}|${nome}`, elemento);
          corpo.append(rot);
          return c;
        });
        atualizar();
      });
      atualizar();
    }
    janela.append(listas);

    const msg = el("div", { class: "modal-msg", role: "status" });
    const acoes = el("div", { class: "modal-acoes" });
    const todas = (v) => { for (const a of abas()) { const e = escolhaDe(a.id); e.marcada = v; e.fora.clear(); contagens.get(a.id)(); } };
    const esq = el("div");
    botaoTodos.addEventListener("click", () => todas(!tudoMarcado()));
    rotularTodos();
    esq.append(botaoTodos);
    const dir = el("div");
    const gerarBtn = el("button", { type: "button", class: "btn primario" }, "Gerar PowerPoint");
    const cancelar = el("button", { type: "button", class: "btn", onclick: fechar }, "Cancelar");
    dir.append(cancelar, gerarBtn);
    acoes.append(esq, dir);
    janela.append(msg, acoes);
    if (!R) gerarBtn.disabled = true;
    gerarBtn.addEventListener("click", async () => {
      tituloSalvo = entrada.value.trim() || "Resultados comerciais";
      const tema = janela.querySelector('input[name="tema-apresentacao"]:checked')?.value || "claro";
      ocupado = true; gerarBtn.disabled = true; cancelar.disabled = true; gerarBtn.textContent = "Gerando…"; msg.className = "modal-msg";
      try {
        const { semLink } = await gerar({ titulo: tituloSalvo, tema, aoAvancar: (t) => { msg.textContent = t; } });
        ocupado = false;
        if (!semLink) fechar();
        else { msg.className = "modal-msg erro"; msg.textContent = "Apresentação gerada, mas sem o botão \"Abrir no painel\" em algumas tabelas: não foi possível falar com o servidor. A planilha traz as tabelas completas."; gerarBtn.disabled = false; cancelar.disabled = false; gerarBtn.textContent = "Gerar PowerPoint"; }
      } catch (e) {
        console.error(e);
        ocupado = false; msg.className = "modal-msg erro"; msg.textContent = `Não foi possível gerar a apresentação: ${e.message}`;
        gerarBtn.disabled = false; cancelar.disabled = false; gerarBtn.textContent = "Gerar PowerPoint";
      }
    });
    // Dentro do .viz-root, onde ficam as cores do tema (claro/escuro).
    (document.querySelector(".viz-root") || document.body).append(fundo, dica);
    entrada.focus();
  }

  window.Apresentacao = { gerar, abrir };
  document.getElementById("exportar-apresentacao")?.addEventListener("click", abrir);
})();
