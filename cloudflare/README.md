# Подготовка Cloudflare для LamPlay

Дата исследования: 8 ноября 2026. Пакет: `0.2.0-preparation`. База плагина: LamPlay 0.22.0, коммит `53023fb90c968d6851a51678655542601d1189b7`.

Это самостоятельная подготовка серверной части в том же репозитории. `lamplay.js` не изменен, Worker еще не опубликован в аккаунте пользователя, новые источники плагина не включены. Все маршруты источников по умолчанию выключены; `/health` работает после развертывания без обращения к источникам.

## Что подготовлено

- `src/worker.mjs`, `src/core.mjs`, `src/routes.mjs`, `src/source-routes.mjs`: Worker для публичных метаданных и получения ссылок.
- `wrangler.jsonc`: конфигурация Cloudflare без токенов, домена и Account ID.
- `client/transport.js`: отдельный ES5-клиент для следующей согласованной интеграции. Текущий плагин его не загружает.
- `test/worker.test.mjs`, `test/sources.test.mjs`: проверки маршрутов, CORS, отмены, лимитов, тайм-аутов, кэша и очистки рекламных полей CVH/Aniboom.
- `scripts/runtime-smoke.mjs`: запуск локального workerd для CI, без облачной публикации и запросов источников.
- `../.github/workflows/cloudflare-check.yml`: тесты, dry-run и проверка workerd без секретов.
- `../.github/workflows/deploy-worker.yml`: публикация вручную через Actions, только из main.
- [Исследование и выбранная архитектура](docs/RESEARCH.md).
- [Настройка аккаунта и GitHub Actions](docs/SETUP.md).
- [Контракт API и подключение в будущую сборку](docs/API.md).
- [HDRezka, Kodik, Filmix и KinoTochka: маршруты](docs/SOURCES-API.md).
- [Как протестировать после публикации](docs/TESTING.md).
- [Проверки и оставшиеся ограничения](docs/VALIDATION.md).

## Дополнение 0.2.0-preparation

Добавлены HDRezka search/page/episodes/stream, Kodik API/get-player/page/resolve, Filmix TV/site/mobile API и KinoTochka search/find/page/playlist. Полный resolve Kodik делает до трех запросов без исполнения JS. Существующий sessionCookie HDRezka и личные токены Kodik/Filmix принимаются только через POST JSON к фиксированному HTTPS-источнику, не хранятся и не кэшируются. Вход HDRezka по логину/паролю не реализован. Мобильному Filmix требуется рабочий HTTPS API; автоматического перехода на HTTP нет.

36 сценариев и dry-run; окончательная runtime-проверка описана в VALIDATION.md. Ни один источник не включен автоматически.

## Где исполняется код

GitHub хранит исходники и по ручному запуску публикует их. Wrangler — инструмент публикации, который запускается в GitHub Actions. Worker выполняется на Cloudflare. Lampa обращается к Worker только за данными. Плеер получает ссылку источника и загружает видео непосредственно с видеосервера.

Новый репозиторий, VPS, Lampac, Playwright-сервер и отдельный домен для этого пакета не требуются. Адрес workers.dev предоставляет Cloudflare после первоначальной настройки. Успешная сборка не доказывает доступность источника с IP Cloudflare и воспроизведение на WebOS.

## Локальная проверка

Из папки `cloudflare` с Node.js 22+:

```bash
npm ci
npm run check
npm test
npm run dry-run
```

`dry-run` собирает Worker, но не публикует его и не требует Cloudflare API Token. `node scripts/runtime-smoke.mjs` дополнительно требует возможности запускать локальный workerd и слушать локальный порт. При ограничениях среды эта проверка выполняется в GitHub Actions.

Дальнейшая настройка описана в SETUP.md. Токен Cloudflare нужен только для развертывания. В клиент, конфигурацию Worker и исходники он не включается.
