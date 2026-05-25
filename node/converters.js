/**
 * Módulo de conversão PDF -> Markdown ou XML (Node.js).
 * Quatro métodos: simples, avançado, OCR, premium (Python via subprocess).
 * Dois formatos de saída: md (padrão) ou xml estruturado por página.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Extração por página: cada função devolve [{ number, text }, ...]
// ---------------------------------------------------------------------------
async function extractPagesSimple(pdfPath) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(fs.readFileSync(pdfPath));
  return data.text.split(/\f/).map((text, i) => ({ number: i + 1, text: text.trim() }));
}

async function extractPagesAdvanced(pdfPath) {
  const pdf2md = require('@opendocsg/pdf2md');
  const md = await pdf2md(fs.readFileSync(pdfPath));
  // pdf2md insere "<!-- PAGE_BREAK -->" entre páginas
  return md
    .split(/<!--\s*PAGE_BREAK\s*-->/)
    .map((text, i) => ({ number: i + 1, text: text.trim() }));
}

async function extractPagesOcr(pdfPath, lang = 'por+eng') {
  const { pdf } = await import('pdf-to-img');
  const Tesseract = require('tesseract.js');

  const document = await pdf(pdfPath, { scale: 2 });
  const worker = await Tesseract.createWorker(lang);
  const pages = [];
  let pageNum = 0;
  try {
    for await (const pngBuffer of document) {
      pageNum += 1;
      const { data } = await worker.recognize(pngBuffer);
      pages.push({ number: pageNum, text: data.text.trim() });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------
function pagesToMarkdown(pages) {
  return pages
    .map(({ number, text }) => `## Página ${number}\n\n${text}\n\n---\n`)
    .join('\n');
}

function xmlEscapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pagesToXml(pages, source, method) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<pdf-document source="${xmlEscapeAttr(path.basename(source))}" ` +
      `method="${xmlEscapeAttr(method)}" pages="${pages.length}" ` +
      `converted-at="${new Date().toISOString()}">`,
    '  <pages>',
  ];
  for (const { number, text } of pages) {
    // Escapa "]]>" dentro do CDATA quebrando-o.
    const safe = text.replace(/]]>/g, ']]]]><![CDATA[>');
    lines.push(`    <page number="${number}">`);
    lines.push(`      <content><![CDATA[${safe}]]></content>`);
    lines.push('    </page>');
  }
  lines.push('  </pages>');
  lines.push('</pdf-document>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Métodos públicos (sempre retornam Markdown — compat. retroativa)
// ---------------------------------------------------------------------------
async function convertSimple(pdfPath)   { return pagesToMarkdown(await extractPagesSimple(pdfPath)); }
async function convertAdvanced(pdfPath) { return (require('@opendocsg/pdf2md'))(fs.readFileSync(pdfPath)); }
async function convertOcr(pdfPath)      { return pagesToMarkdown(await extractPagesOcr(pdfPath)); }

/**
 * Conversão Premium — delega ao pymupdf4llm (Python) via subprocess.
 * Aceita o formato (md ou xml) e repassa para o script Python, que sabe ambos.
 */
async function convertPremium(pdfPath, fmt = 'md') {
  const pyScript = path.resolve(__dirname, '..', 'python', 'converters.py');
  if (!fs.existsSync(pyScript)) {
    throw new Error(`Script Python não encontrado: ${pyScript}`);
  }
  const ext = fmt === 'xml' ? '.xml' : '.md';
  const tmpOut = path.join(os.tmpdir(), `pdf2md-${crypto.randomBytes(8).toString('hex')}${ext}`);
  const pyExe = process.env.PYTHON || 'python';

  return new Promise((resolve, reject) => {
    const proc = spawn(pyExe, [pyScript, pdfPath, 'advanced', tmpOut, fmt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Falha ao executar Python: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python saiu com código ${code}. ${stderr.trim()}`));
      }
      try {
        const out = fs.readFileSync(tmpOut, 'utf-8');
        fs.unlink(tmpOut, () => {});
        resolve(out);
      } catch (err) {
        reject(new Error(`Não foi possível ler a saída do Python: ${err.message}`));
      }
    });
  });
}

const METHODS = {
  simple:   { extract: extractPagesSimple,   markdown: convertSimple },
  advanced: { extract: extractPagesAdvanced, markdown: convertAdvanced },
  ocr:      { extract: extractPagesOcr,      markdown: convertOcr },
  premium:  { extract: null,                 markdown: convertPremium }, // delega tudo ao Python
};

const FORMATS = ['md', 'xml'];

/**
 * Função principal de conversão.
 * @param {string} pdfPath - caminho do PDF.
 * @param {object} opts - { method, format, outputPath }
 */
async function convert(pdfPath, { method = 'advanced', format = 'md', outputPath = null } = {}) {
  if (!METHODS[method]) {
    throw new Error(`Método inválido: ${method}. Use: ${Object.keys(METHODS).join(', ')}`);
  }
  if (!FORMATS.includes(format)) {
    throw new Error(`Formato inválido: ${format}. Use: ${FORMATS.join(', ')}`);
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Arquivo não encontrado: ${pdfPath}`);
  }

  let content;
  if (method === 'premium') {
    content = await convertPremium(pdfPath, format);
  } else if (format === 'md') {
    content = await METHODS[method].markdown(pdfPath);
  } else {
    const pages = await METHODS[method].extract(pdfPath);
    content = pagesToXml(pages, pdfPath, method);
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, content, 'utf-8');
  }
  return content;
}

module.exports = {
  convert,
  convertSimple, convertAdvanced, convertOcr, convertPremium,
  extractPagesSimple, extractPagesAdvanced, extractPagesOcr,
  pagesToMarkdown, pagesToXml,
  METHODS, FORMATS,
};

// Execução via CLI
if (require.main === module) {
  const [, , pdfArg, methodArg = 'advanced', outArg, fmtArg = 'md'] = process.argv;
  if (!pdfArg) {
    console.log('Uso: node converters.js <pdf> [método] [saída] [formato]');
    console.log('  método:   simple | advanced | ocr | premium');
    console.log('  formato:  md (padrão) | xml');
    process.exit(1);
  }
  const ext = fmtArg === 'xml' ? '.xml' : '.md';
  const output = outArg || path.basename(pdfArg, path.extname(pdfArg)) + ext;
  console.log(`Convertendo '${pdfArg}' (método: ${methodArg}, formato: ${fmtArg}) ...`);
  convert(pdfArg, { method: methodArg, format: fmtArg, outputPath: output })
    .then(() => console.log(`Salvo em: ${output}`))
    .catch((err) => {
      console.error('Erro:', err.message);
      process.exit(1);
    });
}
