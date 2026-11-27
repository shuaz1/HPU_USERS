function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var r, e, o = "function" == typeof Symbol ? Symbol : {}, n = o.iterator || "@@iterator", a = o.toStringTag || "@@toStringTag"; function i(o, n, a, i) { var u = n && n.prototype instanceof Generator ? n : Generator, f = Object.create(u.prototype); return _regeneratorDefine2(f, "_invoke", function (t, o, n) { var a, i, u, f = 0, p = n || [], y = !1, G = { p: 0, n: 0, v: r, a: l, f: l.bind(r, 4), d: function d(t, e) { return a = t, i = 0, u = r, G.n = e, c; } }; function l(t, o) { for (i = t, u = o, e = 0; !y && f && !n && e < p.length; e++) { var n, a = p[e], l = G.p, F = a[2]; t > 3 ? (n = F === o) && (u = a[(i = a[4]) ? 5 : (i = 3, 3)], a[4] = a[5] = r) : a[0] <= l && ((n = t < 2 && l < a[1]) ? (i = 0, G.v = o, G.n = a[1]) : l < F && (n = t < 3 || a[0] > o || o > F) && (a[4] = t, a[5] = o, G.n = F, i = 0)); } if (n || t > 1) return c; throw y = !0, o; } return function (n, p, F) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && l(p, F), i = p, u = F; (e = i < 2 ? r : u) || !y;) { a || (i ? (i > 1 && (G.n = i < 3 ? -1 : u), l(i, u)) : G.v = u); try { if (f = 2, a) { if (i || (n = "next"), e = a[n]) { if (!(e = e.call(a, u))) throw TypeError("iterator result is not an object"); if (!e.done) return e; u = e.value, i < 2 && (i = 0); } else 1 === i && (e = a.return) && e.call(a), i < 2 && (u = TypeError("The iterator does not provide a '" + n + "' method"), i = 1); a = r; } else if ((e = (y = G.n < 0) ? u : t.call(o, G)) !== c) break; } catch (t) { a = r, i = 1, u = t; } finally { f = 1; } } return { value: e, done: y }; }; }(o, a, i), !0), f; } var c = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} e = Object.getPrototypeOf; var u = [][n] ? e(e([][n]())) : (_regeneratorDefine2(e = {}, n, function () { return this; }), e), f = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(u); function p(r) { return Object.setPrototypeOf ? Object.setPrototypeOf(r, GeneratorFunctionPrototype) : (r.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(r, a, "GeneratorFunction")), r.prototype = Object.create(f), r; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(f, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, a, "GeneratorFunction"), _regeneratorDefine2(f), _regeneratorDefine2(f, a, "Generator"), _regeneratorDefine2(f, n, function () { return this; }), _regeneratorDefine2(f, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: p }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/* 成绩抓取脚本：在教务成绩页里运行，翻完页把结果交给原生桥 */
(function () {
  if (window.__hpuGradeRunning) return;
  window.__hpuGradeRunning = true;
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function norm(s) {
    return (s || '').replace(/\s+/g, '').trim();
  }
  function extract() {
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    var t = null;
    for (var i = 0; i < tables.length; i++) {
      var tb = tables[i];
      if (/学分/.test(tb.textContent) && /(总评成绩|最终成绩|绩点)/.test(tb.textContent)) {
        t = tb;
        break;
      }
    }
    if (!t) return {
      ok: false,
      reason: '没找到成绩表',
      text: norm(document.body.innerText).slice(0, 160)
    };
    var rows = Array.prototype.slice.call(t.rows);
    var h = -1;
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (/(学年学期|课程名称)/.test(r.textContent) && Array.prototype.slice.call(r.cells).some(function (c) {
        return /学分/.test(c.textContent);
      })) {
        h = j;
        break;
      }
    }
    if (h < 0) h = 0;
    var heads = Array.prototype.slice.call(rows[h].cells).map(function (c) {
      return norm(c.textContent);
    });
    var out = [];
    for (var k = h + 1; k < rows.length; k++) {
      var cs = Array.prototype.slice.call(rows[k].cells).map(function (c) {
        return norm(c.textContent);
      });
      if (cs.length < 6) continue;
      var o = {};
      heads.forEach(function (name, idx) {
        if (name && o[name] === undefined) o[name] = cs[idx] || '';
      });
      if (Object.keys(o).length) out.push(o);
    }
    var first = out[0] ? Object.keys(out[0]).map(function (x) {
      return out[0][x];
    }).join('/') : '';
    var last = out.length ? Object.keys(out[out.length - 1]).map(function (x) {
      return out[out.length - 1][x];
    }).join('/') : '';
    var pager = document.querySelector('.pageFooter, #pageFooter, .pageInfo, #pageInfo, .pagingbar, .pagination');
    return {
      ok: true,
      heads: heads,
      rows: out,
      count: out.length,
      sig: first + '#' + last,
      pageInfo: norm(pager ? pager.textContent : ''),
      url: location.href
    };
  }
  function sigOf() {
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    for (var i = 0; i < tables.length; i++) {
      if (/学分/.test(tables[i].textContent) && /(总评成绩|最终成绩|绩点)/.test(tables[i].textContent)) {
        var body = Array.prototype.slice.call(tables[i].rows).slice(1);
        var txt = body.map(function (r) {
          return (r.textContent || '').replace(/\s+/g, '');
        }).join('|');
        return body.length + '#' + txt.slice(0, 40) + '#' + txt.slice(-40);
      }
    }
    return 'none';
  }
  function goNext() {
    function vis(n) {
      return n && n.offsetParent !== null;
    }
    var nextRe = /下一?页|next|»|＞|>/i;
    var pinfo = document.querySelector('.pageInfo, #pageInfo, .pageFooter, #pageFooter');
    var ptxt = (pinfo ? pinfo.textContent : '').replace(/\s+/g, '');
    var pm = ptxt.match(/(\d+)-(\d+)(?:of|\/)(\d+)/i);
    if (pm && parseInt(pm[2], 10) >= parseInt(pm[3], 10)) return {
      hit: false,
      how: 'last'
    };
    function inPager(root) {
      if (!root) return [];
      return Array.prototype.slice.call(root.querySelectorAll('a,button,input[type=image],img,i,span')).filter(function (n) {
        return vis(n) && (nextRe.test(n.getAttribute('title') || '') || nextRe.test(n.getAttribute('alt') || '') || nextRe.test(n.textContent || '') || nextRe.test(n.value || '') || nextRe.test(n.className || ''));
      }).filter(function (n) {
        return !/disabled|off|gray|ban/i.test(n.className || '');
      });
    }
    var pager = document.querySelector('.pageFooter, #pageFooter, .pagingbar, .pagination, .pagebar');
    var cands = inPager(pager);
    if (!cands.length) cands = inPager(document.querySelector('.pageFooter, .pagingbar') || document.body).slice(0, 4);
    if (cands.length) {
      var uniq = [];
      cands.forEach(function (n) {
        var a = n.closest ? n.closest('a') || n : n;
        if (uniq.indexOf(a) < 0) uniq.push(a);
      });
      uniq.sort(function (a, b) {
        return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
      });
      var el = uniq[0];
      if (el) {
        el.click();
        return {
          hit: true,
          how: 'click'
        };
      }
    }
    var inp = document.querySelector('input[name*=pageNo i], input[id*=pageNo i], input[name*=pageIndex i]');
    if (inp) {
      var cur = parseInt(inp.value, 10) || 1;
      inp.value = String(cur + 1);
      inp.dispatchEvent(new Event('change', {
        bubbles: true
      }));
      inp.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 13,
        bubbles: true
      }));
      var go = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type=button],input[type=submit]')).filter(function (n) {
        return vis(n) && /跳转|GO|Go|确定/i.test((n.value || '') + (n.textContent || ''));
      })[0];
      if (go) {
        go.click();
        return {
          hit: true,
          how: 'pageInput'
        };
      }
      return {
        hit: true,
        how: 'pageInput-enter'
      };
    }
    if (typeof window.changePage === 'function') {
      var m = pinfo ? (pinfo.textContent || '').match(/(\d+)\s*-\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) : null;
      var pageSize = m ? parseInt(m[2], 10) : 50;
      var total = m ? parseInt(m[3], 10) : 0;
      var curPage = m ? Math.ceil(parseInt(m[1], 10) / pageSize) : 1;
      if (total && (curPage + 1) * pageSize - pageSize >= total) return {
        hit: false,
        how: 'last(changePage)'
      };
      try {
        window.changePage(curPage + 1, null);
        return {
          hit: true,
          how: 'changePage()'
        };
      } catch (e) {}
    }
    return {
      hit: false,
      how: 'none'
    };
  }
  function pickField(o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v !== undefined && v !== '') return String(v);
    }
    return '';
  }
  function normalize(rows) {
    return rows.map(function (o) {
      return {
        term: pickField(o, ['学年学期', '学期']),
        code: pickField(o, ['原课程代码', '课程代码']),
        name: pickField(o, ['原课程名称', '课程名称']),
        cat: pickField(o, ['课程类别']),
        attr: pickField(o, ['原课程属性', '课程属性']),
        credit: parseFloat(pickField(o, ['学分']).replace(/[^\d.]/g, '')) || 0,
        score: pickField(o, ['总评成绩']),
        final: pickField(o, ['最终成绩']),
        gpa: parseFloat(pickField(o, ['绩点']).replace(/[^\d.]/g, '')) || 0,
        status: pickField(o, ['申请状态'])
      };
    }).filter(function (x) {
      return x.name;
    });
  }
  function done(payload) {
    var json = JSON.stringify(payload);
    try {
      HpuPage.pageDone(json);
    } catch (e) {}
  }
  _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var first, i, r, all, seen, sig, pages, how, p, nx, changed, w, sg, rr, fresh, rows;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          first = null;
          i = 0;
        case 1:
          if (!(i < 6)) {
            _context.n = 5;
            break;
          }
          r = extract();
          if (!(r && r.ok && r.rows && r.rows.length)) {
            _context.n = 2;
            break;
          }
          first = r;
          return _context.a(3, 5);
        case 2:
          if (!(i === 0 && r && /登录|login|统一身份/.test(document.body.innerText.slice(0, 200)))) {
            _context.n = 3;
            break;
          }
          return _context.a(3, 5);
        case 3:
          _context.n = 4;
          return sleep(1000);
        case 4:
          i++;
          _context.n = 1;
          break;
        case 5:
          if (first) {
            _context.n = 6;
            break;
          }
          done({
            ok: false,
            reason: '成绩页没解析出数据（可能还没登录教务）'
          });
          return _context.a(2);
        case 6:
          all = first.rows.slice();
          seen = {};
          all.forEach(function (o) {
            seen[Object.keys(o).map(function (k) {
              return o[k];
            }).join('|')] = 1;
          });
          sig = first.sig;
          pages = 1;
          how = '';
          p = 2;
        case 7:
          if (!(p <= 30)) {
            _context.n = 17;
            break;
          }
          nx = goNext();
          how = nx && nx.how || '';
          if (!(!nx || !nx.hit)) {
            _context.n = 8;
            break;
          }
          return _context.a(3, 17);
        case 8:
          changed = false;
          w = 0;
        case 9:
          if (!(w < 6)) {
            _context.n = 12;
            break;
          }
          _context.n = 10;
          return sleep(500);
        case 10:
          sg = sigOf();
          if (!(sg !== 'none' && sg !== sig)) {
            _context.n = 11;
            break;
          }
          sig = sg;
          changed = true;
          return _context.a(3, 12);
        case 11:
          w++;
          _context.n = 9;
          break;
        case 12:
          if (changed) {
            _context.n = 13;
            break;
          }
          how = 'no-change';
          return _context.a(3, 17);
        case 13:
          rr = extract();
          if (!(!rr || !rr.ok || !rr.rows.length)) {
            _context.n = 14;
            break;
          }
          return _context.a(3, 17);
        case 14:
          fresh = rr.rows.filter(function (o) {
            var k = Object.keys(o).map(function (x) {
              return o[x];
            }).join('|');
            if (seen[k]) return false;
            seen[k] = 1;
            return true;
          });
          if (fresh.length) {
            _context.n = 15;
            break;
          }
          how = 'dup';
          pages = p;
          return _context.a(3, 17);
        case 15:
          all = all.concat(fresh);
          pages = p;
        case 16:
          p++;
          _context.n = 7;
          break;
        case 17:
          rows = normalize(all);
          done({
            ok: true,
            rows: rows,
            count: rows.length,
            pages: pages,
            next: how,
            pageInfo: first.pageInfo,
            url: first.url
          });
        case 18:
          return _context.a(2);
      }
    }, _callee);
  }))();
})();