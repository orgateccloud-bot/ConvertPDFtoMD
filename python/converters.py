"""
Módulo de conversão PDF para Markdown ou XML.
Implementa 3 métodos de extração: Simples, Avançado e OCR.
Cada método pode emitir saída em Markdown (.md) ou XML estruturado por página (.xml).
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr


# ---------------------------------------------------------------------------
# Extração: cada função devolve uma lista [(num_pagina, texto_pagina), ...]
# ---------------------------------------------------------------------------
def _pages_simple(pdf_path: str) -> list[tuple[int, str]]:
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        return [(i + 1, (p.extract_text() or "").strip()) for i, p in enumerate(pdf.pages)]


def _pages_advanced(pdf_path: str) -> list[tuple[int, str]]:
    import pymupdf4llm

    chunks = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
    pages: list[tuple[int, str]] = []
    for i, chunk in enumerate(chunks):
        meta = chunk.get("metadata", {}) if isinstance(chunk, dict) else {}
        num = meta.get("page", i + 1)
        text = chunk.get("text", "") if isinstance(chunk, dict) else str(chunk)
        pages.append((int(num) + (1 if isinstance(num, int) and num == i else 0), text.strip()))
    # Garantir numeração 1..N quando metadata vier zero-based ou ausente
    return [(idx + 1, text) for idx, (_, text) in enumerate(pages)]


def _pages_ocr(pdf_path: str, lang: str = "por+eng") -> list[tuple[int, str]]:
    import pytesseract
    from pdf2image import convert_from_path

    images = convert_from_path(pdf_path, dpi=300)
    return [
        (i + 1, pytesseract.image_to_string(img, lang=lang).strip())
        for i, img in enumerate(images)
    ]


PAGE_EXTRACTORS = {
    "simple": _pages_simple,
    "advanced": _pages_advanced,
    "ocr": _pages_ocr,
}


# ---------------------------------------------------------------------------
# Formatação: páginas -> Markdown ou XML
# ---------------------------------------------------------------------------
def pages_to_markdown(pages: list[tuple[int, str]]) -> str:
    blocks = []
    for num, text in pages:
        blocks.append(f"## Página {num}\n\n{text}\n\n---\n")
    return "\n".join(blocks)


def pages_to_xml(pages: list[tuple[int, str]], source: str, method: str) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f"<pdf-document source={quoteattr(Path(source).name)} "
        f"method={quoteattr(method)} pages=\"{len(pages)}\" "
        f"converted-at={quoteattr(datetime.now().isoformat(timespec='seconds'))}>",
        "  <pages>",
    ]
    for num, text in pages:
        # Escapar ']]>' dentro do CDATA quebrando o bloco
        safe = text.replace("]]>", "]]]]><![CDATA[>")
        lines.append(f'    <page number="{num}">')
        lines.append(f"      <content><![CDATA[{safe}]]></content>")
        lines.append("    </page>")
    lines.append("  </pages>")
    lines.append("</pdf-document>")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# API pública — mantida compatível com versões anteriores
# ---------------------------------------------------------------------------
def convert_simple(pdf_path: str) -> str:
    """Conversão Simples (Markdown). Extrai texto puro via pdfplumber."""
    return pages_to_markdown(_pages_simple(pdf_path))


def convert_advanced(pdf_path: str) -> str:
    """Conversão Avançada (Markdown). Preserva estrutura via pymupdf4llm."""
    import pymupdf4llm

    return pymupdf4llm.to_markdown(pdf_path)


def convert_ocr(pdf_path: str, lang: str = "por+eng") -> str:
    """Conversão OCR (Markdown). Para PDFs escaneados."""
    return pages_to_markdown(_pages_ocr(pdf_path, lang=lang))


METHODS = {
    "simple": convert_simple,
    "advanced": convert_advanced,
    "ocr": convert_ocr,
}

FORMATS = ("md", "xml", "ofx")


def convert(
    pdf_path: str,
    method: str = "advanced",
    output_path: str | None = None,
    fmt: str = "md",
) -> str:
    """
    Converte um PDF para Markdown ou XML.

    Args:
        pdf_path: caminho do arquivo PDF.
        method: "simple", "advanced" ou "ocr".
        output_path: se fornecido, salva o resultado em arquivo.
        fmt: "md" (Markdown) ou "xml" (XML estruturado por página).

    Returns:
        Conteúdo gerado (string).
    """
    if method not in PAGE_EXTRACTORS:
        raise ValueError(f"Método inválido: {method}. Use: {list(PAGE_EXTRACTORS.keys())}")
    if fmt not in FORMATS:
        raise ValueError(f"Formato inválido: {fmt}. Use: {list(FORMATS)}")

    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {pdf_path}")

    if fmt == "ofx":
        # OFX exige extração rica para parsear transações — usa sempre o pymupdf4llm.
        from ofx_writer import markdown_to_ofx

        md = convert_advanced(str(pdf_file))
        content = markdown_to_ofx(md)
    elif fmt == "md" and method == "advanced":
        # Manter o markdown completo do pymupdf4llm (com tabelas e títulos).
        content = convert_advanced(str(pdf_file))
    else:
        pages = PAGE_EXTRACTORS[method](str(pdf_file))
        content = pages_to_xml(pages, str(pdf_file), method) if fmt == "xml" else pages_to_markdown(pages)

    if output_path:
        Path(output_path).write_text(content, encoding="utf-8")

    return content


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python converters.py <pdf> [método] [saída] [formato]")
        print("  método:   simple | advanced | ocr")
        print("  formato:  md (padrão) | xml | ofx")
        sys.exit(1)

    pdf = sys.argv[1]
    method = sys.argv[2] if len(sys.argv) > 2 else "advanced"
    fmt = sys.argv[4] if len(sys.argv) > 4 else "md"
    default_ext = {"xml": ".xml", "ofx": ".ofx"}.get(fmt, ".md")
    output = sys.argv[3] if len(sys.argv) > 3 else Path(pdf).with_suffix(default_ext).name

    print(f"Convertendo '{pdf}' (método: {method}, formato: {fmt}) ...")
    convert(pdf, method=method, output_path=output, fmt=fmt)
    print(f"Salvo em: {output}")
