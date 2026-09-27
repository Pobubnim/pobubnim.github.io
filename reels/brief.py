"""Фотопостановка кадра для ChatGPT: из короткого описания сцены — полный бриф.

Картинка выглядит «нейросетевой», когда промпт описывает ИДЕЮ. Профессиональный кадр
получается, когда промпт описывает СЪЁМКУ: план и ракурс, камеру и объектив, схему света,
материалы и их износ, грейд, композицию под титры и что запрещено. Общий почерк серии
(HOUSE) одинаков для всех роликов, сцена добавляет своё: предмет, план, свет, реквизит.

Поля сцены в сценарии (все, кроме image, необязательны):
    image  — предмет кадра, что именно в кадре (англ.)
    shot   — план и ракурс: "macro close-up, top-down", "medium shot from behind, eye level"
    lens   — если нужен другой объектив: "100mm macro", "24mm wide"
    light  — схема света этой сцены (иначе — домашняя: мотивированный низкий ключ)
    set    — реквизит и фактуры: "worn walnut desk, brushed aluminium camera cage"
    mood   — настроение одним-двумя словами: "quiet concentration"
"""

HOUSE = {
    "camera": (
        "Shot on an ARRI Alexa 35 with Cooke S4/i primes at T2-T2.8: shallow depth of field, "
        "natural focus fall-off, gentle optical vignetting, no digital sharpening."
    ),
    "light": (
        "Motivated low-key lighting: one large soft key from a practical lamp or window, a thin "
        "rim light separating the subject from the background, deep negative fill, no flat front light."
    ),
    "grade": (
        "Colour grade: deep true blacks, warm cream highlights (#f5efe2), amber practicals, "
        "restrained saturation, a faint teal only in the deepest shadows; Kodak 2383 print "
        "emulation; fine organic 35mm film grain."
    ),
    "realism": (
        "Photorealistic, documentary-grade realism: real materials with wear (micro-scratches on "
        "metal, fingerprints and dust on glass, fabric weave, paper fibres, cable strain relief), "
        "physically correct reflections and contact shadows, true-to-life scale of objects. "
        "It must read as a frame from a real film shoot, not as a 3D render or an illustration."
    ),
    "composition": (
        "Vertical 2:3 frame that will be cropped to 9:16: keep the key subject inside the central "
        "70% of the width; keep the top 15% calm (a headline goes there) and the middle-lower third "
        "darker and uncluttered (subtitles go there). One clear focal point."
    ),
    "avoid": (
        "No text, letters, numbers, logos, brand marks or watermarks anywhere; screens show only "
        "abstract footage or soft light, never readable UI. No recognizable human faces: hands, "
        "backs and silhouettes only. No extra or fused fingers, no deformed hands, no melted "
        "objects, no duplicated cameras. No CGI or plastic look, no HDR halos, no over-sharpening, "
        "no fisheye or tilt-shift, no neon cyberpunk palette, no stock-photo staging."
    ),
}


def compose(sc, data):
    """Полный промпт кадра: сцена + общий почерк серии (data['house'] перекрывает HOUSE)."""
    house = {**HOUSE, **data.get("house", {})}
    lines = [f"SUBJECT: {sc['image'].strip()}"]
    if sc.get("shot"):
        lines.append(f"SHOT: {sc['shot']}")
    camera = house["camera"]
    if sc.get("lens"):
        camera = f"{camera} Lens for this frame: {sc['lens']}."
    lines += [
        f"CAMERA AND LENS: {camera}",
        f"LIGHT: {sc.get('light') or house['light']}",
    ]
    if sc.get("set"):
        lines.append(f"SET, PROPS AND TEXTURES: {sc['set']}")
    if sc.get("mood"):
        lines.append(f"MOOD: {sc['mood']}")
    lines += [
        f"COLOUR: {house['grade']}",
        f"REALISM: {house['realism']}",
        f"COMPOSITION: {house['composition']}",
        f"AVOID: {house['avoid']}",
    ]
    return "\n".join(lines)
