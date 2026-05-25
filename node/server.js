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
  try {
    const md = await convert(req.file.path, { method });
    res.json({ ok: true, markdown: md, filename: req.file.originalname });
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
  <title>PDF -> Markdown</title>
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
    button { background: #4a90e2; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 16px; }
    button:hover:not(:disabled) { background: #357ab8; }
    button:disabled { background: #aaa; cursor: not-allowed; }
    .status { margin: 15px 0; padding: 10px; border-radius: 4px; }
    .status.info { background: #e3f2fd; color: #1565c0; }
    .status.error { background: #ffebee; color: #c62828; }
    .status.success { background: #e8f5e9; color: #2e7d32; }
    textarea { width: 100%; min-height: 400px; font-family: 'Consolas', monospace; font-size: 13px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    .actions { display: flex; gap: 10px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PDF -> Markdown</h1>
    <p>Faça upload de um PDF e escolha o método de conversão.</p>

    <form id="form">
      <div class="form-group">
        <label>Arquivo PDF</label>
        <input type="file" name="pdf" accept="application/pdf" required>
      </div>

      <div class="form-group">
        <label>Método</label>
        <div class="methods">
          <label class="method selected">
            <input type="radio" name="method" value="simple"> <strong>Simples</strong>
            <small>Texto puro. Rápido.</small>
          </label>
          <label class="method">
            <input type="radio" name="method" value="advanced" checked> <strong>Avançado</strong>
            <small>Preserva títulos e estrutura.</small>
          </label>
          <label class="method">
            <input type="radio" name="method" value="ocr"> <strong>OCR</strong>
            <small>PDFs escaneados. Mais lento.</small>
          </label>
        </div>
      </div>

      <button type="submit" id="submitBtn">Converter</button>
    </form>

    <div id="status"></div>

    <div id="result" style="display:none; margin-top: 20px;">
      <label>Resultado Markdown</label>
      <textarea id="output" readonly></textarea>
      <div class="actions">
        <button type="button" id="copyBtn">Copiar</button>
        <button type="button" id="downloadBtn">Baixar .md</button>
      </div>
    </div>
  </div>

  <script>
    document.querySelectorAll('.method input').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.method').forEach(m => m.classList.remove('selected'));
        radio.closest('.method').classList.add('selected');
      });
    });

    // Set initial selection based on checked radio
    const initialChecked = document.querySelector('.method input:checked');
    if (initialChecked) {
      document.querySelectorAll('.method').forEach(m => m.classList.remove('selected'));
      initialChecked.closest('.method').classList.add('selected');
    }

    const form = document.getElementById('form');
    const submitBtn = document.getElementById('submitBtn');
    const statusEl = document.getElementById('status');
    const resultEl = document.getElementById('result');
    const outputEl = document.getElementById('output');
    let currentFilename = 'output.md';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      submitBtn.disabled = true;
      statusEl.className = 'status info';
      statusEl.textContent = 'Convertendo...';
      resultEl.style.display = 'none';

      try {
        const res = await fetch('/convert', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
        outputEl.value = data.markdown;
        currentFilename = data.filename.replace(/\\.pdf$/i, '.md');
        statusEl.className = 'status success';
        statusEl.textContent = 'Concluido (' + data.markdown.length + ' caracteres)';
        resultEl.style.display = 'block';
      } catch (err) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Erro: ' + err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
      outputEl.select();
      document.execCommand('copy');
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      const blob = new Blob([outputEl.value], { type: 'text/markdown' });
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
