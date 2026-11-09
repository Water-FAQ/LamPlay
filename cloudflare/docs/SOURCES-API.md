## Актуализация 0.3.0-testing

Добавлен POST /v1/rezka/login с JSON `{login,password,mirror?}`. Возвращает `{success:true,mirror,sessionCookie}` только после проверки сессии. Поля login/password запрещено передавать через GET; значения и cookies не хранятся/не логируются. sessionCookie передается в последующих POST только тому же mirror. Клиент держит его только в памяти.

HDRezka и KinoTochka принимают mirror из настроек LamPlay (rezka_host / kinotochka_host); KinoTochka теперь допускает GET и POST. Поддерживаются HTTPS origins из конфигурации/разрешенного списка. Для HDRezka проверены rezka.ag, standby-rezka.tv, kvk.zone; для KinoTochka kinovibe.cc и kinovibe.vip. Произвольные хосты не разрешаются. Для добавления другого настроенного пользователем зеркала оператор указывает его в REZKA_ALLOWED_MIRRORS / KINOTOCHKA_ALLOWED_MIRRORS. Основной серверный REZKA_ORIGIN изменен на standby-rezka.tv, явный mirror имеет приоритет.

Новые ошибки: source_auth_required, source_login_rejected, source_session_unconfirmed, mirror_not_allowed, source_video_blocked. Прямой резерв CVH/Filmix выполняется подготовленным клиентом один раз, без токенов/сессий. Старые описания ниже сохранены как история подготовки и в противоречащих пунктах заменены этим разделом. Текущий плагин не подключен.

# HDRezka, Kodik, Filmix и KinoTochka

Пакет Worker `0.2.0-preparation`. Реализация для пробной публикации и тестирования; текущий lamplay.js не подключен к ней. Все восемь источников по умолчанию отключены в ENABLED_SOURCES.

## Общие правила

GET используется для публичных операций. POST принимает только `application/json`, объект с известными плоскими полями, не более 16 KiB, чтение тела не дольше 2 секунд. POST не допускает query string. Поля token/sessionCookie в GET запрещены. Токен Cloudflare для публикации сюда никогда не передается.

Результаты всех четырех новых источников не попадают в общий edge cache. Браузерные cookies, Authorization и IP не копируются к источнику. Поле sessionCookie является отдельным явным способом передать существующую сессию HDRezka только фиксированному HTTPS-зеркалу; сервер ее не сохраняет. Логин/пароль HDRezka, универсальная передача заголовков и произвольный URL не поддерживаются.

## HDRezka — source `rezka`

| Маршрут | Метод и поля | Результат |
|---|---|---|
| `/v1/rezka/search` | GET q; либо POST q, sessionCookie? | Поисковая HTML-страница в text/plain |
| `/v1/rezka/page` | GET path; либо POST path, sessionCookie? | HTML карточки в text/plain |
| `/v1/rezka/episodes` | POST id, translator_id, favs?, sessionCookie? | Родной JSON get_episodes |
| `/v1/rezka/stream` | POST id, translator_id, favs?, season, episode, sessionCookie? | Родной JSON get_stream |
| тот же `/stream` для фильма | POST id, translator_id, movie:true, is_camrip?, is_ads?, is_director?, favs?, sessionCookie? | Родной JSON get_movie |

`path` — путь карточки, например `/series/fiction/123-example.html`, без host/query/fragment. Нулевые season/episode/translator_id допускаются. Поля is_camrip/is_ads/is_director — только 0 или 1; это штатные параметры выбора источника, не инструкция запускать рекламу. action назначает сервер, клиент не может вызвать произвольный AJAX.

Ответ url сохраняется в штатном кодированном формате HDRezka. Декодирование, выбор MP4/HLS и обработка subtitle остаются в адаптере LamPlay. Worker не выполняет замену видеосервера и не обходит Premium. Возвращенный premium_content сохраняется для проверки доступа клиентом. success:false считается ошибкой, а success:true с пустой строкой episodes — успешным пустым результатом.

Оператор задает REZKA_ORIGIN в конфигурации. Редиректы автоматически не следуются; при смене зеркала нужно подтвердить новый адрес и изменить настройку. Прямой login HDRezka остается отдельным механизмом.

## Kodik — source `kodik`

| Маршрут | Метод и поля | Результат |
|---|---|---|
| `/v1/kodik/search` | POST token, title?/shikimori_id?/kinopoisk_id?/imdb_id?/id?, year?, limit?, with_episodes?, with_seasons? | Родной JSON results |
| `/v1/kodik/list` | POST token, те же фильтры, next? | Родной JSON results/пагинация |
| `/v1/kodik/get-player` | POST token, title?/shikimoriID?/kinopoiskID?/imdbID?, year? | Родной JSON found/link/allowed |
| `/v1/kodik/integration-script` | GET без полей | add-players.min.js как инертный text/plain |
| `/v1/kodik/page` | GET path, season?, episode?, translation? | HTML каталога плеера в text/plain |
| `/v1/kodik/resolve` | POST path, season?, episode?, translation? | Нормализованные quality/subtitles |

Для search/get-player нужен хотя бы один идентификатор или title. ID записи API имеет вид serial-123/video-123. limit — 1…100; большие with_episodes-ответы могут не уместиться в предел 1 MiB, для пробного запроса использовать limit:1. Для list next передается только курсор, а не полный next_page URL.

`path` плеера — `/serial/ID/HASH/720p`, `/seria/ID/HASH/720p` или `/video/ID/HASH/720p`. Origin выбирается серверной настройкой KODIK_PLAYER_ORIGIN. Если источник вернул другой домен плеера, сначала его проверить и настроить; произвольный host из запроса не принимается. KODIK_API_ORIGIN задает HTTPS API.

Resolve делает до трех исходящих запросов: страница → same-origin app.player_single*.js → same-origin POST endpoint, прочитанный как данные из JS. JS не исполняется, страница не открывается в браузерном движке. Чужой host в script/endpoint отвергается; каждый шаг расходует source rate limit. Общий тайм-аут 25 секунд, клиентский — 30 секунд. Выходные ссылки не загружаются Worker и не кэшируются.

HTTP401 API и явная ошибка неверного токена дают 401 `source_token_rejected`. HTTP403/сетевой отказ не помечают токен недействительным. Пустой results и found:false остаются успешными ответами. Подбор токена, приоритет личного/сохраненного/автоматического и сохранение индикатора остаются в LamPlay; Worker не собирает и не хранит общий токен.

## Filmix — source `filmix`

| Маршрут | Метод и поля | Результат |
|---|---|---|
| `/v1/filmix/search` | GET q | Filmix TV status/items |
| `/v1/filmix/video-links` | GET id | JSON озвучек/сезонов/файлов Filmix TV |
| `/v1/filmix/suggestions` | GET q | JSON posts сайта filmix.gg |
| `/v1/filmix/mobile/search` | POST token, deviceId, q | JSON мобильного API search |
| `/v1/filmix/mobile/post` | POST token, deviceId, id | JSON player_links |
| `/v1/filmix/mobile/profile` | POST token, deviceId | JSON user_data, доступ аккаунта |
| `/v1/filmix/mobile/token-request` | POST deviceId | Код привязки устройства; только по явному действию пользователя |

Последний маршрут может создать запрос привязки: общий probe-скрипт его автоматически не вызывает. Доступные качества и Pro/Pro+ определяются штатным аккаунтом; Worker не повышает доступ. Клиент LamPlay сохраняет свои ограничения качества и не принимает один только список URL за подтверждение подписки.

Мобильный протокол Filmix использует GET с user_dev_token в исходящем URL. К Worker этот токен приходит в POST JSON, затем идет только на настроенный HTTPS FILMIX_MOBILE_ORIGIN; без логирования, редиректов и общего кэша. Исходный HTTP Filmix API не используется для передачи личных токенов. Работоспособность HTTPS filmixapp.cyou не подтверждена этим пакетом: если он недоступен, требуется проверить другой HTTPS API, либо пользоваться TV/site/прямым путем. Автоматического downgrade к HTTP нет.

## KinoTochka — source `kinotochka`

| Маршрут | Метод и поля | Результат |
|---|---|---|
| `/v1/kinotochka/find` | GET kp | JSON поиска по ID Кинопоиска |
| `/v1/kinotochka/search` | GET q | Worker делает штатный POST поиска, возвращает HTML в text/plain |
| `/v1/kinotochka/page` | GET path | HTML выбранной карточки в text/plain |
| `/v1/kinotochka/playlist` | GET path | JSON .txt/.json плейлиста, включая folder/playlist |

KINOTOCHKA_ORIGIN — выбранный HTTPS-сайт. Если .txt/.json лежит на другом хосте, KINOTOCHKA_PLAYLIST_ORIGIN задает отдельно проверенный HTTPS origin. path — только путь без query/fragment, сегментов `..`, схемы и credentials. Если актуальная разметка использует иной формат, вернуть ошибку и пересмотреть валидатор после проверки. Ссылки file на видео не загружаются сервером. Данные не смешиваются с Kinobase: это другой источник.

## Клиент и границы готовности

ES5-клиент автоматически выбирает POST для Kodik API/resolve, HDRezka episodes/stream, Filmix mobile и любых операций с sessionCookie. Для GET с token/sessionCookie выбрасывает локальную ошибку, не отправляя секрет в URL. Функция `request(route, params, done, fail, method?)` возвращает abort; ошибка содержит code/status без полного URL или токена.

Готово для контрактного теста и пробной публикации. Не проверены реальные доступность/география upstream из Cloudflare, актуальные зеркала, подписанные ссылки на IP ТВ и WebOS-воспроизведение. Вход HDRezka по паролю, хранение сессий, расшифровка HDRezka в Worker и проксирование самого видео не входят в это дополнение.


Актуализация 0.2.1-testing: Worker опубликован отдельно, все восемь маршрутов включены. Исторические отметки о выключенных источниках относятся к подготовке. Плагин не подключен. Текущие результаты и ограничения: [SOURCES.md](../../SOURCES.md). KinoTochka использует kinovibe.cc, AnimeGO — animego.me.
