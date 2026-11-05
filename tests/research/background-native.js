// Lampa native background API fixture. Source: https://github.com/yumata/lampa/blob/main/app.min.js
// Source SHA256: 96f22f3f1b3bd6852e862c8053762093011b5cf36ac4ed9545b64181eca12d36
function installNativeBackground(Lampa) {
 var Storage={field:key=>Lampa.Storage.get(key)},Platform={screen:()=>false},Player={opened:()=>false};
 var Color={get:()=>[[120,40,70]],palette:()=>({average:[120,40,70],bright:[150,80,100]}),blur:(img,done)=>done(img)};
 var Arrays={getKeys:Object.keys}; window.screen_width=innerWidth;window.screen_height=innerHeight;
  var html$b = $("\n    <div class=\"background\">\n        <canvas class=\"background__one\"></canvas>\n        <canvas class=\"background__two\"></canvas>\n        <canvas class=\"background__fade\"></canvas>\n    </div>");
  var background = {
    one: {
      canvas: $('.background__one', html$b),
      ctx: $('.background__one', html$b)[0].getContext('2d')
    },
    two: {
      canvas: $('.background__two', html$b),
      ctx: $('.background__two', html$b)[0].getContext('2d')
    },
    fade: {
      canvas: $('.background__fade', html$b),
      ctx: $('.background__fade', html$b)[0].getContext('2d')
    }
  };
  var theme_elem = $('head meta[name="theme-color"]');
  var view = 'one';
  var src = '';
  var loaded$1 = {};
  var bokeh = {
    c: [],
    h: [],
    d: true
  };
  var timer$2;
  var immed_time = Date.now();
  var theme_color = '#000000';
  var timer_change;
  /**
   * Запуск
   */

  function init$F() {
    Storage.listener.follow('change', function (event) {
      if (event.name == 'background' || event.name == 'background_type') resize$1();
    });
    var u = Platform.any() ? object$2.github_lampa : './';

    if (Platform.is('orsay')) {
      u = './';
    }

    for (var i = 1; i <= 6; i++) {
      var im = new Image();
      im.src = u + 'img/bokeh-h/' + i + '.png';
      bokeh.h.push(im);
    }

    for (var _i = 1; _i <= 6; _i++) {
      var _im = new Image();

      _im.src = u + 'img/bokeh/' + _i + '.png';
      bokeh.c.push(_im);
    }

    background.one.canvas[0].width = window.screen_width;
    background.one.canvas[0].height = window.screen_height;
    background.two.canvas[0].width = window.screen_width;
    background.two.canvas[0].height = window.screen_height;
    background.fade.canvas[0].width = window.screen_width;
    background.fade.canvas[0].height = window.screen_height;
    Lampa.Listener.follow('resize_start', function () {
      html$b[0].style.opacity = 0;
    });
    Lampa.Listener.follow('resize_end', function () {
      html$b[0].style.opacity = 1;
      resize$1();
    });
    html$b[0].toggleClass('hide', !Storage.field('background'));
  }
  /**
   * Получить активный фон
   * @returns {{canvas:object, ctx: class}}
   */


  function bg() {
    view = view == 'one' ? 'two' : 'one';
    return background[view];
  }
  /**
   * Рисовать
   * @param {object} data 
   * @param {object} item - фон
   * @param {boolean} noimage
   */


  function draw$1(data, item, noimage) {
    if (noimage) return; // Для мобильных устройств делаем полный сброс canvas

    if (Platform.screen('mobile')) {
      item.canvas[0].width = window.screen_width;
      item.canvas[0].height = window.screen_height;
    } else {
      item.ctx.clearRect(0, 0, window.screen_width, window.screen_height);
    }

    var palette = data.palette;
    var type = Storage.field('background_type');
    blur(data, item, function () {
      if (type == 'complex' && bokeh.d) {
        var bright = Color.rgbToHsl(palette.average[0], palette.average[1], palette.average[2]);
        item.ctx.globalAlpha = bright[2] > 30 ? bright[2] / 100 * 0.6 : 0.4;
        item.ctx.globalCompositeOperation = bright[2] > 30 ? 'color-dodge' : 'screen';

        for (var i = 0; i < 10; i++) {
          var bp = Math.round(Math.random() * (bokeh.c.length - 1));
          var im = bright[2] > 30 ? bokeh.h[bp] : bokeh.c[bp];
          var xp = window.screen_width * Math.random(),
              yp = window.screen_height / 2 * Math.random() + window.screen_height / 2,
              sz = Math.max(window.screen_height / 8, window.screen_height / 5 * Math.random()) * 0.01,
              nw = im.width * sz,
              nh = im.height * sz;

          try {
            item.ctx.drawImage(im, xp - nw / 2, yp - nw / 2, nw, nh);
          } catch (e) {}
        }
      }

      item.ctx.globalAlpha = type == 'poster' ? 0.7 : 0.6;
      item.ctx.globalCompositeOperation = 'multiply';
      var angle = 90 * Math.PI / 180,
          x2 = window.screen_width * Math.cos(angle),
          y2 = window.screen_height * Math.sin(angle);
      var gradient = item.ctx.createLinearGradient(0, 0, x2, y2);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(1, 'rgba(0,0,0,' + (type == 'poster' ? 0.4 : 0) + ')');
      item.ctx.fillStyle = gradient;
      item.ctx.fillRect(0, 0, window.screen_width, window.screen_height);

      if (Platform.screen('mobile')) {
        item.ctx.globalAlpha = 1;
        item.ctx.globalCompositeOperation = 'destination-out';
        gradient = item.ctx.createLinearGradient(0, 0, x2, y2);
        gradient.addColorStop(0.05, 'rgba(29,31,32,1)');
        gradient.addColorStop(0.18, 'rgba(' + palette.bright.join(',') + ',0)');
        item.ctx.fillStyle = gradient;
        item.ctx.fillRect(0, 0, window.screen_width, window.screen_height);
        clearTimeout(timer_change);
        timer_change = setTimeout(function () {
          html$b.find('canvas').eq(view == 'one' ? 1 : 0).removeClass('visible');
        }, 400);
        item.canvas.addClass('visible');
      } else {
        fadeTo(item);
      }

      if (!Player.opened()) theme(Storage.field('black_style') ? 'black' : 'reset');
    });
  }
  /**
   * Плавный переход с двойным прогревом обоих canvas
   */


  function fadeTo(new_bg) {
    var fade = background.fade.ctx;
    var old_image = background[view === 'one' ? 'two' : 'one'].canvas[0];
    var new_image = new_bg.canvas[0];
    var duration = 700; // длительность fade

    var warmup = 80; // прогрев GPU

    var start = Date.now();

    function step() {
      var elapsed = Date.now() - start;

      if (elapsed < warmup) {
        // прогрев: оба слоя с альфой 0
        fade.globalAlpha = 0;
        fade.drawImage(old_image, 0, 0);
        fade.drawImage(new_image, 0, 0);
        requestAnimationFrame(step);
        return;
      } // плавный переход


      var progress = Math.min((elapsed - warmup) / duration, 1);
      var eased = progress * progress * (3 - 2 * progress); // easeInOutCubic
      // сначала рисуем старый фон

      fade.globalAlpha = 1;
      fade.drawImage(old_image, 0, 0); // поверх рисуем новый с альфой

      fade.globalAlpha = eased;
      fade.drawImage(new_image, 0, 0);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    } // небольшой defer для синхронизации с рендером браузера


    requestAnimationFrame(function () {
      return requestAnimationFrame(step);
    });
  }
  /**
   * Размыть картинку
   * @param {object} data 
   * @param {object} item - фон
   * @param {function} complite 
   */


  function blur(data, item, complite) {
    function blured(img) {
      var ratio = Math.max(window.screen_width / img.width, window.screen_height / img.height);
      var nw = img.width * ratio,
          nh = img.height * ratio;
      item.ctx.globalAlpha = data.img.width > 1000 ? bokeh.d ? 1 : 0.2 : 1;
      item.ctx.drawImage(img, -(nw - window.screen_width) / 2, -(nh - window.screen_height) / 2, nw, nh);
      complite();
    }

    if (data.img.width > 1000) blured(data.img);else Color.blur(data.img, blured);
  }
  /**
   * Обновить если изменился размер окна
   */


  function resize$1() {
    background.one.canvas[0].width = window.screen_width;
    background.one.canvas[0].height = window.screen_height;
    background.two.canvas[0].width = window.screen_width;
    background.two.canvas[0].height = window.screen_height;
    background.fade.canvas[0].width = window.screen_width;
    background.fade.canvas[0].height = window.screen_height;
    background.one.canvas.width(window.screen_width);
    background.one.canvas.height(window.screen_height);
    background.two.canvas.width(window.screen_width);
    background.two.canvas.height(window.screen_height);
    background.fade.canvas.width(window.screen_width);
    background.fade.canvas.height(window.screen_height);
    html$b[0].toggleClass('hide', !Storage.field('background'));
    if (loaded$1[src]) draw$1(loaded$1[src], background[view]);
  }
  /**
   * Максимум картинок в памяти
   */


  function limit$1() {
    var a = Arrays.getKeys(loaded$1);

    if (a.length > 30) {
      var u = a.slice(0, 1);
      delete loaded$1[u];
    }
  }
  /**
   * Загрузить картинку в память
   */


  function load$1() {
    if (loaded$1[src]) {
      draw$1(loaded$1[src], bg());
    } else if (src) {
      limit$1();
      var cache_src = src;
      var colors;
      var img = new Image();
      img.crossOrigin = "Anonymous";

      img.onload = function () {
        try {
          colors = Color.get(img);
        } catch (e) {
          colors = [[200, 200, 200], [100, 100, 100], [10, 10, 10]];
        }

        loaded$1[cache_src] = {
          img: img,
          palette: Color.palette(colors)
        };
        draw$1(loaded$1[cache_src], bg());
      };

      img.onerror = function () {
        draw$1(false, false, true);
      };

      img.src = src;
    }
  }
  /**
   * Изменить картинку
   * @param {string} url
   */


  function change() {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    if (url == src || Storage.field('light_version') || !Storage.field('background')) return;
    bokeh.d = true;
    if (url) src = url;
    clearTimeout(timer$2);
    timer$2 = setTimeout(function () {
      if (url) load$1();else draw$1(false, false, true);
    }, 1000);
  }
  /**
   * Изменить немедленно без ожидания
   * @param {string} url
   */


  function immediately() {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    if (Storage.field('light_version') || immed_time + 1000 > Date.now() || !Storage.field('background')) return;
    if (url) src = url;
    clearTimeout(timer$2);
    bokeh.d = false;
    immed_time = Date.now();
    if (url) load$1();else draw$1(false, false, true);
  }

  function theme(color) {
    if (color == 'black') color = '#000000';else if (color == 'reset') color = '#1d1f20';
    if (color == theme_color) return;
    theme_color = color;
    theme_elem.attr('content', color);
  }
  /**
   * Рендер
   * @returns {object}
   */


  function render$6() {
    return html$b;
  }

  var Background = {
    render: render$6,
    change: change,
    update: resize$1,
    init: init$F,
    immediately: immediately,
    theme: theme
  };

 Object.keys(background).forEach(k=>{background[k].canvas[0].width=innerWidth;background[k].canvas[0].height=innerHeight;});
 Lampa.Background=Background;jQuery('body').prepend(Background.render());
 return Background;
}
