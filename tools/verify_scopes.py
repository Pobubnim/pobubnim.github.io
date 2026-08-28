# -*- coding: utf-8 -*-
"""Независимый пересчёт всей математики приборов (канон — docs/SCOPES_BASE.md).

Ничего не берёт из чужих таблиц: матрицы выводятся из первичных координат,
мишени вектроскопа — из матрицы, зоны экспозиции — из кривых. Всё, что
печатает этот скрипт, обязано совпадать с числами в базе и в assets/js.

Запуск:  python tools/verify_scopes.py         полный отчёт
         python tools/verify_scopes.py --test  только проверки (код 1 при провале)
"""
from __future__ import annotations

import io
import math
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# --- первичные координаты и белые точки (ITU-R BT.709-6, BT.2020-2, SMPTE RP 431-2)
PRIMARIES = {
    "BT.709":  ((0.6400, 0.3300), (0.3000, 0.6000), (0.1500, 0.0600), (0.3127, 0.3290)),
    "P3-D65":  ((0.6800, 0.3200), (0.2650, 0.6900), (0.1500, 0.0600), (0.3127, 0.3290)),
    "BT.2020": ((0.7080, 0.2920), (0.1700, 0.7970), (0.1310, 0.0460), (0.3127, 0.3290)),
}

# --- зоны false color ARRI LogC3: границы из открытой спецификации ARRI
#     «LogC False Color Exposure Zones and Key», 04.02.2025 (таблицы 2–15).
#     Лежат здесь ради одной проверки: наша формула LogC3 обязана попадать
#     ровно в опубликованные зоны. Разойдётся — врёт формула или таблица.
ARRI_LOGC3_LEGAL = {
    160:  {"Red": (753, 940), "Yellow": (729, 753), "Pink": (461, 480), "Green": (397, 415), "Blue": (147, 151), "Purple": (64, 147)},
    800:  {"Red": (878, 940), "Yellow": (857, 878), "Pink": (461, 480), "Green": (397, 415), "Blue": (152, 172), "Purple": (64, 152)},
    3200: {"Red": (927, 940), "Yellow": (914, 927), "Pink": (461, 480), "Green": (397, 415), "Blue": (170, 241), "Purple": (64, 170)},
}
ARRI_LOGC3_FULL = {
    800: {"Red": (951, 1023), "Yellow": (926, 951), "Pink": (464, 486), "Green": (389, 410), "Blue": (103, 127), "Purple": (0, 103)},
}


def code10_legal(sig):
    """доля сигнала → 10-битный legal-код (64 — чёрный, 940 — номинальный белый)"""
    return 64 + sig * 876


def code10_full(sig):
    return sig * 1023


FAILS: list[str] = []


def check(name: str, got: float, want: float, tol: float) -> None:
    ok = abs(got - want) <= tol
    if not ok:
        FAILS.append(f"{name}: получено {got:.5f}, ждали {want:.5f} (допуск {tol})")
    print(f"  {'✓' if ok else '✗'} {name}: {got:.5f} (ждали {want:.5f})")


# ---------------------------------------------------------------- матрицы
def rgb_to_xyz(prim) -> list[list[float]]:
    """Матрица RGB→XYZ из координат первичных цветов и белой точки (SMPTE RP 177)."""
    (rx, ry), (gx, gy), (bx, by), (wx, wy) = prim
    m = [[rx / ry, gx / gy, bx / by],
         [1.0, 1.0, 1.0],
         [(1 - rx - ry) / ry, (1 - gx - gy) / gy, (1 - bx - by) / by]]
    w = [wx / wy, 1.0, (1 - wx - wy) / wy]
    s = mat_vec(inv3(m), w)
    return [[m[i][j] * s[j] for j in range(3)] for i in range(3)]


def inv3(m):
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
            [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
            [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]


def mat_vec(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


# ---------------------------------------------------------------- Y'CbCr
KR, KG, KB = 0.2126, 0.7152, 0.0722          # BT.709-6
KR601, KG601, KB601 = 0.299, 0.587, 0.114    # BT.601-7


def ycbcr(r, g, b, kr=KR, kg=KG, kb=KB):
    y = kr * r + kg * g + kb * b
    return y, (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))


def rgb_from_ycbcr(y, cb, cr, kr=KR, kg=KG, kb=KB):
    r = y + cr * 2 * (1 - kr)
    b = y + cb * 2 * (1 - kb)
    g = (y - kr * r - kb * b) / kg
    return r, g, b


def polar(cb, cr):
    return math.degrees(math.atan2(cr, cb)) % 360, math.hypot(cb, cr)


# ---------------------------------------------------------------- кривые
def oetf709(L):
    """ITU-R BT.709-6 OETF (сцена → сигнал)."""
    return 4.5 * L if L < 0.018 else 1.099 * L ** 0.45 - 0.099


def eotf_srgb_inv(L):
    """sRGB (IEC 61966-2-1) — НЕ то же самое, что 709."""
    return 12.92 * L if L <= 0.0031308 else 1.055 * L ** (1 / 2.4) - 0.055


def slog3(x):
    """Sony S-Log3 (Technical Summary), x — сценовая экспозиция, 0.18 = серая карта."""
    if x >= 0.01125000:
        return (420 + math.log10((x + 0.01) / 0.19) * 261.5) / 1023
    return (x * (171.2102946929 - 95) / 0.01125000 + 95) / 1023


def logc3(x):
    """ARRI LogC3 EI800 (white paper)."""
    cut, a, b, c, d, e, f = 0.010591, 5.555556, 0.052272, 0.247190, 0.385537, 5.367655, 0.092809
    return c * math.log10(a * x + b) + d if x > cut else e * x + f


# ---------------------------------------------------------------- LUT
def trilinear(lut, n, r, g, b):
    """Трилинейная интерполяция по 3D-LUT (8 узлов)."""
    def node(i, j, k):
        return lut[((k * n + j) * n + i) * 3: ((k * n + j) * n + i) * 3 + 3]

    def part(v):
        p = min(max(v, 0.0), 1.0) * (n - 1)
        i = min(int(p), n - 2)
        return i, p - i

    i, fr = part(r)
    j, fg = part(g)
    k, fb = part(b)
    out = []
    for ch in range(3):
        c00 = node(i, j, k)[ch] * (1 - fr) + node(i + 1, j, k)[ch] * fr
        c10 = node(i, j + 1, k)[ch] * (1 - fr) + node(i + 1, j + 1, k)[ch] * fr
        c01 = node(i, j, k + 1)[ch] * (1 - fr) + node(i + 1, j, k + 1)[ch] * fr
        c11 = node(i, j + 1, k + 1)[ch] * (1 - fr) + node(i + 1, j + 1, k + 1)[ch] * fr
        c0 = c00 * (1 - fg) + c10 * fg
        c1 = c01 * (1 - fg) + c11 * fg
        out.append(c0 * (1 - fb) + c1 * fb)
    return out


def tetrahedral(lut, n, r, g, b):
    """Тетраэдральная интерполяция: куб делится на 6 тетраэдров, работают 4 узла.
    Так считает Resolve — на плавных градиентах меньше «ступенек», чем у трилинейной."""
    def node(i, j, k):
        o = ((k * n + j) * n + i) * 3
        return lut[o:o + 3]

    def part(v):
        p = min(max(v, 0.0), 1.0) * (n - 1)
        i = min(int(p), n - 2)
        return i, p - i

    i, fr = part(r)
    j, fg = part(g)
    k, fb = part(b)
    c000, c111 = node(i, j, k), node(i + 1, j + 1, k + 1)
    out = []
    for ch in range(3):
        v000, v111 = c000[ch], c111[ch]
        if fr > fg:
            if fg > fb:      # fr > fg > fb
                v1, v2 = node(i + 1, j, k)[ch], node(i + 1, j + 1, k)[ch]
                res = v000 + (v1 - v000) * fr + (v2 - v1) * fg + (v111 - v2) * fb
            elif fr > fb:    # fr > fb > fg
                v1, v2 = node(i + 1, j, k)[ch], node(i + 1, j, k + 1)[ch]
                res = v000 + (v1 - v000) * fr + (v111 - v2) * fg + (v2 - v1) * fb
            else:            # fb > fr > fg
                v1, v2 = node(i, j, k + 1)[ch], node(i + 1, j, k + 1)[ch]
                res = v000 + (v2 - v1) * fr + (v111 - v2) * fg + (v1 - v000) * fb
        else:
            if fb > fg:      # fb > fg > fr
                v1, v2 = node(i, j, k + 1)[ch], node(i, j + 1, k + 1)[ch]
                res = v000 + (v111 - v2) * fr + (v2 - v1) * fg + (v1 - v000) * fb
            elif fb > fr:    # fg > fb > fr
                v1, v2 = node(i, j + 1, k)[ch], node(i, j + 1, k + 1)[ch]
                res = v000 + (v111 - v2) * fr + (v1 - v000) * fg + (v2 - v1) * fb
            else:            # fg > fr > fb
                v1, v2 = node(i, j + 1, k)[ch], node(i + 1, j + 1, k)[ch]
                res = v000 + (v2 - v1) * fr + (v1 - v000) * fg + (v111 - v2) * fb
        out.append(res)
    return out


def identity_lut(n):
    lut = []
    for k in range(n):
        for j in range(n):
            for i in range(n):
                lut += [i / (n - 1), j / (n - 1), k / (n - 1)]
    return lut


def main() -> None:
    quiet = "--test" in sys.argv

    print("=== 1. МАТРИЦЫ RGB→XYZ (из первичных координат) ===")
    m709 = rgb_to_xyz(PRIMARIES["BT.709"])
    for row in m709:
        print("   " + "  ".join(f"{v: .6f}" for v in row))
    print("  строка Y матрицы = веса яркости:")
    check("Kr", m709[1][0], KR, 5e-5)
    check("Kg", m709[1][1], KG, 5e-5)
    check("Kb", m709[1][2], KB, 5e-5)
    print("  (коэффициенты 0.2126/0.7152/0.0722 — не константа из воздуха,")
    print("   а средняя строка матрицы BT.709: столько света даёт каждый первичный цвет)")

    print("\n=== 2. МИШЕНИ ВЕКТРОСКОПА (BT.709) ===")
    bars = [("жёлтый", 1, 1, 0), ("голубой", 0, 1, 1), ("зелёный", 0, 1, 0),
            ("пурпурный", 1, 0, 1), ("красный", 1, 0, 0), ("синий", 0, 0, 1)]
    print(f'  {"полоса":10} {"угол°":>7} {"R 75%":>7} {"R 100%":>7}')
    angles = {}
    for name, r, g, b in bars:
        _, cb75, cr75 = ycbcr(r * .75, g * .75, b * .75)
        _, cb100, cr100 = ycbcr(r, g, b)
        a75, rad75 = polar(cb75, cr75)
        a100, rad100 = polar(cb100, cr100)
        angles[name] = a75
        print(f"  {name:10} {a75:7.1f} {rad75:7.4f} {rad100:7.4f}")
        if abs(a75 - a100) > 1e-9:
            FAILS.append(f"угол {name} у 75% и 100% полос разошёлся")
    print("  проверки:")
    check("красный на 102.9°", angles["красный"], 102.9, 0.1)
    check("пурпурный на 49.7°", angles["пурпурный"], 49.7, 0.1)
    check("синий на 354.8°", angles["синий"], 354.8, 0.1)

    print("\n=== 3. КОЖА (канон EDU_BASE §8б.4а — 123°) ===")
    for name, rgb in (("светлая", (222, 170, 140)), ("средняя", (198, 134, 102)),
                      ("тёмная", (140, 95, 75)), ("очень тёмная", (96, 64, 50))):
        _, cb, cr = ycbcr(*[c / 255 for c in rgb])
        a, rad = polar(cb, cr)
        ok = 120 <= a <= 130
        if not ok:
            FAILS.append(f"кожа {name} вне коридора 120–130°: {a:.1f}")
        print(f"  {'✓' if ok else '✗'} {name:14} {a:6.1f}°  насыщенность {rad:.4f}")

    print("\n=== 4. ОБРАТИМОСТЬ Y'CbCr ===")
    worst = 0.0
    for r in (0, .18, .5, .75, 1):
        for g in (0, .3, .6, 1):
            for b in (0, .25, .9, 1):
                y, cb, cr = ycbcr(r, g, b)
                r2, g2, b2 = rgb_from_ycbcr(y, cb, cr)
                worst = max(worst, abs(r - r2), abs(g - g2), abs(b - b2))
    check("максимальная ошибка обратного хода", worst, 0.0, 1e-12)

    print("\n=== 5. IRE-ЯКОРЯ И КОДЫ (BT.709 OETF) ===")
    print(f'  {"сцена":>7} {"709 %":>7} {"sRGB %":>7} {"8бит legal":>11} {"10бит legal":>12}')
    for L in (0.0, 0.02, 0.18, 0.35, 0.60, 0.90, 1.0):
        v, s = oetf709(L), eotf_srgb_inv(L)
        print(f"  {L * 100:6.0f}% {v * 100:7.2f} {s * 100:7.2f} "
              f"{round(16 + v * 219):11d} {round(64 + v * 876):12d}")
    check("серая карта 18% → IRE", oetf709(0.18) * 100, 40.90, 0.05)
    check("серая карта в S-Log3", slog3(0.18) * 100, 41.07, 0.05)
    check("серая карта в LogC3 EI800", logc3(0.18) * 100, 39.13, 0.05)
    print("  (sRGB и 709 — РАЗНЫЕ кривые: 18% даёт 40.9 против 46.1)")

    print("\n=== 6. EL ZONE: стопы относительно 18% серого ===")
    print(f'  {"стоп":>6} {"сцена":>9} {"709 IRE":>9} {"S-Log3 %":>9} {"LogC3 %":>8}')
    for stop in (-6, -4, -3, -2, -1, 0, 1, 2, 3, 4):
        x = 0.18 * (2 ** stop)
        v709 = oetf709(min(x, 1.0)) * 100 if x <= 1 else float("nan")
        print(f"  {stop:+6d} {x:9.4f} {v709:9.2f} {slog3(x) * 100:9.2f} {logc3(x) * 100:8.2f}")
    print("  Rec.709 упирается в 100 IRE уже на +2.5 стопа над серым —")
    print("  поэтому шкала в стопах строится по ЛОГ-сигналу, а не по 709.")

    print("\n=== 7. 3D-LUT: интерполяция ===")
    n = 17
    lut = identity_lut(n)
    worst_tri = worst_tet = 0.0
    for r in (0.03, 0.18, 0.42, 0.5, 0.77, 0.99):
        for g in (0.07, 0.33, 0.61, 0.95):
            for b in (0.01, 0.29, 0.68, 0.88):
                t = trilinear(lut, n, r, g, b)
                q = tetrahedral(lut, n, r, g, b)
                worst_tri = max(worst_tri, max(abs(t[i] - v) for i, v in enumerate((r, g, b))))
                worst_tet = max(worst_tet, max(abs(q[i] - v) for i, v in enumerate((r, g, b))))
    check("единичный LUT, трилинейная", worst_tri, 0.0, 1e-12)
    check("единичный LUT, тетраэдральная", worst_tet, 0.0, 1e-12)

    # нелинейный LUT: обе интерполяции должны попадать в узлы точно
    lut2 = []
    for k in range(n):
        for j in range(n):
            for i in range(n):
                lut2 += [(i / (n - 1)) ** 2.2, j / (n - 1) * 0.8, math.sqrt(k / (n - 1))]
    worst_node = 0.0
    for idx in (0, 3, 8, 12, 16):
        v = idx / (n - 1)
        for fn in (trilinear, tetrahedral):
            got = fn(lut2, n, v, v, v)
            want = [v ** 2.2, v * 0.8, math.sqrt(v)]
            worst_node = max(worst_node, max(abs(a - b) for a, b in zip(got, want)))
    check("попадание в узлы (обе интерполяции)", worst_node, 0.0, 1e-12)

    # lut2 сепарабельный (каждый канал зависит от своей оси) — на таком обе
    # интерполяции обязаны совпасть до последнего знака: это проверка кода
    same = 0.0
    for r in (0.11, 0.37, 0.62, 0.84):
        for g in (0.21, 0.55, 0.91):
            for b in (0.13, 0.47, 0.79):
                t = trilinear(lut2, n, r, g, b)
                q = tetrahedral(lut2, n, r, g, b)
                same = max(same, max(abs(a - b) for a, b in zip(t, q)))
    check("сепарабельный LUT: методы совпадают", same, 0.0, 1e-12)

    # настоящий творческий LUT кросс-канальный (насыщенность, тонировка) —
    # здесь методы обязаны РАЗОЙТИСЬ, иначе тетраэдральная не реализована
    lut3 = []
    for k in range(n):
        for j in range(n):
            for i in range(n):
                r, g, b = i / (n - 1), j / (n - 1), k / (n - 1)
                y = KR * r + KG * g + KB * b
                sat = 1.35
                lut3 += [min(1, max(0, y + (r - y) * sat)) ** 0.95,
                         min(1, max(0, y + (g - y) * sat)),
                         min(1, max(0, y + (b - y) * sat)) ** 1.08]
    diff = 0.0
    for r in (0.11, 0.37, 0.62, 0.84):
        for g in (0.21, 0.55, 0.91):
            for b in (0.13, 0.47, 0.79):
                t = trilinear(lut3, n, r, g, b)
                q = tetrahedral(lut3, n, r, g, b)
                diff = max(diff, max(abs(a - b) for a, b in zip(t, q)))
    print(f"  кросс-канальный LUT: расхождение методов {diff:.6f}")
    print("  (ноль был бы подозрителен: вне узлов методы обязаны различаться)")
    if diff < 1e-9:
        FAILS.append("на кросс-канальном LUT методы совпали — тетраэдральная неверна")
    if diff > 0.05:
        FAILS.append(f"методы разошлись слишком сильно ({diff:.3f}) — ищите ошибку")

    print("\n=== 8. ЗОНЫ FALSE COLOR ARRI ↔ НАША ФОРМУЛА LogC3 ===")
    print("  спецификация ARRI задаёт зоны в 10-битных кодах; проверяем, что")
    print("  формула LogC3 из EDU_BASE §8д попадает ровно в них")
    grey = logc3(0.18)
    grey_code = code10_legal(grey)
    lo, hi = ARRI_LOGC3_LEGAL[800]["Green"]
    ok = lo <= grey_code <= hi
    if not ok:
        FAILS.append(f"18% серый по LogC3 даёт код {grey_code:.1f}, зелёная зона ARRI — {lo}–{hi}")
    print(f"  {'✓' if ok else '✗'} 18% серый: LogC3 → {grey * 100:.2f}% сигнала → код {grey_code:.1f} "
          f"(зелёная зона ARRI {lo}–{hi})")

    stop_up = logc3(0.36)
    stop_code = code10_legal(stop_up)
    plo, phi = ARRI_LOGC3_LEGAL[800]["Pink"]
    ok2 = plo <= stop_code <= phi
    if not ok2:
        FAILS.append(f"стоп над серым по LogC3 даёт код {stop_code:.1f}, розовая зона ARRI — {plo}–{phi}")
    print(f"  {'✓' if ok2 else '✗'} +1 стоп (36% сцены): код {stop_code:.1f} (розовая зона {plo}–{phi})")

    for zone in ("Green", "Pink"):
        l0, l1 = ARRI_LOGC3_LEGAL[800][zone]
        f0, f1 = ARRI_LOGC3_FULL[800][zone]
        sig_l = ((l0 - 64) / 876 + (l1 - 64) / 876) / 2
        sig_f = (f0 / 1023 + f1 / 1023) / 2
        d = abs(sig_l - sig_f)
        if d > 0.004:
            FAILS.append(f"зона {zone}: legal и full таблицы ARRI расходятся на {d:.4f} сигнала")
        print(f"  {'✓' if d <= 0.004 else '✗'} зона {zone}: legal {sig_l * 100:.2f}% ↔ full {sig_f * 100:.2f}% "
              f"(расхождение {d * 100:.2f} п.п.)")

    for ei, tab in ARRI_LOGC3_LEGAL.items():
        prev, bad = -1, False
        for z in ("Purple", "Blue", "Green", "Pink", "Yellow", "Red"):
            a, b = tab[z]
            if a < prev or b < a:
                FAILS.append(f"EI {ei}: зона {z} ({a}–{b}) нарушает порядок")
                bad = True
            prev = b
        print(f"  {'✗' if bad else '✓'} EI {ei}: зоны идут по возрастанию, перекрытий нет")

    print("\n=== 9. ШКАЛА В СТОПАХ: границы зон по кривым ===")
    print(f'  {"стоп":>6} {"709 низ":>9} {"709 верх":>10} {"LogC3 низ":>11} {"LogC3 верх":>12}')
    for stop in (-2, -1, 0, 1, 2):
        lo709 = oetf709(0.18 * 2 ** (stop - 0.5)) * 100
        hi709 = oetf709(min(1.0, 0.18 * 2 ** (stop + 0.5))) * 100
        lo_lc = logc3(0.18 * 2 ** (stop - 0.5)) * 100
        hi_lc = logc3(0.18 * 2 ** (stop + 0.5)) * 100
        print(f"  {stop:+6d} {lo709:9.2f} {hi709:10.2f} {lo_lc:11.2f} {hi_lc:12.2f}")
    z_lo, z_hi = oetf709(0.18 * 2 ** -0.5) * 100, oetf709(0.18 * 2 ** 0.5) * 100
    grey709 = oetf709(0.18) * 100
    ok3 = z_lo <= grey709 <= z_hi
    if not ok3:
        FAILS.append(f"зона «0 стоп» ({z_lo:.1f}–{z_hi:.1f}) не накрывает серую карту {grey709:.1f}")
    print(f"  {'✓' if ok3 else '✗'} зона «0 стоп» по 709: {z_lo:.2f}–{z_hi:.2f} IRE, серая карта {grey709:.2f}")

    print("\n=== 10. ШКАЛЫ ЕДИНИЦ (IRE / 8 бит / 10 бит) ===")
    for name, black, white, span10, base10 in (("legal", 16, 235, 876, 64), ("full", 0, 255, 1023, 0)):
        for ire_val in (0, 40.9, 100):
            sig = ire_val / 100
            print(f"  {name:5} {ire_val:6.1f} IRE → 8 бит {black + sig * (white - black):6.1f} "
                  f"→ 10 бит {base10 + sig * span10:7.1f}")
    check("legal: 0 IRE = код 16", 16 + 0.0 * 219, 16, 1e-9)
    check("legal: 100 IRE = код 235", 16 + 1.0 * 219, 235, 1e-9)
    check("legal: 100 IRE = 10-битный 940", code10_legal(1.0), 940, 1e-9)
    check("full: 100% = 10-битный 1023", code10_full(1.0), 1023, 1e-9)
    check("18% серый в 8-битном legal", 16 + oetf709(0.18) * 219, 105.57, 0.2)

    print("\n=== 11. КЛИППИНГ И ЛЕГАЛЬНОСТЬ НА ЦВЕТНЫХ ПОЛОСАХ ===")
    print("  клип пикселя — когда ВСЕ каналы уперлись в потолок или пол кода;")
    print("  у цветных полос синий канал равен нулю, и это НЕ «чёрное в упор»:")
    bars75 = [(1, 1, 1), (1, 1, 0), (0, 1, 1), (0, 1, 0), (1, 0, 1), (1, 0, 0), (0, 0, 1)]
    all_low = sum(1 for b in bars75 if max(b) == 0)
    any_zero = sum(1 for b in bars75 if min(b) == 0)
    print(f"  полос {len(bars75)}: «все каналы в полу» {all_low}, «хотя бы один канал в полу» {any_zero}")
    if all_low != 0:
        FAILS.append("на полосах не должно быть пикселей со всеми каналами в нуле")
    check("доля «канал в упор» на полосах, %", any_zero / len(bars75) * 100, 85.71, 0.01)
    check("белая полоса 75% в кодах", round(0.75 * 255), 191, 0.5)
    check("яркость белой полосы 75% в IRE (full)", round(0.75 * 255) / 255 * 100, 74.90, 0.02)
    kb = 0.0722
    check("яркость синей полосы 75% в IRE (full)", kb * round(0.75 * 255) / 255 * 100, 5.41, 0.02)
    check("яркость синей полосы 75% в IRE (legal)",
          (kb * round(0.75 * 255) - 16) / 219 * 100, -1.01, 0.02)

    print("\n" + ("ПРОВАЛЫ:" if FAILS else "Все проверки пройдены."))
    for f in FAILS:
        print("  ✗ " + f)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
