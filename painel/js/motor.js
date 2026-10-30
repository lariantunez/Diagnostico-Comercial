// Motor de cálculo: decodifica os dados e calcula todos os indicadores para o filtro atual.
const Motor = (() => {
  const D = window.DADOS;

  function decodificar(b64, Tipo) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Tipo(bytes.buffer);
  }

  const F = {
    n: D.fato.n, p: decodificar(D.fato.p, Uint8Array), c: decodificar(D.fato.c, Uint16Array), pr: decodificar(D.fato.pr, Uint16Array),
    v: decodificar(D.fato.v, Uint16Array), q: decodificar(D.fato.q, Int32Array), qp: decodificar(D.fato.qp, Int32Array), val: decodificar(D.fato.val, Int32Array),
  };
  const O = {
    n: D.pedidos.n, d: decodificar(D.pedidos.d, Int32Array), c: decodificar(D.pedidos.c, Uint16Array), v: decodificar(D.pedidos.v, Uint16Array),
    qtd: decodificar(D.pedidos.qtd, Uint16Array), val: decodificar(D.pedidos.val, Int32Array),
  };

  const periodos = D.periodos;
  const pIdx = new Map(periodos.map((p, i) => [p, i]));
  O.p = new Uint8Array(O.n);
  for (let i = 0; i < O.n; i += 1) O.p[i] = pIdx.get(String(O.d[i]).slice(0, 6));

  const clientes = D.clientes.map((r) => ({ chave: r[0], nome: r[1], razao: r[2], cnpj: r[3], mun: r[4], uf: r[5], reg: r[6], canal: r[7], rede: r[8], filial: r[9], vend: r[10], cadastro: r[11] }));
  const produtos = D.produtos.map((r) => ({ cod: r[0], desc: r[1], cat: r[2], fam: r[3], status: r[4], lanc: r[5] }));
  const vendedores = D.vendedores.map((r) => ({ cod: r[0], nome: r[1], status: r[2] }));
  const dic = D.dic;
  const nC = clientes.length, nPr = produtos.length, nV = vendedores.length, nP = periodos.length, nCat = dic.categoria.length, nFam = dic.familia.length;

  // Funcionários (cadastro SA1 classificado como "Funcionário (CPF)" e sem nome fantasia entre os cadastros válidos):
  // o faturamento deles conta normalmente, mas não são clientes (ficam fora de ativos, perdidos, novos, cresceram etc.).
  const funcionario = new Uint8Array(nC);
  if (D.cadastroGeral) {
    const nomeChave = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const chavesFunc = new Set(D.cadastroGeral.linhas.filter((l) => !l[7] && l[8] === "Funcionário (CPF)").map((l) => l[0]));
    const nomesValidos = new Set(D.cadastroGeral.linhas.filter((l) => l[7]).map((l) => nomeChave(l[2])));
    clientes.forEach((cl, c) => { if (chavesFunc.has(cl.chave) && !nomesValidos.has(nomeChave(cl.nome))) funcionario[c] = 1; });
  }

  // Atendimento de demonstradora: agendas mensais por loja (D.demonstradoras.agendas = [cliente, demonstradora, AAAAMM, meta]).
  // Mesmo nome fantasia = mesmo cliente: a agenda de qualquer cadastro vale para todos os cadastros do mesmo nome.
  const nomeGrupo = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const grupoCliente = new Int32Array(nC);
  {
    const ids = new Map();
    clientes.forEach((cl, c) => { const k = nomeGrupo(cl.nome) || `#${c}`; if (!ids.has(k)) ids.set(k, ids.size); grupoCliente[c] = ids.get(k); });
  }
  const nG = Math.max(0, ...grupoCliente) + 1;
  const demonstradoras = D.demonstradoras?.nomes || [];
  const agendas = (D.demonstradoras?.agendas || []).map(([c, d, p, meta]) => ({ g: grupoCliente[c], d, p: pIdx.get(String(p)) ?? -1, meta })).filter((a) => a.p >= 0);
  const temDemonstradoras = agendas.length > 0;

  // Faturamento por mês (sem filtros) para saber quais meses têm dados.
  const fatMes = new Float64Array(nP);
  for (let i = 0; i < F.n; i += 1) fatMes[F.p[i]] += F.val[i];
  const mesesComDados = periodos.filter((p, i) => fatMes[i] / 100 > 1000);
  const geradoEm = D.geradoEm.slice(0, 7).replace("-", "");
  const mesParcial = periodos.at(-1) === geradoEm ? geradoEm : null;

  function desloca(p, k) {
    let y = Number(p.slice(0, 4));
    let m = Number(p.slice(4, 6)) - 1 + k;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return `${y}${String(m + 1).padStart(2, "0")}`;
  }
  const distancia = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(4)) - Number(a.slice(4));

  function periodosComparacao(S, modo) {
    if (!S.length || modo === "nenhum") return [];
    const k = modo === "ano" ? 12 : distancia(S[0], S.at(-1)) + 1;
    return S.map((p) => desloca(p, -k)).filter((p) => pIdx.has(p) && fatMes[pIdx.get(p)] > 0);
  }

  function mascara(n, conjunto, campo, lista) {
    const m = new Uint8Array(n).fill(1);
    if (!conjunto || !conjunto.size) return m;
    for (let i = 0; i < n; i += 1) m[i] = conjunto.has(lista[i][campo]) ? 1 : 0;
    return m;
  }

  // f = { S: [periodos], modo, nomeFantasia, canal, regiao, uf, vendedor, familia, categoria }
  function calcular(f) {
    const S = [...f.S].sort();
    const Cbruto = periodosComparacao(S, f.modo);
    // Comparação que se sobrepõe ao período (ex.: "todos os períodos" vs ano anterior) não é válida.
    const sobreposto = Cbruto.some((p) => f.S.has(p));
    const C = sobreposto ? [] : Cbruto;
    const temC = C.length > 0;
    const cIncompleta = temC && C.length < S.length;
    const inS = new Uint8Array(nP), inC = new Uint8Array(nP);
    for (const p of S) inS[pIdx.get(p)] = 1;
    for (const p of C) inC[pIdx.get(p)] = 1;
    const minS = S.length ? pIdx.get(S[0]) : 0;
    const fimS = S.length ? Number(`${S.at(-1)}31`) : 0;

    const cOK = mascara(nC, f.nomeFantasia, "nome", clientes);
    const okCanal = mascara(nC, f.canal, "canal", clientes);
    const okR = mascara(nC, f.regiao, "reg", clientes), okU = mascara(nC, f.uf, "uf", clientes);
    for (let i = 0; i < nC; i += 1) cOK[i] = cOK[i] & okCanal[i] & okR[i] & okU[i];
    // Seleção feita nos gráficos da aba geográfica (região, "Outras" ou cidade): f.geo.ok(cliente).
    if (f.geo) for (let i = 0; i < nC; i += 1) if (cOK[i] && !f.geo.ok(i)) cOK[i] = 0;
    // Seleção feita por clique nas telas (gráfico, card ou linha de tabela): conjunto de clientes e/ou de produtos.
    if (f.selecao?.clientes) for (let i = 0; i < nC; i += 1) if (cOK[i] && !f.selecao.clientes.has(i)) cOK[i] = 0;
    // Atendimento de demonstradora no período: meses com agenda e demonstradoras por cliente (grupo de nome fantasia).
    // "Apenas lojas com atendimento": só clientes com agenda em ao menos um mês do período (a comparação usa as mesmas lojas).
    // f.SDemo: meses que definem as lojas atendidas quando o cálculo é de outro período (ex.: ciclo anterior dos perdidos).
    const demoMeses = new Uint8Array(nG), demoNomes = new Map();
    {
      const inDemo = f.SDemo ? new Uint8Array(nP) : inS;
      if (f.SDemo) for (const p of f.SDemo) if (pIdx.has(p)) inDemo[pIdx.get(p)] = 1;
      const visto = new Set();
      for (const a of agendas) {
        if (!inDemo[a.p]) continue;
        const k = a.g * 64 + a.p;
        if (!visto.has(k)) { visto.add(k); demoMeses[a.g] += 1; }
        if (!demoNomes.has(a.g)) demoNomes.set(a.g, new Set());
        demoNomes.get(a.g).add(a.d);
      }
    }
    if (f.soDemonstradora) for (let i = 0; i < nC; i += 1) if (cOK[i] && !demoMeses[grupoCliente[i]]) cOK[i] = 0;
    const demo = {
      meses: (c) => demoMeses[grupoCliente[c]],
      nomes: (c) => [...(demoNomes.get(grupoCliente[c]) || [])].map((d) => demonstradoras[d]).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
    const prOK = mascara(nPr, f.familia, "fam", produtos);
    const okCat = mascara(nPr, f.categoria, "cat", produtos);
    for (let i = 0; i < nPr; i += 1) prOK[i] &= okCat[i];
    if (f.selecao?.produtos) for (let i = 0; i < nPr; i += 1) if (prOK[i] && !f.selecao.produtos.has(i)) prOK[i] = 0;
    const vOK = new Uint8Array(nV).fill(1);
    if (f.vendedor && f.vendedor.size) for (let i = 0; i < nV; i += 1) vOK[i] = f.vendedor.has(i) ? 1 : 0;
    const filtroProduto = Boolean((f.familia && f.familia.size) || (f.categoria && f.categoria.size) || f.selecao?.produtos);

    const cli = { valS: new Float64Array(nC), valC: new Float64Array(nC), fatS: new Float64Array(nC), fatC: new Float64Array(nC), qS: new Float64Array(nC), qC: new Float64Array(nC), qpS: new Float64Array(nC), qpC: new Float64Array(nC),
      primeiro: new Int16Array(nC).fill(-1), ultimo: new Int16Array(nC).fill(-1), pedS: new Float64Array(nC), pedC: new Float64Array(nC),
      ultCompra: new Int32Array(nC), valUltCompra: new Float64Array(nC), ultCompraAteFim: new Int32Array(nC), valUltCompraAteFim: new Float64Array(nC), ultPedido: new Int32Array(nC), ultPedidoAteFim: new Int32Array(nC) };
    const prod = { valS: new Float64Array(nPr), valC: new Float64Array(nPr), qS: new Float64Array(nPr), qC: new Float64Array(nPr), qpS: new Float64Array(nPr), qpC: new Float64Array(nPr), cliS: new Uint32Array(nPr), cliC: new Uint32Array(nPr) };
    const mes = { val: new Float64Array(nP), fat: new Float64Array(nP), cliGeral: new Uint32Array(nP), q: new Float64Array(nP), qp: new Float64Array(nP), cli: new Uint32Array(nP), ped: new Float64Array(nP) };
    const vend = { qS: new Float64Array(nV), qC: new Float64Array(nV), valS: new Float64Array(nV), valC: new Float64Array(nV), fatS: new Float64Array(nV), fatC: new Float64Array(nV), pedS: new Float64Array(nV), pedC: new Float64Array(nV), qpS: new Float64Array(nV), qpC: new Float64Array(nV) };
    const cliCat = { S: new Float64Array(nC * nCat), C: new Float64Array(nC * nCat) };
    const vendCat = { S: new Float64Array(nV * nCat), C: new Float64Array(nV * nCat) };
    const vendCli = new Map();
    const vistoMes = new Int16Array(nC).fill(-1), vistoMesGeral = new Int16Array(nC).fill(-1);
    const vistoProdS = new Map(), vistoProdC = new Map();
    // Faturamento líquido por cliente e mês (base de produto e base de pedidos), para as regras de histórico.
    const mcF = new Float64Array(nC * nP), mcO = new Float64Array(nC * nP);
    // Compra no mês (regra de 27/10/2026): teve pedido ou nota de venda no mês, mesmo que devoluções de outros pedidos deixem o líquido ≤ 0.
    const compraF = new Uint8Array(nC * nP), compraO = new Uint8Array(nC * nP);

    for (let i = 0; i < F.n; i += 1) {
      const c = F.c[i];
      if (!cOK[c]) continue;
      const pr = F.pr[i];
      if (!prOK[pr]) continue;
      const v = F.v[i];
      if (!vOK[v]) continue;
      const p = F.p[i];
      const val = F.val[i] / 100, q = F.q[i] / 100, qp = F.qp[i] / 100;
      mes.val[p] += val; mes.q[p] += q; mes.qp[p] += qp;
      mcF[c * nP + p] += val;
      if (val > 0) compraF[c * nP + p] = 1;
      if (val > 0) {
        if (vistoMes[c] !== p) { vistoMes[c] = p; mes.cli[p] += 1; }
        if (cli.primeiro[c] < 0) cli.primeiro[c] = p;
        cli.ultimo[c] = p;
      }
      const cat = produtos[pr].cat;
      if (inS[p]) {
        cli.valS[c] += val; cli.qS[c] += q; cli.qpS[c] += qp;
        prod.valS[pr] += val; prod.qS[pr] += q; prod.qpS[pr] += qp;
        vend.valS[v] += val; vend.qpS[v] += qp; vend.qS[v] += q;
        cliCat.S[c * nCat + cat] += val; vendCat.S[v * nCat + cat] += val;
        const k = v * 8192 + c; const vc = vendCli.get(k) || [0, 0]; vc[0] += val; vendCli.set(k, vc);
        if (val > 0) { const kk = pr * 8192 + c; if (!vistoProdS.has(kk)) { vistoProdS.set(kk, 1); prod.cliS[pr] += 1; } }
      }
      if (inC[p]) {
        cli.valC[c] += val; cli.qC[c] += q; cli.qpC[c] += qp;
        prod.valC[pr] += val; prod.qC[pr] += q; prod.qpC[pr] += qp;
        vend.valC[v] += val; vend.qpC[v] += qp; vend.qC[v] += q;
        cliCat.C[c * nCat + cat] += val; vendCat.C[v * nCat + cat] += val;
        const k = v * 8192 + c; const vc = vendCli.get(k) || [0, 0]; vc[1] += val; vendCli.set(k, vc);
        if (val > 0) { const kk = pr * 8192 + c; if (!vistoProdC.has(kk)) { vistoProdC.set(kk, 1); prod.cliC[pr] += 1; } }
      }
    }

    // Pedidos e datas de compra (base de pedidos: não tem produto, então ignora filtro de produto)
    for (let i = 0; i < O.n; i += 1) {
      const c = O.c[i];
      if (!cOK[c]) continue;
      const v = O.v[i];
      if (!vOK[v]) continue;
      const p = O.p[i], d = O.d[i], n = O.qtd[i], val = O.val[i] / 100;
      mes.fat[p] += val;
      mcO[c * nP + p] += val;
      if (val > 0 || n > 0) compraO[c * nP + p] = 1;
      if (inS[p]) { cli.fatS[c] += val; vend.fatS[v] += val; }
      if (inC[p]) { cli.fatC[c] += val; vend.fatC[v] += val; }
      if (val > 0 && vistoMesGeral[c] !== p) { vistoMesGeral[c] = p; mes.cliGeral[p] += 1; }
      if (n) {
        mes.ped[p] += n;
        if (inS[p]) { cli.pedS[c] += n; vend.pedS[v] += n; }
        if (inC[p]) { cli.pedC[c] += n; vend.pedC[v] += n; }
        if (d > cli.ultPedido[c]) cli.ultPedido[c] = d;
        if (d <= fimS && d > cli.ultPedidoAteFim[c]) cli.ultPedidoAteFim[c] = d;
      }
      if (val > 0) {
        if (d > cli.ultCompra[c]) { cli.ultCompra[c] = d; cli.valUltCompra[c] = 0; }
        if (d === cli.ultCompra[c]) cli.valUltCompra[c] += val;
        if (d <= fimS) {
          if (d > cli.ultCompraAteFim[c]) { cli.ultCompraAteFim[c] = d; cli.valUltCompraAteFim[c] = 0; }
          if (d === cli.ultCompraAteFim[c]) cli.valUltCompraAteFim[c] += val;
        }
      }
    }

    if (!filtroProduto) {
      cli.valS.set(cli.fatS); cli.valC.set(cli.fatC);
      vend.valS.set(vend.fatS); vend.valC.set(vend.fatC);
      mes.val.set(mes.fat); mes.cli.set(mes.cliGeral);
    }

    // Histórico do cliente (regras de 21/10/2026). "Comprou no mês" = teve pedido ou nota de venda no mês (27/10/2026).
    // Novo: comprou no período e nunca comprou antes. Reativado: voltou a comprar após 12 meses ou mais sem compras.
    // Perdido: completou 12 meses sem comprar dentro do período. Demais: faturamento atual x mesmo período do ano anterior.
    // Novo e reativado formam uma categoria única: o histórico carregado começa em out/2023, então quem ficou
    // inativo antes disso aparece sem compra anterior e não dá para distinguir novo de reativado.
    // 7 = Pararam de comprar: compraram na comparação, não compraram no período e ainda não completaram 12 meses sem comprar.
    const STATUS = ["Cresceu", "Reduziu", "Manteve", "Novo ou reativado", "Reativado", "Perdido", "Ajustes/devoluções", "Pararam de comprar"];
    const compraMes = filtroProduto ? compraF : compraO;
    // Comprou no período / na comparação: pelo menos um mês com compra (pedido ou nota de venda).
    cli.compraS = new Uint8Array(nC); cli.compraC = new Uint8Array(nC);
    for (let c = 0; c < nC; c += 1) for (let p = 0; p < nP; p += 1) if (compraMes[c * nP + p]) { if (inS[p]) cli.compraS[c] = 1; if (inC[p]) cli.compraC[c] = 1; }
    const status = new Uint8Array(nC).fill(6);
    const catsS = new Uint8Array(nC), catsC = new Uint8Array(nC);
    const fimIdx = S.length ? pIdx.get(S.at(-1)) : -1;
    const ativoS = new Uint8Array(nC), ativoC = new Uint8Array(nC);
    // Funcionário que completou 12 meses sem comprar no período: não entra nos perdidos, só aparece como "outros clientes".
    const perdidoFunc = new Uint8Array(nC);
    const comprou = (c, p) => p >= 0 && compraMes[c * nP + p] === 1;
    for (let c = 0; c < nC; c += 1) {
      for (let k = 0; k < nCat; k += 1) { if (cliCat.S[c * nCat + k] > 0) catsS[c] += 1; if (cliCat.C[c * nCat + k] > 0) catsC[c] += 1; }
      if (funcionario[c]) { // funcionário: fica em "Ajustes/devoluções" (só valor), nunca ativo nem perdido
        let ult = -1;
        for (let p = fimIdx; p >= 0; p -= 1) if (comprou(c, p)) { ult = p; break; }
        if (!cli.compraS[c] && ult >= 0 && ult + 12 >= minS && ult + 12 <= fimIdx && inS[ult + 12]) perdidoFunc[c] = 1;
        continue;
      }

      // Ativo = comprou no período filtrado (regra de 27/10/2026); na comparação, comprou no período de comparação.
      ativoS[c] = cli.compraS[c]; ativoC[c] = cli.compraC[c];
      let primeiroS = -1;
      for (let p = minS; p <= fimIdx; p += 1) if (inS[p] && comprou(c, p)) { primeiroS = p; break; }
      let ultimo = -1;
      for (let p = fimIdx; p >= 0; p -= 1) if (comprou(c, p)) { ultimo = p; break; }
      if (primeiroS >= 0 && cli.compraS[c]) {
        let anterior = -1;
        for (let p = primeiroS - 1; p >= 0; p -= 1) if (comprou(c, p)) { anterior = p; break; }
        if (anterior < 0) status[c] = 3;
        else if (primeiroS - anterior >= 13) status[c] = 3;
        else if (!temC) status[c] = 2;
        else status[c] = cli.valS[c] > cli.valC[c] ? 0 : cli.valS[c] < cli.valC[c] ? 1 : 2;
      } else if (ultimo >= 0 && ultimo + 12 >= minS && ultimo + 12 <= fimIdx && inS[ultimo + 12]) status[c] = 5;
      else if (temC && cli.compraC[c]) status[c] = 7;
    }
    cli.ativoS = ativoS; cli.ativoC = ativoC; cli.perdidoFunc = perdidoFunc;

    const tot = (lado) => {
      let val = 0, q = 0, qp = 0, ativos = 0, ped = 0;
      const vals = lado === "S" ? cli.valS : cli.valC, qs = lado === "S" ? cli.qS : cli.qC, qps = lado === "S" ? cli.qpS : cli.qpC, peds = lado === "S" ? cli.pedS : cli.pedC;
      const ativo = lado === "S" ? cli.ativoS : cli.ativoC;
      for (let c = 0; c < nC; c += 1) { val += vals[c]; q += qs[c]; qp += qps[c]; ped += peds[c]; if (ativo[c] && cOK[c]) ativos += 1; }
      return { val, q, qp, ativos, ped, preco: qp ? val / qp : null, ticket: ped ? val / ped : null, bonif: q - qp };
    };

    const ponte = STATUS.map((nome, i) => ({ nome, i, clientes: 0, valS: 0, valC: 0, delta: 0 }));
    for (let c = 0; c < nC; c += 1) {
      // Conta também quem só tem pedido (sem nota): pela regra de compra ele é ativo, com valor zero.
      if (!cli.valS[c] && !cli.valC[c] && !cli.compraS[c] && !cli.compraC[c]) continue;
      const g = ponte[status[c]];
      if (!funcionario[c]) g.clientes += 1;
      g.valS += cli.valS[c]; g.valC += cli.valC[c]; g.delta += cli.valS[c] - cli.valC[c];
    }

    return { f, S, C, temC, sobreposto, cIncompleta, inS, inC, filtroProduto, cli, prod, mes, vend, cliCat, vendCat, vendCli, status, STATUS, catsS, catsC, ponte, totS: tot("S"), totC: tot("C"), cOK, prOK, vOK, funcionario, demo };
  }

  // Preço x Mix x Volume. nivel: "produto" | "categoria"
  function pvm(R, nivel) {
    const itens = new Map();
    for (let i = 0; i < nPr; i += 1) {
      const { valS, valC, qpS, qpC } = R.prod;
      if (!valS[i] && !valC[i] && !qpS[i] && !qpC[i]) continue;
      const k = nivel === "categoria" ? produtos[i].cat : i;
      const it = itens.get(k) || { k, RS: 0, RC: 0, QS: 0, QC: 0 };
      it.RS += valS[i]; it.RC += valC[i]; it.QS += qpS[i]; it.QC += qpC[i];
      itens.set(k, it);
    }
    let QSK = 0, QCK = 0, RSK = 0, RCK = 0;
    const lista = [...itens.values()];
    for (const it of lista) if (it.QS > 0 && it.QC > 0) { QSK += it.QS; QCK += it.QC; RSK += it.RS; RCK += it.RC; }
    const ef = { volume: 0, mix: 0, preco: 0, novos: 0, saidas: 0, outros: 0 };
    for (const it of lista) {
      it.vol = 0; it.mix = 0; it.preco = 0; it.novo = 0; it.saida = 0; it.outro = 0;
      if (it.QS > 0 && it.QC > 0) {
        const PC = it.RC / it.QC, PS = it.RS / it.QS;
        it.vol = (QSK - QCK) * (it.QC / QCK) * PC;
        it.mix = (it.QS - it.QC * (QSK / QCK)) * PC;
        it.preco = (PS - PC) * it.QS;
        it.PC = PC; it.PS = PS;
      } else if (it.QS > 0) it.novo = it.RS - it.RC;
      else if (it.QC > 0) it.saida = it.RS - it.RC;
      else it.outro = it.RS - it.RC;
      ef.volume += it.vol; ef.mix += it.mix; ef.preco += it.preco; ef.novos += it.novo; ef.saidas += it.saida; ef.outros += it.outro;
      it.delta = it.RS - it.RC;
    }
    return { ef, itens: lista, QSK, QCK, RSK, RCK };
  }

  // Série mensal de um recorte (produto, categoria ou família), respeitando os filtros de cliente/vendedor.
  function serieItem(R, tipo, id) {
    const val = new Float64Array(nP), qp = new Float64Array(nP), q = new Float64Array(nP);
    for (let i = 0; i < F.n; i += 1) {
      const pr = F.pr[i];
      if (!R.prOK[pr]) continue;
      if (tipo === "produto" ? pr !== id : tipo === "categoria" ? produtos[pr].cat !== id : produtos[pr].fam !== id) continue;
      const c = F.c[i];
      if (!R.cOK[c] || !R.vOK[F.v[i]]) continue;
      const p = F.p[i];
      val[p] += F.val[i] / 100; qp[p] += F.qp[i] / 100; q[p] += F.q[i] / 100;
    }
    return { val, qp, q };
  }

  return { D, F, O, funcionario, temDemonstradoras, periodos, pIdx, clientes, produtos, vendedores, dic, nC, nPr, nV, nP, nCat, nFam, fatMes, mesesComDados, mesParcial, desloca, periodosComparacao, calcular, pvm, serieItem };
})();
