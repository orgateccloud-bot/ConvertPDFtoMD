/**
 * Servidor Express + interface web para o conversor PDF -> Markdown.
 * Acesse http://localhost:3000 após `npm start`.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { convert } = require('./converters');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const upload = multer({ dest: UPLOAD_DIR });
const app = express();

app.get('/', (_req, res) => {
  res.send(HTML_PAGE);
});

app.post('/convert', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  const method = req.body.method || 'advanced';
  const format = req.body.format || 'md';
  try {
    const content = await convert(req.file.path, { method, format });
    res.json({ ok: true, content, format, filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

const HTML_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>PDF -> Markdown / XML</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { margin-top: 0; color: #333; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: 600; color: #555; }
    input[type=file] { padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 100%; }
    .methods { display: flex; gap: 15px; flex-wrap: wrap; }
    .method { padding: 12px 16px; border: 2px solid #ddd; border-radius: 6px; cursor: pointer; flex: 1; min-width: 200px; }
    .method.selected { border-color: #4a90e2; background: #eef5fc; }
    .method input { margin-right: 8px; }
    .method small { display: block; color: #777; margin-top: 4px; }
    .formats { display: flex; gap: 10px; }
    .format { padding: 8px 14px; border: 2px solid #ddd; border-radius: 6px; cursor: pointer; }
    .format.selected { border-color: #4a90e2; background: #eef5fc; }
    .format input { margin-right: 6px; }
    button { background: #4a90e2; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 16px; }
    button:hover:not(:disabled) { background: #357ab8; }
    button:disabled { background: #aaa; cursor: not-allowed; }
    .status { margin: 15px 0; padding: 12px; border-radius: 4px; }
    .status.info { background: #e3f2fd; color: #1565c0; border-left: 4px solid #1565c0; }
    .status.error { background: #ffebee; color: #c62828; border-left: 4px solid #c62828; }
    .status.success { background: #e8f5e9; color: #2e7d32; border-left: 4px solid #2e7d32; }
    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #1565c0; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint { font-size: 13px; color: #555; margin-top: 6px; }
    textarea { width: 100%; min-height: 400px; font-family: 'Consolas', monospace; font-size: 13px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    .actions { display: flex; gap: 10px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PDF -> Markdown / XML</h1>
    <p>Faça upload de um PDF, escolha o método de extração e o formato de saída.</p>

    <form id="form">
      <div class="form-group">
        <label>Arquivo PDF</label>
        <input type="file" name="pdf" accept="application/pdf" required>
      </div>

      <div class="form-group">
        <label>Método</label>
        <div class="methods">
          <label class="method">
            <input type="radio" name="method" value="simple"> <strong>Simples</strong>
            <small>Texto puro. Rápido.</small>
          </label>
          <label class="method">
            <input type="radio" name="method" value="advanced"> <strong>Avançado</strong>
            <small>Preserva títulos e estrutura.</small>
          </label>
          <label class="method">
            <input type="radio" name="method" value="ocr"> <strong>OCR</strong>
            <small>PDFs escaneados. Mais lento.</small>
          </label>
          <label class="method">
            <input type="radio" name="method" value="premium" checked> <strong>Premium</strong>
            <small>pymupdf4llm via Python. Layout + OCR híbrido. Recomendado.</small>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Formato de saída</label>
        <div class="formats">
          <label class="format selected">
            <input type="radio" name="format" value="md" checked> Markdown (.md)
          </label>
          <label class="format">
            <input type="radio" name="format" value="xml"> XML (.xml, por página)
          </label>
          <label class="format">
            <input type="radio" name="format" value="ofx"> OFX (.ofx, extrato Sicoob)
          </label>
        </div>
      </div>

      <button type="submit" id="submitBtn">Converter</button>
    </form>

    <div id="status"></div>

    <div id="result" style="display:none; margin-top: 20px;">
      <label id="resultLabel">Resultado</label>
      <textarea id="output" readonly></textarea>
      <div class="actions">
        <button type="button" id="copyBtn">Copiar</button>
        <button type="button" id="downloadBtn">Baixar</button>
      </div>
    </div>
  </div>

  <script>
    // Visual selection for methods and formats
    function bindRadioGroup(itemSelector) {
      document.querySelectorAll(itemSelector + ' input').forEach(radio => {
        radio.addEventListener('change', () => {
          document.querySelectorAll(itemSelector).forEach(m => m.classList.remove('selected'));
          radio.closest(itemSelector).classList.add('selected');
        });
      });
      const checked = document.querySelector(itemSelector + ' input:checked');
      if (checked) {
        document.querySelectorAll(itemSelector).forEach(m => m.classList.remove('selected'));
        checked.closest(itemSelector).classList.add('selected');
      }
    }
    bindRadioGroup('.method');
    bindRadioGroup('.format');

    const form = document.getElementById('form');
    const submitBtn = document.getElementById('submitBtn');
    const statusEl = document.getElementById('status');
    const resultEl = document.getElementById('result');
    const resultLabel = document.getElementById('resultLabel');
    const outputEl = document.getElementById('output');
    let currentFilename = 'output.md';
    let currentMime = 'text/markdown';

    const METHOD_HINTS = {
      simple: '~5-10 segundos por arquivo',
      advanced: '~10-30 segundos por arquivo',
      ocr: '~5-15 segundos por pagina (baixa modelo na 1a vez)',
      premium: '~1-3 minutos para PDFs grandes (carrega modelo de layout)'
    };

    let elapsedTimer = null;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const selectedMethod = formData.get('method');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Convertendo... aguarde';
      resultEl.style.display = 'none';

      const startTime = Date.now();
      const renderStatus = () => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        const mm = String(Math.floor(secs / 60)).padStart(2, '0');
        const ss = String(secs % 60).padStart(2, '0');
        statusEl.className = 'status info';
        statusEl.innerHTML =
          '<span class="spinner"></span><strong>Convertendo... ' + mm + ':' + ss + '</strong>' +
          '<div class="hint">Metodo: <strong>' + selectedMethod + '</strong> &middot; estimativa: ' + METHOD_HINTS[selectedMethod] + '</div>' +
          '<div class="hint"><strong>Nao atualize a pagina nem clique de novo</strong> &mdash; o servidor esta processando.</div>';
      };
      renderStatus();
      elapsedTimer = setInterval(renderStatus, 1000);

      try {
        const res = await fetch('/convert', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
        outputEl.value = data.content;
        const extMap = { xml: '.xml', ofx: '.ofx' };
        const mimeMap = { xml: 'application/xml', ofx: 'application/x-ofx' };
        const ext = extMap[data.format] || '.md';
        currentMime = mimeMap[data.format] || 'text/markdown';
        currentFilename = data.filename.replace(/\.pdf$/i, ext);
        resultLabel.textContent = 'Resultado (' + data.format.toUpperCase() + ')';
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        statusEl.className = 'status success';
        statusEl.textContent = 'Concluido em ' + elapsed + 's (' + data.content.length + ' caracteres)';
        resultEl.style.display = 'block';
      } catch (err) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Erro: ' + err.message;
      } finally {
        clearInterval(elapsedTimer);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Converter';
      }
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
      outputEl.select();
      document.execCommand('copy');
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      const blob = new Blob([outputEl.value], { type: currentMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentFilename;
      a.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>`;
