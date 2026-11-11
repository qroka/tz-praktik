# Развёртывание на своём сервере

Схема: GitHub Actions проверяет код, собирает Docker-образ, публикует его в `ghcr.io` и по SSH обновляет контейнеры на сервере. Перед приложением стоит Caddy: он сам выпускает и продлевает HTTPS-сертификат.

Сайт открывается на корне домена (`https://tz-praktikum.ru/`), панель преподавателя — `https://tz-praktikum.ru/#/admin`.

## 1. DNS

У регистратора домена создайте A-записи на IP сервера:

| Имя | Тип | Значение |
|---|---|---|
| `@` | A | `193.233.91.143` |
| `www` | A | `193.233.91.143` |

Пока записи не обновились (до нескольких часов), HTTPS-сертификат не выпустится.

## 2. Подготовка сервера (один раз)

Под `root` на сервере:

```bash
mkdir -p /opt/tz-praktikum && cd /opt/tz-praktikum
# скопируйте сюда deploy/setup-server.sh из репозитория и выполните:
bash setup-server.sh
```

Скрипт создаёт пользователя `deploy` (только группа `docker`), каталог `/opt/tz-praktikum` и открывает в файрволе порты 22, 80 и 443.

Создайте ключ для деплоя **на своём компьютере**, а не на сервере:

```bash
ssh-keygen -t ed25519 -f tz-deploy-key -C "github-actions" -N ""
```

Содержимое `tz-deploy-key.pub` добавьте в `/home/deploy/.ssh/authorized_keys` на сервере. Файл `tz-deploy-key` (приватный) пойдёт в секрет GitHub и больше нигде не хранится.

Создайте `/opt/tz-praktikum/.env` по образцу `deploy/.env.example`: задайте длинный `ADMIN_PASSWORD`. Администратор создаётся при первом запуске, пароль потом можно сменить в панели.

## 3. Секреты в GitHub

В репозитории: **Settings → Secrets and variables → Actions → New repository secret**.

| Секрет | Значение |
|---|---|
| `SSH_HOST` | `193.233.91.143` |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | содержимое приватного файла `tz-deploy-key` целиком |

Образ хранится в приватном пакете `ghcr.io/qroka/tz-praktik`. Сервер входит в реестр временным токеном Actions только на время обновления.

## 4. Запуск

Отправьте изменения в `main` (или запустите workflow «Деплой на сервер» вручную во вкладке Actions). Конвейер выполнит типы и тесты, соберёт образ, скопирует `docker-compose.yml` и `Caddyfile` на сервер и перезапустит контейнеры.

Проверка на сервере:

```bash
cd /opt/tz-praktikum && docker compose ps && docker compose logs --tail 50
```

## Данные и резервные копии

База SQLite лежит в томе Docker `app-data` (`/data/tz-praktik.db` в контейнере). Копия базы:

```bash
cd /opt/tz-praktikum
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/tz-praktik.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db ./backup-$(date +%F).db
```

При обновлении образа том сохраняется, данные не теряются.

## Откат

Каждый образ также помечен хэшем коммита. Чтобы вернуться, в `docker-compose.yml` на сервере укажите `image: ghcr.io/qroka/tz-praktik:<sha>` и выполните `docker compose up -d`.

## GitHub Pages

Старый workflow `deploy.yml` публикует статическую версию без сервера на GitHub Pages (базовый путь `/tz-praktik/`). На своём домене он не нужен: если Pages не используется, отключите его в **Actions**.
