/* The small pages: the reader's own language first (her saved choice, else a Pashto phone; English is never chosen
   for her, as on the homes). */
(function(){var p=null;try{p=localStorage.getItem('qalam.site.lang')}catch(e){}
p=p||(/^ps\b/i.test(navigator.language||'')?'ps':'');
var m=p&&document.querySelector('.multi[data-l='+p+']');if(m)m.parentNode.insertBefore(m,m.parentNode.querySelector('.multi'));})();
