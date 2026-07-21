#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Monta a pasta PROTOCOLO/ de um processo a partir de um manifesto JSON.

Parte MECÂNICA e determinística do organizador: o agente identifica quais
arquivos são o quê (isso exige juízo) e passa um manifesto; este script só
executa as conversões, sempre igual para a mesma entrada.

Regras fixas:
- A PETIÇÃO INICIAL é copiada em .docx e NUNCA convertida para PDF (decisão do
  escritório; o PDF é passo manual pelo Word, validado com pdffonts).
- Áudios e vídeos vão soltos em PROTOCOLO/MIDIAS/, sem conversão.
- Nada é apagado — só se cria PROTOCOLO/. Os originais ficam intactos.
- O contrato de honorários não entra (o agente simplesmente não o inclui no
  manifesto).

Uso:
    python3 organizar_pasta.py <manifesto.json>

Manifesto (caminhos relativos à "pasta" ou absolutos):
{
  "pasta": "/caminho/do/processo",
  "inicial": "Inicial - Fulano x Nubank - REV.docx",
  "documentos": {
    "Procuração": "procuracao.pdf",
    "Documento de Identificação": ["rg-frente.jpg", "rg-verso.jpg"],
    "Comprovante de Residência": "conta-luz.pdf"
  },
  "provas": ["print-conversa.jpg", "extrato.pdf"],
  "midias": ["audio.ogg", "video.mp4"]
}

Requer: Pillow, pypdf (veja requirements.txt).
Imprime um JSON com o resultado.
"""
import json
import os
import shutil
import sys

IMAGENS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")


def _resolver(pasta, caminho):
    return caminho if os.path.isabs(caminho) else os.path.join(pasta, caminho)


def _imagem_para_pdf(origem, destino):
    from PIL import Image

    img = Image.open(origem)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    img.save(destino, "PDF", resolution=150.0)


def _para_pdf_unico(origem, destino):
    """Um arquivo (imagem ou PDF) vira um PDF em destino."""
    if not os.path.exists(origem):
        raise FileNotFoundError(f"arquivo do manifesto não existe: {origem}")
    ext = os.path.splitext(origem)[1].lower()
    if ext == ".pdf":
        shutil.copy2(origem, destino)
    elif ext in IMAGENS:
        _imagem_para_pdf(origem, destino)
    else:
        raise ValueError(f"não sei converter para PDF (extensão {ext}): {origem}")


def _juntar_pdfs(pdfs, destino):
    from pypdf import PdfWriter

    writer = PdfWriter()
    for p in pdfs:
        writer.append(p)
    with open(destino, "wb") as f:
        writer.write(f)


def _documento_para_pdf(pasta, entrada, destino, tmpdir):
    """entrada é um caminho ou uma lista (várias páginas → um único PDF)."""
    itens = entrada if isinstance(entrada, list) else [entrada]
    if len(itens) == 1:
        _para_pdf_unico(_resolver(pasta, itens[0]), destino)
        return
    parciais = []
    for i, item in enumerate(itens):
        parcial = os.path.join(tmpdir, f"parte_{i}.pdf")
        _para_pdf_unico(_resolver(pasta, item), parcial)
        parciais.append(parcial)
    _juntar_pdfs(parciais, destino)


def organizar(manifesto):
    pasta = manifesto["pasta"]
    if not os.path.isdir(pasta):
        raise NotADirectoryError(f"pasta não encontrada: {pasta}")

    protocolo = os.path.join(pasta, "PROTOCOLO")
    os.makedirs(protocolo, exist_ok=True)
    tmpdir = os.path.join(protocolo, ".tmp")
    os.makedirs(tmpdir, exist_ok=True)

    criados = []
    contador = {"n": 0}

    def num():
        contador["n"] += 1
        return f"{contador['n']:02d}"

    # 01 - Petição Inicial.docx (NUNCA converter)
    inicial = _resolver(pasta, manifesto["inicial"])
    if not inicial.lower().endswith(".docx"):
        raise ValueError("a inicial precisa ser .docx (não se converte para PDF aqui)")
    if not os.path.exists(inicial):
        raise FileNotFoundError(f"inicial não encontrada: {inicial}")
    destino_inicial = os.path.join(protocolo, f"{num()} - Petição Inicial.docx")
    shutil.copy2(inicial, destino_inicial)
    criados.append(destino_inicial)

    # 02+ documentos do cliente (na ordem do manifesto)
    for rotulo, entrada in (manifesto.get("documentos") or {}).items():
        destino = os.path.join(protocolo, f"{num()} - {rotulo}.pdf")
        _documento_para_pdf(pasta, entrada, destino, tmpdir)
        criados.append(destino)

    # provas (cada uma vira um PDF numerado, nome legível pelo original)
    for prova in manifesto.get("provas") or []:
        stem = os.path.splitext(os.path.basename(prova))[0]
        destino = os.path.join(protocolo, f"{num()} - {stem}.pdf")
        _para_pdf_unico(_resolver(pasta, prova), destino)
        criados.append(destino)

    # mídias: soltas em MIDIAS/, sem conversão
    midias = manifesto.get("midias") or []
    if midias:
        midias_dir = os.path.join(protocolo, "MIDIAS")
        os.makedirs(midias_dir, exist_ok=True)
        for m in midias:
            origem = _resolver(pasta, m)
            if not os.path.exists(origem):
                raise FileNotFoundError(f"mídia não existe: {origem}")
            destino = os.path.join(midias_dir, os.path.basename(m))
            shutil.copy2(origem, destino)
            criados.append(destino)

    shutil.rmtree(tmpdir, ignore_errors=True)

    return {
        "ok": True,
        "protocolo": protocolo,
        "arquivos": [os.path.basename(c) for c in criados],
        "qtd": len(criados),
    }


def mover_para_protocolar(pasta, destino_dir):
    """Move a pasta do caso inteira para a pasta 'Para Protocolar', preservando
    o nome. Só é chamado pelo maestro DEPOIS do veredito verde do conferente —
    o organizador não conhece o veredito na passada normal.

    Não sobrescreve: se já houver uma pasta de mesmo nome no destino, para e
    avisa, em vez de misturar arquivos.
    """
    pasta = os.path.abspath(pasta)
    if not os.path.isdir(pasta):
        raise NotADirectoryError(f"pasta do caso não encontrada: {pasta}")
    if not os.path.isdir(destino_dir):
        raise NotADirectoryError(f"pasta 'Para Protocolar' não encontrada: {destino_dir}")

    destino = os.path.join(destino_dir, os.path.basename(pasta.rstrip(os.sep)))
    if os.path.exists(destino):
        raise FileExistsError(f"já existe no destino: {destino}")

    shutil.move(pasta, destino)
    return {"ok": True, "movida_para": destino}


def main():
    if len(sys.argv) < 2:
        sys.exit(
            "Uso:\n"
            "  python3 organizar_pasta.py <manifesto.json>\n"
            "  python3 organizar_pasta.py --mover <pasta_do_caso> <pasta_para_protocolar>"
        )

    if sys.argv[1] == "--mover":
        if len(sys.argv) < 4:
            sys.exit("Uso: python3 organizar_pasta.py --mover <pasta_do_caso> <pasta_para_protocolar>")
        resultado = mover_para_protocolar(sys.argv[2], sys.argv[3])
    else:
        with open(sys.argv[1], encoding="utf-8") as f:
            manifesto = json.load(f)
        resultado = organizar(manifesto)

    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
