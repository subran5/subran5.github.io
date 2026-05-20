const canvas = document.getElementById('cursorCanvas');
const ctx = canvas.getContext('2d');

const shadowBuffer = document.createElement('canvas');
const sctx = shadowBuffer.getContext('2d');

const CONFIG = {
    radius: innerWidth / 3,
    opacity: 0.2,
    clickOpacity: 0.3,
    color: '255,255,255',
    shadowColor: '#000',
    smooth: 0.12,
    lightHeight: innerWidth * 2,
    divBrightness: 0
};

const mouse = { x: 0, y: 0 };

let visible = false;
let clicked = false;

let radius = 0;
let opacity = 0;

let blockers = [];

// BLOCKERS

function updateBlockers() {
    blockers = [...document.querySelectorAll('.shadow-caster')].map(el => {
        const r = el.getBoundingClientRect();
        const br = Math.min(
            parseFloat(getComputedStyle(el).borderRadius) || 0,
            r.width / 2,
            r.height / 2
        );

        return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            radius: br
        };
    });
}

// PATH

function roundedRectPath(c, b) {
    const r = b.radius;

    c.moveTo(b.left + r, b.top);
    c.lineTo(b.right - r, b.top);
    c.arcTo(b.right, b.top, b.right, b.top + r, r);
    c.lineTo(b.right, b.bottom - r);
    c.arcTo(b.right, b.bottom, b.right - r, b.bottom, r);
    c.lineTo(b.left + r, b.bottom);
    c.arcTo(b.left, b.bottom, b.left, b.bottom - r, r);
    c.lineTo(b.left, b.top + r);
    c.arcTo(b.left, b.top, b.left + r, b.top, r);
    c.closePath();
}

// SHADOWS

function drawShadow(c, b, lightRadius) {
    const precision = 12;
    const points = [];

    const corners = [
        [b.right - b.radius, b.top + b.radius, -Math.PI / 2],
        [b.right - b.radius, b.bottom - b.radius, 0],
        [b.left + b.radius, b.bottom - b.radius, Math.PI / 2],
        [b.left + b.radius, b.top + b.radius, Math.PI]
    ];

    // build perimeter
    for (const [cx, cy, start] of corners) {
        for (let i = 0; i <= precision; i++) {
            const a = start + (i / precision) * Math.PI / 2;

            points.push({
                x: cx + Math.cos(a) * b.radius,
                y: cy + Math.sin(a) * b.radius
            });
        }
    }

    let run = [];

    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        const len = Math.hypot(dx, dy) || 1;

        const nx = -dy / len;
        const ny = dx / len;

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        const visibleEdge =
            (mx - mouse.x) * nx + (my - mouse.y) * ny < 0;

        if (visibleEdge) {
            if (!run.length) run.push(p1);
            run.push(p2);
        } else if (run.length > 1) {
            fillShadowRun(c, run, lightRadius);
            run = [];
        }
    }

    if (run.length > 1) {
        fillShadowRun(c, run, lightRadius);
    }
}

function fillShadowRun(c, run, lightRadius) {
    const far = run.map(p => {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;

        const scale =
            Math.hypot(dx, dy) * (lightRadius / CONFIG.lightHeight);

        return {
            x: p.x + (dx / Math.hypot(dx, dy)) * scale,
            y: p.y + (dy / Math.hypot(dx, dy)) * scale
        };
    });

    c.beginPath();

    c.moveTo(run[0].x, run[0].y);

    for (let i = 1; i < run.length; i++) {
        c.lineTo(run[i].x, run[i].y);
    }

    for (let i = far.length - 1; i >= 0; i--) {
        c.lineTo(far[i].x, far[i].y);
    }

    c.closePath();
    c.fill();
}

// MAIN LOOP

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sctx.clearRect(0, 0, shadowBuffer.width, shadowBuffer.height);

    radius += ((visible ? CONFIG.radius : 0) - radius) * CONFIG.smooth;

    const targetOpacity =
        visible
            ? (clicked ? CONFIG.clickOpacity : CONFIG.opacity)
            : 0;

    opacity += (targetOpacity - opacity) * CONFIG.smooth;

    if (opacity > 0.005) {
        // light
        const grad = ctx.createRadialGradient(
            mouse.x, mouse.y, 0,
            mouse.x, mouse.y, radius
        );

        grad.addColorStop(0, `rgba(${CONFIG.color},${opacity})`);
        grad.addColorStop(1, `rgba(${CONFIG.color},0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // brighter light inside blockers
        ctx.save();

        ctx.beginPath();
        blockers.forEach(b => roundedRectPath(ctx, b));

        ctx.clip();

        const innerGrad = ctx.createRadialGradient(
            mouse.x, mouse.y, 0,
            mouse.x, mouse.y, radius
        );

        innerGrad.addColorStop(
            0,
            `rgba(${CONFIG.color},${opacity + CONFIG.divBrightness})`
        );

        innerGrad.addColorStop(1, `rgba(${CONFIG.color},0)`);

        ctx.fillStyle = innerGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();

        // shadows
        sctx.fillStyle = CONFIG.shadowColor;

        blockers.forEach(b => drawShadow(sctx, b, radius));

        // cut blockers out
        sctx.globalCompositeOperation = 'destination-out';

        sctx.beginPath();
        blockers.forEach(b => roundedRectPath(sctx, b));

        sctx.fill();

        sctx.globalCompositeOperation = 'source-over';

        // remove light where shadows are
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(shadowBuffer, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }

    requestAnimationFrame(animate);
}

// EVENTS

function resize() {
    canvas.width = shadowBuffer.width = innerWidth;
    canvas.height = shadowBuffer.height = innerHeight;

    updateBlockers();
}

addEventListener('resize', resize);
addEventListener('scroll', updateBlockers, { passive: true });

addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    visible = true;
}, { passive: true });

addEventListener('mousedown', () => clicked = true);
addEventListener('mouseup', () => clicked = false);

addEventListener('mouseout', e => {
    if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
        visible = false;
    }
});

// INIT

resize();
animate();
