#!/usr/bin/env bash
# Выкладка тестовой версии: ветка dev → репозиторий greed1-alt/parsimony-beta → https://beta.parsimony.ru
# Рабочее приложение друзей (app.parsimony.ru) собирается из main этого репозитория и отсюда не меняется.
# Запуск: bash tools/deploy-beta.sh   (из любой папки репозитория; выкладывается последний коммит ветки dev)
#
# Репозиторий беты — только для выкладки: каждый раз туда уходит один свежий коммит с принудительной заменой (push -f),
# история там не нужна. Отличия от dev: CNAME = beta.parsimony.ru, в manifest.json название «Parsimony β», без tools/.
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
REMOTE="https://github.com/greed1-alt/parsimony-beta.git"
SHA="$(git -C "$REPO" rev-parse --short dev)"
NAME="$(git -C "$REPO" config user.name)"
MAIL="$(git -C "$REPO" config user.email)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$REPO" archive dev | tar -x -C "$TMP"
rm -rf "$TMP/tools"
printf 'beta.parsimony.ru\n' > "$TMP/CNAME"
sed -i 's/"name": "Parsimony"/"name": "Parsimony β"/; s/"short_name": "Parsimony"/"short_name": "Parsimony β"/' "$TMP/manifest.json"
grep -q 'Parsimony β' "$TMP/manifest.json" || { echo "manifest.json: не нашёл название для замены" >&2; exit 1; }

cd "$TMP"
git init -q -b main
git add -A
git -c user.name="$NAME" -c user.email="$MAIL" commit -q -m "Бета: dev $SHA"
git push -q -f "$REMOTE" main
echo "Бета выложена: dev $SHA → https://beta.parsimony.ru (GitHub Pages обновится за 1–2 минуты)"
