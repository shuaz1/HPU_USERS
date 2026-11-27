function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var r, e, o = "function" == typeof Symbol ? Symbol : {}, n = o.iterator || "@@iterator", a = o.toStringTag || "@@toStringTag"; function i(o, n, a, i) { var u = n && n.prototype instanceof Generator ? n : Generator, f = Object.create(u.prototype); return _regeneratorDefine2(f, "_invoke", function (t, o, n) { var a, i, u, f = 0, p = n || [], y = !1, G = { p: 0, n: 0, v: r, a: l, f: l.bind(r, 4), d: function d(t, e) { return a = t, i = 0, u = r, G.n = e, c; } }; function l(t, o) { for (i = t, u = o, e = 0; !y && f && !n && e < p.length; e++) { var n, a = p[e], l = G.p, F = a[2]; t > 3 ? (n = F === o) && (u = a[(i = a[4]) ? 5 : (i = 3, 3)], a[4] = a[5] = r) : a[0] <= l && ((n = t < 2 && l < a[1]) ? (i = 0, G.v = o, G.n = a[1]) : l < F && (n = t < 3 || a[0] > o || o > F) && (a[4] = t, a[5] = o, G.n = F, i = 0)); } if (n || t > 1) return c; throw y = !0, o; } return function (n, p, F) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && l(p, F), i = p, u = F; (e = i < 2 ? r : u) || !y;) { a || (i ? (i > 1 && (G.n = i < 3 ? -1 : u), l(i, u)) : G.v = u); try { if (f = 2, a) { if (i || (n = "next"), e = a[n]) { if (!(e = e.call(a, u))) throw TypeError("iterator result is not an object"); if (!e.done) return e; u = e.value, i < 2 && (i = 0); } else 1 === i && (e = a.return) && e.call(a), i < 2 && (u = TypeError("The iterator does not provide a '" + n + "' method"), i = 1); a = r; } else if ((e = (y = G.n < 0) ? u : t.call(o, G)) !== c) break; } catch (t) { a = r, i = 1, u = t; } finally { f = 1; } } return { value: e, done: y }; }; }(o, a, i), !0), f; } var c = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} e = Object.getPrototypeOf; var u = [][n] ? e(e([][n]())) : (_regeneratorDefine2(e = {}, n, function () { return this; }), e), f = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(u); function p(r) { return Object.setPrototypeOf ? Object.setPrototypeOf(r, GeneratorFunctionPrototype) : (r.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(r, a, "GeneratorFunction")), r.prototype = Object.create(f), r; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(f, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, a, "GeneratorFunction"), _regeneratorDefine2(f), _regeneratorDefine2(f, a, "Generator"), _regeneratorDefine2(f, n, function () { return this; }), _regeneratorDefine2(f, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: p }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
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
      try {
        data = JSON.parse(data);
      } catch (e) {
        data = {
          ok: false,
          reason: String(data)
        };
      }
    }
    if (ok) w.resolve(data === null ? {} : data);else w.reject(new Error(data && (data.message || data.reason) || 'native error'));
  };
  function call(method, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'c' + ++seq;
      waiters[id] = {
        resolve: resolve,
        reject: reject
      };
      try {
        HpuNative.call(method, JSON.stringify(payload || {}), id);
      } catch (e) {
        delete waiters[id];
        reject(e);
      }
    });
  }
  function http(o) {
    return call('http', o || {});
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  var CAS = 'https://uia.hpu.edu.cn/cas/login?service=https%3A%2F%2Fuia.hpu.edu.cn%2Fsso%2Flogin%3Fredirect_uri%3D' + 'https%253A%252F%252Fzhjw.hpu.edu.cn%252Feams%252Flogin.action%26x_client%3Dcas';
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
    while (m = re.exec(seg)) {
      if (m[1]) out.push({
        code: m[1],
        name: m[2].trim()
      });
    }
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
      while (m = re.exec(tr)) cells.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      if (cells.length >= 3) out.push(cells);
    });
    return out;
  }
  function balancesOf(html) {
    var out = [];
    var re = /([^<>：;]{1,30})剩余电量：<span class="number orange">([\d.]+)<\/span>/g;
    var m;
    while (m = re.exec(html || '')) {
      out.push({
        meter: m[1].trim().replace(/^[^一-龥A-Za-z0-9#]+/, ''),
        kwh: parseFloat(m[2]) || 0
      });
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
    var p = function p(n) {
      return (n < 10 ? '0' : '') + n;
    };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function chain(_x) {
    return _chain.apply(this, arguments);
  }
  function _chain() {
    _chain = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(o) {
      var vs, p0, buildings, p1, floors, p2, rooms, p3, res, loc, p4, p5, alertMsg;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            vs = function vs(h) {
              return pick(h, /id="__VIEWSTATE" value="([^"]*)"/);
            };
            _context.n = 1;
            return http({
              method: 'GET',
              url: ELEC
            });
          case 1:
            p0 = _context.v;
            if (p0.body) {
              _context.n = 2;
              break;
            }
            return _context.a(2, {
              ok: false,
              reason: '电费查询站打不开（183.169.255.4:8080 无响应）'
            });
          case 2:
            buildings = options(p0.body, 'drlouming');
            _context.n = 3;
            return http({
              method: 'POST',
              url: ELEC,
              body: form({
                __EVENTTARGET: 'drlouming',
                __EVENTARGUMENT: '',
                __VIEWSTATE: vs(p0.body),
                drlouming: o.building || '',
                drceng: '',
                drfangjian: '',
                radio: o.radio
              })
            });
          case 3:
            p1 = _context.v;
            floors = options(p1.body, 'drceng');
            if (o.building) {
              _context.n = 4;
              break;
            }
            return _context.a(2, {
              ok: true,
              buildings: buildings,
              floors: [],
              rooms: [],
              balances: [],
              rows: []
            });
          case 4:
            if (o.floor) {
              _context.n = 5;
              break;
            }
            return _context.a(2, {
              ok: true,
              buildings: buildings,
              floors: floors,
              rooms: [],
              balances: [],
              rows: []
            });
          case 5:
            _context.n = 6;
            return http({
              method: 'POST',
              url: ELEC,
              body: form({
                __EVENTTARGET: 'drceng',
                __EVENTARGUMENT: '',
                __VIEWSTATE: vs(p1.body),
                drlouming: o.building,
                drceng: o.floor,
                drfangjian: '',
                radio: o.radio
              })
            });
          case 6:
            p2 = _context.v;
            rooms = options(p2.body, 'drfangjian');
            if (o.room) {
              _context.n = 7;
              break;
            }
            return _context.a(2, {
              ok: true,
              buildings: buildings,
              floors: floors,
              rooms: rooms,
              balances: [],
              rows: []
            });
          case 7:
            _context.n = 8;
            return http({
              method: 'POST',
              url: ELEC,
              body: form({
                __EVENTTARGET: '',
                __EVENTARGUMENT: '',
                __VIEWSTATE: vs(p2.body),
                drlouming: o.building,
                drceng: o.floor,
                drfangjian: o.room,
                radio: o.radio,
                'ImageButton1.x': '12',
                'ImageButton1.y': '8'
              })
            });
          case 8:
            p3 = _context.v;
            res = p3.body || '';
            loc = p3.location || '';
            if (!(loc && loc !== ELEC)) {
              _context.n = 10;
              break;
            }
            _context.n = 9;
            return http({
              method: 'GET',
              url: loc.indexOf('http') === 0 ? loc : 'http://183.169.255.4:8080' + (loc.charAt(0) === '/' ? loc : '/' + loc)
            });
          case 9:
            p4 = _context.v;
            if (p4.body) res = p4.body;
          case 10:
            if (!(o.start && o.end && res)) {
              _context.n = 12;
              break;
            }
            _context.n = 11;
            return http({
              method: 'POST',
              url: loc.indexOf('http') === 0 ? loc : 'http://183.169.255.4:8080' + (loc.charAt(0) === '/' ? loc : '/' + loc),
              body: form({
                __EVENTTARGET: '',
                __EVENTARGUMENT: '',
                __VIEWSTATE: vs(res),
                __EVENTVALIDATION: pick(res, /id="__EVENTVALIDATION" value="([^"]*)"/),
                txtstart: o.start,
                txtend: o.end,
                btnser: '查询'
              })
            });
          case 11:
            p5 = _context.v;
            if (p5.body && p5.body.length > 200) res = p5.body;
          case 12:
            alertMsg = pick(res, /alert\('([^']*)'\)/);
            return _context.a(2, {
              ok: true,
              buildings: buildings,
              floors: floors,
              rooms: rooms,
              balances: balancesOf(res),
              rows: rowsOf(res),
              alert: alertMsg,
              resHtml: res
            });
        }
      }, _callee);
    }));
    return _chain.apply(this, arguments);
  }
  function _elec2(_x2) {
    return _elec.apply(this, arguments);
  }
  function _elec() {
    _elec = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(opts) {
      var radio, primary, out, twin, pairFloor, pairRoom, pair;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            radio = opts.kind === 'buy' ? 'buyR' : 'usedR';
            _context2.n = 1;
            return chain({
              building: opts.building || '',
              floor: opts.floor || '',
              room: opts.room || '',
              radio: radio,
              start: opts.start || today(-30),
              end: opts.end || today(0)
            });
          case 1:
            primary = _context2.v;
            if (primary.ok) {
              _context2.n = 2;
              break;
            }
            return _context2.a(2, primary);
          case 2:
            out = primary;
            out.url = ELEC;
            if (!(opts.room && opts.building)) {
              _context2.n = 4;
              break;
            }
            twin = twinOf(primary.buildings, opts.building);
            if (!twin) {
              _context2.n = 4;
              break;
            }
            pairFloor = twin.code + (opts.floor || '').slice(2);
            pairRoom = twin.code + (opts.room || '').slice(2);
            _context2.n = 3;
            return chain({
              building: twin.code,
              floor: pairFloor,
              room: pairRoom,
              radio: radio,
              start: opts.start || today(-30),
              end: opts.end || today(0)
            });
          case 3:
            pair = _context2.v;
            if (pair.ok) {
              out.balances = out.balances.concat(pair.balances);
              out.pair = {
                code: twin.code,
                name: twin.name,
                balances: pair.balances,
                rows: pair.rows
              };
            }
          case 4:
            return _context2.a(2, out);
        }
      }, _callee2);
    }));
    return _elec.apply(this, arguments);
  }
  /* ---------------- 对外的 window.hpu ---------------- */
  window.hpu = {
    isShell: true,
    platform: 'android',
    /** 打开统一认证登录，落到教务首页后把 HTML 交回来由页面自己解析课表 */
    loginAndFetchCourses: function loginAndFetchCourses() {
      return call('open', {
        url: CAS,
        title: '统一身份认证',
        mode: 'login',
        ua: 'desktop'
      });
    },
    /** 成绩：注入脚本在原页面翻页抓取，结果直接回传 rows */
    grades: function grades() {
      return call('grades', {});
    },
    openInApp: function openInApp(url, title) {
      return call('open', {
        url: url,
        title: title || '',
        mode: 'browse'
      });
    },
    freeFilters: function freeFilters(opts) {
      return call('open', {
        url: FREE,
        title: '空闲教室查询',
        mode: 'free',
        prefill: opts || {}
      }).then(function (r) {
        return r && r.ok ? {
          ok: true,
          opened: true
        } : r;
      });
    },
    freeQuery: function freeQuery() {
      return Promise.resolve({
        ok: false,
        reason: '安卓版请在打开的教务页面里点「查询」，日期条件由网页自己判断'
      });
    },
    freeSnap: function freeSnap() {
      return Promise.resolve({
        ok: false,
        reason: '安卓版不落页面快照'
      });
    },
    elec: function elec(opts) {
      return _elec2(opts || {});
    },
    sdcx: function sdcx() {
      return Promise.resolve({
        ok: false,
        reason: '安卓版暂未接宿舍读数站，宿舍页可直接打开学校原页查看'
      });
    },
    clearSession: function clearSession() {
      return call('clear', {});
    },
    sessionState: function sessionState() {
      return call('session', {});
    }
  };
})();