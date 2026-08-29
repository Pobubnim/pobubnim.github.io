# -*- coding: utf-8 -*-
"""Самопроверка числовых фактов EDU_BASE (§8б, §8д, §8е).

Независимая реализация формул: пересчитывает все якоря, которые
опубликованы в базе и уроках, и валится (exit 1), если что-то разошлось.
Прогонять перед публикацией урока с числами. Источники формул — EDU_BASE §8д
(Sony S-Log3 Technical Summary, ARRI LogC3 white paper, ITU-R BT.709, ASC CDL).
"""
import math
import sys

GREY = 0.18
FAIL = []


def check(name, got, want, tol):
    ok = abs(got - want) <= tol
    print(("OK  " if ok else "FAIL") + f" {name}: {got:.4g} (база: {want:g} ±{tol:g})")
    if not ok:
        FAIL.append(name)


# ---------- кривые (§8д.4–6) ----------
def slog3(x):
    if x >= 0.01125:
        return (420 + math.log10((x + 0.01) / 0.19) * 261.5) / 1023
    return (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023


def logc3(x):  # EI800
    cut, a, b, c, d, e, f = 0.010591, 5.555556, 0.052272, 0.247190, 0.385537, 5.367655, 0.092809
    return c * math.log10(a * x + b) + d if x > cut else e * x + f


def r709(x):
    return 4.5 * x if x < 0.018 else 1.099 * x ** 0.45 - 0.099


def inv709(v):
    return v / 4.5 if v < 0.081 else ((v + 0.099) / 1.099) ** (1 / 0.45)


def headroom(fn):
    lo, hi = 0.0, 16.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if fn(GREY * 2 ** mid) >= 1:
            hi = mid
        else:
            lo = mid
    return hi


print("— Кривые: якоря серой карты (доля сигнала) —")
check("S-Log3 18% (=420/1023)", slog3(GREY), 420 / 1023, 1e-6)
check("S-Log3 18%, %", slog3(GREY) * 100, 41.1, 0.05)
check("LogC3 18%, %", logc3(GREY) * 100, 39.1, 0.05)
check("Rec.709 18%, %", r709(GREY) * 100, 40.9, 0.05)
check("S-Log3 бумага 90%, %", slog3(GREY * 2 ** 2.32) * 100, 58.4, 0.2)

print("— Кривые: запас над серым до V=1, стопы —")
check("S-Log3 запас", headroom(slog3), 7.7, 0.05)
check("LogC3 запас", headroom(logc3), 8.3, 0.05)
check("Rec.709 запас", headroom(r709), 2.5, 0.05)

print("— Кодов на стоп (10 бит) —")
check("S-Log3 кодов/стоп (log-участок)", math.log10(2) * 261.5, 78.7, 0.1)
top = round((min(1, 1.0) - r709(0.5)) * 1023)  # линейно: верхний стоп 0.5..1.0
check("линейно: верхний стоп из 1023 кодов", (1.0 - 0.5) * 1023, 511.5, 1)

# ---------- LGG ↔ ASC CDL (§8д.1–2) ----------
print("— LGG ↔ CDL: тождество конвейеров —")


def lgg(v, lift, gamma, gain, off):
    v = v + off
    v = gain * (v + lift * (1 - v))
    return max(0.0, v) ** (1 / gamma)


def cdl(v, slope, offset, power):
    return max(0.0, v * slope + offset) ** power


lift, gamma, gain, off = -0.07, 1.18, 1.22, 0.04
slope = gain * (1 - lift)
offset = gain * ((1 - lift) * off + lift)
power = 1 / gamma
worst = max(abs(lgg(v / 100, lift, gamma, gain, off) - cdl(v / 100, slope, offset, power))
            for v in range(0, 101))
check("max |LGG − CDL| по 0..1", worst, 0, 1e-12)

# ---------- Gain против экспозиции (§8е.6, урок 06) ----------
print("— Gain ×2 дисплейного сигнала: сколько это стопов света —")
v_grey = r709(GREY)
stops_mid = math.log2(inv709(min(1, v_grey * 2)) / GREY)
check("×2 на серой карте, стопов света", stops_mid, 1.9, 0.05)
# оба значения внутри линейного сегмента (V ≤ 0.081): ×2 сигнала = ровно +1 стоп
stops_shadow = math.log2(inv709(0.04 * 2) / inv709(0.04))
check("×2 в тенях (лин. сегмент), стопов", stops_shadow, 1.0, 1e-9)

# ---------- вектороскоп: углы кожи (§8б.4а) ----------
print("— Вектороскоп: угол линии скин-тона (оси Cb/Cr Rec.709) —")


def angle(r, g, b):
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    cb, cr = (b - y) * 0.5389, (r - y) * 0.635
    return math.degrees(math.atan2(cr, cb)) % 360


check("светлая кожа (222,170,140)", angle(222, 170, 140), 127, 1)
check("средняя (198,134,102)", angle(198, 134, 102), 125, 1)
check("тёмная (140,95,75)", angle(140, 95, 75), 123, 1)
check("очень тёмная (96,64,50)", angle(96, 64, 50), 123, 1)
check("чистый красный", angle(255, 0, 0), 103, 1)

# ---------- пуассоновская физика стенда (§8е.3) ----------
print("— Шум: SNR = sqrt(N) —")
check("SNR при N=40 (тени 2% колодца 2000)", math.sqrt(2000 * 0.02), 6.3, 0.1)
check("SNR при N=200 (середина 10%)", math.sqrt(2000 * 0.10), 14.1, 0.1)

# ---------- сравнение форматов при равной крупности (§8и.7) ----------
print("— Формат сенсора: равная крупность, дистанция и диафрагма —")


def blur_mm(f, N, s, d):
    """диаметр пятна на сенсоре, мм (всё в мм)"""
    return f * f * abs(d - s) / (N * d * (s - f))


def dof_total(f, N, s, c):
    H = f * f / (N * c) + f
    near = s * (H - f) / (H + s - 2 * f)
    far = s * (H - f) / (H - s) if s < H else float("inf")
    return far - near


FULL_W, PHONE_W = 36.0, 7.6
EQ_F, APERTURE, DIST, BG = 50.0, 2.8, 3000.0, 30000.0     # 50 мм экв., f/2.8, 3 м, фон 30 м
crop = FULL_W / PHONE_W
check("кроп-фактор телефона 1/1.7\"", crop, 4.74, 0.01)
check("объектив телефона под кадр 50 мм", EQ_F / crop, 10.56, 0.01)

# размытие в ДОЛЯХ КАДРА: пятно на сенсоре, делённое на ширину сенсора
share_ff = blur_mm(EQ_F, APERTURE, DIST, BG) / FULL_W
share_phone = blur_mm(EQ_F / crop, APERTURE, DIST, BG) / PHONE_W
check("размытие фона: полный кадр против телефона, раз", share_ff / share_phone, 4.79, 0.05)
check("полный кадр, огонь на 30 м, px кадра 880", share_ff * 880, 6.66, 0.05)
check("телефон, огонь на 30 м, px кадра 880", share_phone * 880, 1.39, 0.05)

# глубина резкости: у телефона она БОЛЬШЕ (кружок строже, но фокусное короче)
c_ff = math.hypot(36, 24) / 1500
c_phone = math.hypot(7.6, 5.7) / 1500
check("глубина, полный кадр 50 мм f/2.8 с 3 м, м",
      dof_total(EQ_F, APERTURE, DIST, c_ff) / 1000, 0.58, 0.02)
check("глубина, телефон при той же крупности, м",
      dof_total(EQ_F / crop, APERTURE, DIST, c_phone) / 1000, 3.69, 0.05)

print()
if FAIL:
    print("РАСХОЖДЕНИЯ:", ", ".join(FAIL))
    sys.exit(1)
print("Все якоря базы сходятся с формулами.")
