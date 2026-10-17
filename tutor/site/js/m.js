/* /m (WEBSITE.md 2.7, W3): the Android app's "Use Qalam in this browser too" opens /m#<16 digits>. The code is kept
   for this tab only (sessionStorage 'qalam.bag.handoff', which the app's #/move reads, W7) and the address becomes
   /app/#/move before anything is drawn, so the digits stay in no address bar or history. Inert anywhere else (m.html,
   which the site check opens to see the page itself). */
(function(){if(location.pathname!='/m')return;var d=location.hash.replace(/[^0-9]/g,'');if(d.length==16)try{sessionStorage.setItem('qalam.bag.handoff',d)}catch(e){}
location.replace('/app/#/move')})()
