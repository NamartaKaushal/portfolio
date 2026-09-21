/* ascii-photo.js
   Recreates the 21st.dev "Custom ASCII art" look (renderMode: "dither") with Canvas2D.

   Pipeline (same order as the recipe):
   1. photo drawn "cover"-fit, on a solid black background
   2. split into cells, sample the average colour / luminance of each
   3. ordered (Bayer) dither -> one small square per lit cell
   4. brightness / contrast / saturation, then a green tint blended with "overlay"
   5. post effects: bloom, chromatic aberration, glitch, scan lines, film grain, vignette
   6. a soft light glow
   7. flicker animation
   8. intro: the squares blink wildly for a few seconds, then lock into place (face first)
      and the animation stops on a clear still portrait
*/
(() => {
    'use strict';

    // ======================= EDIT THESE =======================
    const PHOTO_SRC = 'photo.jpg';   // your photo, saved next to index.html
    const FOCUS_X = 0.5;             // 0 = keep the left of the photo, 1 = keep the right
    const FOCUS_Y = 0.25;            // 0 = keep the top (face), 1 = keep the bottom

    const CFG = {
        cellSize: 8,        // px. Each cell is drawn as a 2x2 block of dither squares
        coverage: 100,        // % of cells that may be drawn
        invert: false,       // true = flip light and dark
        brightness: 0,       // -100..100
        contrast: 115,       // %
        edgeEmphasis: 80,    // 0..100, sharpens edges between cells
        density: 0,          // -100..100, more or fewer squares overall
        saturation: 100,     // %
        grayscale: 0,        // 0..100
        tint: '0,255,102',   // r,g,b of the green overlay
        tintOpacity: 45,     // %
        bg: '#000000',

        // post effects, 0 = off, 100 = max
        fx: { bloom: 60, chromatic: 40, glitch: 20, scanLines: 28, filmGrain: 40, vignette: 13 },

        // ---- intro: blink for a while, then lock into your face and stop ----
        intro: {
            blinkSeconds: 2.5,     // wild blinking, the photo is barely readable
            resolveSeconds: 2.2,   // squares lock into place one by one until the face is clear
            faceX: 0.5,            // where your face is (0..1 across / down the picture);
            faceY: 0.27,           // squares near it lock in first
            faceLift: 0.6          // 0..1 brightens the face so eyes / smile show up (0 = off)
        },

        // effects on the final still picture (calmer than the blinking phase so the face is clear)
        finalFx: { bloom: 45, chromatic: 0, glitch: 0, scanLines: 10, filmGrain: 12, vignette: 13 },

        // flicker animation (used while blinking)
        animSpeed: 61,
        animIntensity: 60,

        // light glow (x, y are 0..1 across the picture; radius and intensity are %)
        lights: [{ x: 0.3, y: 0.5, radius: 29, intensity: 61 }],

        fps: 30
    };
    // ==========================================================

    const canvas = document.getElementById('ascii-photo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const note = document.getElementById('ascii-note');
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // ---------- helpers ----------
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

    // Stable pseudo-random number in [0, 1) from an integer
    function hash(n) {
        n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
        n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
        n ^= n >>> 16;
        return (n >>> 0) / 4294967296;
    }

    // 4x4 Bayer matrix, values in (0, 1)
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

    const makeCanvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, w);
        c.height = Math.max(1, h);
        return c;
    };

    function showNote(text) {
        if (!note) return;
        note.textContent = text;
        note.hidden = false;
    }

    // ---------- placeholder portrait (used until photo.jpg loads or if it can't be read) ----------
    function paintPlaceholder(w, h) {
        const c = makeCanvas(w, h);
        const g = c.getContext('2d');
        const bg = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, h * 0.85);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(1, '#c9d3ce');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        g.fillStyle = '#0d1311'; // dark hoodie
        g.beginPath();
        g.moveTo(w * 0.06, h);
        g.bezierCurveTo(w * 0.06, h * 0.72, w * 0.2, h * 0.6, w * 0.38, h * 0.56);
        g.lineTo(w * 0.62, h * 0.56);
        g.bezierCurveTo(w * 0.8, h * 0.6, w * 0.94, h * 0.72, w * 0.94, h);
        g.closePath();
        g.fill();
        g.beginPath();
        g.ellipse(w * 0.5, h * 0.36, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
        g.fill();

        const face = g.createRadialGradient(w * 0.46, h * 0.33, 0, w * 0.5, h * 0.37, h * 0.16);
        face.addColorStop(0, '#e6c3ad');
        face.addColorStop(1, '#a9836e');
        g.fillStyle = face;
        g.beginPath();
        g.ellipse(w * 0.5, h * 0.37, w * 0.12, h * 0.15, 0, 0, Math.PI * 2);
        g.fill();
        return c;
    }

    // ---------- state ----------
    let photo = null;             // HTMLImageElement, or null -> placeholder
    let usingPlaceholder = true;
    let W = 0, H = 0, PW = 0, PH = 0, dpr = 1;
    let cols = 0, rows = 0, sub = 7;
    let lum = new Float32Array(0);
    let lit = new Uint8Array(0);           // coverage mask
    let pal = new Uint16Array(0);          // palette index per cell
    let palStr = [];
    let snap, chan, grainTile, grainPattern;
    let bloomChain = [];
    let raf = 0, lastFrame = 0, resizeTimer = 0;
    let order = new Float32Array(0);     // 0..1 per cell: when it locks in during the intro (0 = first)
    let introStart = -1;                 // time of the first frame of the intro
    let settled = false;                 // true once the still portrait has been drawn

    // ---------- build the cell grid from the photo ----------
    function drawCover(g, im, w, h) {
        const iw = im.naturalWidth || im.width;
        const ih = im.naturalHeight || im.height;
        const s = Math.max(w / iw, h / ih);
        const dw = iw * s, dh = ih * s;
        g.drawImage(im, (w - dw) * FOCUS_X, (h - dh) * FOCUS_Y, dw, dh);
    }

    function readPixels() {
        const src = makeCanvas(W, H);
        const g = src.getContext('2d');
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        drawCover(g, photo || paintPlaceholder(600, 800), W, H);
        return g.getImageData(0, 0, W, H).data;
    }

    function build() {
        const rect = canvas.getBoundingClientRect();
        W = Math.round(rect.width);
        H = Math.round(rect.height);
        if (W < 2 || H < 2) return false;

        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = PW = Math.round(W * dpr);
        canvas.height = PH = Math.round(H * dpr);

        snap = makeCanvas(PW, PH);
        chan = makeCanvas(PW, PH);
        bloomChain = [];
        for (let i = 1; i <= 4; i++) bloomChain.push(makeCanvas(PW >> i, PH >> i));

        let data;
        try {
            data = readPixels();
        } catch (err) {
            // Browsers refuse to read pixels from a photo opened straight from disk (file://)
            photo = null;
            usingPlaceholder = true;
            showNote('Your browser blocks reading photo.jpg when the page is opened as a local file. ' +
                     'Open the page with Live Server ("Go Live" in VS Code) to see your photo.');
            data = readPixels();
        }

        sub = CFG.cellSize / 2;
        cols = Math.ceil(W / sub);
        rows = Math.ceil(H / sub);
        const n = cols * rows;

        const contrast = CFG.contrast / 100;
        const bright = CFG.brightness * 2.55;
        const sat = CFG.saturation / 100;
        const gray = CFG.grayscale / 100;

        const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
        lum = new Float32Array(n);

        for (let cy = 0; cy < rows; cy++) {
            const y0 = Math.floor(cy * sub), y1 = Math.min(H, Math.floor((cy + 1) * sub));
            for (let cx = 0; cx < cols; cx++) {
                const x0 = Math.floor(cx * sub), x1 = Math.min(W, Math.floor((cx + 1) * sub));
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let y = y0; y < y1; y++) {
                    let p = (y * W + x0) * 4;
                    for (let x = x0; x < x1; x++, p += 4) {
                        r += data[p]; g += data[p + 1]; b += data[p + 2]; cnt++;
                    }
                }
                cnt = cnt || 1;
                r = (r / cnt - 128) * contrast + 128 + bright;
                g = (g / cnt - 128) * contrast + 128 + bright;
                b = (b / cnt - 128) * contrast + 128 + bright;

                let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;      // 0..255 scale
                r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
                r += (l - r) * gray;   g += (l - g) * gray;   b += (l - b) * gray;

                const i = cy * cols + cx;
                R[i] = clamp255(r); G[i] = clamp255(g); B[i] = clamp255(b);
                lum[i] = clamp01(l / 255);
            }
        }

        // Edge emphasis: unsharp mask on the cell grid
        const k = (CFG.edgeEmphasis / 100) * 2.5;
        const sharp = new Float32Array(n);
        for (let cy = 0; cy < rows; cy++) {
            for (let cx = 0; cx < cols; cx++) {
                const i = cy * cols + cx;
                const l = lum[i];
                const avg = (lum[cy * cols + Math.max(0, cx - 1)] + lum[cy * cols + Math.min(cols - 1, cx + 1)] +
                             lum[Math.max(0, cy - 1) * cols + cx] + lum[Math.min(rows - 1, cy + 1) * cols + cx]) / 4;
                sharp[i] = clamp01(l + (l - avg) * k);
            }
        }

        // Final luminance (invert, density), coverage mask, and colour per cell
        const bias = (CFG.density / 100) * 0.5;
        lit = new Uint8Array(n);
        pal = new Uint16Array(n);
        palStr = [];
        const palMap = new Map();
        const tint = CFG.tint.split(',').map(Number);

        for (let i = 0; i < n; i++) {
            let l = sharp[i];
            if (CFG.invert) l = 1 - l;
            l = clamp01(l + bias);
            // brighten the mid-tones around the face (skin is mid-grey, which dithers into sparse dots)
            if (CFG.intro.faceLift > 0) {
                const fx = (((i % cols) + 0.5) / cols - CFG.intro.faceX) * (W / H);
                const fy = (((i / cols) | 0) + 0.5) / rows - CFG.intro.faceY;
                const u = clamp01((Math.hypot(fx, fy) - 0.09) / 0.10);
                const m = 1 - u * u * (3 - 2 * u);                 // 1 on the face, fades to 0 around it
                l = Math.pow(l, 1 - CFG.intro.faceLift * m);
            }
            lum[i] = l;
            lit[i] = hash(i * 31 + 7) < CFG.coverage / 100 ? 1 : 0;

            // Lit squares keep a hint of the photo's hue, pulled toward green in the shadows
            const mx = Math.max(R[i], G[i], B[i], 1);
            const shade = (0.6 + 0.4 * l) * 255;
            const m = 0.08 + 0.62 * Math.pow(1 - l, 1.2);
            const r = ((R[i] / mx) * shade) * (1 - m) + tint[0] * m;
            const g = ((G[i] / mx) * shade) * (1 - m) + tint[1] * m;
            const b = ((B[i] / mx) * shade) * (1 - m) + tint[2] * m;

            const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            let idx = palMap.get(key);
            if (idx === undefined) {
                idx = palStr.length;
                palStr.push('rgb(' + ((r >> 3) << 3) + ',' + ((g >> 3) << 3) + ',' + ((b >> 3) << 3) + ')');
                palMap.set(key, idx);
            }
            pal[i] = idx;
        }

        // Order in which squares lock into place: mostly random, but cells near the face go first
        order = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const cx = i % cols, cy = (i / cols) | 0;
            const dx = ((cx + 0.5) / cols - CFG.intro.faceX) * (W / H);
            const dy = (cy + 0.5) / rows - CFG.intro.faceY;
            const d = clamp01(Math.hypot(dx, dy) / 0.9);
            order[i] = clamp01(0.55 * hash(i * 17 + 3) + 0.45 * d);
        }

        // Film grain tile
        grainTile = makeCanvas(256, 256);
        const gg = grainTile.getContext('2d');
        const img = gg.createImageData(256, 256);
        for (let p = 0; p < img.data.length; p += 4) {
            const v = 128 + (Math.random() - 0.5) * 180;
            img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
            img.data[p + 3] = 255;
        }
        gg.putImageData(img, 0, 0);
        grainPattern = ctx.createPattern(grainTile, 'repeat');
        return true;
    }

    // ---------- drawing ----------
    function drawDither(step, elapsed) {
        const I = CFG.intro;
        const A = reduceMotion ? 0 : 1;
        const blinkEnd = I.blinkSeconds;
        const calm = clamp01((elapsed - blinkEnd) / I.resolveSeconds);   // 0 while blinking -> 1 when settled

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = CFG.bg;
        ctx.fillRect(0, 0, W, H);

        // whole-picture flicker, fades out as the picture settles
        ctx.globalAlpha = 1 - A * 0.22 * (1 - calm) * hash(step * 13 + 5);

        const size = Math.max(1, sub - 1);
        let last = -1;
        for (let i = 0, n = cols * rows; i < n; i++) {
            if (!lit[i]) continue;
            let l = lum[i];
            // a square keeps blinking until its own lock time; after that it never changes again
            if (A > 0 && elapsed < blinkEnd + I.resolveSeconds * order[i]) {
                const s = i * 374761393 + step * 668265263;
                if (hash(s) < 0.55) l += (hash(s + 1) - 0.5) * 1.5;
            }
            const cx = i % cols;
            const cy = (i / cols) | 0;
            if (l <= BAYER[((cy & 3) << 2) | (cx & 3)]) continue;

            if (pal[i] !== last) { ctx.fillStyle = palStr[pal[i]]; last = pal[i]; }
            ctx.fillRect(cx * sub, cy * sub, size, size);
        }
        ctx.globalAlpha = 1;
    }

    function applyTint() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = CFG.tintOpacity / 100;
        ctx.fillStyle = 'rgb(' + CFG.tint + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    function fxBloom(k) {
        let from = canvas;
        for (const c of bloomChain) {                    // halve repeatedly = clean blur
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = true;
            g.globalCompositeOperation = 'copy';
            g.drawImage(from, 0, 0, c.width, c.height);
            from = c;
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.40 * k;
        ctx.drawImage(bloomChain[3], 0, 0, PW, PH);
        ctx.globalAlpha = 0.28 * k;
        ctx.drawImage(bloomChain[2], 0, 0, PW, PH);
        ctx.globalAlpha = 0.22 * k;
        ctx.drawImage(bloomChain[1], 0, 0, PW, PH);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function fxChromatic(k) {
        const d = Math.round((1 + k * 3) * dpr);
        const s = snap.getContext('2d');
        s.globalCompositeOperation = 'copy';
        s.drawImage(canvas, 0, 0);

        const c = chan.getContext('2d');
        const passes = [['#ff0000', -d], ['#00ff00', 0], ['#0000ff', d]];

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, PW, PH);
        ctx.globalCompositeOperation = 'lighter';
        for (const [color, dx] of passes) {
            c.globalCompositeOperation = 'copy';
            c.drawImage(snap, 0, 0);
            c.globalCompositeOperation = 'multiply';
            c.fillStyle = color;
            c.fillRect(0, 0, PW, PH);
            ctx.drawImage(chan, dx, 0);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    function fxGlitch(k) {
        if (Math.random() > 0.02 + k * 0.2) return;
        const s = snap.getContext('2d');
        s.globalCompositeOperation = 'copy';
        s.drawImage(canvas, 0, 0);
        const bands = 1 + ((Math.random() * 3) | 0);
        for (let i = 0; i < bands; i++) {
            const y = Math.random() * PH;
            const h = (6 + Math.random() * 60 * (0.5 + k)) * dpr;
            const dx = (Math.random() - 0.5) * 120 * (0.5 + k) * dpr;
            ctx.drawImage(snap, 0, y, PW, h, dx, y, PW, h);
        }
    }

    function fxScanLines(k, t) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.7 * k).toFixed(3) + ')';
        const gap = 3 * dpr;
        const lineH = Math.max(1, Math.round(dpr));
        for (let y = ((t * 24) % 3) * dpr; y < PH; y += gap) ctx.fillRect(0, y, PW, lineH);
    }

    function fxGrain(k) {
        const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.9 * k;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = grainPattern;
        ctx.fillRect(0, 0, PW + 256, PH + 256);
        ctx.restore();
    }

    function fxVignette(k) {
        const cx = PW / 2, cy = PH / 2;
        const g = ctx.createRadialGradient(cx, cy, Math.min(PW, PH) * 0.4, cx, cy, Math.hypot(cx, cy));
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,' + clamp01(k * 2.4).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, PW, PH);
    }

    function applyLights(t) {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of CFG.lights) {
            const r = (p.radius / 100) * Math.max(PW, PH) * 0.9;
            const a = (p.intensity / 100) * 0.28 * (reduceMotion ? 1 : 1 + 0.12 * Math.sin(t * 2.3));
            const g = ctx.createRadialGradient(p.x * PW, p.y * PH, 0, p.x * PW, p.y * PH, r);
            g.addColorStop(0, 'rgba(170,255,210,' + a.toFixed(3) + ')');
            g.addColorStop(1, 'rgba(170,255,210,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, PW, PH);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    function render(t) {
        const I = CFG.intro;
        if (introStart < 0) introStart = t;
        const elapsed = reduceMotion || settled ? Infinity : t - introStart;
        const final = elapsed >= I.blinkSeconds + I.resolveSeconds + 0.15;

        const rate = 4 + (CFG.animSpeed / 100) * 16;             // flicker steps per second
        const step = final ? 0 : Math.floor(t * rate);

        drawDither(step, elapsed);
        applyTint();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const f = final ? CFG.finalFx : CFG.fx;
        if (f.bloom) fxBloom(f.bloom / 100);
        if (f.chromatic) fxChromatic(f.chromatic / 100);
        if (f.glitch && !final && !reduceMotion) fxGlitch(f.glitch / 100);
        if (f.scanLines) fxScanLines(f.scanLines / 100, final ? 0 : t);
        if (f.filmGrain) fxGrain(f.filmGrain / 100);
        if (f.vignette) fxVignette(f.vignette / 100);
        applyLights(final ? 0 : t);

        if (final) settled = true;
    }

    function loop(now) {
        raf = requestAnimationFrame(loop);
        if (document.documentElement.dataset.portal === 'entered') return;
        if (now - lastFrame < 1000 / CFG.fps) return;
        lastFrame = now;
        render(now / 1000);
        if (settled) cancelAnimationFrame(raf);   // the picture is final: stop animating
    }

    function restart() {
        cancelAnimationFrame(raf);
        if (!build()) return;
        // The intro is NOT restarted here any more. Its clock keeps running, so a resize (for example a
        // phone's address bar sliding in and out) can never make the picture start blinking all over again.
        if (reduceMotion || settled) {
            render(0);                                   // finished: just redraw the still picture
        } else {
            render(performance.now() / 1000);            // redraw at once, so there is no empty frame in between
            raf = requestAnimationFrame(loop);
        }
    }

    // ---------- start ----------
    function start(img) {
        photo = img;
        usingPlaceholder = !img;
        restart();
        const onResize = () => {
            const r = canvas.getBoundingClientRect();
            // Ignore small size changes (a phone's address bar changes the size by a few percent).
            // The picture is simply stretched a tiny bit by CSS, which cannot be seen.
            const dw = Math.abs(r.width - W) / W;
            const dh = Math.abs(r.height - H) / H;
            if (dw < 0.12 && dh < 0.12) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(restart, 200);
        };
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
        else window.addEventListener('resize', onResize);
    }

    const img = new Image();
    img.onload = () => start(img);
    img.onerror = () => {
        showNote('Could not find "' + PHOTO_SRC + '". Save your photo next to index.html with that name. Showing a placeholder for now.');
        start(null);
    };
    img.src = PHOTO_SRC;
})();