"""
Módulo de conversão PDF para Markdown.
Implementa 3 métodos: Simples, Avançado e OCR.
"""
from pathlib import Path


def convert_simple(pdf_path: str) -> str:
    """
    Conversão Simples — extrai apenas o texto puro do PDF.
    Usa pdfplumber. Rápido. Bom para PDFs digitais com texto bem estruturado.
    """
    import pdfplumber

    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            lines.append(f"## Página {page_num}\n")
            lines.append(text.strip())
            lines.append("\n---\n")
    return "\n".join(lines)


def convert_advanced(pdf_path: str) -> str:
    """
    Conversão Avançada — preserva estrutura (títulos, listas, tabelas).
    Usa pymupdf4llm, biblioteca desenhada para gerar Markdown a partir de PDFs.
    """
    import pymupdf4llm

    return pymupdf4llm.to_markdown(pdf_path)


def convert_ocr(pdf_path: str, lang: str = "por+eng") -> str:
    """
    Conversão com OCR — para PDFs escaneados (imagens).
    Requer Tesseract instalado: https://github.com/UB-Mannheim/tesseract/wiki
    Requer Poppler instalado: https://github.com/oschwartz10612/poppler-windows
    """
    import pytesseract
    from pdf2image import convert_from_path

    images = convert_from_path(pdf_path, dpi=300)
    lines = []
    for page_num, image in enumerate(images, start=1):
        text = pytesseract.image_to_string(image, lang=lang)
        lines.append(f"## Página {page_num}\n")
        lines.append(text.strip())
        lines.append("\n---\n")
    return "\n".join(lines)


METHODS = {
    "simple": convert_simple,
    "advanced": convert_advanced,
    "ocr": convert_ocr,
}


def convert(pdf_path: str, method: str = "advanced", output_path: str | None = None) -> str:
    """
    Converte um PDF para Markdown usando o método especificado.

    Args:
        pdf_path: caminho do arquivo PDF.
        method: "simple", "advanced" ou "ocr".
        output_path: se fornecido, salva o resultado em arquivo .md.

    Returns:
        Conteúdo Markdown gerado.
    """
    if method not in METHODS:
        raise ValueError(f"Método inválido: {method}. Use: {list(METHODS.keys())}")

    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {pdf_path}")

    md_content = METHODS[method](str(pdf_file))

    if output_path:
        Path(output_path).write_text(md_content, encoding="utf-8")

    return md_content


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python converters.py <pdf> [método] [saída.md]")
        print("Métodos: simple, advanced, ocr")
        sys.exit(1)

    pdf = sys.argv[1]
    method = sys.argv[2] if len(sys.argv) > 2 else "advanced"
    output = sys.argv[3] if len(sys.argv) > 3 else Path(pdf).with_suffix(".md").name

    print(f"Convertendo '{pdf}' (método: {method}) ...")
    convert(pdf, method=method, output_path=output)
    print(f"Salvo em: {output}")
