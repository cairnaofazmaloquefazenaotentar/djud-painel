const XLSX = require("xlsx");
const path = require("path");

const filePath =
  "C:\\Users\\Avell\\OneDrive\\Documentos\\DOUTORADO\\Possíveis Artigos para publicação - depois do ENMC com o profs Marcelo e Gentil\\Artigo_Judicialização_PNCP\\Base_Locoust5000\\baseRedmine_17-03-2026.xlsx";

console.log("📊 Analisando arquivo Excel...\n");

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`✅ Arquivo lido com sucesso!`);
  console.log(`📝 Planilha: ${sheetName}`);
  console.log(`📊 Linhas: ${data.length}`);
  console.log(`\n🔍 Colunas encontradas:`);

  if (data.length > 0) {
    const columns = Object.keys(data[0]);
    columns.forEach((col, idx) => {
      console.log(`  ${idx + 1}. ${col}`);
    });

    console.log(`\n📋 Primeiras 3 linhas:`);
    data.slice(0, 3).forEach((row, idx) => {
      console.log(`\n  Linha ${idx + 1}:`);
      Object.entries(row).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
    });
  }
} catch (error) {
  console.error("❌ Erro ao ler arquivo:", error.message);
  process.exit(1);
}
