/* 成绩抓取脚本：在教务成绩页里运行，翻完页把结果交给原生桥 */
(function () {
  if (window.__hpuGradeRunning) return;
  window.__hpuGradeRunning = true;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function norm(s) { return (s || '').replace(/\s+/g, '').trim(); }

  function extract() {
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    var t = null;
    for (var i = 0; i < tables.length; i++) {
      var tb = tables[i];
      if (/学分/.test(tb.textContent) && /(总评成绩|最终成绩|绩点)/.test(tb.textContent)) { t = tb; break; }
    }
    if (!t) return { ok: false, reason: '没找到成绩表', text: norm(document.body.innerText).slice(0, 160) };
    var rows = Array.prototype.slice.call(t.rows);
    var h = -1;
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (/(学年学期|课程名称)/.test(r.textContent) && Array.prototype.slice.call(r.cells).some(function (c) { return /学分/.test(c.textContent); })) { h = j; break; }
    }
    if (h < 0) h = 0;
    var heads = Array.prototype.slice.call(rows[h].cells).map(function (c) { return norm(c.textContent); });
    var out = [];
    for (var k = h + 1; k < rows.length; k++) {
      var cs = Array.prototype.slice.call(rows[k].cells).map(function (c) { return norm(c.textContent); });
      if (cs.length < 6) continue;
      var o = {};
      heads.forEach(function (name, idx) { if (name && o[name] === undefined) o[name] = cs[idx] || ''; });
      if (Object.keys(o).length) out.push(o);
    }
    var first = out[0] ? Object.keys(out[0]).map(function (x) { return out[0][x]; }).join('/') : '';
    var last = out.length ? Object.keys(out[out.length - 1]).map(function (x) { return out[out.length - 1][x]; }).join('/') : '';
    var pager = document.querySelector('.pageFooter, #pageFooter, .pageInfo, #pageInfo, .pagingbar, .pagination');
    return {
      ok: true, heads: heads, rows: out, count: out.length,
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
        var txt = body.map(function (r) { return (r.textContent || '').replace(/\s+/g, ''); }).join('|');
        return body.length + '#' + txt.slice(0, 40) + '#' + txt.slice(-40);
      }
    }
    return 'none';
  }

  function goNext() {
    function vis(n) { return n && n.offsetParent !== null; }
    var nextRe = /下一?页|next|»|＞|>/i;
    var pinfo = document.querySelector('.pageInfo, #pageInfo, .pageFooter, #pageFooter');
    var ptxt = (pinfo ? pinfo.textContent : '').replace(/\s+/g, '');
    var pm = ptxt.match(/(\d+)-(\d+)(?:of|\/)(\d+)/i);
    if (pm && parseInt(pm[2], 10) >= parseInt(pm[3], 10)) return { hit: false, how: 'last' };

    function inPager(root) {
      if (!root) return [];
      return Array.prototype.slice.call(root.querySelectorAll('a,button,input[type=image],img,i,span'))
        .filter(function (n) {
          return vis(n) && (nextRe.test(n.getAttribute('title') || '') || nextRe.test(n.getAttribute('alt') || '')
            || nextRe.test(n.textContent || '') || nextRe.test(n.value || '') || nextRe.test(n.className || ''));
        })
        .filter(function (n) { return !/disabled|off|gray|ban/i.test(n.className || ''); });
    }

    var pager = document.querySelector('.pageFooter, #pageFooter, .pagingbar, .pagination, .pagebar');
    var cands = inPager(pager);
    if (!cands.length) cands = inPager(document.querySelector('.pageFooter, .pagingbar') || document.body).slice(0, 4);
    if (cands.length) {
      var uniq = [];
      cands.forEach(function (n) {
        var a = n.closest ? (n.closest('a') || n) : n;
        if (uniq.indexOf(a) < 0) uniq.push(a);
      });
      uniq.sort(function (a, b) { return b.getBoundingClientRect().left - a.getBoundingClientRect().left; });
      var el = uniq[0];
      if (el) { el.click(); return { hit: true, how: 'click' }; }
    }

    var inp = document.querySelector('input[name*=pageNo i], input[id*=pageNo i], input[name*=pageIndex i]');
    if (inp) {
      var cur = parseInt(inp.value, 10) || 1;
      inp.value = String(cur + 1);
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      var go = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type=button],input[type=submit]'))
        .filter(function (n) { return vis(n) && /跳转|GO|Go|确定/i.test((n.value || '') + (n.textContent || '')); })[0];
      if (go) { go.click(); return { hit: true, how: 'pageInput' }; }
      return { hit: true, how: 'pageInput-enter' };
    }

    if (typeof window.changePage === 'function') {
      var m = pinfo ? (pinfo.textContent || '').match(/(\d+)\s*-\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) : null;
      var pageSize = m ? parseInt(m[2], 10) : 50;
      var total = m ? parseInt(m[3], 10) : 0;
      var curPage = m ? Math.ceil(parseInt(m[1], 10) / pageSize) : 1;
      if (total && (curPage + 1) * pageSize - pageSize >= total) return { hit: false, how: 'last(changePage)' };
      try { window.changePage(curPage + 1, null); return { hit: true, how: 'changePage()' }; } catch (e) { }
    }
    return { hit: false, how: 'none' };
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
    }).filter(function (x) { return x.name; });
  }

  function done(payload) {
    var json = JSON.stringify(payload);
    try { HpuPage.pageDone(json); } catch (e) { }
  }

  (async function () {
    var first = null;
    for (var i = 0; i < 6; i++) {
      var r = extract();
      if (r && r.ok && r.rows && r.rows.length) { first = r; break; }
      if (i === 0 && r && /登录|login|统一身份/.test(document.body.innerText.slice(0, 200))) break;
      await sleep(1000);
    }
    if (!first) { done({ ok: false, reason: '成绩页没解析出数据（可能还没登录教务）' }); return; }

    var all = first.rows.slice();
    var seen = {};
    all.forEach(function (o) { seen[Object.keys(o).map(function (k) { return o[k]; }).join('|')] = 1; });

    var sig = first.sig;
    var pages = 1;
    var how = '';

    for (var p = 2; p <= 30; p++) {
      var nx = goNext();
      how = (nx && nx.how) || '';
      if (!nx || !nx.hit) break;

      var changed = false;
      for (var w = 0; w < 6; w++) {
        await sleep(500);
        var sg = sigOf();
        if (sg !== 'none' && sg !== sig) { sig = sg; changed = true; break; }
      }
      if (!changed) { how = 'no-change'; break; }

      var rr = extract();
      if (!rr || !rr.ok || !rr.rows.length) break;
      var fresh = rr.rows.filter(function (o) {
        var k = Object.keys(o).map(function (x) { return o[x]; }).join('|');
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });
      if (!fresh.length) { how = 'dup'; pages = p; break; }
      all = all.concat(fresh);
      pages = p;
    }

    var rows = normalize(all);
    done({ ok: true, rows: rows, count: rows.length, pages: pages, next: how, pageInfo: first.pageInfo, url: first.url });
  })();
})();
