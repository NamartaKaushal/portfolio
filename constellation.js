const canvas = document.getElementById('constellation');
const ctx = canvas.getContext('2d', { alpha: false });

// Mouse tracking
const mouse = {
    x: -1000,
    y: -1000,
    prevX: -1000,
    prevY: -1000,
    vx: 0,
    vy: 0,
    radius: 220,
};

let nodes = [];
let width = 0;
let height = 0;
let animationFrameId;
let lastTime = performance.now();

// This site is always dark-themed, regardless of the browser/OS colour scheme setting.
const isDarkMode = true;

// Colors
const bgColor     = '#030407';
const nodeColor   = '255,255,255';
const accentColor = '56,189,248';

// Setup canvas size
function handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width  = window.innerWidth;
    height = window.innerHeight;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    initNodes();
}

// Create grid of nodes
function initNodes() {
    nodes = [];
    const spacing = 55;
    const cols = Math.ceil(width  / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = i * spacing;
            const y = j * spacing;
            nodes.push({
                x,
                y,
                vx: 0,
                vy: 0,
                baseX: x,
                baseY: y,
                radius: Math.random() * 1.2 + 1.2,
                label: (i * 7).toString(16).toUpperCase()
                     + ':' 
                     + (j * 11).toString(16).toUpperCase(),
                pulse: Math.random() * Math.PI * 2,
            });
        }
    }
}

// Mouse events
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
});

window.addEventListener('resize', handleResize);

// Main render loop
function render(now) {
    if (document.documentElement.dataset.portal === 'entered') {
        lastTime = now;
        animationFrameId = requestAnimationFrame(render);
        return;
    }
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Mouse velocity
    mouse.vx = (mouse.x - mouse.prevX) / (dt * 1000 || 1);
    mouse.vy = (mouse.y - mouse.prevY) / (dt * 1000 || 1);
    mouse.prevX = mouse.x;
    mouse.prevY = mouse.y;

    const speed = Math.sqrt(
        mouse.vx * mouse.vx + 
        mouse.vy * mouse.vy
    );

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Physics constants
    const SPRING_K = 18;
    const DAMPING  = 0.82;

    // Update node positions
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.pulse += dt * 3;

        const dx   = mouse.x - n.x;
        const dy   = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Repulsion from mouse
        if (dist < mouse.radius && dist > 0) {
            const power = 1 - dist / mouse.radius;
            const force = power * (1500 + speed * 150);
            const angle = Math.atan2(dy, dx);
            n.vx -= Math.cos(angle) * force * dt;
            n.vy -= Math.sin(angle) * force * dt;
        }

        // Spring back to home
        n.vx += (n.baseX - n.x) * SPRING_K * dt;
        n.vy += (n.baseY - n.y) * SPRING_K * dt;

        // Damping
        n.vx *= DAMPING;
        n.vy *= DAMPING;

        // Move
        n.x += n.vx * dt * 60;
        n.y += n.vy * dt * 60;
    }

    // Draw connections between nearby nodes
    const MAX_DIST    = 75;
    const MAX_DIST_SQ = MAX_DIST * MAX_DIST;

    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
            const n2  = nodes[j];
            const ndx = n.x - n2.x;
            const ndy = n.y - n2.y;
            const dSq = ndx * ndx + ndy * ndy;

            if (dSq < MAX_DIST_SQ) {
                const nDist = Math.sqrt(dSq);
                const alpha = (1 - nDist / MAX_DIST) 
                            * (isDarkMode ? 0.18 : 0.08);
                ctx.strokeStyle = 
                    `rgba(${nodeColor},${alpha})`;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(n.x, n.y);
                ctx.lineTo(n2.x, n2.y);
                ctx.stroke();
            }
        }
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
        const n    = nodes[i];
        const dx   = mouse.x - n.x;
        const dy   = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = dist < mouse.radius;

        const baseAlpha = near
            ? 0.95
            : 0.25 + Math.sin(n.pulse) * 0.1;

        ctx.fillStyle = near
            ? `rgba(${accentColor},${baseAlpha})`
            : `rgba(${nodeColor},${baseAlpha})`;

        const r = near
            ? n.radius * 2.2
            : n.radius + Math.sin(n.pulse) * 0.3;

        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fill();

        // Radar rings and hex labels on hover
        if (dist < 90) {
            const pulseRing = ((n.pulse * 20) % 30) + 4;
            const ringAlpha = (1 - pulseRing / 34) * 0.4;

            ctx.strokeStyle = 
                `rgba(${accentColor},${ringAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(n.x, n.y, pulseRing, 0, Math.PI * 2);
            ctx.stroke();

            ctx.font = 
                '8px ui-monospace,monospace';
            ctx.fillStyle = 
                `rgba(${accentColor},0.85)`;
            ctx.fillText(n.label, n.x + 10, n.y - 10);
        }
    }

    animationFrameId = requestAnimationFrame(render);
}

// Start everything
handleResize();
requestAnimationFrame(render);