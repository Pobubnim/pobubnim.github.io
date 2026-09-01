# -*- coding: utf-8 -*-
"""Приёмка переезда на свой домен: проверяет то, что ломается тихо.

Запуск: python tools/check_domain.py
Код 1 — есть провалы, 0 — всё зелёное.
"""
import json
import socket
import ssl
import sys
import urllib.request

NEW = "pobubnim.ru"
OLD = "pobubnim.github.io"
GH_IPS = {"185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"}

ok, bad = [], []


def check(name, cond, detail=""):
    (ok if cond else bad).append(f"{name}{' — ' + detail if detail else ''}")


def doh(name, rtype="A"):
    url = f"https://dns.google/resolve?name={name}&type={rtype}"
    with urllib.request.urlopen(url, timeout=15) as r:
        d = json.load(r)
    return [a.get("data") for a in d.get("Answer", [])], d.get("Status")


def resolved_ip():
    """Первый живой A-адрес домена по DoH: на машинах с VPN системный
    резолвер молчит (UDP/53 перехвачен), а сайт при этом живой."""
    ips, status = doh(NEW)
    return ips[0] if status == 0 and ips else None


def fetch(path, scheme="https"):
    """Читает страницу даже когда системный резолвер не работает:
    сначала обычным адресом, при провале — по IP с заголовком Host."""
    url = f"{scheme}://{NEW}{path}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.read().decode("utf-8", "ignore")
    except (urllib.error.URLError, socket.gaierror) as e:
        if not isinstance(getattr(e, "reason", None), socket.gaierror):
            raise
    ip = resolved_ip()
    if not ip:
        raise RuntimeError("домен не резолвится")
    req = urllib.request.Request(f"{scheme}://{ip}{path}", headers={"Host": NEW})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return r.read().decode("utf-8", "ignore")


def head(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "pobubnim-check"})
    op = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
    try:
        with op.open(req, timeout=20) as r:
            return r.status, r.url, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, url, dict(e.headers)


# 1. DNS
ips, status = doh(NEW)
check("DNS: домен резолвится", status == 0 and ips, f"статус {status}")
check("DNS: A-записи ведут на GitHub Pages", set(ips) & GH_IPS == set(ips) and len(ips) > 0,
      f"получено {sorted(ips)}")
check("DNS: все четыре адреса GitHub", set(ips) == GH_IPS, f"{len(ips)} из 4")
wwws, wstatus = doh("www." + NEW, "CNAME")
check("DNS: www ведёт на Pages", wstatus == 0, f"статус {wstatus}")

# 2. HTTPS и сертификат
try:
    ctx = ssl.create_default_context()
    target = NEW
    try:
        socket.getaddrinfo(NEW, 443)
    except socket.gaierror:
        target = resolved_ip() or NEW
    with socket.create_connection((target, 443), timeout=20) as s:
        with ctx.wrap_socket(s, server_hostname=NEW) as ss:
            cert = ss.getpeercert()
    names = {v for k, v in cert.get("subjectAltName", []) if k == "DNS"}
    check("HTTPS: сертификат выпущен и валиден", NEW in names, f"домены в сертификате: {sorted(names)}")
except Exception as e:
    check("HTTPS: сертификат выпущен и валиден", False, str(e))

# 3. Сайт отвечает и http уходит на https
try:
    try:
        socket.getaddrinfo(NEW, 80)
        code, final, hdrs = head("http://" + NEW + "/")
    except socket.gaierror:
        ip = resolved_ip()
        req_h = urllib.request.Request("http://" + ip + "/", method="HEAD", headers={"Host": NEW})
        with urllib.request.urlopen(req_h, timeout=20) as r:
            code, final, hdrs = r.status, r.url, dict(r.headers)
    check("Сайт: http отдаёт страницу", code == 200, f"код {code}")
    check("Сайт: http перекинут на https (Enforce HTTPS)", final.startswith("https://"), f"итог {final}")
except Exception as e:
    check("Сайт: http отдаёт страницу", False, str(e))
    check("Сайт: http перекинут на https (Enforce HTTPS)", False, "сайт не открылся")

# 4. Старый адрес отдаёт 301 на новый
req = urllib.request.Request("https://" + OLD + "/", method="HEAD")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


try:
    urllib.request.build_opener(NoRedirect).open(req, timeout=20)
    check("Старый адрес: 301 на новый", False, "редиректа нет")
except urllib.error.HTTPError as e:
    loc = e.headers.get("Location", "")
    check("Старый адрес: 301 на новый", e.code == 301 and NEW in loc, f"код {e.code}, Location {loc}")
except Exception as e:
    check("Старый адрес: 301 на новый", False, str(e))

# 5. Ключевые файлы на новом домене
for path, must in (("/sitemap.xml", "<loc>https://" + NEW),
                   ("/robots.txt", "Sitemap: https://" + NEW),
                   ("/llms.txt", NEW),
                   ("/192a35e5815990c4c58d2bff8e132937.txt", "192a35e5815990c4c58d2bff8e132937")):
    try:
        body = fetch(path)
        check(f"Файл {path}", must in body, "содержимое не то")
    except Exception as e:
        check(f"Файл {path}", False, str(e))

# 6. Счётчик Метрики на главной
try:
    home = fetch("/")
    check("Метрика: счётчик подключён", "analytics.js" in home, "нет analytics.js")
    check("Канонический адрес — новый домен", f'href="https://{NEW}/"' in home, "canonical не тот")
except Exception as e:
    check("Главная страница читается", False, str(e))

print("ЗЕЛЁНОЕ (%d):" % len(ok))
for line in ok:
    print("  +", line)
print("\nПРОВАЛЫ (%d):" % len(bad))
for line in bad:
    print("  -", line)
sys.exit(1 if bad else 0)
