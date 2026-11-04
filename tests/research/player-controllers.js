// Native Lampa player controllers, source: https://github.com/yumata/lampa (04.11.2026).
function installNativePlayerControllers(){
    Controller.add('player_rewind', {
      toggle: function toggle() {
        Controller.collectionSet(render$c());
        Controller.collectionFocus(false, render$c());
      },
      up: function up() {
        toggleUp();
      },
      down: function down() {
        toggleButtons();
      },
      right: function right() {
        listener$j.send('rnext', {});
      },
      left: function left() {
        listener$j.send('rprev', {});
      },
      gone: function gone() {
        Html.render().find('.selector').removeClass('focus');
      },
      back: toPlayer
    });
    Controller.add('player_panel', {
      toggle: function toggle() {
        if (PlayerIPTV.playning()) Controller.toggle('player_tv');else {
          Controller.collectionSet(render$c());
          Controller.collectionFocus($(Player.playdata().iptv ? '.player-panel__next' : '.player-panel__playpause', Html.render())[0], render$c());
        }
      },
      up: function up() {
        Player.playdata().iptv || Html.render().hasClass('panel--norewind') ? toggleUp() : toggleRewind();
      },
      right: function right() {
        Navigator.move('right');
      },
      left: function left() {
        Navigator.move('left');
      },
      down: function down() {
        PlayerFooter.available() ? Controller.toggle('player_footer') : listener$j.send('playlist', {});
      },
      gone: function gone() {
        Html.render().find('.selector').removeClass('focus');
      },
      back: toPlayer
    });
  }