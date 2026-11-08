# Контракт подготовленного Worker

Версия API: v1. Входящие методы: GET, предусмотренные POST JSON и ограниченный OPTIONS. Ответы со статусом 200 означают успешный разбор данных источника, а не проверку фильма на ТВ. Никакого `?url=`, `/proxy`, загрузки файлов и видеосегментов нет.

Новые маршруты **HDRezka, Kodik, Filmix и KinoTochka** описаны в [SOURCES-API.md](SOURCES-API.md); таблица ниже относится к первоначальным четырем источникам.

## Маршруты

| Маршрут | Параметры | Ответ | Edge TTL |
|---|---|---|---|
| `/health` | нет | service/version/enabledSources, без запроса источников | нет |
| `/v1/animelib/search` | `q`, необязательный `page` | Исходный JSON data/links/meta | 60 с |
| `/v1/animelib/episodes` | `anime_id`: точный slug_url из поиска | Исходный JSON data со списком эпизодов | 60 с |
| `/v1/animelib/episode` | `id`: ID серии AnimeLib | JSON data.players | нет |
| `/v1/animelib/constants` | нет | JSON data.videoServers | 300 с |
| `/v1/cdnvideohub/playlist` | `id`, `aggr=kp` или `aggr=mali` | titleName/isSerial/items; только нужные поля элементов | 60 с |
| `/v1/cdnvideohub/video` | `id`: vkId из каталога | sources и допустимый failoverHost | нет |
| `/v1/animego/search` | `q` | HTML в text/plain для инертного разбора клиентом | нет |
| `/v1/animego/player` | `id`: ID аниме AnimeGO | JSON data.content раскрыт в text/plain | нет |
| `/v1/animego/episode` | `id`: внутренний ID серии AnimeGO | То же, для выбранной серии | нет |
| `/v1/aniboom/embed` | `id`: ID embed, необязательные `episode`, `translation` | quality.auto, streams[{format,url,fallback}], subtitles:[] | нет |

CVH pub фиксируется сервером: kp → 12, mali → 747. Клиент не выбирает pub/host/заголовки. Список источников ENABLED_SOURCES использует имена animelib, cdnvideohub, animego, aniboom. Все они изначально отключены.

Значения `id` — положительные десятичные строки до 15 цифр; slug — текущий формат `<положительный ID>--<латинский slug>`. Название q непустое, до 150 символов. Неизвестные и повторяющиеся параметры запрещены. Валидаторы намеренно узкие; если upstream легитимно изменит формат, его нужно пересмотреть и покрыть тестом.

Плейлисты не объединяются на сервере. В CVH один item может быть сочетанием серии и перевода: число items не равно числу уникальных серий. Все связи, номера сезонов, объединение частей и счетчики остаются задачей адаптера LamPlay.

## Заголовки и ошибки

Разрешенный origin получает свой точный Access-Control-Allow-Origin и Vary: Origin. Автоматические браузерные credentials не поддерживаются. Все ответы клиенту no-store и nosniff, HTML отдается text/plain с ограничивающим CSP. Код страниц не исполняется. Cookie/Authorization/X-Forwarded-For/пользовательский Referer из HTTP-заголовков не копируются к источнику, Set-Cookie не возвращается клиенту. Исключение по явному содержимому POST: поле sessionCookie передается только выбранному сервером HTTPS-зеркалу HDRezka.

Рекламные инструкции CVH и Aniboom не включаются в нормализованный ответ; AnimeLib JSON и AnimeGO текст могут содержать дополнительные данные, которые адаптер не должен исполнять или передавать в плеер. Встроенную в сам видеоряд рекламу эта схема не удаляет.

Ошибка имеет вид:

```json
{"error":{"code":"upstream_denied","upstreamStatus":403}}
```

В ошибку не включаются исходное тело, полный URL, cookies, токены или видеоссылки. Коды: invalid_parameters, invalid_request, route_not_found, origin_required, origin_denied, method_not_allowed, headers_not_allowed, source_disabled, rate_limiter_unavailable, rate_limited, upstream_denied, upstream_http_error, upstream_redirect, upstream_content_type, upstream_shape_changed, upstream_no_streams, upstream_too_large, upstream_challenge, upstream_timeout, upstream_unavailable. Успешный `data:[]` отличается от ошибки. Ни одна ошибка не означает автоматически «тайтла нет» или «личный токен Kodik отклонен».

## План подключения в LamPlay

`client/transport.js` — ES5-фабрика `LamPlayMetadataClient(workerOrigin)`. Это дополнительный проверенный клиент, не подключенный к lamplay.js. Пример для будущей сборки:

```javascript
var client = LamPlayMetadataClient('https://ФАКТИЧЕСКИЙ-АДРЕС-WORKER');
var pending = client.request('cdnvideohub/playlist', { id: kpId, aggr: 'kp' }, onData, onError);
// При закрытии экрана или смене источника:
pending.abort();
```

Фактический origin подставить после публикации; Account ID и API Token в клиент не передаются. Фабрика принимает только HTTPS origin, выставляет withCredentials=false, ждет до 15 секунд (до 30 секунд для kodik/resolve) и игнорирует поздние callbacks после abort. Для JSON-маршрутов разбирает JSON, для AnimeGO возвращает текст.

В будущем включать транспорт отдельно по источнику, сохраняя отмену и поколение текущего `Transport`. Для CVH адаптер может использовать Worker для каталога и resolve; для AnimeLib прямой API остается первым. При недоступности Worker допускается однократный прямой резерв, если этот маршрут действительно работает на устройстве. Нужен единый лимит попыток без петель «прямой → Worker → прямой → Worker».

Конструкторы Aniboom/AnimeLib в 0.22 не становятся рабочими от наличия этого пакета. Нужно отдельно заменить AnimeGO-чтение на JSON content, убрать массовый обход всех серий AnimeLib, проверить ID и добавить настройку адреса/политики Worker в новую согласованную сборку. Atomic reveal должен ждать общий подготовленный снимок, а частично готовые ответы Worker не должны перерисовывать фильтры по одному.

Нельзя автоматически перенаправлять через Worker произвольные URL из `io.request`: туда попадают другие источники, TMDB и потенциально приватные данные. В 0.2.0-preparation личные токены Kodik/Filmix принимаются через POST JSON для фиксированных операций без хранения/общего кэша. Вход HDRezka по логину/паролю не реализован; допускается явно передать существующий sessionCookie только своему доверенному Worker.


Актуализация 0.2.1-testing: Worker опубликован отдельно, все восемь маршрутов включены. Исторические отметки о выключенных источниках относятся к подготовке. Плагин не подключен. Текущие результаты и ограничения: [SOURCES.md](../../SOURCES.md). KinoTochka использует kinovibe.cc, AnimeGO — animego.me.
