#!/usr/bin/env bash
# Разовая подготовка нового Ubuntu-сервера (Docker уже установлен). Запуск под root: bash setup-server.sh
set -euo pipefail

DIR=/opt/tz-praktikum
mkdir -p "$DIR"

# Пользователь для деплоя из GitHub Actions: только docker, без sudo.
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy "$DIR"

# Файрвол: только SSH, HTTP и HTTPS.
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

echo "Готово. Дальше: добавьте публичный ключ в /home/deploy/.ssh/authorized_keys и создайте $DIR/.env (см. deploy/.env.example)."
