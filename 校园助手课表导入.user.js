// ==UserScript==
// @name         校园助手·课表一键导入
// @version      1.0
// @description  河南理工教务课表页注入悬浮按钮，一键回传到校园助手
// @match        https://zhjw.hpu.edu.cn/eams/courseTableForStd*
// @match        http://zhjw.hpu.edu.cn/eams/courseTableForStd*
// @match        https://webvpn.hpu.edu.cn/*courseTableForStd*
// @grant        none
// ==/UserScript==
(function(){
if(document.getElementById('hpuFloatBtn')){alert('悬浮按钮已存在，直接点击即可');return;}
var b=document.createElement('div');b.id='hpuFloatBtn';b.textContent='导入校园助手';
b.style.cssText='position:fixed;right:18px;bottom:28px;z-index:99999;padding:12px 18px;background:#0aa5ff;color:#fff;border-radius:24px;font:14px/1.4 sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.35)';
b.onclick=function(){
try{
var DAY={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7};
var CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12};
var PT={1:['08:00','08:45'],2:['08:55','09:40'],3:['10:00','10:45'],4:['10:55','11:40'],5:['11:50','12:35'],6:['14:30','15:15'],7:['15:25','16:10'],8:['16:30','17:15'],9:['17:25','18:10'],10:['19:00','19:45'],11:['19:55','20:40']};
function wrs(s){var out=[];if(!s)return null;String(s).replace(/第|周/g,'').split(/[,，、;；\s]+/).forEach(function(g){if(!g)return;var m=g.match(/(\d{1,2})\s*[-—~]\s*(\d{1,2})/);if(m)out.push([+m[1],+m[2]]);else{var n=g.match(/(\d{1,2})/);if(n)out.push([+n[0],+n[0]]);}});return out.length?out:null;}
var tbl=null,ts=document.querySelectorAll('table');
for(var i=0;i<ts.length;i++){var t=ts[i].innerText;if(/星期一/.test(t)&&/节次|周次/.test(t)){tbl=ts[i];break;}}
if(!tbl){alert('未找到课表表格，请进入「个人课表」页再点');return;}
var rows=tbl.rows,hi=-1;
for(i=0;i<rows.length;i++){if(/星期一/.test(rows[i].innerText)){hi=i;break;}}
if(hi<0){alert('未找到星期表头');return;}
var head=rows[hi].cells,days=[],total=head.length;
for(i=0;i<total;i++){var m=head[i].innerText.match(/星期([一二三四五六日])/);days[i]=m?DAY[m[1]]:null;}
var pend=[],out=[],curP=0;
for(var r=hi+1;r<rows.length;r++){
var cells=rows[r].cells,ci=0;
for(var c=0;c<total;c++){
if(pend[c]&&pend[c].left>0){pend[c].left--;for(var q=0;q<pend[c].refs.length;q++){if(PT[curP])pend[c].refs[q].e=PT[curP][1];}continue;}
var cell=cells[ci++];if(!cell)continue;
var txt=(cell.innerText||'').trim();
var pm=txt.match(/第([一二三四五六七八九十]+)节/);if(pm&&CN[pm[1]])curP=CN[pm[1]];
var day=days[c];if(!day||!txt)continue;
var re=/([^\n(（]+?)\s*\n?\s*[（(](\d{6,}[.\d]*)[)）]\s*\n?\s*[（(]([^)（()\n]*)[)）]\s*\n?\s*[（(]([^)（()]*)[)）]/g,m2,made=[];
while((m2=re.exec(txt))){
var n=m2[1].trim();if(!n||n.length>40)continue;
var wkRoom=m2[4],k=wkRoom.search(/[,，]/),wk=k>=0?wkRoom.slice(0,k):wkRoom,room=k>=0?wkRoom.slice(k+1).trim():'';
made.push({n:n,code:m2[2],y:m2[3].trim()||'待定',r:room||'待定',t:PT[curP]?PT[curP][0]:'08:00',e:PT[curP]?PT[curP][1]:'09:40',day:day,wrs:wrs(wk),wt:/单/.test(wk)?'odd':(/双/.test(wk)?'even':'all')});
}
if(cell.rowSpan>1)pend[c]={left:cell.rowSpan-1,refs:made};
out=out.concat(made);
}
}
if(!out.length){alert('未解析到课程，当前页面可能不是个人课表');return;}
if(window.opener){window.opener.postMessage({type:'HPU_COURSES',list:out},'*');b.textContent='已回传 '+out.length+' 条到 App';b.style.background='#12c48b';}
else{var blob=new Blob([JSON.stringify(out)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='courses.json';a.click();b.textContent='已导出 courses.json（请回 App 导入）';}
}catch(e){alert('抓取失败：'+e.message);}
};
document.body.appendChild(b);
})();
