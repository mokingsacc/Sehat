/* /get/ in Dari (W3): ?lang=ps or ?lang=en (the app's Settings and the class cards say which), else a saved choice or
   a Pashto phone, opens that language's page. English is never chosen on its own. Inert anywhere else. */
(function(){var l=location,w,s=null;if(!/^https?:$/.test(l.protocol)||l.pathname!='/get/')return;
w=(l.search.match(/[?&]lang=(prs|ps|en)\b/)||[])[1];try{s=localStorage.getItem('qalam.site.lang')}catch(e){}
w=w||s||(/^ps\b/i.test(navigator.language||'')?'ps':'');if(w=='ps'||w=='en')l.replace('/'+w+'/get/'+l.hash)})()
