/* The first thing in each home's head (WEBSITE.md 2.2), before anything is drawn: a printed class card's QR
   (/?join=CODE) opens the app; a phone that already has a learner opens her lessons, unless the address says ?site;
   and the Dari home sends a Pashto phone, or a reader who chose Pashto or English, to that home. A saved choice
   always wins and English is never picked on its own. Inert when the page is opened as a file. */
(function(){var l=location,q=l.search,s=null;if(!/^https?:$/.test(l.protocol))return;
if(/[?&]join=/.test(q)){l.replace('/app/'+q+l.hash);return}
try{s=localStorage.getItem('qalam.site.lang')}catch(e){}
if(!/[?&]site\b/.test(q))try{var v=JSON.parse(localStorage.getItem('qalam.v2'));if(v&&v.learners&&v.learners.length){l.replace('/app/'+l.hash);return}}catch(e){}
if(l.pathname=='/'){var w=s||(/^ps\b/i.test(navigator.language||'')?'ps':'');if(w=='ps'||w=='en')l.replace('/'+w+'/'+q+l.hash)}})()
