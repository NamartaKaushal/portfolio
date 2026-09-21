/* nav.js
   Makes the navigation bar work:
     - the green cursor slides to the tab you hover or focus, and goes back when you leave
     - the cursor rests on the section you are currently reading (it follows your scrolling)
     - clicking a tab scrolls smoothly to that section (the links themselves do this, the script only
       keeps the highlight steady while the page is scrolling)
*/
(() => {
    'use strict';

    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    const pill = nav.querySelector('.nav-pill');
    const cursor = nav.querySelector('.nav-cursor');
    const items = Array.from(pill.querySelectorAll('li:not(.nav-cursor)'));
    const links = items.map((li) => li.querySelector('a'));
    const targets = links.map((a) => document.querySelector(a.getAttribute('href')));
    const toggle = nav.querySelector('.nav-toggle');
if (toggle) {
    const closeMenu = () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    links.forEach((a) => a.addEventListener('click', closeMenu)); // close after picking a section
    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target)) closeMenu();                // close on outside tap
    });
    window.addEventListener('resize', closeMenu);                 // avoid a stuck-open menu on rotate
}

    // The dark copy of the tab names that lives inside the green cursor
    const inner = document.createElement('div');
    inner.className = 'nav-cursor-inner';
    links.forEach((a) => {
        const copy = document.createElement('span');
        copy.className = 'nav-link';
        copy.textContent = a.textContent;
        inner.appendChild(copy);
    });
    cursor.appendChild(inner);

    let active = 0;             // the tab of the section you are on
    let lockUntil = 0;          // while a click-scroll is running, ignore the scroll position

    // ---------- the cursor ----------
    function moveTo(i) {
        const li = items[i];
        cursor.style.left = li.offsetLeft + 'px';
        cursor.style.width = li.offsetWidth + 'px';
        cursor.style.opacity = '1';
        inner.style.transform = 'translateX(' + (-li.offsetLeft) + 'px)';   // keeps the dark names in place
    }

    function placeWithoutAnimation(i) {
        nav.classList.add('is-still');
        moveTo(i);
        cursor.getBoundingClientRect();        // apply now, without sliding from the left edge
        nav.classList.remove('is-still');
    }

    function setActive(i) {
        active = i;
        links.forEach((a, j) => {
            if (j === i) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
        moveTo(i);
    }

    items.forEach((li, i) => {
        li.addEventListener('mouseenter', () => moveTo(i));
        li.addEventListener('focusin', () => moveTo(i));
    });
    pill.addEventListener('mouseleave', () => moveTo(active));
    pill.addEventListener('focusout', (e) => {
        if (!pill.contains(e.relatedTarget)) moveTo(active);
    });

    // ---------- which section are you on? ----------
    function currentSection() {
        const vh = window.innerHeight || 1;
        let index = 0;                                   // 0 = Home
        targets.forEach((el, i) => {
            if (i === 0 || !el) return;
            if (el.getBoundingClientRect().top <= vh * 0.5) index = i;
        });
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        return atBottom ? items.length - 1 : index;
    }

    function onScroll() {
        if (performance.now() < lockUntil) return;
        const i = currentSection();
        if (i !== active) setActive(i);
    }

    // clicking a tab: highlight it straight away and hold it while the page glides there
    links.forEach((a, i) => {
        a.addEventListener('click', () => {
            lockUntil = performance.now() + 1800;
            setActive(i);
        });
    });
    if ('onscrollend' in window) {
        window.addEventListener('scrollend', () => { lockUntil = 0; onScroll(); });
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; onScroll(); });
    }, { passive: true });

    // ---------- start, and keep the cursor the right size when fonts load / the window changes ----------
    function relayout() { placeWithoutAnimation(active); }
    window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

    setActive(currentSection());
    placeWithoutAnimation(active);
})();
