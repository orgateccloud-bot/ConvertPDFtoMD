/**
 * Módulo de conversão PDF -> Markdown (Node.js).
 * Três métodos: simples, avançado e OCR.
 */
const fs = require('fs');
const path = require('path');

/**
 * Conversão Simples — extrai apenas texto puro.
 * Usa pdf-parse. Rápido. Bom para PDFs digitais.
 */
async function convertSimple(pdfPath) {
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  const pages = data.text.split(/\f/);
  return pages
    .map((text, i) => `## Página ${i + 1}\n\n${text.trim()}\n\n---\n`)
    .join('\n');
}

/**
 * Conversão Avançada — preserva títulos, listas e estrutura.
 * Usa @opendocsg/pdf2md.
 */
async function convertAdvanced(pdfPath) {
  const pdf2md = require('@opendocsg/pdf2md');
  const dataBuffer = fs.readFileSync(pdfPath);
  return await pdf2md(dataBuffer);
}

/**
 * Conversão com OCR — para PDFs escaneados.
 * Renderiza cada página como PNG e roda Tesseract.js.
 */
async function convertOcr(pdfPath, lang = 'por+eng') {
  const { pdfToPng } = require('pdf-to-png-converter');
  const Tesseract = require('tesseract.js');

  const pngPages = await pdfToPng(pdfPath, {
    viewportScale: 2.0,
    outputFolder: undefined,
  });

  const worker = await Tesseract.createWorker(lang);
  const blocks = [];
  try {
    for (let i = 0; i < pngPages.length; i++) {
      const { data } = await worker.recognize(pngPages[i].content);
      blocks.push(`## Página ${i + 1}\n\n${data.text.trim()}\n\n---\n`);
    }
  } finally {
    await worker.terminate();
  }
  return blocks.join('\n');
}

const METHODS = {
  simple: convertSimple,
  advanced: convertAdvanced,
  ocr: convertOcr,
};

/**
 * Função principal de conversão.
 * @param {string} pdfPath - caminho do PDF.
 * @param {object} opts - { method, outputPath }
 */
async function convert(pdfPath, { method = 'advanced', outputPath = null } = {}) {
  if (!METHODS[method]) {
    throw new Error(`Método inválido: ${method}. Use: ${Object.keys(METHODS).join(', ')}`);
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Arquivo não encontrado: ${pdfPath}`);
  }

  const md = await METHODS[method](pdfPath);
  if (outputPath) {
    fs.writeFileSync(outputPath, md, 'utf-8');
  }
  return md;
}

module.exports = { convert, convertSimple, convertAdvanced, convertOcr, METHODS };

// Execução via CLI
if (require.main === module) {
  const [, , pdfArg, methodArg = 'advanced', outArg] = process.argv;
  if (!pdfArg) {
    console.log('Uso: node converters.js <pdf> [método] [saída.md]');
    console.log('Métodos: simple, advanced, ocr');
    process.exit(1);
  }
  const output = outArg || path.basename(pdfArg, path.extname(pdfArg)) + '.md';
  console.log(`Convertendo '${pdfArg}' (método: ${methodArg}) ...`);
  convert(pdfArg, { method: methodArg, outputPath: output })
    .then(() => console.log(`Salvo em: ${output}`))
    .catch((err) => {
      console.error('Erro:', err.message);
      process.exit(1);
    });
}
