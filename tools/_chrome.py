# -*- coding: utf-8 -*-
"""Где взять Chrome для приборов приёмки: машина владельца или облачная сессия.

Раньше каждый tools/check_*.py и test_*.py держал путь к chrome.exe у себя, и в
облаке (Linux, root) ни один прибор не поднимался. Теперь путь один:

  1. переменная POBUBNIM_CHROME, если задана;
  2. Windows — Chrome по штатному пути;
  3. Linux/macOS — chrome/chromium из PATH, иначе Chromium Playwright
     из /opt/pw-browsers (он стоит в облачной сессии).

Под root Chrome не стартует без --no-sandbox, а приборы запускают его своими
флагами. Поэтому под root возвращается обёртка, которая добавляет флаг сама.
"""
import glob
import os
import shutil
import sys
import tempfile

WINDOWS = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def _find():
    env = os.environ.get("POBUBNIM_CHROME")
    if env:
        return env
    if os.name == "nt":
        return WINDOWS
    path = None
    for name in ("google-chrome", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if path:
            break
    if not path:
        found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"))
        path = found[-1] if found else None
    if not path:
        sys.exit("Chrome не найден: задайте путь в переменной POBUBNIM_CHROME")
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        wrap = os.path.join(tempfile.gettempdir(), "pobubnim-chrome.sh")
        with open(wrap, "w", encoding="utf-8") as f:
            f.write('#!/bin/sh\nexec "%s" --no-sandbox "$@"\n' % path)
        os.chmod(wrap, 0o755)
        return wrap
    return path


CHROME = _find()
