/* text-roll.js
   Plain-JS version of the "TextRoll" effect (motion-primitives).
   Every letter is drawn twice. The first copy flips away (rotateX 0 -> 90deg) and the second copy
   flips in (90deg -> 0), one letter after another.

   Two modes:
     data-text-roll="auto"   plays ONCE, when the text scrolls into view (this is the component's
                             behaviour: it plays on its own). Used for the About page.
     data-text-roll          plays when you hover it (or the link/button around it).

   Options (attributes on the same element):
     data-stagger="0.01"     seconds between one letter and the next   (default 0.1)
     data-duration="0.4"     seconds one letter takes to flip           (default 0.5)

   Elements with mode "auto" inside the same  data-roll-group  container play one after the other:
   the next one starts when the previous one has reached its last letter.
*/
(() => {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const GAP = 0.15;                 // pause between two elements of a group, in seconds

    const make = (tag, cls, text) => {
        const el = document.createElement(tag);
        el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
    };

    const groups = [];                // { el, hosts: [], played }

    document.querySelectorAll('[data-text-roll]').forEach((host) => {
        const text = host.textContent.replace(/\s+/g, ' ').trim();
        if (!text || host.dataset.rollReady) return;

        const auto = host.dataset.textRoll === 'auto';
        if (auto && reduceMotion) return;            // reduced motion: keep plain, finished text

        host.dataset.rollReady = 'true';
        host.classList.add('text-roll');

        const stagger = parseFloat(host.dataset.stagger) || 0.1;
        const duration = parseFloat(host.dataset.duration) || 0.5;
        host.style.setProperty('--tr-stagger', stagger + 's');
        host.style.setProperty('--tr-duration', duration + 's');
        host._stagger = stagger;

        host.textContent = '';
        host.appendChild(make('span', 'tr-sr', text));          // real text for screen readers

        const letters = make('span', 'tr-letters');
        letters.setAttribute('aria-hidden', 'true');

        // Words are kept together so lines only ever break between words
        let index = 0;
        text.split(' ').forEach((word, w, all) => {
            const wordEl = make('span', 'tr-word');
            Array.from(word).forEach((ch) => {
                const cell = make('span', 'tr-letter');
                cell.style.setProperty('--i', String(index++));
                cell.appendChild(make('span', 'tr-out', ch));   // visible at rest, flips away
                cell.appendChild(make('span', 'tr-in', ch));    // flips in from below
                cell.appendChild(make('span', 'tr-size', ch));  // invisible, gives the cell its width
                wordEl.appendChild(cell);
            });
            letters.appendChild(wordEl);
            if (w < all.length - 1) { letters.appendChild(document.createTextNode(' ')); index++; }
        });
        host.appendChild(letters);
        host._count = index;

        if (auto) {
            const box = host.closest('[data-roll-group]') || host;
            let group = groups.find((g) => g.el === box);
            if (!group) { group = { el: box, hosts: [], played: false }; groups.push(group); }
            group.hosts.push(host);
        } else {
            // hover mode: if the text sits inside a link or button, the whole link/button is the hover area
            const trigger = host.closest('a, button') || host;
            const on = () => host.classList.add('is-rolling');
            const off = () => host.classList.remove('is-rolling');
            trigger.addEventListener('mouseenter', on);
            trigger.addEventListener('mouseleave', off);
            trigger.addEventListener('focusin', on);
            trigger.addEventListener('focusout', off);
        }
    });

    if (!groups.length) return;

    // Line the elements of each group up one after the other
    groups.forEach((g) => {
        let start = 0;
        g.hosts.forEach((h) => {
            h.style.setProperty('--tr-base', start.toFixed(3) + 's');
            start += h._count * h._stagger + GAP;
        });
    });

    // ---------- start playing when the group is on screen ----------
    const portal = document.getElementById('portal');
    // While the About page is still fading in behind the zoom, wait until it has fully arrived
    const arrived = () => !portal || portal.dataset.motion !== 'on' || portal.dataset.entered === 'true';

    function inView(el) {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        return visible >= Math.min(r.height, vh) * 0.4;
    }

    function check() {
        groups.forEach((g) => {
            if (g.played || !arrived() || !inView(g.el)) return;
            g.played = true;
            g.hosts.forEach((h) => h.classList.add('is-rolling'));
        });
        if (groups.every((g) => g.played)) {
            clearInterval(timer);
            window.removeEventListener('scroll', check);
            window.removeEventListener('resize', check);
        }
    }

    const timer = setInterval(check, 150);   // also covers the moment the zoom finishes
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
})();
