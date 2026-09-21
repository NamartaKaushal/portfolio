/* skills.js
   Turns the green lamp on when the Skill set section scrolls into view, and off again when it
   has completely left the screen (so it plays again next time). This is what "whileInView" does
   in the original React component.

   With "reduce motion" switched on in the operating system, or in a very old browser, nothing
   animates: the section simply shows in its finished state.
*/
(() => {
    'use strict';

    const section = document.getElementById('skills');
    if (!section) return;

    // When the cards form a scrollable strip (narrow screens), let keyboard users focus it and use the arrow keys
    const grid = section.querySelector('.skills-grid');
    if (grid) {
        grid.setAttribute('aria-label', 'Skill groups');
        const updateFocusable = () => {
            if (grid.scrollWidth > grid.clientWidth + 1) grid.tabIndex = 0;
            else grid.removeAttribute('tabindex');
        };
        updateFocusable();
        if ('ResizeObserver' in window) new ResizeObserver(updateFocusable).observe(grid);
        else window.addEventListener('resize', updateFocusable);
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    const lamp = section.querySelector('.lamp');

    // The little entrance animations only exist while this class is present,
    // so the page still looks right if this script never runs.
    section.classList.add('skills-anim');

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
                section.classList.add('is-lit');
            } else if (!entry.isIntersecting) {
                section.classList.remove('is-lit');
            }
        }
    }, { threshold: [0, 0.3] });

    observer.observe(lamp || section);
})();
