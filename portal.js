/* portal.js
   Scroll-driven zoom into the letter A of your name, ending on the About page.

   Plain-JS port of "Glyph Portal" (c) 2026 Christian Katzmann, MIT.
   Origin: UsefulPortal.astro on https://ktzm.dk -> UsefulPortal.tsx -> ClarityPortal.tsx.
   "A scroll-driven camera through live type." Keep this notice with copies.

   How it works
   1. The name is drawn as an SVG clipPath, and a plain white "field" is clipped to those letters.
   2. The chosen letter is scanned to find the biggest empty square inside its enclosed hole
      (the little triangle inside the A).
   3. While you scroll, the camera flies to that hole and zooms in until the hole fills the whole
      screen. Because the hole is empty, the screen ends up plain black, ready for the About page.
*/
(() => {
    'use strict';

    // ======================= EDIT THESE =======================
    // Which letter to dive into. Lines are counted from 0, letters are counted from 0.
    // "NAMARTA":  N=0  A=1  M=2  A=3  R=4  T=5  A=6
    const FOCUS_LINE    = 0;      // 0 = first line (NAMARTA), 1 = second line (KAUSHAL)
    const FOCUS_INDEX   = 3;      // 1 = the first A of NAMARTA. Try 3 or 6 for the other A's
    const SCROLL_LENGTH = 2.4;    // how many screens of scrolling the zoom takes (1 to 8)
    const LINE_HEIGHT   = 1.0;    // gap between the two name lines, in font sizes
    const FONT_FAMILY   = 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace';
    const FONT_WEIGHT   = 900;
    // ==========================================================

    const section = document.getElementById('portal');
    if (!section) return;

    const pin    = section.querySelector('[data-pin]');
    const field  = section.querySelector('[data-field]');
    const art    = section.querySelector('[data-art]');
    const clip   = art && art.querySelector('clipPath');
    const slot   = section.querySelector('[data-slot]');
    const probe  = section.querySelector('[data-viewport]');
    if (!pin || !field || !clip || !slot || !probe) return;

    const lines = Array.from(slot.querySelectorAll('[data-line]'))
        .map((el) => el.textContent.trim().normalize('NFC').toUpperCase())
        .filter(Boolean);
    if (!lines.length) return;

    const root = document.documentElement;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ZOOM_END = 0.64;    // the zoom is finished at this point of the scroll (0 to 1)
    const LENGTH = Number.isFinite(SCROLL_LENGTH) ? Math.min(8, Math.max(1, SCROLL_LENGTH)) : 2.4;
    const clipId = clip.id;

    const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
    const smooth = (a, b, n) => {
        const t = clamp((n - a) / (b - a));
        return t * t * (3 - 2 * t);
    };

    // ---------- the name as SVG text inside the clipPath (one <text> per line) ----------
    const texts = lines.map((line, i) => {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', '0');
        t.setAttribute('y', String(i * 100 * LINE_HEIGHT));
        t.style.cssText =
            'font-family:' + FONT_FAMILY + ';font-weight:' + FONT_WEIGHT + ';font-size:100px;' +
            'font-kerning:none;font-variant-ligatures:none;letter-spacing:0';
        t.textContent = line;
        clip.appendChild(t);
        return t;
    });

    // ---------- measuring ----------
    const measureCtx = document.createElement('canvas').getContext('2d');
    const scanCanvas = document.createElement('canvas');
    const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    /* Largest empty square inside an ENCLOSED hole of one glyph (the triangle inside an A,
       the loop inside an R, and so on). Steps:
         1. draw the letter big,
         2. flood-fill the empty space from the outside edge, so anything left over is a hole,
         3. find the biggest solid square made only of hole pixels (linear-time dynamic programming). */
    function hole(char) {
        const font = FONT_WEIGHT + ' 300px ' + FONT_FAMILY;
        const c = scanCtx;
        c.font = font;
        const m = c.measureText(char);
        const pad = 8;
        const left = Math.ceil(m.actualBoundingBoxLeft);
        const ascent = Math.ceil(m.actualBoundingBoxAscent);
        scanCanvas.width  = Math.max(1, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2);
        scanCanvas.height = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2);
        c.font = font;
        c.fontKerning = 'none';
        c.fillStyle = '#000';
        c.fillText(char, pad + left, pad + ascent);

        const w = scanCanvas.width, h = scanCanvas.height;
        const px = c.getImageData(0, 0, w, h).data;

        // empty[i] = 1 where the pixel has no ink at all
        const empty = new Uint8Array(w * h);
        for (let i = 0; i < empty.length; i++) empty[i] = px[i * 4 + 3] < 12 ? 1 : 0;

        // flood-fill the outside (everything reachable from the border)
        const outside = new Uint8Array(w * h);
        const stack = new Int32Array(w * h);
        let sp = 0;
        const seed = (i) => { if (empty[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
        for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
        while (sp > 0) {
            const i = stack[--sp];
            const x = i % w, y = (i - x) / w;
            if (x > 0)     seed(i - 1);
            if (x < w - 1) seed(i + 1);
            if (y > 0)     seed(i - w);
            if (y < h - 1) seed(i + w);
        }

        // biggest square of hole pixels
        const rows = new Uint16Array(w + 1);
        let size = 0, bx = 0, by = 0;
        for (let y = 0; y < h; y++) {
            let diagonal = 0;
            for (let x = 0; x < w; x++) {
                const above = rows[x + 1];
                const i = y * w + x;
                rows[x + 1] = (empty[i] && !outside[i]) ? Math.min(above, rows[x], diagonal) + 1 : 0;
                diagonal = above;
                if (rows[x + 1] > size) { size = rows[x + 1]; bx = x; by = y; }
            }
        }
        if (size < 3) return null;   // this letter has no hole (N, M, T, K ...)
        // scanned at 3x the SVG size (300px vs 100px); keep a 2px margin for raster disagreement
        return {
            x: (bx + 1 - size / 2 - pad - left) / 3,
            y: (by + 1 - size / 2 - pad - ascent) / 3,
            radius: Math.max(0.5, size / 2 - 2) / 3
        };
    }

    let bounds = { x: 0, y: 0, width: 1, height: 1 };
    let center = { x: 0, y: 0 };
    let target = null;
    let measured = false;

    function measure() {
        const font = FONT_WEIGHT + ' 100px ' + FONT_FAMILY;
        const ctx = measureCtx;
        const candidates = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        lines.forEach((text, li) => {
            const baseline = li * 100 * LINE_HEIGHT;
            ctx.font = font;
            ctx.fontKerning = 'none';
            const m = ctx.measureText(text);
            minX = Math.min(minX, -m.actualBoundingBoxLeft);
            maxX = Math.max(maxX, m.actualBoundingBoxRight);
            minY = Math.min(minY, baseline - m.actualBoundingBoxAscent);
            maxY = Math.max(maxY, baseline + m.actualBoundingBoxDescent);

            let offset = 0;
            Array.from(text).forEach((ch, idx) => {
                ctx.font = font;
                ctx.fontKerning = 'none';
                const advance = ctx.measureText(text.slice(0, offset)).width;
                const found = hole(ch);
                if (found) candidates.push({ x: found.x + advance, y: found.y + baseline, radius: found.radius, ch, line: li, idx });
                offset += ch.length;
            });
        });

        const width = maxX - minX, height = maxY - minY;
        if (!(width > 0) || !(height > 0)) return false;
        bounds = { x: minX, y: minY, width, height };
        center = { x: minX + width / 2, y: minY + height / 2 };

        // the letter you picked -> any A on the first line -> whichever letter has the roomiest hole
        target =
            candidates.find((c) => c.line === FOCUS_LINE && c.idx === FOCUS_INDEX) ||
            candidates.find((c) => c.line === 0 && c.ch === 'A') ||
            [...candidates].sort((a, b) => b.radius - a.radius)[0] ||
            null;
        return true;
    }

    // ---------- layout ----------
    let W = 1, H = 1, travel = 1;
    let startScale = 1, endScale = 1;
    let S0 = { x: 0, y: 0 };
    let ready = false, motionOn = false;

    function layout() {
        if (!section.clientWidth) return;
        W = pin.clientWidth;
        // A 100svh probe keeps mobile browser chrome from constantly changing the scroll distance
        H = Math.max(1, probe.offsetHeight || window.innerHeight);
        section.style.setProperty('--gp-height', H + 'px');
        section.style.setProperty('--gp-length', String(LENGTH));
        travel = H * LENGTH;

        if (!measured) { ready = measure(); measured = true; }
        if (!ready) return;

        section.dataset.ready = 'true';   // hides the plain-text fallback name

        // The name is fitted into the slot in the right-hand column
        const pr = pin.getBoundingClientRect();
        const sr = slot.getBoundingClientRect();
        const box = { x: sr.left - pr.left, y: sr.top - pr.top, w: sr.width, h: sr.height };
        startScale = Math.min(box.w / bounds.width, box.h / bounds.height);
        // Left-aligned on a computer. On a phone your style.css centres the text of the page, and then the
       // name is centred in its box as well.
        const centred = getComputedStyle(slot).textAlign === 'center';
        S0 = { x: box.x + (centred ? box.w / 2 : (bounds.width * startScale) / 2), y: box.y + box.h / 2 };
        // Zoom until the empty disk inside the letter's hole covers the whole screen (plus a 15% safety
        // margin for raster differences).
        endScale = target ? Math.max(startScale, (Math.hypot(W, H) / (target.radius * 2)) * 1.15) : startScale;

        motionOn = !motion.matches && !!target;
        section.dataset.motion = motionOn ? 'on' : 'off';
    }

    // ---------- painting ----------
    const position = () => clamp(-section.getBoundingClientRect().top / travel);

    function paint(progress) {
        const p = motionOn ? progress : 0;
        const t = clamp(p / ZOOM_END);
        const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        const scale = Math.exp(Math.log(startScale) + Math.log(endScale / startScale) * eased);
        // Zoom by interpolating 1/scale: the camera glides to the letter, then dives into it
        const blend = endScale === startScale ? 0 : (1 / scale - 1 / startScale) / (1 / endScale - 1 / startScale);
        const tx0 = target ? target.x : center.x;
        const ty0 = target ? target.y : center.y;
        const cx = center.x + (tx0 - center.x) * blend;
        const cy = center.y + (ty0 - center.y) * blend;
        const roll = -4 * smooth(0.06, 0.5, t) * (1 - smooth(0.62, 0.92, t));
        // The anchor slides from the name's slot to the middle of the screen
        const sx = S0.x + (W / 2 - S0.x) * blend;
        const sy = S0.y + (H / 2 - S0.y) * blend;

        // Scale lives on the clipPath (avoids text paint limits); the translation is applied to the text
        const rad = roll * Math.PI / 180;
        const dx = sx / scale, dy = sy / scale;
        const tx = Math.cos(rad) * dx + Math.sin(rad) * dy - cx;
        const ty = -Math.sin(rad) * dx + Math.cos(rad) * dy - cy;
        clip.setAttribute('transform', 'scale(' + scale + ') rotate(' + roll + ')');
        const move = 'translate(' + tx + ' ' + ty + ')';
        for (const t2 of texts) t2.setAttribute('transform', move);

        // Once the camera is inside the hole the screen holds no ink at all, so hide the white field
        // completely. (The About page then fades in on plain black.)
        field.style.clipPath = 'url(#' + clipId + ')';
        field.style.webkitClipPath = 'url(#' + clipId + ')';
        field.style.visibility = t >= 1 ? 'hidden' : 'visible';

        section.style.setProperty('--gp-caption', (1 - smooth(0.01, 0.2, p)).toFixed(4));
        section.style.setProperty('--gp-reveal', (motionOn ? smooth(ZOOM_END, ZOOM_END + 0.14, p) : 1).toFixed(4));
        section.style.setProperty('--gp-cta-events', p < 0.08 ? 'auto' : 'none');
        section.dataset.entered = String(p >= ZOOM_END + 0.14);
        section.dataset.progress = p.toFixed(4);
        root.dataset.portal = p >= 0.95 ? 'entered' : 'intro';   // other scripts can pause themselves
    }

    // ---------- scheduling ----------
    let raf = 0, dirty = true;

    function frame() {
        raf = 0;
        if (dirty) { dirty = false; layout(); }
        if (ready) paint(position());
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const relayout = () => { dirty = true; schedule(); };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', relayout);
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(relayout);
        ro.observe(pin);
        ro.observe(slot);
    }
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', relayout);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { measured = false; relayout(); });
    }

    frame();
    schedule();
})();