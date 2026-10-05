# -*- coding: utf-8 -*-
"""Приёмка профиля исполнителя (assets/js/profile.js) на живых страницах.

Реквизиты, вписанные в смету, обязаны сами встать в договор и релиз — и только в
пустые поля; статус исполнителя следует за профилем там, где такой статус есть;
подстановка не подсвечивает лист договора как правку; паспортные поля в профиль
не попадают; кнопка «Забыть» стирает всё.

Запуск:  python tools/test_profile.py [адрес сервера, по умолчанию http://localhost:8765]
"""
import json
import sys
import time

from test_callsheet import Tab, check, fails

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765").rstrip("/")
KEY = "pobubnim-profile-v1"


class Page(Tab):
    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(30):
            time.sleep(0.4)
            if self.js("document.readyState") == "complete" and self.js("!!document.getElementById('paper').innerText"):
                time.sleep(0.3)
                return
        raise RuntimeError("страница не поднялась: " + "; ".join(self.errors[:2]))


def main():
    t = Page()
    try:
        t.goto(BASE + "/instrumenty/smeta-i-schet.html")
        check("на чистом браузере подписи про профиль нет", t.js("document.querySelector('.profile-note').hidden"), "")
        t.js("(()=>{const r=document.querySelector('input[name=who][value=ip]');r.checked=true;"
             "r.dispatchEvent(new Event('change',{bubbles:true}));})()")
        for fid, v in (("f-exec", "Бубнов Савелий Игоревич"), ("f-inn", "503000000000"), ("f-bank", "АО «Т-Банк»"),
                       ("f-bik", "044525974"), ("f-ks", "30101810145250000974"), ("f-rs", "40802810000000000001"),
                       ("f-city", "Апрелевка")):
            t.set(fid, v)
        time.sleep(0.8)
        prof = json.loads(t.js(f"localStorage.getItem('{KEY}')") or "{}")
        check("смета записала реквизиты и статус в профиль",
              prof.get("name") == "Бубнов Савелий Игоревич" and prof.get("inn") == "503000000000" and
              prof.get("status") == "ip" and prof.get("acc") == "40802810000000000001" and prof.get("city") == "Апрелевка", prof)
        check("подпись с кнопкой «Забыть» появилась", t.js("!document.querySelector('.profile-note').hidden"), "")

        t.goto(BASE + "/instrumenty/modelnyj-reliz.html")
        check("релиз: имя автора и город встали сами",
              t.js("document.getElementById('f-author').value") == "Бубнов Савелий Игоревич" and
              t.js("document.getElementById('f-city').value") == "Апрелевка" and
              "Бубнов Савелий Игоревич" in t.paper(), t.js("document.getElementById('f-author').value"))

        t.goto(BASE + "/konstruktor-dogovora.html")
        got = json.loads(t.js("JSON.stringify(['name','inn','bank','bik','corr','acc'].map(k=>document.getElementById('f-exec-'+k).value))"))
        check("договор: реквизиты исполнителя встали сами",
              got == ["Бубнов Савелий Игоревич", "503000000000", "АО «Т-Банк»", "044525974",
                      "30101810145250000974", "40802810000000000001"], got)
        check("договор: статус исполнителя — ИП, как в профиле, и лист это знает",
              t.js("document.querySelector('input[name=executor]:checked').value") == "ip" and
              "Бубнов Савелий Игоревич" in t.paper() and "503000000000" in t.paper(), "")
        check("подстановка не подсвечена в листе как правка", t.js("document.querySelectorAll('#paper .hit').length") == 0,
              t.js("document.querySelectorAll('#paper .hit').length"))
        t.js("(()=>{const c=document.getElementById('f-exec-pass-on');if(c&&!c.checked){c.checked=true;"
             "c.dispatchEvent(new Event('change',{bubbles:true}));}})()")
        t.set("f-exec-pser", "45 12 345678")
        t.set("f-exec-phone", "+7 982 905-44-54")
        time.sleep(0.8)
        prof = json.loads(t.js(f"localStorage.getItem('{KEY}')") or "{}")
        check("телефон дописался в профиль, паспорт — нет",
              prof.get("tel") == "+7 982 905-44-54" and "45 12 345678" not in json.dumps(prof, ensure_ascii=False) and
              set(prof) <= {"name", "inn", "ogrn", "addr", "tel", "email", "acc", "bank", "bik", "corr", "city", "status"}, prof)

        t.goto(BASE + "/instrumenty/smeta-i-schet.html")
        t.set("f-exec", "ООО «Другой исполнитель»")
        time.sleep(0.7)
        t.goto(BASE + "/instrumenty/modelnyj-reliz.html")
        check("профиль хранит последнее вписанное имя",
              t.js("document.getElementById('f-author').value") == "ООО «Другой исполнитель»", "")
        t.click("#btn-profile-forget")
        check("«Забыть» стирает профиль и прячет подпись",
              t.js(f"localStorage.getItem('{KEY}')") in (None, "") and t.js("document.querySelector('.profile-note').hidden"), "")
        t.goto(BASE + "/konstruktor-dogovora.html")
        check("после «Забыть» поля договора пустые", t.js("document.getElementById('f-exec-name').value") == "", "")
        check("без ошибок в консоли", not t.errors, t.errors[:3])
    finally:
        t.close()
    print(("\nПРОВАЛЕНО (" + str(len(fails)) + "): " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
