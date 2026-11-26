// Top "sections" navigation shared by the Mini App pages.
(function () {
  var SECTIONS = [
    { id: 'draw', href: '/', icon: '🎨', title: 'Rasm chizish' },
    { id: 'hand', href: '/hand.html', icon: '🗡', title: 'Qo‘l sehri' },
    { id: 'air', href: '/air.html', icon: '✍️', title: 'Havoda chizish' },
    { id: 'face', href: '/face.html', icon: '🎭', title: 'Yuz sehri' },
    { id: 'mirror', href: '/mirror.html', icon: '🌌', title: 'Zarracha ko‘zgu' },
    { id: 'bunny', href: '/bunny.html', icon: '🐰', title: 'Jonli Quyon' },
  ];

  function build() {
    var current = document.body.getAttribute('data-section') || 'draw';
    var qs = window.location.search || '';
    var nav = document.createElement('nav');
    nav.className = 'sections-nav';
    nav.id = 'sectionsNav';
    var html = '<div class="sections-nav-inner">';
    SECTIONS.forEach(function (s, i) {
      html +=
        '<a class="sec-link' + (s.id === current ? ' active' : '') + '" href="' + s.href + qs + '">' +
        '<span class="sec-num">' + (i + 1) + '</span>' +
        '<span class="sec-ico">' + s.icon + '</span>' +
        '<span class="sec-title">' + s.title + '</span></a>';
    });
    html += '</div>';
    nav.innerHTML = html;
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('has-sections-nav');
    var active = nav.querySelector('.sec-link.active');
    if (active && active.scrollIntoView) {
      setTimeout(function () {
        try { active.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {}
      }, 60);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
