# Плеер сетов для мобильного приложения

Движок, который рисует анимированный сет суши с прозрачным фоном внутри WebView.
Приложение возит картинки роллов один раз, а каждый сет — это несколько килобайт JSON.

## Зачем не видео

Сеты и анимации настраиваются в генераторе, то есть вариантов практически неограниченно:
только параметры анимации дают около 280 комбинаций до слайдеров, а расстановка роллов
свободная. Предрендеренные ролики под это не подходят — один сет × одна анимация = один
файл. Плюс прозрачного видео на обеих платформах сразу не существует: HEVC с альфой живёт
у Apple, VP9 с альфой на Android поддерживается не везде, а в MP4 альфы нет в принципе.

Поэтому в приложение встраивается рендерер. Любой сет, любая скорость, ни одного нового
файла.

## Сборка

```bash
npm run player:build
```

На выходе **один файл** `player/dist/index.html` — около 271 КБ (82 КБ в gzip). JS и CSS
свёрнуты внутрь, за кодом нет ни одного внешнего запроса. Этот файл кладётся в бандл
приложения.

Остальные команды: `npm run player:dev` — демо-страница с зашитыми пресетами,
`npm run player:test`, `npm run player:typecheck`.

## Что подаётся на вход

Пресет — это выгрузка из раздела «Пресеты» генератора, один в один. Зашитые наборы лежат
в `src/app/iso/iso-presets.json`.

```json
{
  "name": "Большой сет_верт (40)",
  "objects":    [{ "name": "sushi_1", "anchor": {"x": 0.49, "y": 0.74}, "footprint": "1x1", "scale": 1 }],
  "placements": [{ "objectName": "sushi_1", "col": 0, "row": 0, "floor": 0, "footprint": "1x1" }],
  "values":     { "grid.mode": "stacked", "grid.zone": 4, "relief.wave": true, "relief.loopSeconds": 4 }
}
```

Картинки роллов пресет **не хранит** — он ссылается на них по имени (`objects[].name`).
Их отдаёт хост.

## Картинки: не через `data:`

Плеер принимает `data:`-URL, но для настоящих фотографий это не годится: восемь роллов
в base64 дают JSON примерно на **5 МБ**, столько через `evaluateJavaScript` не передать.

Правильный путь — отдавать картинки своей схемой из бандла и присылать плееру короткие
URL: `WKURLSchemeHandler` на iOS, `WebViewAssetLoader` на Android. Оба варианта ниже.

Размеры картинок передавать необязательно: если `width`/`height` не указаны, плеер
измеряет их сам и до измерения ничего не рисует, чтобы раскладка не прыгала.

## iOS, Swift

### Прозрачность

Три строки, без которых вместо прозрачности будет белый прямоугольник:

```swift
webView.isOpaque = false
webView.backgroundColor = .clear
webView.scrollView.backgroundColor = .clear
```

### Сборка вью

`WKWebView` копирует конфигурацию при создании, поэтому обработчик сообщений
регистрируется **до** него — добавленный позже он не сработает. Отдельный объект вместо
`self` заодно убирает удержание, которым `WKUserContentController` держит обработчик.

```swift
import WebKit

final class PlayerEvents: NSObject, WKScriptMessageHandler {
    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        // ["type": "ready", "pieces": 36, "loopSeconds": 4, "missing": []]
        // ["type": "error", "message": "..."]
        print("player event:", message.body)
    }
}

final class SushiPlayerView: UIView {
    private let webView: WKWebView
    private let events = PlayerEvents()

    override init(frame: CGRect) {
        let configuration = WKWebViewConfiguration()
        // Картинки роллов из бандла по схеме rolls://
        configuration.setURLSchemeHandler(RollSchemeHandler(), forURLScheme: "rolls")
        // Имя обработчика должно быть ровно таким: плеер шлёт события сюда.
        configuration.userContentController.add(events, name: "teikidoPlayer")

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(frame: frame)

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        addSubview(webView)
        webView.frame = bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        guard let page = Bundle.main.url(forResource: "index", withExtension: "html") else { return }
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
```

### Отдача картинок

```swift
final class RollSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard
            let name = task.request.url?.lastPathComponent,
            let file = Bundle.main.url(forResource: name, withExtension: nil),
            let data = try? Data(contentsOf: file)
        else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let response = URLResponse(
            url: task.request.url!, mimeType: "image/png",
            expectedContentLength: data.count, textEncodingName: nil
        )
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
```

### Загрузка сета

JSON — подмножество синтаксиса объектного литерала JavaScript, поэтому его можно
подставлять в вызов напрямую, без экранирования строк.

```swift
func load(preset: [String: Any], rolls: [String]) {
    let payload: [String: Any] = [
        "preset": preset,
        "images": rolls.map { ["name": $0, "url": "rolls://\($0).png"] },
        "autoplay": true,
    ]
    guard
        let data = try? JSONSerialization.data(withJSONObject: payload),
        let json = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript("TeikidoPlayer.load(\(json))")
}
```

Страница грузится асинхронно, поэтому первый `load` вызывается из
`webView(_:didFinish:)` делегата навигации, иначе `TeikidoPlayer` ещё не существует.

## Android, Kotlin

### Прозрачность

```kotlin
webView.setBackgroundColor(Color.TRANSPARENT)
```

Если на старых версиях фон всё равно чёрный, помогает
`webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)`.

### Сборка вью

```kotlin
import android.graphics.Color
import android.view.View
import android.webkit.*
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class SushiPlayer(context: Context) {
    val webView = WebView(context).apply {
        setBackgroundColor(Color.TRANSPARENT)
        overScrollMode = View.OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        settings.javaScriptEnabled = true
        // Имя интерфейса должно быть ровно таким: плеер шлёт события сюда.
        addJavascriptInterface(Bridge(), "TeikidoPlayerAndroid")
    }

    private val assets = WebViewAssetLoader.Builder()
        .addPathHandler("/player/", WebViewAssetLoader.AssetsPathHandler(context))
        .addPathHandler("/rolls/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    init {
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assets.shouldInterceptRequest(request.url)
        }
        webView.loadUrl("https://appassets.androidplatform.net/player/index.html")
    }

    class Bridge {
        @JavascriptInterface
        fun onEvent(json: String) {
            // {"type":"ready","pieces":36,"loopSeconds":4,"missing":[]}
            // {"type":"error","message":"..."}
        }
    }

    fun load(presetJson: String, rolls: List<String>) {
        val images = rolls.joinToString(",") {
            """{"name":"$it","url":"https://appassets.androidplatform.net/rolls/$it.png"}"""
        }
        val payload = """{"preset":$presetJson,"images":[$images],"autoplay":true}"""
        webView.evaluateJavascript("TeikidoPlayer.load($payload)", null)
    }
}
```

Файл плеера кладётся в `src/main/assets/player/index.html`, картинки — в
`src/main/assets/rolls/`.

## API

Всё висит на `window.TeikidoPlayer`.

| Метод | Что делает |
| --- | --- |
| `load(config)` | Загружает сет. Принимает объект **или строку JSON** |
| `play()` / `pause()` | Пуск и пауза. Пауза не теряет место в цикле |
| `setSpeed(seconds)` | Секунды на цикл, от 1 до 12 |
| `setProgress(p)` | Ставит цикл в точку `[0, 1)` — для ручной перемотки |
| `destroy()` | Гасит плеер и очищает сцену |
| `on(fn)` / `off(fn)` | Подписка на события из JavaScript (нативным хостам не нужна) |

Поля `load`:

| Поле | Обязательное | Смысл |
| --- | --- | --- |
| `preset` | да | Пресет из генератора |
| `images` | да | `[{ name, url, width?, height? }]` |
| `speed` | нет | Секунды на цикл; перебивает значение из пресета |
| `autoplay` | нет | По умолчанию `true` |

События уходят **сразу в оба нативных канала**, если они есть, — вставлять свой JS не
нужно:

- `ready` — `{ loopSeconds, pieces, missing }`. `missing` перечисляет имена роллов,
  которые пресет расставляет, а хост не прислал: сцена всё равно рисуется, без них.
- `error` — `{ message }`. Битый JSON или пресет без объектов сообщаются, а не бросаются.

## Поведение, о котором стоит знать

**Свёрнутое приложение возвращается анимированным.** Кадры перестаёт выдавать сам
браузер, когда страницу не видно, — отдельной проверки видимости внутри плеера нет
намеренно: некоторые WebView сообщают о себе «скрыт», будучи на экране, и тогда сет
молча замирал бы без всякого признака, почему.

**Если плеер уехал за край экрана** — например, список сетов прокрутили, — браузер этого
не замечает и продолжает рисовать. Хост знает об этом раньше всех, поэтому зовите
`pause()` и `play()` сами при прокрутке. Это заметно экономит батарею на длинных списках.

**Запоздавший кадр не толкает волну вперёд.** Если WebView стоял, продвижение
ограничивается одним циклом: петля бесшовная, поэтому отстать на цикл незаметно,
а дёрнуться — заметно.

**Кадр детерминирован.** Один и тот же `setProgress` даёт один и тот же кадр, так что
анимацию можно вести и снаружи, своим таймером.

## Что проверено, а что нет

Проверено в браузере: документ прозрачен насквозь, за кодом ноль внешних запросов, сцена
совпадает с генератором кадр в кадр во всех зашитых пресетах и в четырёх точках цикла
волны, загрузка одной JSON-строкой работает без единого сетевого запроса.

**Не проверено на устройстве.** Плеер ни разу не запускался в настоящем WKWebView или
Android WebView. При первой интеграции подтвердите:

1. Фон приложения просвечивает сквозь плеер (три строки для iOS, одна для Android выше).
2. Картинки доезжают по выбранной схеме — пришло событие `ready` с ненулевым `pieces`
   и пустым `missing`.
3. Частота кадров на реальном телефоне, не на симуляторе.

Если по третьему пункту будет мало — резать в таком порядке: сначала частота пересчёта
рельефа, затем canvas вместо SVG, и только потом нативный рендер.
