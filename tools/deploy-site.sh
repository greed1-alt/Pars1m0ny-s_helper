#!/usr/bin/env bash
# Выкладка страницы о Parsimony: папка site/ ветки dev → репозиторий greed1-alt/parsimony-site → https://parsimony.ru
# Запуск: bash tools/deploy-site.sh            — выложить последний коммит ветки dev
#         bash tools/deploy-site.sh --out ПАПКА — только собрать в папку (посмотреть у себя), без выкладки
#
# Шрифты (fonts/) и иконки берутся из приложения — копий в репозитории нет. Как у беты: в репозиторий сайта каждый раз уходит
# один свежий коммит с заменой (push -f), история там не нужна. Сайт без скриптов, со своим CSP (site/index.html).
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
REMOTE="https://github.com/greed1-alt/parsimony-site.git"
OUT=""
if [ "${1:-}" = "--out" ]; then OUT="${2:?папка}"; fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive dev site fonts favicon.png icon-180.png icon-192.png icon-512.png | tar -x -C "$TMP"
mkdir -p "$TMP/out/fonts"
cp -r "$TMP/site/." "$TMP/out/"
cp "$TMP/fonts/inter-cyrillic.woff2" "$TMP/fonts/inter-latin.woff2" "$TMP/fonts/josefin-sans-300-latin.woff2" "$TMP/fonts/OFL-Inter.txt" "$TMP/fonts/OFL-JosefinSans.txt" "$TMP/out/fonts/"
cp "$TMP/favicon.png" "$TMP/icon-180.png" "$TMP/icon-192.png" "$TMP/icon-512.png" "$TMP/out/"
grep -q '^parsimony.ru$' "$TMP/out/CNAME" || { echo "site/CNAME: должен быть parsimony.ru" >&2; exit 1; }

if [ -n "$OUT" ]; then mkdir -p "$OUT"; cp -r "$TMP/out/." "$OUT/"; echo "Собрано в $OUT"; exit 0; fi

SHA="$(git -C "$REPO" rev-parse --short dev)"
NAME="$(git -C "$REPO" config user.name)"
MAIL="$(git -C "$REPO" config user.email)"
cd "$TMP/out"
git init -q -b main
git add -A
git -c user.name="$NAME" -c user.email="$MAIL" commit -q -m "Сайт: dev $SHA"
git push -q -f "$REMOTE" main
echo "Сайт выложен: dev $SHA → https://parsimony.ru (GitHub Pages обновится за 1–2 минуты)"
