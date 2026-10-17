/* Every site page's one script (WEBSITE.md 2.4 to 2.6). Nothing here is needed to use a page: the doors and the
   language switch are plain links. It remembers the language picked (qalam.site.lang, the only thing the site keeps),
   shows the learners already on this phone by picture, says when the phone is offline or on the hub's Wi-Fi, reads a
   section aloud (a recorded clip when the page has one, else the phone's own voice, else "not ready"), offers the
   install prompt and shows what the page cost. The words it needs are in the page's #t block, in its language. */
(function(){
var d=document,h=d.documentElement,T={},LS=null,lang=h.getAttribute('data-l')||'prs';
try{T=JSON.parse(d.getElementById('t').textContent)}catch(e){}
try{LS=window.localStorage;LS.getItem('x')}catch(e){LS=null}
var FA='۰۱۲۳۴۵۶۷۸۹';
function num(n){n=String(n);return lang=='en'?n:n.replace(/[0-9]/g,function(c){return FA[c]}).replace(/\./g,'٫')}
var hub=location.protocol=='http:'&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^.]+\.(lan|local)$)/.test(location.hostname);
function $(s){return d.querySelector(s)}
function all(s,f){Array.prototype.forEach.call(d.querySelectorAll(s),f)}
function learner(){try{var v=JSON.parse(LS&&LS.getItem('qalam.v2'));if(v&&v.learners&&v.learners.length){
 for(var i=0;i<v.learners.length;i++)if(v.learners[i].id==v.active)return v.learners[i];return v.learners[0]}}catch(e){}return null}
function state(){
 var off=navigator.onLine===false,c=$('#cont'),l=c&&learner(),cost=$('[data-cost]');
 if(c){c.hidden=!l;var dh=$('#dh');if(dh&&T.someone_new&&l)dh.textContent=T.someone_new}
 if(l){var p=T.pics&&T.pics[l.picture]?l.picture:'book';$('#whopic use').setAttribute('href','#a-'+p);
  $('#wholine').textContent=T.pics[p]+' · '+(l.band=='ad'?T.adults:T.year_label.replace('{n}',num(l.year==null?1:l.year)))}
 if(cost)cost.textContent=off?cost.getAttribute('data-off'):hub?cost.getAttribute('data-hub'):cost.getAttribute('data-cost');
 var chip=$('#chip');if(chip)chip.hidden=!off;
 if(hub)all('[data-net]',function(e){e.hidden=true});
}
var tt;function toast(s){var e=$('#toast');e.textContent=s;e.className='show';clearTimeout(tt);tt=setTimeout(function(){e.className=''},4000)}
var playing=null;
function say(b){
 if(playing){try{playing.pause()}catch(e){}playing=null}
 var ss=window.speechSynthesis,sel=b.getAttribute('data-read'),clip=b.getAttribute('data-clip'),txt='';
 all('.spk.on',function(e){e.classList.remove('on')});
 var done=function(){b.classList.remove('on')};
 if(clip&&window.Audio){var a=new Audio(clip);playing=a;b.classList.add('on');a.onended=a.onerror=done;
  a.play().catch(function(){done();voice()});return}
 voice();
 function voice(){
  (sel?d.querySelectorAll(sel):[b.closest('[data-area]')||b.parentNode]).forEach(function(e){txt+=' '+e.innerText});
  var code={prs:'fa',ps:'ps',en:'en'}[lang],v=ss&&ss.getVoices().filter(function(v){return v.lang.toLowerCase().indexOf(code)==0})[0];
  if(!v){toast(T.no_voice);return}
  ss.cancel();var u=new SpeechSynthesisUtterance(txt);u.voice=v;u.lang=v.lang;b.classList.add('on');u.onend=u.onerror=done;ss.speak(u)}
}
function weight(){var e=$('#weight');if(!e||!T.weight)return;var n=0;
 try{var x=performance.getEntriesByType('navigation')[0];n=x&&(x.transferSize||x.encodedBodySize)||0}catch(z){}
 e.textContent=n>=1024?T.weight.replace('{n}',num(Math.round(n/1024))):''}
var bip=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();bip=e});
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a,button');if(!a)return;
 var sw=a.getAttribute('data-switch');if(sw){try{LS&&LS.setItem('qalam.site.lang',sw)}catch(z){}return}
 if(a.hasAttribute('data-read')){say(a);return}
 if(a.id=='install'){if(bip){bip.prompt();bip=null}else toast(T.install_help)}});
window.addEventListener('online',state);window.addEventListener('offline',state);
state();if(d.readyState=='complete')weight();else window.addEventListener('load',weight);
})();
