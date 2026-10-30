// Formatação pt-BR
const Fmt = (() => {
  const nf = (d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const n0 = nf(0), n1 = nf(1), n2 = nf(2), n4 = nf(4);
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function compacto(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return `${n1.format(v / 1e9)} bi`;
    if (a >= 1e6) return `${n1.format(v / 1e6)} mi`;
    if (a >= 1e4) return `${n0.format(v / 1e3)} mil`;
    if (a >= 1e3) return `${n1.format(v / 1e3)} mil`;
    return n0.format(v);
  }
  const ok = (v) => v !== null && v !== undefined && Number.isFinite(v);
  // Texto todo em maiúsculas (nomes vindos do ERP) vira "Primeira Letra Maiúscula" fora das tabelas.
  // Mantém siglas curtas (CD, SP), abreviações com ponto (A.T.C), números romanos e palavras com dígitos.
  const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
  function nome(t) {
    const s = String(t ?? "");
    if (/\p{Ll}/u.test(s) || !/\p{Lu}.*\p{Lu}/u.test(s)) return s;
    return s.split(/(\s+)/).map((p, i) => {
      const letras = p.replace(/[^\p{L}]/gu, "");
      if (!letras || /[.\d]/.test(p) || /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(letras)) return p;
      const baixo = p.toLowerCase();
      if (i > 0 && PARTICULAS.has(baixo)) return baixo;
      if (letras.length <= 2) return p;
      return baixo.replace(/\p{L}/u, (c) => c.toUpperCase());
    }).join("");
  }
  return {
    MESES,
    nome,
    rs: (v) => (ok(v) ? `R$ ${n2.format(v)}` : "—"),
    rs0: (v) => (ok(v) ? `R$ ${n2.format(v)}` : "—"),
    // Ticket médio por produto com 4 casas (pedido do usuário, 30/10/2026).
    rs4: (v) => (ok(v) ? `R$ ${n4.format(v)}` : "—"),
    rsc: (v) => (ok(v) ? `R$ ${n2.format(v)}` : "—"),
    num: (v) => (ok(v) ? n0.format(v) : "—"),
    num1: (v) => (ok(v) ? n1.format(v) : "—"),
    // Valores sempre completos (pedido do usuário, 28/10/2026): inteiro sem casas, demais com 2 casas.
    numc: (v) => (ok(v) ? (Number.isInteger(v) ? n0 : n2).format(v) : "—"),
    // Só para a escala dos eixos dos gráficos (0, 20 mi, 40 mi...), que não cabe com valores completos.
    eixo: (v) => (ok(v) ? compacto(v) : "—"),
    pct: (v, d = 2) => (ok(v) ? `${nf(d).format(v * 100)}%` : "—"),
    var: (v, d = 2) => (v === Infinity ? "novo" : ok(v) ?`${v > 0 ? "+" : ""}${nf(d).format(v * 100)}%` : "—"),
    varRs: (v) => (ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}R$ ${n2.format(Math.abs(v))}` : "—"),
    varRsCheio: (v) => (ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}R$ ${n2.format(Math.abs(v))}` : "—"),
    varNum: (v) => (ok(v) ? `${v > 0 ? "+" : ""}${n0.format(v)}` : "—"),
    pp: (v) => (ok(v) ? `${v > 0 ? "+" : ""}${n2.format(v * 100)} p.p.` : "—"),
    mes: (p) => { const m = MESES[Number(p.slice(4, 6)) - 1]; return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${p.slice(0, 4)}`; },
    mesLongo: (p) => { const m = MESES[Number(p.slice(4, 6)) - 1]; return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${p.slice(0, 4)}`; },
    data: (d) => { const s = String(d || ""); return s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : "—"; },
    taxa: (a, b) => (b ? a / b - 1 : (a ? Infinity : null)),
    esc: (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  };
})();
