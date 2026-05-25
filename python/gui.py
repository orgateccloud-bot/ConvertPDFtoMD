"""
Interface gráfica (Tkinter) para o conversor PDF -> Markdown.
Permite escolher o método (Simples, Avançado, OCR) e visualizar o resultado.
"""
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

from converters import convert

METHOD_LABELS = {
    "Simples (texto puro)": "simple",
    "Avançado (estrutura preservada)": "advanced",
    "OCR (PDFs escaneados)": "ocr",
}


class ConverterApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("PDF → Markdown — Conversor")
        root.geometry("900x650")

        self._build_widgets()
        self.pdf_path: str | None = None

    def _build_widgets(self) -> None:
        top = ttk.Frame(self.root, padding=10)
        top.pack(fill="x")

        ttk.Button(top, text="Selecionar PDF", command=self.pick_file).pack(side="left")
        self.file_label = ttk.Label(top, text="Nenhum arquivo selecionado", foreground="gray")
        self.file_label.pack(side="left", padx=10)

        method_frame = ttk.LabelFrame(self.root, text="Método de conversão", padding=10)
        method_frame.pack(fill="x", padx=10, pady=5)

        self.method_var = tk.StringVar(value="Avançado (estrutura preservada)")
        for label in METHOD_LABELS:
            ttk.Radiobutton(
                method_frame, text=label, variable=self.method_var, value=label
            ).pack(anchor="w")

        action_frame = ttk.Frame(self.root, padding=10)
        action_frame.pack(fill="x")

        self.convert_btn = ttk.Button(action_frame, text="Converter", command=self.run_convert)
        self.convert_btn.pack(side="left")

        self.save_btn = ttk.Button(
            action_frame, text="Salvar .md", command=self.save_output, state="disabled"
        )
        self.save_btn.pack(side="left", padx=5)

        self.status = ttk.Label(action_frame, text="", foreground="blue")
        self.status.pack(side="left", padx=10)

        ttk.Label(self.root, text="Resultado:", padding=(10, 5)).pack(anchor="w")
        self.output = scrolledtext.ScrolledText(self.root, wrap="word", font=("Consolas", 10))
        self.output.pack(fill="both", expand=True, padx=10, pady=5)

    def pick_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Selecione um PDF", filetypes=[("Arquivos PDF", "*.pdf")]
        )
        if path:
            self.pdf_path = path
            self.file_label.config(text=Path(path).name, foreground="black")

    def run_convert(self) -> None:
        if not self.pdf_path:
            messagebox.showwarning("Aviso", "Selecione um PDF primeiro.")
            return

        method_key = METHOD_LABELS[self.method_var.get()]
        self.convert_btn.config(state="disabled")
        self.save_btn.config(state="disabled")
        self.status.config(text="Convertendo...", foreground="blue")
        self.output.delete("1.0", "end")

        threading.Thread(target=self._convert_worker, args=(method_key,), daemon=True).start()

    def _convert_worker(self, method: str) -> None:
        try:
            md = convert(self.pdf_path, method=method)
            self.root.after(0, self._on_done, md)
        except Exception as exc:  # noqa: BLE001 — surface any error to the GUI
            self.root.after(0, self._on_error, exc)

    def _on_done(self, md: str) -> None:
        self.output.insert("1.0", md)
        self.status.config(text=f"Concluído ({len(md)} caracteres)", foreground="green")
        self.convert_btn.config(state="normal")
        self.save_btn.config(state="normal")

    def _on_error(self, exc: Exception) -> None:
        self.status.config(text="Erro na conversão", foreground="red")
        self.convert_btn.config(state="normal")
        messagebox.showerror("Erro", f"Falha ao converter:\n\n{exc}")

    def save_output(self) -> None:
        if not self.pdf_path:
            return
        default = Path(self.pdf_path).with_suffix(".md").name
        path = filedialog.asksaveasfilename(
            defaultextension=".md",
            initialfile=default,
            filetypes=[("Markdown", "*.md"), ("Texto", "*.txt")],
        )
        if path:
            Path(path).write_text(self.output.get("1.0", "end"), encoding="utf-8")
            self.status.config(text=f"Salvo em: {path}", foreground="green")


def main() -> None:
    root = tk.Tk()
    ConverterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
