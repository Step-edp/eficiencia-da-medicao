"""Gera public/cisc-notas.json a partir da exportação de notas.

Uso: python scripts/importar-notas-cisc.py "C:\\caminho\\data.xlsx"
Mantém notas com Inicio Desejado a partir de 2024.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

DESTINO = Path(__file__).resolve().parents[1] / "public" / "cisc-notas.json"
ANO_MINIMO = 2024


def indice(lista, valor, mapa):
    texto = "" if valor is None else str(valor).strip()
    if texto not in mapa:
        mapa[texto] = len(lista)
        lista.append(texto)
    return mapa[texto]


def main():
    origem = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\E706032\Downloads\data (1).xlsx")
    livro = openpyxl.load_workbook(origem, read_only=True, data_only=True)
    aba = livro[livro.sheetnames[0]]
    linhas = aba.iter_rows(values_only=True)
    next(linhas)

    descricoes, canais, cidades, tipos, niveis = [], [], [], [], []
    mapa_d, mapa_c, mapa_u, mapa_t, mapa_n = {}, {}, {}, {}, {}
    notas = []

    for linha in linhas:
        if not linha or len(linha) < 7:
            continue
        inicio = linha[6]
        if not isinstance(inicio, datetime) or inicio.year < ANO_MINIMO:
            continue
        der = linha[8] if len(linha) > 8 else None
        notas.append(
            [
                int(linha[3]) if linha[3] is not None else None,
                "" if linha[5] is None else str(linha[5]).strip(),
                inicio.strftime("%Y-%m-%d"),
                indice(descricoes, linha[4] if len(linha) > 4 else "", mapa_d),
                indice(canais, linha[10] if len(linha) > 10 else "", mapa_c),
                indice(cidades, linha[13] if len(linha) > 13 else "", mapa_u),
                indice(tipos, linha[2] if len(linha) > 2 else "", mapa_t),
                indice(niveis, linha[1] if len(linha) > 1 else "", mapa_n),
                None if not isinstance(der, (int, float)) else int(round(der)),
            ]
        )

    notas.sort(key=lambda item: item[2], reverse=True)
    pacote = {
        "desde": ANO_MINIMO,
        "campoData": "Inicio Desejado",
        "descricoes": descricoes,
        "canais": canais,
        "cidades": cidades,
        "tipos": tipos,
        "niveis": niveis,
        "notas": notas,
    }
    DESTINO.write_text(json.dumps(pacote, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(notas)} notas em {DESTINO} ({DESTINO.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
