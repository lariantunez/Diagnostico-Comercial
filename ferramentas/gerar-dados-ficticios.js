// Gerador de dados fictícios do Diagnóstico Comercial (versão portfólio).
// Cria uma indústria de cosméticos inventada ("Aurora Cosméticos Profissionais") com 37 meses de sell-in e grava
// painel/dados/dados.js no MESMO formato que o pipeline real exporta do MongoDB: o painel roda sem banco e sem servidor.
// Nenhum nome, CNPJ, cliente, vendedor ou valor vem de dados reais. Semente fixa: o resultado é sempre o mesmo.
// Uso: node ferramentas/gerar-dados-ficticios.js
const fs = require("fs");
const path = require("path");

// ---------- Aleatoriedade reprodutível ----------
function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261030);
const entre = (a, b) => a + (b - a) * rnd();
const inteiro = (a, b) => Math.floor(entre(a, b + 1));
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
const normal = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const lognormal = (media, sigma) => media * Math.exp(sigma * normal() - (sigma * sigma) / 2);
function sortearPeso(itens, peso = (x) => x.peso) { const total = itens.reduce((s, x) => s + peso(x), 0); let r = rnd() * total; for (const x of itens) { r -= peso(x); if (r <= 0) return x; } return itens.at(-1); }

// ---------- Calendário: 37 meses, o último em andamento ----------
const PERIODOS = [];
for (let ano = 2023, mes = 10; PERIODOS.length < 37; mes += 1) { if (mes > 12) { mes = 1; ano += 1; } PERIODOS.push(`${ano}${String(mes).padStart(2, "0")}`); }
const GERADO_EM = "2026-10-20T12:00:00.000Z";
const SAZONALIDADE = [0.86, 0.9, 1.06, 1.0, 1.1, 0.94, 0.95, 1.0, 1.02, 1.1, 1.12, 1.04]; // jan..dez
const FRACAO_MES_PARCIAL = 0.62;

// ---------- Geografia ----------
const ESTADOS = [
  ["SP", "Sudeste", 34, ["São Paulo", "Campinas", "Santo André", "São Bernardo do Campo", "Guarulhos", "Osasco", "Ribeirão Preto", "Sorocaba", "Santos", "São José dos Campos", "Jundiaí", "Piracicaba", "Bauru", "Taubaté"]],
  ["RJ", "Sudeste", 12, ["Rio de Janeiro", "Niterói", "Duque de Caxias", "Nova Iguaçu", "Petrópolis", "Volta Redonda", "Campos dos Goytacazes"]],
  ["MG", "Sudeste", 10, ["Belo Horizonte", "Contagem", "Uberlândia", "Juiz de Fora", "Montes Claros", "Uberaba"]],
  ["ES", "Sudeste", 2, ["Vitória", "Vila Velha", "Serra"]],
  ["PR", "Sul", 8, ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais"]],
  ["SC", "Sul", 6, ["Florianópolis", "Joinville", "Blumenau", "Itajaí", "Chapecó"]],
  ["RS", "Sul", 6, ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria"]],
  ["GO", "Centro-Oeste", 4, ["Goiânia", "Aparecida de Goiânia", "Anápolis"]],
  ["DF", "Centro-Oeste", 3, ["Brasília"]],
  ["MS", "Centro-Oeste", 2, ["Campo Grande", "Dourados"]],
  ["MT", "Centro-Oeste", 2, ["Cuiabá", "Várzea Grande"]],
  ["BA", "Nordeste", 4, ["Salvador", "Feira de Santana", "Vitória da Conquista"]],
  ["PE", "Nordeste", 3, ["Recife", "Olinda", "Caruaru"]],
  ["CE", "Nordeste", 2, ["Fortaleza", "Juazeiro do Norte"]],
  ["MA", "Nordeste", 1, ["São Luís"]], ["PB", "Nordeste", 1, ["João Pessoa"]], ["RN", "Nordeste", 1, ["Natal"]],
  ["AL", "Nordeste", 1, ["Maceió"]], ["SE", "Nordeste", 0.5, ["Aracaju"]], ["PI", "Nordeste", 0.5, ["Teresina"]],
  ["PA", "Norte", 1, ["Belém", "Ananindeua"]], ["AM", "Norte", 1, ["Manaus"]], ["TO", "Norte", 0.3, ["Palmas"]], ["RO", "Norte", 0.3, ["Porto Velho"]],
].map(([uf, regiao, peso, cidades]) => ({ uf, regiao, peso, cidades }));
// Filial que atende cada estado (05001 = venda direta/e-commerce, atende qualquer UF).
const FILIAIS = { "01001": "Matriz São Paulo", "02002": "Filial Rio de Janeiro", "03001": "Filial Sul", "03002": "Filial Paraná", "04001": "Filial Centro", "05001": "Venda Direta" };
const filialDoEstado = (uf) => (uf === "SP" ? "01001" : ["RJ", "ES"].includes(uf) ? "02002" : ["SC", "RS"].includes(uf) ? "03001" : uf === "PR" ? "03002" : "04001");

// ---------- Segmentações (tamanho = volume relativo; freq = chance de comprar no mês; qtd = peças por item) ----------
const SEGMENTOS = [
  { nome: "DISTRIBUIDOR", peso: 5, tamanho: 4.5, freq: 0.78, qtd: 11, itens: 11, desconto: 0.18 },
  { nome: "REDE DE PERFUMARIAS", peso: 9, tamanho: 2.6, freq: 0.74, qtd: 10, itens: 10, desconto: 0.08 },
  { nome: "LOJA DE COSMÉTICOS", peso: 30, tamanho: 1, freq: 0.52, qtd: 6, itens: 7, desconto: 0.04 },
  { nome: "SALÃO DE BELEZA", peso: 22, tamanho: 0.35, freq: 0.38, qtd: 3, itens: 4, desconto: 0 },
  { nome: "FARMÁCIA E DROGARIA", peso: 10, tamanho: 0.6, freq: 0.44, qtd: 4, itens: 5, desconto: 0.03 },
  { nome: "ATACAREJO", peso: 5, tamanho: 2.2, freq: 0.6, qtd: 7, itens: 7, desconto: 0.12 },
  { nome: "E-COMMERCE", peso: 4, tamanho: 1.8, freq: 0.7, qtd: 8, itens: 9, desconto: 0.06 },
  { nome: "PROFISSIONAL AUTÔNOMO", peso: 15, tamanho: 0.2, freq: 0.3, qtd: 2, itens: 3, desconto: 0 },
];
const SEG_FUNCIONARIO = { nome: "VENDA A FUNCIONÁRIOS", peso: 0, tamanho: 0.05, freq: 0.25, qtd: 1, itens: 3, desconto: 0.3 };

// ---------- Produtos ----------
const MARCA = "AURORA";
const TONS = ["1.0 PRETO", "3.0 CASTANHO ESCURO", "4.0 CASTANHO MEDIO", "5.0 CASTANHO CLARO", "6.0 LOURO ESCURO", "7.0 LOURO MEDIO", "8.0 LOURO CLARO", "9.0 LOURO MUITO CLARO", "10.0 LOURO CLARISSIMO", "6.66 VERMELHO INTENSO", "7.77 MARROM DOURADO", "5.62 ACAJU", "8.1 LOURO CINZA", "0.11 CORRETOR CINZA"];
const FASHION = ["AZUL PROFUNDO", "ROSA CHICLETE", "VIOLETA NOTURNO", "VERDE ESMERALDA", "VERMELHO CEREJA", "LARANJA NEON", "PRATA GELO", "TURQUESA", "PINK", "LILAS"];
const CATEGORIAS = [
  { nome: "COLORAÇÃO PERMANENTE", familia: "COLORAÇÃO", preco: 21, peso: 26, skus: TONS.map((t) => `${MARCA} COLOR ${t} 60G`) },
  { nome: "COLORAÇÃO TEMPORÁRIA FASHION", familia: "COLORAÇÃO", preco: 27, peso: 12, skus: FASHION.map((t) => `${MARCA} FASHION ${t} 100G`) },
  { nome: "TONALIZANTE", familia: "COLORAÇÃO", preco: 18, peso: 6, skus: ["CHOCOLATE", "CARAMELO", "PEROLA", "GRAFITE", "MEL", "NEUTRO"].map((t) => `${MARCA} TONALIZANTE ${t} 100ML`) },
  { nome: "DESCOLORAÇÃO", familia: "QUÍMICA", preco: 36, peso: 7, skus: ["PO DESCOLORANTE AZUL 300G", "PO DESCOLORANTE BRANCO 300G", "PO DESCOLORANTE 50G", "CREME DESCOLORANTE 400G"].map((t) => `${MARCA} ${t}`) },
  { nome: "OXIDANTE", familia: "QUÍMICA", preco: 13, peso: 9, skus: ["OX 10 VOL 900ML", "OX 20 VOL 900ML", "OX 30 VOL 900ML", "OX 40 VOL 900ML", "OX 20 VOL 90ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "ALISAMENTO", familia: "QUÍMICA", preco: 72, peso: 4, skus: ["ESCOVA ORGANICA 1L", "ALISANTE TIOGLICOLATO 500G", "REDUTOR DE VOLUME 1L"].map((t) => `${MARCA} ${t}`) },
  { nome: "TRATAMENTO RECONSTRUÇÃO", familia: "TRATAMENTO", preco: 49, peso: 8, skus: ["REPAIR AMPOLA 15ML", "REPAIR KIT ETAPA 1 1L", "REPAIR KIT ETAPA 2 1L", "REPAIR KIT ETAPA 3 1L", "BOTOX CAPILAR 1KG", "CAUTERIZACAO 500ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "MÁSCARA CAPILAR", familia: "TRATAMENTO", preco: 31, peso: 6, skus: ["MASCARA HIDRATACAO 500G", "MASCARA NUTRICAO 500G", "MASCARA MATIZADORA 500G", "MASCARA CACHOS 500G", "MASCARA HIDRATACAO 1KG"].map((t) => `${MARCA} ${t}`) },
  { nome: "ÓLEOS E SÉRUNS", familia: "TRATAMENTO", preco: 38, peso: 4, skus: ["OLEO ARGAN 60ML", "SERUM PONTAS 30ML", "OLEO COCO 60ML", "BLEND 7 OLEOS 100ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "SHAMPOO", familia: "HIGIENE CAPILAR", preco: 23, peso: 7, skus: ["SHAMPOO HIDRATACAO 1L", "SHAMPOO ANTIRRESIDUO 1L", "SHAMPOO MATIZADOR 300ML", "SHAMPOO CACHOS 300ML", "SHAMPOO HIDRATACAO 300ML", "SHAMPOO MASCULINO 250ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "CONDICIONADOR", familia: "HIGIENE CAPILAR", preco: 24, peso: 5, skus: ["CONDICIONADOR HIDRATACAO 1L", "CONDICIONADOR CACHOS 300ML", "CONDICIONADOR NUTRICAO 300ML", "CONDICIONADOR MATIZADOR 300ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "FINALIZADORES", familia: "FINALIZAÇÃO", preco: 28, peso: 5, skus: ["LEAVE-IN 200ML", "PROTETOR TERMICO 200ML", "SPRAY BRILHO 120ML", "MOUSSE MODELADOR 200ML"].map((t) => `${MARCA} ${t}`) },
  { nome: "CACHOS", familia: "FINALIZAÇÃO", preco: 30, peso: 5, skus: ["CREME DE PENTEAR CACHOS 1KG", "GELATINA CACHOS 500G", "ATIVADOR DE CACHOS 300ML", "CREME DE PENTEAR CACHOS 300G"].map((t) => `${MARCA} ${t}`) },
  { nome: "KITS PROFISSIONAIS", familia: "OUTROS", preco: 115, peso: 3, skus: ["KIT COLORACAO SALAO", "KIT RECONSTRUCAO SALAO", "KIT LISO PERFEITO", "KIT CACHOS PROFISSIONAL"].map((t) => `${MARCA} ${t}`) },
  { nome: "ACESSÓRIOS", familia: "OUTROS", preco: 12, peso: 2, skus: ["LUVAS DESCARTAVEIS 100UN", "PINCEL APLICADOR", "TIGELA MISTURA", "TOUCA TERMICA", "PAPEL ALUMINIO 30M"].map((t) => `${MARCA} ${t}`) },
  { nome: "OUTROS LANÇAMENTOS", familia: "OUTROS", preco: 42, peso: 2, skus: ["SKINCARE CAPILAR SERUM", "BLINDAGEM CAPILAR 300ML", "GLOSS ACIDIFICANTE 500ML"].map((t) => `${MARCA} ${t}`) },
];
// Tendência anual por categoria: algumas linhas crescem, outras perdem espaço.
const TENDENCIA_CATEGORIA = { "COLORAÇÃO TEMPORÁRIA FASHION": 0.22, "CACHOS": 0.18, "TRATAMENTO RECONSTRUÇÃO": 0.12, "ÓLEOS E SÉRUNS": 0.1, "ALISAMENTO": -0.16, "TONALIZANTE": -0.12, "OXIDANTE": -0.05, "ACESSÓRIOS": -0.2, "SHAMPOO": -0.04 };
const produtos = [];
let codigo = 1000;
for (const cat of CATEGORIAS) for (const nome of cat.skus) {
  codigo += inteiro(1, 9);
  // Lançamentos: alguns SKUs só começam a vender no meio da janela (data de lançamento = 1ª venda).
  const lancamento = cat.nome === "OUTROS LANÇAMENTOS" || rnd() < 0.08 ? inteiro(6, 30) : 0;
  produtos.push({ codigo: String(codigo), nome, cat, preco: cat.preco * entre(0.82, 1.22), popularidade: lognormal(1, 0.7), lancamento, reajusteSKU: entre(-0.02, 0.03) });
}
// Reajuste de tabela: janeiro de cada ano (com variação por SKU).
const REAJUSTE_ANO = { 2023: 0, 2024: 0.058, 2025: 0.071, 2026: 0.052 };
function precoNoMes(prod, p) {
  const ano = Number(PERIODOS[p].slice(0, 4));
  let fator = 1;
  for (let a = 2024; a <= ano; a += 1) fator *= 1 + REAJUSTE_ANO[a] + prod.reajusteSKU;
  return prod.preco * fator;
}

// ---------- Pessoas e nomes ----------
const PRIMEIROS = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Mariana", "Natália", "Patrícia", "Renata", "Sabrina", "Tatiane", "Vanessa", "André", "Bruno", "Carlos", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Leonardo", "Marcelo", "Rafael", "Rodrigo", "Thiago", "Vinícius"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Costa", "Dias", "Ferreira", "Gomes", "Lima", "Martins", "Melo", "Moreira", "Nogueira", "Oliveira", "Pereira", "Ramos", "Ribeiro", "Rocha", "Santana", "Teixeira", "Vieira", "Azevedo", "Carvalho", "Duarte", "Freitas", "Monteiro", "Pinheiro"];
const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const usados = new Set();
function pessoa() { let n; do n = `${escolher(PRIMEIROS)} ${escolher(SOBRENOMES)} ${escolher(SOBRENOMES)}`; while (usados.has(n)); usados.add(n); return semAcento(n); }
const PALAVRAS = ["AURORA", "LIRIO", "JASMIM", "AMBAR", "SAFIRA", "VIOLETA", "ESMERALDA", "TOPAZIO", "ORQUIDEA", "CAMELIA", "MAGNOLIA", "CRISTAL", "PEROLA", "RUBI", "LOTUS", "IRIS", "ACACIA", "DALIA", "GARDENIA", "HORTENSIA", "PRIMAVERA", "VITORIA", "BELA VISTA", "BOM JARDIM", "ENCANTO", "ESSENCIAL", "BRILHO", "DIVINA", "SEDUCAO", "CHARME", "ELEGANCE", "GLAMOUR", "BELLE", "VIVACE", "ALEGRIA", "ESTRELA", "LUAR", "SOLAR", "MARE", "PRISMA", "AQUARELA", "CANELA", "BAUNILHA", "ALECRIM", "LAVANDA", "GIRASSOL", "MIMOSA", "TULIPA"];
const PREFIXO = { "DISTRIBUIDOR": ["DISTRIBUIDORA", "DIST"], "REDE DE PERFUMARIAS": ["PERFUMARIA"], "LOJA DE COSMÉTICOS": ["COSMETICOS", "CASA DA BELEZA", "EMPORIO", "LOJA"], "SALÃO DE BELEZA": ["SALAO", "STUDIO", "ESPACO", "INSTITUTO"], "FARMÁCIA E DROGARIA": ["DROGARIA", "FARMACIA"], "ATACAREJO": ["ATACADO", "ATACAREJO"], "E-COMMERCE": ["LOJA VIRTUAL", "SHOP"], "PROFISSIONAL AUTÔNOMO": ["CABELEIREIRA", "HAIR"], "VENDA A FUNCIONÁRIOS": [""] };
const nomesFantasia = new Set();
function nomeLoja(seg, cidade) {
  for (let t = 0; t < 200; t += 1) {
    const n = `${escolher(PREFIXO[seg.nome])} ${escolher(PALAVRAS)}${rnd() < 0.45 ? ` ${semAcento(cidade).split(" ")[0]}` : rnd() < 0.3 ? ` ${escolher(PALAVRAS)}` : ""}`.trim();
    if (!nomesFantasia.has(n)) { nomesFantasia.add(n); return n; }
  }
  throw new Error("Sem nomes disponíveis");
}
function cnpj(raiz) {
  const base = (raiz || String(inteiro(10000000, 99999999))) + String(inteiro(1, 9)).padStart(4, "0");
  const dv = (s) => { const pesos = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = [...s].reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base), d2 = dv(base + d1);
  return `${base}${d1}${d2}`;
}
const razaoDe = (nome) => `${nome.split(" ").slice(-1)[0]} ${escolher(["COMERCIO DE COSMETICOS", "COSMETICOS E PERFUMARIA", "PRODUTOS DE BELEZA", "DISTRIBUIDORA"])} ${escolher(["LTDA", "LTDA - ME", "EIRELI", "S.A."])}`;

// ---------- Vendedores (carteiras por filial) ----------
const vendedores = [];
for (const [fil, qtd] of Object.entries({ "01001": 9, "02002": 4, "03001": 3, "03002": 3, "04001": 6, "05001": 2 })) {
  for (let i = 0; i < qtd; i += 1) vendedores.push({ codigo: String(100 + vendedores.length * 3).padStart(6, "0"), nome: pessoa(), filial: fil, situacao: rnd() < 0.1 ? "Inativo" : "Ativo" });
}
const vendedoresDa = (fil) => vendedores.filter((v) => v.filial === fil);

// ---------- Clientes ----------
const dic = { canal: [], regiao: [], uf: [], municipio: [], rede: [], categoria: [], familia: [], filial: [], statusProduto: [] };
const idDe = (lista, valor) => { let i = lista.indexOf(valor); if (i < 0) { i = lista.length; lista.push(valor); } return i; };
const clientes = [];
const sequencia = {};
const chaveNova = (fil) => { sequencia[fil] = (sequencia[fil] || 0) + inteiro(1, 6); return `${fil}|${String(sequencia[fil]).padStart(6, "0")}|01`; };
function novoCliente({ seg, estado, cidade, nome, rede = "INDEPENDENTE", fil, raizCnpj, funcionario = false }) {
  fil = fil || (rnd() < 0.05 ? "05001" : filialDoEstado(estado.uf));
  const vend = escolher(vendedoresDa(fil));
  const c = {
    chave: chaveNova(fil), nome, razao: funcionario ? nome : razaoDe(nome), cnpj: funcionario ? String(inteiro(1e10, 9e10)) : cnpj(raizCnpj),
    seg, estado, cidade, rede, fil, vend, funcionario,
    tamanho: lognormal(seg.tamanho, 0.85), freq: Math.min(0.95, seg.freq * entre(0.75, 1.25)),
    crescimento: normal() * 0.26 - 0.03, // ao ano
    inicio: rnd() < 0.8 ? 0 : inteiro(1, 34), fim: 99, retorno: -1,
    preferidas: [...CATEGORIAS].sort(() => rnd() - 0.5).slice(0, inteiro(4, 9)),
    vendedorNovo: null, demonstradora: null,
  };
  // Perdidos: param de comprar em algum mês (alguns voltam depois de 12+ meses = reativados).
  if (rnd() < 0.22) { c.fim = inteiro(c.inicio + 2, 36); if (rnd() < 0.18 && c.fim + 13 < 36) c.retorno = inteiro(c.fim + 13, 36); }
  // Troca de carteira: parte dos clientes muda de vendedor no meio da janela.
  if (rnd() < 0.1) c.vendedorNovo = { a_partir: inteiro(8, 30), vend: escolher(vendedoresDa(fil)) };
  clientes.push(c);
  return c;
}
// Redes: várias lojas com o mesmo prefixo, numeradas.
const REDES = ["PERFUMARIA ESTRELA", "BELLA FORMA", "CASA DA BELEZA AURI", "PONTO BELO", "MUNDO DOS CACHOS", "VIVA COR", "ESSENZA", "LUMINA", "MAISON BELLE", "DOCE ENCANTO"];
for (const rede of REDES) {
  const estado = sortearPeso(ESTADOS.filter((e) => e.peso >= 2));
  const seg = SEGMENTOS[1], raiz = String(inteiro(10000000, 99999999)), lojas = inteiro(3, 14);
  for (let i = 1; i <= lojas; i += 1) {
    const cidade = escolher(estado.cidades), nome = `${rede} LJ ${String(i).padStart(2, "0")}`;
    nomesFantasia.add(nome);
    novoCliente({ seg, estado, cidade, nome, rede, raizCnpj: raiz });
  }
}
// Demais clientes.
while (clientes.length < 1750) {
  const seg = sortearPeso(SEGMENTOS.filter((s) => s.nome !== "REDE DE PERFUMARIAS")), estado = sortearPeso(ESTADOS), cidade = escolher(estado.cidades);
  novoCliente({ seg, estado, cidade, nome: nomeLoja(seg, cidade) });
}
// Mesmo nome fantasia em outro cadastro (CNPJ novo ou outra filial): o painel une os dois num cliente só.
for (const c of clientes.filter((c) => c.inicio === 0 && c.fim === 99 && rnd() < 0.035)) {
  const troca = inteiro(8, 28);
  const novo = novoCliente({ seg: c.seg, estado: c.estado, cidade: c.cidade, nome: c.nome, rede: c.rede, fil: rnd() < 0.5 ? "05001" : c.fil });
  Object.assign(novo, { tamanho: c.tamanho, freq: c.freq, crescimento: c.crescimento, preferidas: c.preferidas, inicio: troca, fim: 99, retorno: -1 });
  c.fim = troca - 1; c.retorno = -1;
}
// Cadastrados que nunca compraram na janela.
for (const c of clientes) if (rnd() < 0.12) { c.inicio = 99; }
// Funcionários (CPF): compram pouco; o faturamento conta, mas não são clientes.
for (let i = 0; i < 42; i += 1) {
  const estado = ESTADOS[0];
  novoCliente({ seg: SEG_FUNCIONARIO, estado, cidade: "São Paulo", nome: pessoa(), fil: "01001", funcionario: true });
}
// Demonstradoras: agenda mensal em parte das lojas; nos meses com agenda a loja compra mais.
const demonstradoras = Array.from({ length: 46 }, () => pessoa());
for (const c of clientes) {
  if (c.funcionario || !["REDE DE PERFUMARIAS", "LOJA DE COSMÉTICOS", "ATACAREJO", "FARMÁCIA E DROGARIA"].includes(c.seg.nome)) continue;
  if (rnd() > (c.seg.nome === "REDE DE PERFUMARIAS" ? 0.55 : 0.13)) continue;
  const ini = inteiro(Math.max(0, c.inicio === 99 ? 0 : c.inicio), 30), dur = inteiro(3, 20);
  c.demonstradora = { d: inteiro(0, demonstradoras.length - 1), meses: new Set(Array.from({ length: dur }, (_, k) => ini + k).filter((m) => m < 37)) };
}

// ---------- Fatos ----------
const fatos = new Map(); // p|c|pr|v → [q, qp, val] (centavos e centésimos)
const pedidos = new Map(); // data|c|v → [qtd, val]
const ultimaCompra = new Map(); // c → [{p, pr, qp, preco}] para devoluções
const tendenciaGeral = (p) => 1 + 0.006 * p + (p >= 27 ? 0.03 : 0); // empresa cresce ~8% a.a. e acelera em 2026
for (let ci = 0; ci < clientes.length; ci += 1) {
  const c = clientes[ci];
  for (let p = 0; p < PERIODOS.length; p += 1) {
    const ativo = p >= c.inicio && (p <= c.fim || (c.retorno >= 0 && p >= c.retorno));
    if (!ativo) continue;
    const comAgenda = c.demonstradora?.meses.has(p);
    const mes = Number(PERIODOS[p].slice(4)) - 1;
    if (rnd() > Math.min(0.97, c.freq + (comAgenda ? 0.18 : 0))) continue;
    const vend = c.vendedorNovo && p >= c.vendedorNovo.a_partir ? c.vendedorNovo.vend : c.vend;
    const v = vendedores.indexOf(vend);
    const escala = c.tamanho * SAZONALIDADE[mes] * tendenciaGeral(p) * Math.exp(c.crescimento * (p - Math.max(0, c.inicio)) / 12) * (comAgenda ? 1.35 : 1) * (p === 36 ? FRACAO_MES_PARCIAL : 1);
    const nPedidos = 1 + (rnd() < 0.3 ? 1 : 0) + (c.seg.tamanho > 2 && rnd() < 0.5 ? inteiro(1, 3) : 0);
    const dias = [...new Set(Array.from({ length: nPedidos }, () => inteiro(1, p === 36 ? 19 : 28)))];
    for (const dia of dias) {
      const data = Number(`${PERIODOS[p]}${String(dia).padStart(2, "0")}`);
      const nItens = Math.max(1, Math.min(28, Math.round(lognormal(c.seg.itens, 0.5) * Math.pow(Math.max(0.3, c.tamanho / c.seg.tamanho), 0.25))));
      let valorPedido = 0;
      for (let k = 0; k < nItens; k += 1) {
        const cat = sortearPeso(c.preferidas, (x) => x.peso * Math.exp((TENDENCIA_CATEGORIA[x.nome] || 0) * p / 12));
        const opcoes = produtos.filter((x) => x.cat === cat && p >= x.lancamento);
        if (!opcoes.length) continue;
        const prod = sortearPeso(opcoes, (x) => x.popularidade);
        const pr = produtos.indexOf(prod);
        const qp = Math.max(1, Math.round(lognormal(c.seg.qtd, 0.6) * Math.sqrt(escala / c.seg.tamanho)));
        const bonus = rnd() < 0.07 ? Math.max(1, Math.round(qp * 0.1)) : 0;
        const preco = precoNoMes(prod, p) * (1 - c.seg.desconto) * entre(0.97, 1.03);
        const val = Math.round(qp * preco * 100);
        const kf = `${p}|${ci}|${pr}|${v}`;
        const f = fatos.get(kf) || [0, 0, 0];
        f[0] += (qp + bonus) * 100; f[1] += qp * 100; f[2] += val;
        fatos.set(kf, f);
        valorPedido += val;
        if (rnd() < 0.15) ultimaCompra.set(ci, { pr, qp, preco, v });
      }
      const kp = `${data}|${ci}|${v}`;
      const o = pedidos.get(kp) || [0, 0];
      o[0] += 1; o[1] += valorPedido;
      pedidos.set(kp, o);
    }
    // Devolução ocasional (valor negativo, sem pedido): aparece em "Ajustes/devoluções".
    const ult = ultimaCompra.get(ci);
    if (ult && rnd() < 0.025) {
      const qtd = Math.max(1, Math.round(ult.qp * entre(0.2, 1)));
      const val = -Math.round(qtd * ult.preco * 100);
      const kf = `${p}|${ci}|${ult.pr}|${ult.v}`;
      const f = fatos.get(kf) || [0, 0, 0];
      f[0] -= qtd * 100; f[1] -= qtd * 100; f[2] += val;
      fatos.set(kf, f);
      const kp = `${PERIODOS[p]}${String(inteiro(1, 28)).padStart(2, "0")}|${ci}|${ult.v}`;
      const o = pedidos.get(kp) || [0, 0];
      o[1] += val;
      pedidos.set(kp, o);
    }
  }
}

// ---------- Montagem no formato do painel ----------
const ordemFatos = [...fatos.entries()].map(([k, f]) => [...k.split("|").map(Number), ...f]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const F = { p: new Uint8Array(ordemFatos.length), c: new Uint16Array(ordemFatos.length), pr: new Uint16Array(ordemFatos.length), v: new Uint16Array(ordemFatos.length), q: new Int32Array(ordemFatos.length), qp: new Int32Array(ordemFatos.length), val: new Int32Array(ordemFatos.length) };
ordemFatos.forEach(([p, c, pr, v, q, qp, val], i) => { F.p[i] = p; F.c[i] = c; F.pr[i] = pr; F.v[i] = v; F.q[i] = q; F.qp[i] = qp; F.val[i] = val; });
const ordemPedidos = [...pedidos.entries()].map(([k, o]) => [...k.split("|").map(Number), ...o]).sort((a, b) => a[0] - b[0]);
const O = { d: new Int32Array(ordemPedidos.length), c: new Uint16Array(ordemPedidos.length), v: new Uint16Array(ordemPedidos.length), qtd: new Uint16Array(ordemPedidos.length), val: new Int32Array(ordemPedidos.length) };
ordemPedidos.forEach(([d, c, v, qtd, val], i) => { O.d[i] = d; O.c[i] = c; O.v[i] = v; O.qtd[i] = qtd; O.val[i] = val; });
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
const encode = (obj) => Object.fromEntries(Object.entries(obj).map(([k, a]) => [k, b64(a)]));

// Data de lançamento = primeira venda.
const primeiraVenda = new Array(produtos.length).fill("");
for (const [p, , pr, , q] of ordemFatos) if (q > 0 && !primeiraVenda[pr]) primeiraVenda[pr] = PERIODOS[p];

const linhasClientes = clientes.map((c) => [
  c.chave, c.nome, c.razao, c.cnpj, idDe(dic.municipio, `${semAcento(c.cidade)} / ${c.estado.uf}`), idDe(dic.uf, c.estado.uf), idDe(dic.regiao, c.estado.regiao.toUpperCase()),
  idDe(dic.canal, c.seg.nome), idDe(dic.rede, c.rede), idDe(dic.filial, FILIAIS[c.fil]), vendedores.indexOf(c.vendedorNovo?.vend || c.vend), 1,
]);
const linhasProdutos = produtos.map((p, i) => [p.codigo, p.nome, idDe(dic.categoria, p.cat.nome), idDe(dic.familia, p.cat.familia), idDe(dic.statusProduto, "CADASTRO VÁLIDO"), primeiraVenda[i]]);

// Cadastro geral (SA1 inteira): válidos + funcionários + cadastros desconsiderados pelo tratamento (sem vendas).
const mascaraCpf = (d) => `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
const cadastroLinhas = clientes.map((c) => [c.chave, c.razao, c.nome, c.funcionario ? mascaraCpf(c.cnpj) : c.cnpj, semAcento(c.cidade), c.estado.uf, (c.vendedorNovo?.vend || c.vend).nome, c.funcionario ? 0 : 1, c.funcionario ? "Funcionário (CPF)" : ""]);
const EXCLUIDOS = { "Sem CNPJ válido": 61, "Cadastro de teste": 7, "Empresa interna": 4, "Não é cliente": 33, "Sem vendedor": 48, "Cadastro duplicado (mantido o ativo)": 26 };
const contagens = {};
for (const [motivo, n] of Object.entries(EXCLUIDOS)) {
  contagens[motivo] = n;
  for (let i = 0; i < n; i += 1) {
    const seg = sortearPeso(SEGMENTOS), estado = sortearPeso(ESTADOS), cidade = escolher(estado.cidades), fil = filialDoEstado(estado.uf);
    const nome = motivo === "Cadastro de teste" ? `TESTE ${inteiro(1, 99)}` : motivo === "Empresa interna" ? `${MARCA} ${escolher(["MATRIZ", "LABORATORIO", "SHOWROOM", "CD"])}` : nomeLoja(seg, cidade);
    cadastroLinhas.push([chaveNova(fil), razaoDe(nome), nome, motivo === "Sem CNPJ válido" ? "" : cnpj(), semAcento(cidade), estado.uf, motivo === "Sem vendedor" ? "" : escolher(vendedoresDa(fil)).nome, 0, motivo]);
  }
}
const validos = cadastroLinhas.filter((l) => l[7]);
const nomesValidos = new Set(validos.map((l) => l[2]));
const funcionarios = clientes.filter((c) => c.funcionario).length;

const D = {
  geradoEm: GERADO_EM, janelaMeses: 37, primeiroPeriodo: PERIODOS[0], ultimoPeriodo: PERIODOS.at(-1),
  origem: { banco: "Dados fictícios (gerador de demonstração)", lote: "Aurora Cosméticos Profissionais" },
  periodos: PERIODOS, dic,
  clientes: linhasClientes, produtos: linhasProdutos, vendedores: vendedores.map((v) => [v.codigo, v.nome, v.situacao]),
  cadastroSA1: {
    arquivo: "clientes_sa1_completo_ficticio.csv", cadastros: validos.length, clientes: nomesValidos.size, ativosCadastro: Math.round(nomesValidos.size * 0.86),
    tratamento: { lidos: cadastroLinhas.length, funcionarios, semCnpj: contagens["Sem CNPJ válido"], internas: contagens["Empresa interna"], testes: contagens["Cadastro de teste"], naoClientes: contagens["Não é cliente"], semVendedor: contagens["Sem vendedor"], duplicados: contagens["Cadastro duplicado (mantido o ativo)"] },
  },
  cadastroGeral: { colunas: ["id", "razao", "fantasia", "documento", "cidade", "uf", "vendedor", "valido", "motivo"], linhas: cadastroLinhas },
  demonstradoras: { nomes: demonstradoras, agendas: clientes.flatMap((c, ci) => (c.demonstradora ? [...c.demonstradora.meses].map((m) => [ci, c.demonstradora.d, Number(PERIODOS[m]), 800]) : [])) },
  fato: { n: ordemFatos.length, ...encode(F) },
  pedidos: { n: ordemPedidos.length, ...encode(O) },
};
const destino = path.join(__dirname, "..", "painel", "dados", "dados.js");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, `window.DADOS = ${JSON.stringify(D)};\n`, "utf8");
const total = ordemFatos.reduce((s, f) => s + f[6], 0) / 100;
console.log(JSON.stringify({ arquivo: path.relative(process.cwd(), destino), megabytes: +(fs.statSync(destino).size / 1048576).toFixed(1), clientes: clientes.length, produtos: produtos.length, vendedores: vendedores.length, linhasFato: ordemFatos.length, linhasPedidos: ordemPedidos.length, agendas: D.demonstradoras.agendas.length, faturamentoTotal: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }, null, 2));
