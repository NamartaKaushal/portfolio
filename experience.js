/* experience.js
   Makes the company names in the Experience section work as tabs:
   click a company (or use the arrow keys) and its details appear on the right.
*/
(() => {
    'use strict';

    const section = document.getElementById('experience');
    if (!section) return;

    const tabs = Array.from(section.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));

    section.classList.add('exp-js');   // without this class every company simply shows one under the other

    function select(index, moveFocus) {
        tabs.forEach((tab, i) => {
            const on = i === index;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
            if (panels[i]) panels[i].hidden = !on;
        });
        if (moveFocus) tabs[index].focus();
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(i));
        tab.addEventListener('keydown', (e) => {
            let next = null;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % tabs.length;
            else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = tabs.length - 1;
            if (next === null) return;
            e.preventDefault();
            select(next, true);
        });
    });

    // start on the tab marked aria-selected="true" in the HTML (the first one)
    const start = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    select(start < 0 ? 0 : start);
})();
