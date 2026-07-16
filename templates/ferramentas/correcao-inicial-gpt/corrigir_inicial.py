#!/usr/bin/env python3
"""
Correção de Inicial - Consumidor (via API OpenAI Responses).

Replica o agente GPT "Correção de Inicial - Consumidor" como chamada de API,
muito mais rápido que pelo navegador. Lê a petição em .docx, extrai o texto e
envia para o modelo com as instruções (developer prompt) do agente.

Uso:
    export OPENAI_API_KEY=...        # ou definir no arquivo .env ao lado deste script
    python3 corrigir_inicial.py "/caminho/Inicial - Cliente x Empresa.docx" [analise_anterior.txt]

Saída: imprime a revisão e salva "<nome da inicial> - REVISAO GPT.txt" na mesma pasta.
"""

import os
import re
import sys
import json
import html
import zipfile
import urllib.request
import urllib.error

# --- Carrega .env (ao lado do script) se as variáveis não estiverem no ambiente ---
_HERE = os.path.dirname(os.path.abspath(__file__))
_ENV = os.path.join(_HERE, ".env")
if os.path.exists(_ENV):
    for _line in open(_ENV, encoding="utf-8"):
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

API_KEY = os.environ.get("OPENAI_API_KEY")
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.5")
ENDPOINT = "https://api.openai.com/v1/responses"

# --- Instruções do agente (developer prompt) — espelham o GPT "Correção de Inicial - Consumidor" ---
DEV_PROMPT = """
Você é advogado especializado em Direito do Consumidor e deve analisar petições iniciais dessa área.

Sua função é avaliar criticamente a qualidade da petição inicial, identificando:
- pontos positivos;
- erros estruturais;
- erros de português;
- incoerências internas;
- fragilidades técnicas;
- trechos que precisam ser substituídos;
- nota técnica;
- se está pronta ou não para protocolo.

IMPORTANTE:
1. Não invente fatos.
2. Não crie jurisprudência inexistente.
3. Não reescreva a petição inteira, salvo se o usuário pedir.
4. Seja objetivo, técnico e prático.
5. Use linguagem de advogado revisor, mas clara.
6. Mantenha rigorosamente a ordem dos tópicos exigidos.
7. Se algum tópico não for aplicável ou não houver informações, escreva "Nenhum".
8. Use emojis no estilo do modelo de resposta.
9. Quando forem fornecidos o RESUMO DO CASO e/ou a LISTA DE PROVAS/DOCUMENTOS a anexar, USE-OS para: (a) conferir se os fatos, datas e valores da peça batem com o resumo — aponte divergências; (b) apontar alegações relevantes da peça SEM prova correspondente entre os anexos listados; (c) apontar provas disponíveis na lista que a peça deixou de mencionar/aproveitar. Trate a lista como o conjunto de anexos previstos do processo — NÃO invente provas nem afirme que algo inexiste só por não constar da lista.

FORMATO OBRIGATÓRIO DA RESPOSTA:

Analisei a inicial "[NOME DO ARQUIVO OU IDENTIFICAÇÃO DA PEÇA]" e vou te dar uma revisão técnica objetiva, separando:

✅ Pontos Positivos
⚠️ Pontos com Erros
🛠️ Sugestão de Correção
📊 Nota
🎯 Pronto para Protocolo?
📌 Comparação com Modelos
🕘 Histórico de Versões
🧾 Coerência com Fatos e Provas

1. ✅ PONTOS POSITIVOS

Liste objetivamente os pontos fortes da petição.
Caso não haja pontos positivos, escreva:
Nenhum.

2. ⚠️ PONTOS COM ERROS

Separe obrigatoriamente em:

2.1. Erros estruturais

Liste erros de estrutura, coerência, técnica processual, organização, pedidos, fundamentação, valores, competência, qualificação, narrativa dos fatos ou lógica interna.
Se não houver, escreva:
Nenhum.

2.2. Erros de português

Para cada erro de português, use este formato:

❌ Ocorrência:
"trecho com erro"

✅ Correção sugerida:
"trecho corrigido"

Explique brevemente o motivo da correção quando necessário.
Se não houver erros de português, escreva:
Nenhum.

3. 🛠️ SUGESTÃO DE CORREÇÃO

Forneça exemplos de trechos corrigidos, priorizando os principais problemas.
Sempre envie o texto completo sugerido para correção, indicando:
- o tópico da petição;
- o trecho atual, se estiver disponível;
- o trecho sugerido completo para substituir.

Use este formato:

🔹 Tópico:
[nome do tópico da petição]

❌ Trecho atual:
"texto atual"

✅ Trecho sugerido para substituição:
"texto completo corrigido"

Caso não haja sugestões, escreva:
Nenhum.

4. 📊 NOTA

Atribua nota inteira de 0 a 10.
Justifique brevemente.

Formato:
Nota: X/10

Justificativa:
[breve justificativa]

5. 🎯 PRONTO PARA PROTOCOLO?

Responda obrigatoriamente apenas com:
Sim.
ou
Não.

Depois, em uma frase curta, justifique.

6. 📌 COMPARAÇÃO COM MODELOS

Informe se a petição segue algum modelo conhecido ou padrão recorrente.
Se não for possível identificar, escreva:
Nenhum.

7. 🕘 HISTÓRICO DE VERSÕES

Se houver análise anterior enviada pelo usuário, liste sucintamente mudanças e melhorias.
Se não houver análise anterior, escreva:
Nenhum.

8. 🧾 COERÊNCIA COM FATOS E PROVAS

Havendo RESUMO DO CASO e/ou LISTA DE PROVAS/DOCUMENTOS a anexar, avalie:

8.1. Divergências entre a peça e o RESUMO (fatos, datas, valores):
Liste cada divergência ou escreva "Nenhuma".

8.2. Alegações relevantes da peça SEM prova correspondente entre os anexos:
Liste ou escreva "Nenhuma".

8.3. Provas disponíveis (na lista) não aproveitadas na peça:
Liste ou escreva "Nenhuma".

Se não houver RESUMO nem lista de provas, escreva:
Nenhum.
""".strip()


def extrair_texto_docx(caminho):
    """Extrai o texto da petição. Usa python-docx se disponível; senão, fallback com stdlib."""
    try:
        import docx  # python-docx
        d = docx.Document(caminho)
        linhas = [p.text for p in d.paragraphs]
        return "\n".join(linhas).strip()
    except Exception:
        with zipfile.ZipFile(caminho) as z:
            xml = z.read("word/document.xml").decode("utf-8")
        xml = xml.replace("</w:p>", "\n")
        xml = re.sub(r"<w:tab[^>]*/>", "\t", xml)
        txt = html.unescape(re.sub(r"<[^>]+>", "", xml))
        out = []
        for l in txt.split("\n"):
            l = l.rstrip()
            if l == "" and (not out or out[-1] == ""):
                continue
            out.append(l)
        return "\n".join(out).strip()


# Palavras que indicam arquivo de RESUMO/FATOS/RELATÓRIO, em ordem de prioridade
_RESUMO_KEYS = ["fatos para a inicial", "resumo", "relatorio", "relatório", "relato", "fatos"]


def _ler_texto_arquivo(caminho):
    """Lê texto de um arquivo de fatos/resumo em .md/.txt/.docx/.rtf."""
    low = caminho.lower()
    if low.endswith(".docx"):
        return extrair_texto_docx(caminho)
    if low.endswith(".rtf"):
        raw = open(caminho, encoding="utf-8", errors="ignore").read()
        raw = re.sub(r"\\'[0-9a-fA-F]{2}", " ", raw)       # bytes escapados \'e9
        raw = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", raw)       # control words \par, \b0, etc.
        raw = raw.replace("{", " ").replace("}", " ").replace("\\", " ")
        raw = re.sub(r"[ \t]+", " ", raw)
        return "\n".join(l.strip() for l in raw.splitlines() if l.strip()).strip()
    # .md / .txt / outros textos simples
    return open(caminho, encoding="utf-8", errors="ignore").read().strip()


def ler_resumo(pasta):
    """Procura na pasta um arquivo de RESUMO/FATOS/RELATÓRIO (resumo, fatos, relatório e
    similares), em .md/.txt/.docx/.rtf, e retorna (texto, nome_do_arquivo) — ou ('', '').
    Prioriza 'fatos para a inicial' > 'resumo' > 'relatório' > 'fatos'."""
    if not os.path.isdir(pasta):
        return "", ""
    exts = (".md", ".txt", ".docx", ".rtf")
    candidatos = []
    for nome in sorted(os.listdir(pasta)):
        low = nome.lower()
        if nome.startswith((".", "~$")) or "revisao gpt" in low or not low.endswith(exts):
            continue
        for prio, chave in enumerate(_RESUMO_KEYS):
            if chave in low:
                candidatos.append((prio, nome))
                break
    if not candidatos:
        return "", ""
    candidatos.sort()                       # menor prioridade primeiro
    nome = candidatos[0][1]
    try:
        return _ler_texto_arquivo(os.path.join(pasta, nome)).strip(), nome
    except Exception:
        return "", ""


def listar_provas(pasta, caminho_docx, resumo_nome=""):
    """Lista os documentos/provas a anexar (os nomes de arquivo já são descritivos).
    Exclui a própria inicial, o arquivo de resumo/fatos/relatório, o parecer anterior,
    ocultos, temporários e subpastas."""
    if not os.path.isdir(pasta):
        return []
    inicial = os.path.basename(caminho_docx)
    itens = []
    for nome in sorted(os.listdir(pasta)):
        low = nome.lower()
        if nome.startswith((".", "~$")) or nome in (inicial, resumo_nome):
            continue
        if low.endswith(".md") or "revisao gpt" in low:
            continue
        if any(k in low for k in _RESUMO_KEYS):        # fatos/relatório/resumo não são "provas"
            continue
        if os.path.isdir(os.path.join(pasta, nome)):   # ignora subpastas (ex.: PROTOCOLO)
            continue
        itens.append(nome)
    return itens


def corrigir_inicial(caminho_docx, nome_arquivo=None, analise_anterior=""):
    if not API_KEY:
        sys.exit("ERRO: defina OPENAI_API_KEY (export OPENAI_API_KEY=... ou no arquivo .env).")
    if not os.path.exists(caminho_docx):
        sys.exit(f"ERRO: arquivo não encontrado: {caminho_docx}")

    nome_arquivo = nome_arquivo or os.path.basename(caminho_docx)
    texto = extrair_texto_docx(caminho_docx)
    if len(texto) < 200:
        sys.exit("ERRO: texto extraído muito curto — confira se o .docx está correto.")

    # Contexto extra da pasta: RESUMO dos fatos + lista de provas/documentos a anexar
    pasta = os.path.dirname(os.path.abspath(caminho_docx))
    resumo, resumo_nome = ler_resumo(pasta)
    provas = listar_provas(pasta, caminho_docx, resumo_nome)
    blocos = []
    if resumo:
        blocos.append(
            f"=== RESUMO DO CASO / FATOS — fonte: {resumo_nome} (apurado pelo escritório) ===\n"
            + resumo
        )
    if provas:
        blocos.append(
            "=== PROVAS/DOCUMENTOS QUE SERÃO ANEXADOS AO PROCESSO ===\n"
            "(lista pelos nomes de arquivo, já descritivos; não são as imagens em si)\n"
            + "\n".join("- " + p for p in provas)
        )
    contexto = ("\n\n".join(blocos) + "\n\n") if blocos else ""

    user_text = (
        f"Nome/identificação da peça:\n{nome_arquivo}\n\n"
        f"Análise anterior, se houver:\n{analise_anterior or 'Nenhum'}\n\n"
        + contexto +
        "Analise a PETIÇÃO INICIAL abaixo (texto integral extraído do .docx) e siga "
        "rigorosamente o formato exigido. Se acima houver RESUMO e/ou LISTA DE PROVAS, "
        "cruze-os com a peça (coerência de fatos/valores, alegações sem prova e provas "
        "não aproveitadas), conforme a seção 8.\n\n=== PETIÇÃO INICIAL ===\n" + texto
    )

    body = {
        "model": MODEL,
        "input": [
            {"role": "developer", "content": [{"type": "input_text", "text": DEV_PROMPT}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_text}]},
        ],
    }

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", "ignore")
        sys.exit(f"ERRO HTTP {e.code} na API OpenAI:\n{detalhe[:1200]}")
    except urllib.error.URLError as e:
        sys.exit(f"ERRO de conexão com a API: {e}")

    # Extrai o texto da resposta (Responses API)
    saida = data.get("output_text")
    if not saida:
        partes = []
        for item in data.get("output", []):
            for c in item.get("content", []) or []:
                if c.get("type") == "output_text":
                    partes.append(c.get("text", ""))
        saida = "\n".join(partes).strip()
    if not saida:
        sys.exit("ERRO: resposta sem texto. JSON bruto:\n" + json.dumps(data)[:1200])
    return saida


def main():
    if len(sys.argv) < 2:
        sys.exit('uso: python3 corrigir_inicial.py "<caminho.docx>" [analise_anterior.txt]')
    caminho = sys.argv[1]
    analise = ""
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        analise = open(sys.argv[2], encoding="utf-8").read()

    resultado = corrigir_inicial(caminho, analise_anterior=analise)
    print(resultado)

    saida_txt = os.path.splitext(caminho)[0] + " - REVISAO GPT.txt"
    try:
        with open(saida_txt, "w", encoding="utf-8") as f:
            f.write(resultado)
        print(f"\n[salvo em] {saida_txt}", file=sys.stderr)
    except Exception as e:
        print(f"[aviso] não consegui salvar o .txt ({e}). A revisão está acima.", file=sys.stderr)


if __name__ == "__main__":
    main()
