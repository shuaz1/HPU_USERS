/* 安卓版 window.hpu：把原生桥包成和桌面壳一致的 Promise 接口 */
(function () {
  if (!window.HpuNative) return;

  var seq = 0;
  var waiters = {};

  window.__hpuDone = function (id, ok, payload) {
    var w = waiters[id];
    if (!w) return;
    delete waiters[id];
    var data = payload;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { data = { ok: false, reason: String(data) }; }
    }
    if (ok) w.resolve(data === null ? {} : data);
    else w.reject(new Error((data && (data.message || data.reason)) || 'native error'));
  };

  function call(method, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'c' + (++seq);
      waiters[id] = { resolve: resolve, reject: reject };
      try {
        HpuNative.call(method, JSON.stringify(payload || {}), id);
      } catch (e) {
        delete waiters[id];
        reject(e);
      }
    });
  }

  function http(o) { return call('http', o || {}); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var CAS = 'https://uia.hpu.edu.cn/cas/login?service=https%3A%2F%2Fuia.hpu.edu.cn%2Fsso%2Flogin%3Fredirect_uri%3D' +
    'https%253A%252F%252Fzhjw.hpu.edu.cn%252Feams%252Flogin.action%26x_client%3Dcas';
  var FREE = 'https://zhjw.hpu.edu.cn/eams/classroom/apply/std-activity.action';
  var ELEC = 'http://183.169.255.4:8080/Default.aspx';

  /* ---------------- 电费站三级联动（和桌面壳同一套表单协议） ---------------- */

  function pick(html, re) {
    var m = (html || '').match(re);
    return m ? m[1] : '';
  }

  function form(o) {
    return Object.keys(o).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(o[k] == null ? '' : o[k]);
    }).join('&');
  }

  function options(html, id) {
    var seg = ((html || '').split('id="' + id + '"')[1] || '').split('</select>')[0];
    var out = [];
    var re = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
    var m;
    while ((m = re.exec(seg))) { if (m[1]) out.push({ code: m[1], name: m[2].trim() }); }
    return out;
  }

  function rowsOf(html) {
    var seg = ((html || '').split('class="dataTable"')[1] || '').split('</table>')[0];
    var out = [];
    var trs = seg.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    trs.forEach(function (tr) {
      if (/titleLine/.test(tr)) return;
      var cells = [];
      var re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      var m;
      while ((m = re.exec(tr))) cells.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      if (cells.length >= 3) out.push(cells);
    });
    return out;
  }

  function balancesOf(html) {
    var out = [];
    var re = /([^<>：;]{1,30})剩余电量：<span class="number orange">([\d.]+)<\/span>/g;
    var m;
    while ((m = re.exec(html || ''))) {
      out.push({ meter: m[1].trim().replace(/^[^一-龥A-Za-z0-9#]+/, ''), kwh: parseFloat(m[2]) || 0 });
    }
    return out;
  }

  function twinOf(buildings, code) {
    var cur = null;
    for (var i = 0; i < buildings.length; i++) if (buildings[i].code === code) cur = buildings[i];
    if (!cur) return null;
    var base = cur.name.replace(/(照明|空调)/, '');
    for (var j = 0; j < buildings.length; j++) {
      var b = buildings[j];
      if (b.code !== code && /照明|空调/.test(b.name) && b.name.replace(/(照明|空调)/, '') === base) return b;
    }
    return null;
  }

  function today(offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function chain(o) {
    var vs = function (h) { return pick(h, /id="__VIEWSTATE" value="([^"]*)"/); };
    var p0 = await http({ method: 'GET', url: ELEC });
    if (!p0.body) return { ok: false, reason: '电费查询站打不开（183.169.255.4:8080 无响应）' };

    var buildings = options(p0.body, 'drlouming');
    var p1 = await http({
      method: 'POST', url: ELEC, body: form({
        __EVENTTARGET: 'drlouming', __EVENTARGUMENT: '', __VIEWSTATE: vs(p0.body),
        drlouming: o.building || '', drceng: '', drfangjian: '', radio: o.radio
      })
    });
    var floors = options(p1.body, 'drceng');
    if (!o.building) return { ok: true, buildings: buildings, floors: [], rooms: [], balances: [], rows: [] };
    if (!o.floor) return { ok: true, buildings: buildings, floors: floors, rooms: [], balances: [], rows: [] };

    var p2 = await http({
      method: 'POST', url: ELEC, body: form({
        __EVENTTARGET: 'drceng', __EVENTARGUMENT: '', __VIEWSTATE: vs(p1.body),
        drlouming: o.building, drceng: o.floor, drfangjian: '', radio: o.radio
      })
    });
    var rooms = options(p2.body, 'drfangjian');
    if (!o.room) return { ok: true, buildings: buildings, floors: floors, rooms: rooms, balances: [], rows: [] };

    var p3 = await http({
      method: 'POST', url: ELEC, body: form({
        __EVENTTARGET: '', __EVENTARGUMENT: '', __VIEWSTATE: vs(p2.body),
        drlouming: o.building, drceng: o.floor, drfangjian: o.room, radio: o.radio,
        'ImageButton1.x': '12', 'ImageButton1.y': '8'
      })
    });

    var res = p3.body || '';
    var loc = p3.location || '';
    if (loc && loc !== ELEC) {
      var p4 = await http({ method: 'GET', url: loc.indexOf('http') === 0 ? loc : ('http://183.169.255.4:8080' + (loc.charAt(0) === '/' ? loc : '/' + loc)) });
      if (p4.body) res = p4.body;
    }
    if (o.start && o.end && res) {
      var p5 = await http({
        method: 'POST', url: loc.indexOf('http') === 0 ? loc : ('http://183.169.255.4:8080' + (loc.charAt(0) === '/' ? loc : '/' + loc)),
        body: form({
          __EVENTTARGET: '', __EVENTARGUMENT: '',
          __VIEWSTATE: vs(res), __EVENTVALIDATION: pick(res, /id="__EVENTVALIDATION" value="([^"]*)"/),
          txtstart: o.start, txtend: o.end, btnser: '查询'
        })
      });
      if (p5.body && p5.body.length > 200) res = p5.body;
    }
    var alertMsg = pick(res, /alert\('([^']*)'\)/);
    return {
      ok: true, buildings: buildings, floors: floors, rooms: rooms,
      balances: balancesOf(res), rows: rowsOf(res), alert: alertMsg, resHtml: res
    };
  }

  async function elec(opts) {
    var radio = opts.kind === 'buy' ? 'buyR' : 'usedR';
    var primary = await chain({
      building: opts.building || '', floor: opts.floor || '', room: opts.room || '',
      radio: radio, start: opts.start || today(-30), end: opts.end || today(0)
    });
    if (!primary.ok) return primary;

    var out = primary;
    out.url = ELEC;

    if (opts.room && opts.building) {
      var twin = twinOf(primary.buildings, opts.building);
      if (twin) {
        var pairFloor = twin.code + (opts.floor || '').slice(2);
        var pairRoom = twin.code + (opts.room || '').slice(2);
        var pair = await chain({
          building: twin.code, floor: pairFloor, room: pairRoom,
          radio: radio, start: opts.start || today(-30), end: opts.end || today(0)
        });
        if (pair.ok) {
          out.balances = out.balances.concat(pair.balances);
          out.pair = { code: twin.code, name: twin.name, balances: pair.balances, rows: pair.rows };
        }
      }
    }
    return out;
  }

  /* ---------------- 对外的 window.hpu ---------------- */

  window.hpu = {
    isShell: true,
    platform: 'android',

    /** 打开统一认证登录，落到教务首页后把 HTML 交回来由页面自己解析课表 */
    loginAndFetchCourses: function () {
      return call('open', { url: CAS, title: '统一身份认证', mode: 'login', ua: 'desktop' });
    },

    /** 成绩：注入脚本在原页面翻页抓取，结果直接回传 rows */
    grades: function () { return call('grades', {}); },

    openInApp: function (url, title) {
      return call('open', { url: url, title: title || '', mode: 'browse' });
    },

    freeFilters: function (opts) {
      return call('open', { url: FREE, title: '空闲教室查询', mode: 'free', prefill: opts || {} })
        .then(function (r) { return r && r.ok ? { ok: true, opened: true } : r; });
    },

    freeQuery: function () {
      return Promise.resolve({ ok: false, reason: '安卓版请在打开的教务页面里点「查询」，日期条件由网页自己判断' });
    },

    freeSnap: function () { return Promise.resolve({ ok: false, reason: '安卓版不落页面快照' }); },

    elec: function (opts) { return elec(opts || {}); },

    sdcx: function () {
      return Promise.resolve({ ok: false, reason: '安卓版暂未接宿舍读数站，宿舍页可直接打开学校原页查看' });
    },

    clearSession: function () { return call('clear', {}); },

    sessionState: function () { return call('session', {}); }
  };
})();
