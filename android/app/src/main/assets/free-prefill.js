/* 空闲教室预填：页面里有表单才填，填完让用户自己点「查询」 */
(function () {
  window.alert = function (m) {
    window.__freeAlert = String(m);
  };
  window.__hpuFill = function (o) {
    try {
      if (!o) o = {};
      var form = document.actionForm;
      if (!form && !document.querySelector('[name="classroom.campus.id"]')) return 'noform';
      var set = function set(name, v) {
        var list = document.querySelectorAll('[name="' + name + '"]');
        var n = 0;
        Array.prototype.forEach.call(list, function (el) {
          el.value = v;
          el.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          n += 1;
        });
        return n;
      };

      // 先切「按时刻」，否则后面切模式会把时间框重置回 00:00
      set('roomApplyTimeType', '1');
      [['classroom.type.id', o.type], ['classroom.campus.id', o.campus], ['classroom.building.id', o.building], ['seats', o.seats], ['classroom.name', o.name], ['cycleTime.cycleCount', '1'], ['cycleTime.dateBegin', o.date], ['cycleTime.dateEnd', o.date]].forEach(function (pair) {
        var k = pair[0],
          v = pair[1];
        if (v != null && v !== '') set(k, String(v));
      });
      if (o.from) set('timeBegin', o.from);
      if (o.to) set('timeEnd', o.to);
      window.scrollTo(0, 0);
      return 'filled';
    } catch (e) {
      return 'err:' + (e && e.message);
    }
  };
})();