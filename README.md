# PDF -> Markdown / XML / OFX — Conversor

Projeto com duas implementações (Python e Node.js), múltiplos métodos de extração e três formatos de saída: **Markdown**, **XML** (estruturado por página) ou **OFX 2.0** (extrato bancário compatível com softwares de conciliação contábil).

## Estrutura

```
ConvertPDftoMD/
├── python/         Implementação Python + GUI Tkinter
├── node/           Implementação Node.js + GUI Web (navegador)
├── input/          Coloque seus PDFs aqui
└── output/         Saídas geradas
```

## Métodos de extração

| Método      | Quando usar                                              | Velocidade |
|-------------|----------------------------------------------------------|------------|
| `simple`    | PDF digital, só texto puro                               | Rápido     |
| `advanced`  | PDF digital, preservar títulos / tabelas                 | Médio      |
| `ocr`       | PDF escaneado (imagens) — texto via reconhecimento óptico | Lento      |
| `premium`*  | Layout analysis + OCR híbrido (pymupdf4llm)              | Médio/Alto |

\* Disponível apenas no Node.js (delega ao Python via subprocess).

## Formatos de saída

| Formato | Extensão | Estrutura |
|---------|----------|-----------|
| `md`    | `.md`    | Markdown com `## Página N` por página (ou markdown contínuo no método `advanced`). |
| `xml`   | `.xml`   | XML estruturado: `<pdf-document>` com `<page number="N">` e conteúdo em `<![CDATA[...]]>`. |
| `ofx`   | `.ofx`   | OFX 2.0 — extrato bancário com `<STMTTRN>` por transação (data, valor, D/C, memo). Atualmente parser apenas para **Sicoob**. Usa internamente o método `advanced` (pymupdf4llm). |

Exemplo de XML gerado:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<pdf-document source="arquivo.pdf" method="advanced" pages="98" converted-at="2026-05-25T16:25:31">
  <pages>
    <page number="1">
      <content><![CDATA[
        # Extrato de conta corrente
        ...
      ]]></content>
    </page>
    ...
  </pages>
</pdf-document>
```

---

## Python

### Instalação

```powershell
cd python
pip install -r requirements.txt
```

Para o método **OCR**, instale também:
- [Tesseract OCR (Windows)](https://github.com/UB-Mannheim/tesseract/wiki) — com pacote de idioma português
- [Poppler para Windows](https://github.com/oschwartz10612/poppler-windows/releases) — adicione `bin\` ao PATH

### Uso via GUI (recomendado)

```powershell
python gui.py
```

Selecione método **e** formato (Markdown ou XML) na própria janela.

### Uso via CLI

```powershell
# Markdown (padrão)
python converters.py "..\input\arquivo.pdf" advanced "..\output\arquivo.md"

# XML
python converters.py "..\input\arquivo.pdf" advanced "..\output\arquivo.xml" xml

# OFX (extrato Sicoob)
python converters.py "..\input\extrato.pdf" advanced "..\output\extrato.ofx" ofx
```

---

## Node.js

### Instalação

```powershell
cd node
npm install
```

Para o método **OCR** o `tesseract.js` baixa automaticamente os modelos de idioma na primeira execução.

### Uso via GUI Web (recomendado)

```powershell
npm start
```

Acesse: <http://localhost:3000>

Selecione método e formato (Markdown ou XML) no formulário.

### Uso via CLI

```powershell
# Markdown (padrão)
node converters.js "..\input\arquivo.pdf" advanced "..\output\arquivo.md"

# XML
node converters.js "..\input\arquivo.pdf" advanced "..\output\arquivo.xml" xml

# OFX (delega ao Python por baixo)
node converters.js "..\input\extrato.pdf" advanced "..\output\extrato.ofx" ofx
```

---

## Comparando os métodos

```powershell
# Mesmo PDF, todos os métodos, formato Markdown
python converters.py teste.pdf simple    ..\output\teste-simple.md
python converters.py teste.pdf advanced  ..\output\teste-advanced.md
python converters.py teste.pdf ocr       ..\output\teste-ocr.md

# Mesmo método, formato XML
python converters.py teste.pdf advanced  ..\output\teste-advanced.xml xml
```

Ou simplesmente abra a GUI e alterne entre as opções com o mesmo arquivo.
