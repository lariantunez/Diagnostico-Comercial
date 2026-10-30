// Copia o painel do projeto original (frontend) para painel/ e o adapta ao modo demonstração:
// sem servidor (não consulta a API), selo "Dados fictícios" e o botão de importação vira "voltar ao estudo de caso".
// O código do painel é o mesmo do projeto em produção: só os dados (painel/dados/dados.js) são fictícios.
// Uso: node ferramentas/atualizar-painel.js "<pasta frontend do projeto original>"
const fs = require("fs");
const path = require("path");

const origem = process.argv[2];
if (!origem || !fs.existsSync(path.join(origem, "index.html"))) { console.error("Informe a pasta frontend do projeto original."); process.exit(1); }
const destino = path.join(__dirname, "..", "painel");
const ARQUIVOS = ["index.html", "css/app.css", "js/formato.js", "js/motor.js", "js/mapa-brasil.js", "js/graficos.js", "js/componentes.js", "js/telas.js", "js/app.js"];

// Trocas exatas: se o trecho não existir mais no original, a cópia para (para ninguém publicar um painel quebrado).
const TROCAS = {
  "js/app.js": [[
    /fonteDados\.textContent = "Verificando banco\.\.\.";\r?\n(\s*)document\.querySelector\("\.topo"\)\.prepend\(fonteDados\);\r?\n\s*fetch\("api\/saude"\)[\s\S]*?fonteDados\.classList\.add\("erro"\); \}\);/,
    (_, ind) => `fonteDados.textContent = "Dados fictícios · demonstração";\n${ind}document.querySelector(".topo").prepend(fonteDados);`,
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
