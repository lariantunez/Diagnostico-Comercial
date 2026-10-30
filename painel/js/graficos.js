// Gráficos em SVG puro (sem dependências). Barras finas com ponta arredondada, linhas de 2px,
// grade em linha fina, tooltip em todas as marcas.
const Graf = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const tip = () => document.getElementById("tooltip");
  // Escala dos eixos: abreviada (Fmt.eixo) quando o formato é de valor; formatos próprios (%, preço) ficam como estão.
  const eixo = (fmt) => ([Fmt.numc, Fmt.rs, Fmt.rs0, Fmt.rsc].includes(fmt) ? Fmt.eixo : fmt);

  // Valor com sinal explícito (+ ou −) é uma variação: verde quando sobe, vermelho quando cai.
  const sinalDoTexto = (v) => { const s = String(v ?? "").trim(); return /^\+\s*(R\$\s*)?\d/.test(s) ? "sobe" : /^[−-]\s*(R\$\s*)?\d/.test(s) ? "desce" : ""; };
  // linhas: [rótulo, valor, classe opcional], ex.: "atual" pinta a linha do período atual de azul.
  // Texto (string) em vez de linhas: corpo HTML já montado (ex.: balão no formato dos cartões, UI.tipCartao).
  function mostrarTooltip(ev, titulo, linhas) {
    const t = tip();
    t.innerHTML = `<div class="t-titulo">${Fmt.esc(Fmt.nome(titulo))}</div>${typeof linhas === "string" ? linhas : (linhas || []).map(([k, v, classe]) => `<div class="t-linha${classe ? ` ${classe}` : ""}"><span>${Fmt.esc(k)}</span><span class="${sinalDoTexto(v)}">${Fmt.esc(Fmt.nome(v))}</span></div>`).join("")}`;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    t.style.left = `${x}px`; t.style.top = `${y}px`;
  }
  const esconderTooltip = () => { tip().hidden = true; };

  function ticks(min, max, n = 5) {
    if (min === max) { max = min + 1; }
    const passoBruto = (max - min) / n;
    const mag = 10 ** Math.floor(Math.log10(Math.abs(passoBruto)));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= passoBruto) || 10 * mag;
    const ini = Math.floor(min / passo) * passo, fim = Math.ceil(max / passo) * passo;
    const out = [];
    for (let v = ini; v <= fim + passo / 2; v += passo) out.push(Math.round(v / passo) * passo || 0);
    return out;
  }

  function caixa(altura) {
    const div = document.createElement("div");
    div.className = "grafico";
    div.style.minHeight = `${altura}px`;
    return div;
  }
  const larguraDe = (el, padrao = 640) => Math.max(280, (el && el.clientWidth) || padrao);

  // Barra vertical com topo arredondado (4px) e base reta.
  function pathColuna(x, y0, y1, w) {
    const r = Math.min(4, w / 2, Math.abs(y1 - y0));
    if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }
  function pathBarraH(x0, x1, y, h) {
    const r = Math.min(4, h / 2, Math.abs(x1 - x0));
    if (x1 >= x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
  }

  function ligarHover(div, itens) {
    div.querySelectorAll("[data-i]").forEach((el) => {
      const it = itens[Number(el.dataset.i)];
      el.addEventListener("mousemove", (ev) => mostrarTooltip(ev, it.titulo ?? it.rotulo, it.tooltip));
      el.addEventListener("mouseleave", esconderTooltip);
      if (it.onClick) { el.style.cursor = "pointer"; el.addEventListener("click", it.onClick); }
    });
  }

  // Colunas mensais. itens: [{rotulo, valor, estado: "S"|"C"|"", tooltip}]
  function colunas(alvo, { itens, altura = 240, fmt = Fmt.numc, legenda = true, rotulosValor = false, larguraMax = 24 }) {
    const div = caixa(altura);
    const W = larguraDe(alvo), H = altura, m = { t: 12, r: 8, b: 30, l: 56 };
    const vals = itens.map((d) => d.valor);
    const tk = ticks(Math.min(0, ...vals), Math.max(0, ...vals));
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - tk[0]) / (tk.at(-1) - tk[0]));
    const banda = (W - m.l - m.r) / Math.max(1, itens.length);
    const w = Math.max(2, Math.min(larguraMax, banda - 2));
    const cor = { S: "var(--series-1)", C: "var(--series-2)", "": "var(--muted-mark)" };
    const passoRot = Math.ceil(itens.length / Math.floor((W - m.l) / 46));
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    for (const t of tk) s += `<line class="grade-linha" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${eixo(fmt)(t)}</text>`;
    itens.forEach((d, i) => {
      const x = m.l + i * banda + (banda - w) / 2;
      s += `<path class="marca" d="${pathColuna(x, y(0), y(d.valor), w)}" fill="${d.cor || cor[d.estado || ""]}"/>`;
      if (rotulosValor) s += `<text class="rotulo-dado" x="${m.l + i * banda + banda / 2}" y="${y(Math.max(0, d.valor)) - 6}" text-anchor="middle">${Fmt.esc(fmt(d.valor))}</text>`;
      s += `<rect class="alvo" data-i="${i}" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${H - m.t - m.b}"/>`;
      if (i % passoRot === 0) s += `<text x="${m.l + i * banda + banda / 2}" y="${H - 10}" text-anchor="middle">${Fmt.esc(d.rotulo)}</text>`;
    });
    s += `<line class="eixo" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    div.innerHTML = (legenda ? `<div class="legenda"><span><i style="--c:var(--series-1)"></i>Período selecionado</span><span><i style="--c:var(--series-2)"></i>Período de comparação</span><span><i style="--c:var(--muted-mark)"></i>Demais meses</span></div>` : "") + s;
    ligarHover(div, itens);
    return div;
  }

  // Colunas comparadas: um par por item (período atual × comparação). Acima do par: valor atual e variação % colorida.
  // itens: [{rotulo, atual, anterior, texto, variacao, corVariacao, tooltip, onClick, apagado}]
  function colunasComparadas(alvo, { itens, altura = 300, fmt = Fmt.numc, legendaAtual = "", legendaAnterior = "" }) {
    const div = caixa(altura);
    if (!itens.length) { div.innerHTML = `<p class="vazio">Sem dados</p>`; return div; }
    const W = larguraDe(alvo), H = altura, m = { t: 40, r: 8, b: 34, l: 56 };
    const tk = ticks(0, Math.max(0, ...itens.flatMap((d) => [d.atual, d.anterior])));
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (Math.max(0, v) - tk[0]) / (tk.at(-1) - tk[0]));
    const banda = (W - m.l - m.r) / itens.length;
    const w = Math.max(6, Math.min(34, (banda - 18) / 2));
    const maxCh = Math.max(6, Math.floor(banda / 6.6));
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    for (const t of tk) s += `<line class="grade-linha" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${eixo(fmt)(t)}</text>`;
    itens.forEach((d, i) => {
      const cx = m.l + i * banda + banda / 2;
      const op = d.apagado ? ' opacity="0.3"' : "";
      s += `<path class="marca" d="${pathColuna(cx - w - 1, y(0), y(d.atual), w)}" fill="var(--series-1)"${op}/>`;
      s += `<path class="marca" d="${pathColuna(cx + 1, y(0), y(d.anterior), w)}" fill="var(--muted-mark)"${op}/>`;
      const topo = y(Math.max(d.atual, d.anterior));
      s += `<text class="rotulo-dado" x="${cx}" y="${topo - 20}" text-anchor="middle"${op}>${Fmt.esc(d.texto ?? fmt(d.atual))}</text>`;
      if (d.variacao) s += `<text class="rotulo-dado" x="${cx}" y="${topo - 6}" text-anchor="middle" style="fill:${d.corVariacao || "var(--text-secondary)"}"${op}>${Fmt.esc(d.variacao)}</text>`;
      const nome = Fmt.nome(d.rotulo);
      s += `<text class="rotulo-cat" x="${cx}" y="${H - 12}" text-anchor="middle">${Fmt.esc(nome.length > maxCh ? `${nome.slice(0, maxCh - 1)}…` : nome)}</text>`;
      s += `<rect class="alvo" data-i="${i}" x="${m.l + i * banda}" y="0" width="${banda}" height="${H}"/>`;
    });
    s += `<line class="eixo" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    div.innerHTML = `<div class="legenda"><span><i style="--c:var(--series-1)"></i>${Fmt.esc(legendaAtual)}</span><span><i style="--c:var(--muted-mark)"></i>${Fmt.esc(legendaAnterior)}</span></div>` + s;
    ligarHover(div, itens);
    return div;
  }

  // Linhas. x: rótulos; series: [{nome, valores, cor}]; destaque: índices de x em destaque (faixa)
  // aoClicar(i): clique no mês i (o mês mais próximo do cursor).
  function linhas(alvo, { x, series, altura = 200, fmt = Fmt.numc, fmtTip = fmt, destaque = null, zeroBase = true, aoClicar = null }) {
    const div = caixa(altura);
    const W = larguraDe(alvo), H = altura, m = { t: 12, r: 12, b: 28, l: 56 };
    const todos = series.flatMap((s) => s.valores.filter((v) => v !== null && Number.isFinite(v)));
    if (!todos.length) { div.innerHTML = `<p class="vazio">Sem dados</p>`; return div; }
    const tk = ticks(zeroBase ? Math.min(0, ...todos) : Math.min(...todos), Math.max(...todos));
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - tk[0]) / (tk.at(-1) - tk[0]));
    const passo = (W - m.l - m.r) / Math.max(1, x.length - 1);
    const xp = (i) => m.l + i * passo;
    const passoRot = Math.ceil(x.length / Math.floor((W - m.l) / 46));
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    if (destaque) destaque.forEach((i) => { s += `<rect x="${xp(i) - passo / 2}" y="${m.t}" width="${passo}" height="${H - m.t - m.b}" fill="var(--wash)"/>`; });
    for (const t of tk) s += `<line class="grade-linha" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${eixo(fmt)(t)}</text>`;
    x.forEach((r, i) => { if (i % passoRot === 0) s += `<text x="${xp(i)}" y="${H - 9}" text-anchor="middle">${Fmt.esc(r)}</text>`; });
    for (const se of series) {
      let d = "", aberto = false;
      se.valores.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { aberto = false; return; }
        d += `${aberto ? "L" : "M"}${xp(i)},${y(v)}`; aberto = true;
      });
      s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const ult = se.valores.findLastIndex((v) => v !== null && Number.isFinite(v));
      if (ult >= 0) s += `<circle cx="${xp(ult)}" cy="${y(se.valores[ult])}" r="4" fill="${se.cor}" stroke="var(--surface-1)" stroke-width="2"/>`;
    }
    s += `<line class="cursor" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--axis)" visibility="hidden"/>`;
    s += `<rect class="alvo" x="${m.l - passo / 2}" y="${m.t}" width="${W - m.l - m.r + passo}" height="${H - m.t - m.b}"/></svg>`;
    const leg = series.length > 1 ? `<div class="legenda">${series.map((se) => `<span><i class="linha" style="--c:${se.cor}"></i>${Fmt.esc(se.nome)}</span>`).join("")}</div>` : "";
    div.innerHTML = leg + s;
    const svg = div.querySelector("svg"), cursor = div.querySelector(".cursor"), alvoR = div.querySelector(".alvo");
    const indice = (ev) => {
      const b = svg.getBoundingClientRect();
      const px = (ev.clientX - b.left) * (W / b.width);
      return Math.max(0, Math.min(x.length - 1, Math.round((px - m.l) / passo)));
    };
    if (aoClicar) { alvoR.style.cursor = "pointer"; alvoR.addEventListener("click", (ev) => aoClicar(indice(ev))); }
    alvoR.addEventListener("mousemove", (ev) => {
      const i = indice(ev);
      cursor.setAttribute("x1", xp(i)); cursor.setAttribute("x2", xp(i)); cursor.setAttribute("visibility", "visible");
      mostrarTooltip(ev, x[i], series.map((se) => [se.nome, fmtTip(se.valores[i])]));
    });
    alvoR.addEventListener("mouseleave", () => { cursor.setAttribute("visibility", "hidden"); esconderTooltip(); });
    return div;
  }

  // Barras horizontais ranqueadas. divergente: positivo/negativo com cores opostas.
  // Cores cinza das marcas: o texto em destaque (%) usa o cinza do texto, senão fica sem contraste no tema escuro.
  const CINZAS = ["var(--muted-mark)", "var(--axis)", "var(--mapa-estavel)"];
  function barrasH(alvo, { itens, fmt = Fmt.numc, divergente = false, larguraRotulo = 190, alturaBarra = 14, gap = 8 }) {
    const div = caixa(40);
    if (!itens.length) { div.innerHTML = `<p class="vazio">Sem dados</p>`; return div; }
    // Espaço para os rótulos de valor calculado pelo tamanho do texto (~6,4px por caractere a 11px).
    // d.textoCor: trecho final do rótulo (ex.: "(20,5%)") pintado na cor da barra, para contrastar com o valor.
    const textoDe = (d) => String(d.texto ?? fmt(d.valor)) + (d.textoCor ? ` ${d.textoCor}` : "");
    const larguraTexto = (lista) => lista.reduce((mx, d) => Math.max(mx, textoDe(d).length * 6.4 + 10), 0);
    const W = larguraDe(alvo);
    // Rótulo inteiro sempre que couber: alarga a coluna até 35% do gráfico antes de cortar o texto.
    larguraRotulo = Math.max(larguraRotulo, Math.min(W * 0.35, Math.max(...itens.map((d) => String(d.rotulo).length)) * 6.6 + 10));
    const m = { t: 4, r: Math.max(24, larguraTexto(itens.filter((d) => d.valor >= 0))), b: 4, l: larguraRotulo };
    const H = m.t + m.b + itens.length * (alturaBarra + gap);
    const vals = itens.map((d) => d.valor);
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    const larg = W - m.l - m.r;
    const esq = min < 0 ? larguraTexto(itens.filter((d) => d.valor < 0)) : 0;
    const x = (v) => m.l + esq + (larg - esq) * ((v - min) / ((max - min) || 1));
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    const corte = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
    const maxCh = Math.floor(larguraRotulo / 6.6);
    itens.forEach((d, i) => {
      const yy = m.t + i * (alturaBarra + gap);
      const cor = d.cor || (divergente ? (d.valor >= 0 ? "var(--div-pos)" : "var(--div-neg)") : "var(--series-1)");
      s += `<text class="rotulo-cat" x="${m.l - 8}" y="${yy + alturaBarra - 3}" text-anchor="end">${Fmt.esc(corte(Fmt.nome(d.rotulo), maxCh))}</text>`;
      if (d.valor) s += `<path class="marca" d="${pathBarraH(x(0), x(d.valor), yy, alturaBarra)}" fill="${cor}"${d.apagado ? ' opacity="0.3"' : ""}/>`;
      const lx = d.valor >= 0 ? x(d.valor) + 6 : x(d.valor) - 6;
      s += `<text class="rotulo-dado" x="${lx}" y="${yy + alturaBarra - 3}" text-anchor="${d.valor >= 0 ? "start" : "end"}">${Fmt.esc(d.texto ?? fmt(d.valor))}${d.textoCor ? ` <tspan style="fill:${CINZAS.includes(cor) ? "var(--text-secondary)" : cor}">${Fmt.esc(d.textoCor)}</tspan>` : ""}</text>`;
      s += `<rect class="alvo" data-i="${i}" x="0" y="${yy - gap / 2}" width="${W}" height="${alturaBarra + gap}"/>`;
    });
    s += `<line class="eixo" x1="${x(0)}" x2="${x(0)}" y1="0" y2="${H}"/></svg>`;
    div.innerHTML = s;
    ligarHover(div, itens);
    return div;
  }

  // Cascata (ponte). passos: [{rotulo, valor, total: bool, tooltip}]
  function cascata(alvo, { passos, altura = 300, fmt = Fmt.rsc }) {
    const div = caixa(altura);
    const W = larguraDe(alvo), H = altura, m = { t: 22, r: 8, b: 44, l: 64 };
    let acc = 0;
    const barras = passos.map((p) => {
      if (p.total) { acc = p.valor; return { ...p, de: 0, ate: p.valor }; }
      const de = acc; acc += p.valor; return { ...p, de, ate: acc };
    });
    const ext = barras.flatMap((b) => [b.de, b.ate]);
    const tk = ticks(Math.min(0, ...ext), Math.max(...ext));
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - tk[0]) / (tk.at(-1) - tk[0]));
    const banda = (W - m.l - m.r) / barras.length;
    const w = Math.min(48, banda * 0.6);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    for (const t of tk) s += `<line class="grade-linha" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${eixo(fmt)(t)}</text>`;
    barras.forEach((b, i) => {
      const x = m.l + i * banda + (banda - w) / 2;
      const cor = b.total ? "var(--series-7)" : b.valor >= 0 ? "var(--div-pos)" : "var(--div-neg)";
      const y0 = y(Math.min(b.de, b.ate)), y1 = y(Math.max(b.de, b.ate));
      s += `<rect class="marca" x="${x}" y="${y1}" width="${w}" height="${Math.max(1, y0 - y1)}" rx="3" fill="${cor}"/>`;
      if (i < barras.length - 1) s += `<line x1="${x + w}" x2="${m.l + (i + 1) * banda + (banda - w) / 2}" y1="${y(b.ate)}" y2="${y(b.ate)}" stroke="var(--axis)"/>`;
      const txt = b.total ? fmt(b.valor) : Fmt.varRs(b.valor);
      s += `<text class="rotulo-dado" x="${x + w / 2}" y="${y1 - 6}" text-anchor="middle">${txt}</text>`;
      const partes = b.rotulo.split("\n");
      partes.forEach((pt, k) => { s += `<text class="rotulo-cat" x="${m.l + i * banda + banda / 2}" y="${H - m.b + 16 + k * 13}" text-anchor="middle">${Fmt.esc(Fmt.nome(pt))}</text>`; });
      s += `<rect class="alvo" data-i="${i}" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${H - m.t - m.b}"/>`;
    });
    s += `<line class="eixo" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    div.innerHTML = s;
    ligarHover(div, barras.map((b) => ({ titulo: b.rotulo.replace("\n", " "), tooltip: b.tooltip || [["Valor", b.total ? Fmt.rs(b.valor) : Fmt.varRsCheio(b.valor)]] })));
    return div;
  }

  // Rosca (pizza vazada). fatias: [{rotulo, valor >= 0, cor, tooltip}]; centro: {valor, legenda}.
  // Fatias separadas por 2px da cor do cartão; percentual direto na legenda ao lado.
  function pizza(alvo, { fatias, centro = null, tamanho = 220, fmtValor = Fmt.rs0, tituloLegenda = "", sufixoPct = "", rotulosFatias = false }) {
    const div = caixa(tamanho);
    div.classList.add("grafico-pizza");
    const total = fatias.reduce((a, f) => a + Math.max(0, f.valor), 0);
    const R = tamanho / 2, r = R * 0.62, cx = R, cy = R;
    const ponto = (raio, ang) => [cx + raio * Math.sin(ang), cy - raio * Math.cos(ang)];
    let s = `<svg viewBox="0 0 ${tamanho} ${tamanho}" width="${tamanho}" height="${tamanho}" role="img" aria-label="Gráfico de pizza">`;
    if (!total) s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--muted-mark)" stroke-width="${R - r}"/>`;
    let ang = 0;
    fatias.forEach((f, i) => {
      const v = Math.max(0, f.valor);
      if (!v) return;
      const fim = ang + (v / total) * Math.PI * 2;
      if (v === total) {
        s += `<circle class="marca" cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${f.cor}" stroke-width="${R - r}"/>`;
        s += `<circle class="alvo" data-i="${i}" cx="${cx}" cy="${cy}" r="${R}"/>`;
      } else {
        const g = fim - ang > Math.PI ? 1 : 0;
        const [x1, y1] = ponto(R, ang), [x2, y2] = ponto(R, fim), [x3, y3] = ponto(r, fim), [x4, y4] = ponto(r, ang);
        s += `<path class="marca alvo-fatia" data-i="${i}" d="M${x1},${y1}A${R},${R} 0 ${g} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${g} 0 ${x4},${y4}Z" fill="${f.cor}" stroke="var(--surface-1)" stroke-width="2"/>`;
      }
      ang = fim;
    });
    // Percentual dentro de cada fatia (só nas que têm espaço, a partir de 4%).
    if (rotulosFatias && total) {
      let a0 = 0;
      fatias.forEach((f) => {
        const v = Math.max(0, f.valor), a1 = a0 + (v / total) * Math.PI * 2;
        if (v / total >= 0.04) { const [x, y] = ponto((R + r) / 2, (a0 + a1) / 2); s += `<text class="rotulo-fatia" x="${x}" y="${y + 4}" text-anchor="middle">${Fmt.pct(v / total, 1)}</text>`; }
        a0 = a1;
      });
    }
    // Centro só com texto discreto (centro.linhas), sem número em destaque.
    if (centro?.linhas) centro.linhas.forEach((t, k) => { s += `<text class="centro-legenda" x="${cx}" y="${cy + 4 + (k - (centro.linhas.length - 1) / 2) * 15}" text-anchor="middle">${Fmt.esc(t)}</text>`; });
    // Valor completo no centro: a fonte diminui para o texto caber no furo da rosca (largura ≈ 0,55 × fonte por caractere).
    else if (centro) s += `<text class="centro-valor" x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:${Math.min(18, (2 * r * 0.86) / (String(centro.valor).length * 0.55)).toFixed(1)}px">${Fmt.esc(centro.valor)}</text><text class="centro-legenda" x="${cx}" y="${cy + 20}" text-anchor="middle">${Fmt.esc(centro.legenda || "")}</text>`;
    s += "</svg>";
    const leg = `<div class="legenda-pizza">${tituloLegenda ? `<h3>${tituloLegenda}</h3>` : ""}${fatias.map((f) => `<div class="item" style="--c:${f.cor}${CINZAS.includes(f.cor) ?";--c-pct:var(--text-secondary)" : ""}"><i></i><span class="nome">${Fmt.esc(Fmt.nome(f.rotulo))}</span><span class="pct">${total ? Fmt.pct(Math.max(0, f.valor) / total, 1) : "—"}${sufixoPct}</span><span class="valor">${fmtValor(f.valor)}</span></div>`).join("")}</div>`;
    div.innerHTML = s + leg;
    ligarHover(div, fatias.map((f) => ({ titulo: f.rotulo, onClick: f.onClick, tooltip: f.tooltip || [["Valor", fmtValor(f.valor)], ["Participação", total ? Fmt.pct(Math.max(0, f.valor) / total, 1) : "—"]] })));
    return div;
  }

  // Mapa do Brasil por estado (contornos em MAPA_BRASIL). dados: { UF: { cor, titulo, tooltip } }.
  // Siglas omitidas nos estados muito pequenos (o balão mostra o nome).
  function mapaBrasil(alvo, { dados, aoClicar = null, destaque = null, largura = 520 }) {
    const m = typeof MAPA_BRASIL !== "undefined" ? MAPA_BRASIL : null;
    const div = caixa(0);
    div.classList.add("mapa-brasil");
    if (!m) { div.innerHTML = `<p class="vazio">Mapa indisponível</p>`; return div; }
    const semSigla = new Set(["PB", "AL", "SE", "DF"]);
    let s = `<svg viewBox="0 0 ${m.largura} ${m.altura}" style="max-width:${largura}px" role="img" aria-label="Mapa do Brasil por estado">`;
    m.estados.forEach((e, i) => {
      const d = dados[e.uf];
      const marcado = destaque instanceof Set ? destaque.has(e.uf) : destaque === e.uf;
      s += `<path class="uf${marcado ? " destaque" : ""}" data-i="${i}" d="${e.d}" fill="${d?.cor || "var(--mapa-sem)"}"/>`;
    });
    m.estados.forEach((e) => { if (!semSigla.has(e.uf)) s += `<text class="sigla-uf" x="${e.cx}" y="${e.cy + 4}" text-anchor="middle">${e.uf}</text>`; });
    s += "</svg>";
    div.innerHTML = s;
    div.querySelectorAll("path.uf").forEach((p) => {
      const e = m.estados[Number(p.dataset.i)], d = dados[e.uf];
      p.addEventListener("mousemove", (ev) => mostrarTooltip(ev, d?.titulo || `${e.nome} (${e.uf})`, d?.tooltip || [["Sem vendas no período", ""]]));
      p.addEventListener("mouseleave", esconderTooltip);
      if (aoClicar) { p.style.cursor = "pointer"; p.addEventListener("click", () => { esconderTooltip(); aoClicar(e.uf, e.nome); }); }
    });
    return div;
  }

  // Dispersão com quadrantes em zero. pontos: [{x, y, rotulo, tooltip, cor}]
  function dispersao(alvo, { pontos, altura = 340, fmtX = Fmt.var, fmtY = Fmt.var, rotX = "", rotY = "", limite = 1 }) {
    const div = caixa(altura);
    const W = larguraDe(alvo), H = altura, m = { t: 14, r: 16, b: 40, l: 60 };
    const ok = pontos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!ok.length) { div.innerHTML = `<p class="vazio">Sem itens comparáveis</p>`; return div; }
    const clamp = (v) => Math.max(-limite, Math.min(limite, v));
    const xs = ok.map((p) => clamp(p.x)), ys = ok.map((p) => clamp(p.y));
    const tx = ticks(Math.min(0, ...xs), Math.max(0, ...xs)), ty = ticks(Math.min(0, ...ys), Math.max(0, ...ys));
    const X = (v) => m.l + (W - m.l - m.r) * ((clamp(v) - tx[0]) / (tx.at(-1) - tx[0]));
    const Y = (v) => m.t + (H - m.t - m.b) * (1 - (clamp(v) - ty[0]) / (ty.at(-1) - ty[0]));
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    for (const t of ty) s += `<line class="grade-linha" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmtY(t)}</text>`;
    for (const t of tx) s += `<text x="${X(t)}" y="${H - m.b + 16}" text-anchor="middle">${fmtX(t)}</text>`;
    s += `<line class="eixo" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}"/><line class="eixo" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    s += `<text x="${W - m.r}" y="${H - 6}" text-anchor="end">${Fmt.esc(rotX)} →</text><text x="${m.l}" y="${m.t - 2}" text-anchor="start">↑ ${Fmt.esc(rotY)}</text>`;
    ok.forEach((p) => { s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 5}" fill="${p.cor || "var(--series-1)"}" fill-opacity=".8" stroke="var(--surface-1)" stroke-width="2"/>`; });
    s += `<circle class="realce" r="8" fill="none" stroke="var(--text-primary)" stroke-width="1.5" visibility="hidden"/>`;
    s += `<rect class="alvo" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
    div.innerHTML = s;
    const svg = div.querySelector("svg"), realce = div.querySelector(".realce"), r = div.querySelector(".alvo");
    r.addEventListener("mousemove", (ev) => {
      const b = svg.getBoundingClientRect();
      const px = (ev.clientX - b.left) * (W / b.width), py = (ev.clientY - b.top) * (H / b.height);
      let melhor = null, dist = Infinity;
      for (const p of ok) { const d = (X(p.x) - px) ** 2 + (Y(p.y) - py) ** 2; if (d < dist) { dist = d; melhor = p; } }
      if (!melhor || dist > 900) { realce.setAttribute("visibility", "hidden"); esconderTooltip(); return; }
      realce.setAttribute("cx", X(melhor.x)); realce.setAttribute("cy", Y(melhor.y)); realce.setAttribute("visibility", "visible");
      mostrarTooltip(ev, melhor.rotulo, melhor.tooltip);
    });
    r.addEventListener("mouseleave", () => { realce.setAttribute("visibility", "hidden"); esconderTooltip(); });
    return div;
  }

  // Meia-lua: um arco por item (de fora para dentro), cada um proporcional a valor ÷ total. itens: [{rotulo, valor, cor, tooltip}].
  function meiaLua(alvo, { itens, total, centro = "", legendaCentro = "", tamanho = 300, espessura = 18, folga = 8 }) {
    const div = caixa(0);
    div.classList.add("meia-lua");
    const cx = tamanho / 2, cy = tamanho / 2 + espessura / 2, r0 = tamanho / 2 - espessura / 2;
    const H = cy + espessura / 2 + 4;
    const ponto = (r, f) => { const a = Math.PI - f * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arco = (r, f) => { const [x, y] = ponto(r, Math.min(f, 0.9999)); return `M${cx - r},${cy} A${r},${r} 0 0 1 ${x.toFixed(2)},${y.toFixed(2)}`; };
    let s = `<svg viewBox="0 0 ${tamanho} ${H}" style="max-width:${tamanho}px" role="img">`;
    itens.forEach((it, i) => {
      const r = r0 - i * (espessura + folga);
      const f = total ? Math.max(0, it.valor) / total : 0;
      s += `<path d="${arco(r, 1)}" fill="none" stroke="var(--grid)" stroke-width="${espessura}" stroke-linecap="round"/>`;
      if (f > 0) s += `<path class="marca" d="${arco(r, f)}" fill="none" stroke="${it.cor}" stroke-width="${espessura}" stroke-linecap="round"/>`;
      s += `<path class="alvo" data-i="${i}" d="${arco(r, 1)}" style="fill:none" stroke="transparent" stroke-width="${espessura + folga}"/>`;
    });
    s += `<text class="centro-valor" x="${cx}" y="${cy - 14}" text-anchor="middle">${Fmt.esc(centro)}</text><text class="centro-legenda" x="${cx}" y="${cy + 2}" text-anchor="middle">${Fmt.esc(legendaCentro)}</text></svg>`;
    div.innerHTML = s;
    ligarHover(div, itens);
    return div;
  }

  // Funil: um degrau por item, largura proporcional ao valor (o maior ocupa a largura toda). itens: [{rotulo, valor, texto, cor, tooltip, onClick}].
  function funil(alvo, { itens, alturaDegrau = 46, gap = 6, larguraNome = 0.42 }) {
    const div = caixa(0);
    div.classList.add("funil");
    if (!itens.length) { div.innerHTML = `<p class="vazio">Sem dados</p>`; return div; }
    const W = larguraDe(alvo), areaF = W * (1 - larguraNome) - 16, cx = areaF / 2;
    const H = itens.length * (alturaDegrau + gap);
    const max = Math.max(...itens.map((d) => d.valor), 1);
    const larg = itens.map((d) => Math.max(0.28, d.valor / max) * areaF);
    const maxCh = Math.floor((W - areaF - 24) / 6.8);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    itens.forEach((d, i) => {
      const y = i * (alturaDegrau + gap), topo = larg[i], base = i < itens.length - 1 ? larg[i + 1] : larg[i] * 0.86;
      s += `<path class="marca" d="M${cx - topo / 2},${y}H${cx + topo / 2}L${cx + base / 2},${y + alturaDegrau}H${cx - base / 2}Z" fill="${d.cor}"/>`;
      s += `<text class="funil-valor" x="${cx}" y="${y + alturaDegrau / 2 + 5}" text-anchor="middle">${Fmt.esc(d.texto ?? Fmt.numc(d.valor))}</text>`;
      const nome = Fmt.nome(d.rotulo);
      s += `<circle cx="${areaF + 16}" cy="${y + alturaDegrau / 2}" r="5" fill="${d.cor}"/><text class="rotulo-cat" x="${areaF + 28}" y="${y + alturaDegrau / 2 + 4}">${Fmt.esc(nome.length > maxCh ? `${nome.slice(0, maxCh - 1)}…` : nome)}</text>`;
      s += `<rect class="alvo" data-i="${i}" x="0" y="${y}" width="${W}" height="${alturaDegrau}"/>`;
    });
    div.innerHTML = `${s}</svg>`;
    ligarHover(div, itens);
    return div;
  }

  // Anéis de progresso lado a lado (um cartão por item). itens: [{rotulo, fracao 0–1, centro, cor, linhas: [[rótulo, valor]], tooltip, onClick}].
  function aneis(alvo, { itens, tamanho = 120, espessura = 10 }) {
    const div = caixa(0);
    div.classList.add("aneis");
    if (!itens.length) { div.innerHTML = `<p class="vazio">Sem dados</p>`; return div; }
    const r = (tamanho - espessura) / 2, c = 2 * Math.PI * r;
    div.innerHTML = itens.map((d, i) => `<div class="anel${d.onClick ? " clicavel" : ""}${d.selecionado ? " selecionado" : ""}${d.apagado ? " apagado" : ""}" data-i="${i}">`
      + `<svg viewBox="0 0 ${tamanho} ${tamanho}" width="${tamanho}" height="${tamanho}" role="img"><circle cx="${tamanho / 2}" cy="${tamanho / 2}" r="${r}" fill="none" stroke="var(--grid)" stroke-width="${espessura}"/>`
      + `<circle cx="${tamanho / 2}" cy="${tamanho / 2}" r="${r}" fill="none" stroke="${d.cor}" stroke-width="${espessura}" stroke-linecap="round" stroke-dasharray="${(Math.max(0.02, Math.min(1, d.fracao)) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${tamanho / 2} ${tamanho / 2})"/>`
      + `<text class="anel-centro${d.onCentro ? " anel-parte" : ""}${d.centroSel ? " selecionado" : ""}" data-centro="${i}" x="${tamanho / 2}" y="${tamanho / 2 + 6}" text-anchor="middle" style="fill:${d.cor}">${Fmt.esc(d.centro)}</text></svg>`
      + `<div class="anel-nome">${Fmt.esc(Fmt.nome(d.rotulo))}</div>`
      + (d.linhas || []).map(([k, v, clique, sel], j) => `<div class="anel-linha${clique ? " anel-parte" : ""}${sel ? " selecionado" : ""}" data-linha="${i}|${j}"><span>${Fmt.esc(k)}</span><strong>${Fmt.esc(v)}</strong></div>`).join("")
      + "</div>").join("");
    ligarHover(div, itens);
    // Partes clicáveis do anel: d.onCentro (o percentual) e o 3º item de cada linha ([rótulo, valor, clique, selecionado]).
    div.querySelectorAll("[data-centro]").forEach((el) => { const d = itens[Number(el.dataset.centro)]; if (d.onCentro) el.addEventListener("click", (ev) => { ev.stopPropagation(); d.onCentro(); }); });
    div.querySelectorAll("[data-linha]").forEach((el) => { const [i, j] = el.dataset.linha.split("|").map(Number); const fn = itens[i].linhas[j][2]; if (fn) el.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); }); });
    return div;
  }

  return { colunas, colunasComparadas, linhas, barrasH, cascata, pizza, mapaBrasil, dispersao, meiaLua, funil, aneis, mostrarTooltip, esconderTooltip };
})();
