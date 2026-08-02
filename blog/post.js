document.getElementById('yr').textContent = new Date().getFullYear();
(function(){
  var mb=document.getElementById('menuBtn'), nl=document.getElementById('navlinks');
  if(!mb||!nl) return;
  function setOpen(on){
    nl.classList.toggle('open', on);
    mb.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.style.overflow = on ? 'hidden' : '';
  }
  mb.addEventListener('click', function(){ setOpen(!nl.classList.contains('open')); });
  nl.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ setOpen(false); }); });
  window.addEventListener('resize', function(){ if(window.innerWidth>1040) setOpen(false); });
})();
