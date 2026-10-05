# -*- coding: utf-8 -*-
"""Приёмка тайминга свадебного дня (instrumenty/tajming-svadby.html) на живой странице.

Проверяет счёт от церемонии назад и вперёд, отключение блоков и свет: закат и золотой
час сверяются с движком sun.js, а подсказка обязана менять смысл вместе с планом —
«прогулка уходит в сумерки», «золотой час на прогулке», «золотой час на банкете».

Запуск:  python tools/test_tajming.py [url]
"""
import json
import sys
import time

from test_callsheet import Tab, check, fails

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/tajming-svadby.html"


class Page(Tab):
    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(30):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimTajming") == "object":
                return
        raise RuntimeError("страница не поднялась: " + "; ".join(self.errors[:2]))


def rows(t):
    return json.loads(t.js("JSON.stringify(PobubnimTajming.schedule().map(r=>[r.time,r.end,r.nm]))"))


def main():
    t = Page()
    try:
        t.goto(URL)
        r = rows(t)
        check("день считается от церемонии: утро назад, праздник вперёд",
              r[0] == ["10:30", "12:00", "Сборы и утро"] and ["13:00", "14:00", "Церемония"] in r and
              r[-1] == ["20:00", None, "Финал: проводы и разъезд"], r)
        t.set("f-cer", "15:00")
        check("сдвиг церемонии сдвигает весь день", rows(t)[0][0] == "12:30" and rows(t)[-1][0] == "22:00", rows(t))
        t.js("(()=>{const c=document.querySelector('[data-id=\"vstrecha\"] input[type=checkbox]');c.checked=false;"
             "c.dispatchEvent(new Event('change',{bubbles:true}));})()")
        check("выключенный блок уходит из плана и сокращает утро",
              rows(t)[0][0] == "13:00" and "Встреча / выкуп" not in [x[2] for x in rows(t)], rows(t))
        t.js("(()=>{const c=document.querySelector('[data-id=\"vstrecha\"] input[type=checkbox]');c.checked=true;"
             "c.dispatchEvent(new Event('change',{bubbles:true}));})()")
        t.set("f-cer", "13:00")

        check("без даты и города света в плане нет", t.js("PobubnimTajming.light()") is None and "Закат" not in t.paper(), "")
        t.set("f-city", "Москва")
        t.set("f-date", "2026-12-19")
        want = t.js("PobubnimSun.hhmm(PobubnimSun.times(2026,12,19,55.7558,37.6173,3).sunset)")
        light = json.loads(t.js("JSON.stringify(PobubnimTajming.light())"))
        check("закат в плане совпал с движком солнца", light["head"].startswith(want) and want in t.paper(), light)
        check("зимой прогулка 14:30–16:00 уходит в сумерки — план говорит об этом",
              light["note"].startswith("Прогулка заканчивается после заката"), light["note"])
        t.set("f-cer", "11:00")
        light = json.loads(t.js("JSON.stringify(PobubnimTajming.light())"))
        check("ранняя церемония: золотой час выпадает на банкет", "Банкет" in light["note"] and "закатные портреты" in light["note"], light["note"])
        t.set("f-date", "2026-10-10")
        t.set("f-cer", "14:30")
        light = json.loads(t.js("JSON.stringify(PobubnimTajming.light())"))
        check("прогулка 16:00–17:30 при закате 17:42: золотой час на прогулке",
              light["note"].startswith("Золотой час попадает на прогулку"), light)
        t.set("f-cer", "18:00")
        light = json.loads(t.js("JSON.stringify(PobubnimTajming.light())"))
        check("прогулка после заката названа прямо", light["note"].startswith("Прогулка начинается после заката"), light["note"])
        t.set("f-city", "Город, которого нет")
        check("незнакомый город не роняет план, свет просто убирается",
              t.js("PobubnimTajming.light()") is None and "Церемония" in t.paper(), "")
        t.set("f-city", "Москва")
        t.set("f-cer", "14:30")

        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850, deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        t.set("f-city", "Москва")
        t.set("f-date", "2026-10-10")
        sw, cw = t.js("document.documentElement.scrollWidth"), t.js("document.documentElement.clientWidth")
        check("мобила 375 без оверфлоу", sw <= cw + 1, f"{sw} > {cw}")
        check("без ошибок в консоли", not t.errors, t.errors[:3])
    finally:
        t.close()
    print(("\nПРОВАЛЕНО (" + str(len(fails)) + "): " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
