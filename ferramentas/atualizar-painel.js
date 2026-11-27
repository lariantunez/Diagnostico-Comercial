// Copia o painel do projeto original (frontend) para painel/ e o adapta ao modo demonstração:
// sem servidor (não consulta a API), selo "Dados fictícios" e o botão de importação vira "voltar ao estudo de caso".
// O código do painel é o mesmo do projeto em produção: só os dados (painel/dados/dados.js) são fictícios.
// Uso: node ferramentas/atualizar-painel.js "<pasta frontend do projeto original>"
const fs = require("fs");
const path = require("path");

const origem = process.argv[2];
if (!origem || !fs.existsSync(path.join(origem, "index.html"))) { console.error("Informe a pasta frontend do projeto original."); process.exit(1); }
const destino = path.join(__dirname, "..", "painel");
const ARQUIVOS = ["index.html", "css/app.css", "js/formato.js", "js/motor.js", "js/mapa-brasil.js", "js/graficos.js", "js/componentes.js", "js/explicacoes.js", "js/telas.js", "js/app.js", "js/apresentacao.js"];
// Bibliotecas de terceiros usadas pelo "Exportar apresentação" (PowerPoint, prints e Excel): copiadas como estão.
const BIBLIOTECAS = ["js/vendor/pptxgen.bundle.js", "js/vendor/pptxgenjs-LICENSE.txt", "js/vendor/html-to-image.js", "js/vendor/html-to-image-LICENSE.txt", "js/vendor/exceljs.min.js", "js/vendor/exceljs-LICENSE.txt"];

// Trocas exatas: se o trecho não existir mais no original, a cópia para (para ninguém publicar um painel quebrado).
const TROCAS = {
  "js/app.js": [[
    /async function criarLink\(extra\) \{/,
    'async function criarLink(extra) {\n    return null; // demonstração sem servidor: sem link "Abrir no painel"',
  ], [
    /fonteDados\.textContent = "Verificando banco\.\.\.";\r?\n(\s*)document\.querySelector\("\.topo"\)\.prepend\(fonteDados\);\r?\n\s*fetch\("api\/saude"\)[\s\S]*?fonteDados\.classList\.add\("erro"\); \}\);/,
    (_, ind) => `fonteDados.textContent = "Dados fictícios · demonstração";\n${ind}document.querySelector(".topo").prepend(fonteDados);`,
  ]],
  // Sem servidor: os slides não ganham o botão "Abrir no painel" (o link curto é guardado no banco do projeto real).
  // As tabelas saem com as linhas que couberem e a nota aponta para a planilha baixada junto.
  "js/apresentacao.js": [[
    /Tabelas entram com as linhas e colunas que couberem no slide, com um botão para abrir a tabela no painel \(mesmos filtros\); as tabelas completas vão numa planilha Excel baixada junto\./,
    "Tabelas entram com as linhas e colunas que couberem no slide; as tabelas completas vão numa planilha Excel baixada junto.",
  ]],
  "index.html": [
    [/<a class="btn" id="abrir-importacao"[^>]*>Importar bases<\/a>/, '<a class="btn" id="abrir-importacao" href="../index.html">← Estudo de caso</a>'],
    [/<title>[^<]*<\/title>/, "<title>Diagnóstico Comercial · Demonstração</title>"],
  ],
};

for (const rel of ARQUIVOS) {
  let texto = fs.readFileSync(path.join(origem, rel), "utf8");
  for (const [de, para] of TROCAS[rel] || []) {
    if (!de.test(texto)) { console.error(`Trecho não encontrado em ${rel}: ${de}`); process.exit(1); }
    texto = texto.replace(de, para);
  }
  fs.mkdirSync(path.dirname(path.join(destino, rel)), { recursive: true });
  fs.writeFileSync(path.join(destino, rel), texto, "utf8");
  console.log(`copiado ${rel}`);
}
for (const rel of BIBLIOTECAS) {
  fs.mkdirSync(path.dirname(path.join(destino, rel)), { recursive: true });
  fs.copyFileSync(path.join(origem, rel), path.join(destino, rel));
  console.log(`copiado ${rel}`);
}
