# PDF -> Markdown — Conversor

Projeto com duas implementações (Python e Node.js) e três métodos de conversão para você testar e comparar.

## Estrutura

```
ConvertPDftoMD/
├── python/         Implementação Python + GUI Tkinter
├── node/           Implementação Node.js + GUI Web (navegador)
├── input/          Coloque seus PDFs aqui
└── output/         Saídas geradas
```

## Métodos de conversão

| Método      | Quando usar                              | Velocidade |
|-------------|------------------------------------------|------------|
| `simple`    | PDF digital, só texto puro               | Rápido     |
| `advanced`  | PDF digital, preservar títulos/estrutura | Médio      |
| `ocr`       | PDF escaneado (imagens)                  | Lento      |

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

### Uso via CLI

```powershell
python converters.py "..\input\arquivo.pdf" advanced "..\output\arquivo.md"
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

### Uso via CLI

```powershell
node converters.js "..\input\arquivo.pdf" advanced "..\output\arquivo.md"
```

---

## Comparando os métodos

Para o mesmo PDF, rode os três métodos e compare:

```powershell
# Python
python converters.py teste.pdf simple    ..\output\teste-simple.md
python converters.py teste.pdf advanced  ..\output\teste-advanced.md
python converters.py teste.pdf ocr       ..\output\teste-ocr.md
```

Ou simplesmente abra a GUI e alterne entre os 3 modos com o mesmo arquivo.
