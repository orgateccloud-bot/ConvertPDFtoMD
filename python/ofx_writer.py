"""
Conversor Markdown (extrato bancário) -> OFX 2.0.

Atualmente suporta extratos do Sicoob no layout produzido pelo pymupdf4llm
(`converters.py` método `advanced`). Para outros bancos, basta acrescentar
um novo parser na lista PARSERS e mantê-lo retornando `BankStatement`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable
from xml.sax.saxutils import escape


# ---------------------------------------------------------------------------
# Modelo
# ---------------------------------------------------------------------------
@dataclass
class Transaction:
    date: str        # YYYYMMDD
    amount: float    # negativo = débito, positivo = crédito
    trntype: str     # "DEBIT" ou "CREDIT"
    fitid: str       # identificador único da transação
    memo: str        # descrição


@dataclass
class BankStatement:
    bank_id: str = "756"          # Sicoob (FEBRABAN)
    org: str = "SICOOB"
    branch_id: str = ""           # Cooperativa
    account_id: str = ""          # Conta
    holder: str = ""              # Titular
    period_start: str = ""        # YYYYMMDD
    period_end: str = ""          # YYYYMMDD
    currency: str = "BRL"
    transactions: list[Transaction] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Serialização OFX 2.0
# ---------------------------------------------------------------------------
def statement_to_ofx(stmt: BankStatement) -> str:
    now = datetime.now().strftime("%Y%m%d%H%M%S")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?OFX OFXHEADER="200" VERSION="200" SECURITY="NONE" '
        'OLDFILEUID="NONE" NEWFILEUID="NONE"?>',
        "<OFX>",
        "  <SIGNONMSGSRSV1>",
        "    <SONRS>",
        "      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>",
        f"      <DTSERVER>{now}</DTSERVER>",
        "      <LANGUAGE>POR</LANGUAGE>",
        f"      <FI><ORG>{escape(stmt.org)}</ORG><FID>{escape(stmt.bank_id)}</FID></FI>",
        "    </SONRS>",
        "  </SIGNONMSGSRSV1>",
        "  <BANKMSGSRSV1>",
        "    <STMTTRNRS>",
        f"      <TRNUID>{now}</TRNUID>",
        "      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>",
        "      <STMTRS>",
        f"        <CURDEF>{escape(stmt.currency)}</CURDEF>",
        "        <BANKACCTFROM>",
        f"          <BANKID>{escape(stmt.bank_id)}</BANKID>",
        f"          <BRANCHID>{escape(stmt.branch_id)}</BRANCHID>",
        f"          <ACCTID>{escape(stmt.account_id)}</ACCTID>",
        "          <ACCTTYPE>CHECKING</ACCTTYPE>",
        "        </BANKACCTFROM>",
        "        <BANKTRANLIST>",
        f"          <DTSTART>{stmt.period_start}</DTSTART>",
        f"          <DTEND>{stmt.period_end}</DTEND>",
    ]
    for tx in stmt.transactions:
        lines.extend([
            "          <STMTTRN>",
            f"            <TRNTYPE>{tx.trntype}</TRNTYPE>",
            f"            <DTPOSTED>{tx.date}</DTPOSTED>",
            f"            <TRNAMT>{tx.amount:.2f}</TRNAMT>",
            f"            <FITID>{escape(tx.fitid)}</FITID>",
            f"            <MEMO>{escape(tx.memo[:255])}</MEMO>",
            "          </STMTTRN>",
        ])
    # Saldo final (placeholder — OFX exige LEDGERBAL para validar em alguns importadores)
    balance = sum(tx.amount for tx in stmt.transactions)
    lines.extend([
        "        </BANKTRANLIST>",
        "        <LEDGERBAL>",
        f"          <BALAMT>{balance:.2f}</BALAMT>",
        f"          <DTASOF>{stmt.period_end or now[:8]}</DTASOF>",
        "        </LEDGERBAL>",
        "      </STMTRS>",
        "    </STMTTRNRS>",
        "  </BANKMSGSRSV1>",
        "</OFX>",
    ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Parser Sicoob
# ---------------------------------------------------------------------------
_PERIOD_RE = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s*(?:~+\s*-\s*~+|-)\s*(\d{2}/\d{2}/\d{4})"
)
_BRANCH_RE = re.compile(r"\b(\d{4})\s*(?:~+\s*-\s*~+|-)\s*(\d)\b")
_ACCOUNT_RE = re.compile(r"\b(\d{1,3}(?:\.\d{3})+)\s*(?:~+\s*-\s*~+|-)\s*(\d)\b")
_TRANSACTION_RE = re.compile(
    r"^\|\s*(?P<date>\d{2}/\d{2})\s*\|"            # |DD/MM|
    r"(?P<middle>.+?)"                              # qualquer coisa (descrição)
    r"R\s*[\$S]\s*\|?\s*"                           # "R$" ou "RS" (OCR vira S), c/ ou s/ pipe
    r"(?P<amount>[\d][\d.\s]*,\d{2})"               # valor (ex: 2,20 | 5.028,55 | 51 5,17)
    r"\s*(?P<dc>[DC])\s*\|?\s*$",                   # D/C ao final
    re.MULTILINE,
)


def _clean_memo(text: str) -> str:
    """Limpa os campos do meio: remove pipes, indicadores e espaços extras."""
    text = re.sub(r"[«»“”\"]+\s*\)", " ", text)  # remove «) »)
    text = text.replace("|", " ").replace("R$", " ").replace("RS", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_sicoob(md: str) -> BankStatement:
    stmt = BankStatement()

    # Período
    period_year = datetime.now().year
    if m := _PERIOD_RE.search(md):
        try:
            start = datetime.strptime(m.group(1), "%d/%m/%Y")
            end = datetime.strptime(m.group(2), "%d/%m/%Y")
            stmt.period_start = start.strftime("%Y%m%d")
            stmt.period_end = end.strftime("%Y%m%d")
            period_year = start.year
        except ValueError:
            pass

    # Cooperativa (BRANCHID)
    if m := _BRANCH_RE.search(md):
        stmt.branch_id = f"{m.group(1)}-{m.group(2)}"

    # Conta (ACCTID) — formato 158.083 - 3 -> "158083-3"
    if m := _ACCOUNT_RE.search(md):
        digits = m.group(1).replace(".", "")
        stmt.account_id = f"{digits}-{m.group(2)}"

    # Transações
    seq = 0
    seen_fitids: set[str] = set()
    for tx_match in _TRANSACTION_RE.finditer(md):
        date_str = tx_match.group("date")
        amount_str = tx_match.group("amount").replace(" ", "").replace(".", "").replace(",", ".")
        dc = tx_match.group("dc").upper()
        memo = _clean_memo(tx_match.group("middle"))

        try:
            day, month = date_str.split("/")
            tx_date = datetime(period_year, int(month), int(day)).strftime("%Y%m%d")
            amount = float(amount_str)
        except ValueError:
            continue

        if dc == "D":
            amount = -abs(amount)
            trntype = "DEBIT"
        else:
            amount = abs(amount)
            trntype = "CREDIT"

        seq += 1
        fitid = f"{tx_date}-{seq:04d}"
        while fitid in seen_fitids:  # garantia extra de unicidade
            seq += 1
            fitid = f"{tx_date}-{seq:04d}"
        seen_fitids.add(fitid)

        stmt.transactions.append(
            Transaction(date=tx_date, amount=amount, trntype=trntype, fitid=fitid, memo=memo)
        )

    return stmt


PARSERS: dict[str, Callable[[str], BankStatement]] = {
    "sicoob": parse_sicoob,
}


def markdown_to_ofx(md: str, bank: str = "sicoob") -> str:
    parser = PARSERS.get(bank.lower())
    if parser is None:
        raise ValueError(f"Banco não suportado: {bank}. Disponíveis: {list(PARSERS)}")
    return statement_to_ofx(parser(md))


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python ofx_writer.py <markdown.md> [saída.ofx]")
        sys.exit(1)
    md_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else md_path.rsplit(".", 1)[0] + ".ofx"
    md_text = open(md_path, encoding="utf-8").read()
    ofx_text = markdown_to_ofx(md_text)
    open(out_path, "w", encoding="utf-8").write(ofx_text)
    print(f"OFX salvo em: {out_path}")
