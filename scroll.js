/* scroll.js
   Fades the first page out and the About page in as you scroll.
   Everything stays on the same black constellation background. */
(() => {
    'use strict';

    const root = document.documentElement;
    const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
    let ticking = false;

    function update() {
        ticking = false;
        const vh = window.innerHeight || 1;
        const p = window.scrollY / vh;            // 0 = top, 1 = one full screen down

        // Page 1 fades between 5% and 65% of a screen of scrolling
        const hero = 1 - clamp((p - 0.05) / 0.6);
        // About fades in between 35% and 85%
        const about = clamp((p - 0.35) / 0.5);

        root.style.setProperty('--hero-fade', hero.toFixed(3));
        root.style.setProperty('--about-in', about.toFixed(3));
    }

    function onScroll() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
})();
