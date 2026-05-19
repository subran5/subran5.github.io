const canvas = document.getElementById('cursorCanvas');
const ctx = canvas.getContext('2d');

const shadowBuffer = document.createElement('canvas');
const sctx = shadowBuffer.getContext('2d');

const CONFIG = {
    radius: canvas.width * 2,
    baseOpacity: 0.2,
    clickedOpacity: 0.3,
    color: '255, 255, 255',
    shadowColor: 'black',
    smoothSpeed: 0.12,
    lightHeight: canvas.width * 2,
    divBrightness: 0
};

let mouse = { x: 0, y: 0 };
let isOnPage = false;
let isClicked = false;

let currentRadius = 0;
let currentOpacity = 0;
let blockers = [];

/* ---------------- BLOCKERS ---------------- */

function updateBlockers() {
    const elements = document.querySelectorAll('.shadow-caster');
    blockers = Array.from(elements).map(el => {
        const r = el.getBoundingClientRect();
        const left = r.left;
        const top = r.top;
        const width = r.width;
        const height = r.height;

        return {
            left, top,
            right: left + width,
            bottom: top + height,
            width, height,
            cx: left + width / 2,
            cy: top + height / 2,
            borderRadius: parseFloat(getComputedStyle(el).borderRadius) || 0
        };
    });
}

/* ---------------- PATH HELPERS ---------------- */

function pathRoundedRect(c, rect) {
    const r = Math.min(rect.borderRadius, rect.width / 2, rect.height / 2);
    const { left:l, top:t, right:rgt, bottom:b } = rect;

    c.beginPath();
    c.moveTo(l + r, t);
    c.lineTo(rgt - r, t);
    c.arcTo(rgt, t, rgt, t + r, r);
    c.lineTo(rgt, b - r);
    c.arcTo(rgt, b, rgt - r, b, r);
    c.lineTo(l + r, b);
    c.arcTo(l, b, l, b - r, r);
    c.lineTo(l, t + r);
    c.arcTo(l, t, l + r, t, r);
    c.closePath();
}

/* ---------------- SHADOW PROJECTION ---------------- */

function drawUnifiedShadow(c, mouse, rect, radius) {
    const precision = 12;
    const r = Math.min(rect.borderRadius, rect.width / 2, rect.height / 2);
    const pts = [];
    const HALF_PI = Math.PI / 2;

    // --- Perimeter (clockwise) ---
    for (let i = 0; i <= precision; i++) {
        let a = (i / precision) * HALF_PI - HALF_PI;
        pts.push({ x: rect.right - r + Math.cos(a) * r, y: rect.top + r + Math.sin(a) * r });
    }
    for (let i = 0; i <= precision; i++) {
        let a = (i / precision) * HALF_PI;
        pts.push({ x: rect.right - r + Math.cos(a) * r, y: rect.bottom - r + Math.sin(a) * r });
    }
    for (let i = 0; i <= precision; i++) {
        let a = (i / precision) * HALF_PI + HALF_PI;
        pts.push({ x: rect.left + r + Math.cos(a) * r, y: rect.bottom - r + Math.sin(a) * r });
    }
    for (let i = 0; i <= precision; i++) {
        let a = (i / precision) * HALF_PI + Math.PI;
        pts.push({ x: rect.left + r + Math.cos(a) * r, y: rect.top + r + Math.sin(a) * r });
    }

    // --- Find silhouette edges ---
    const silhouette = [];

    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        let nx = -dy;
        let ny = dx;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        const lx = mx - mouse.x;
        const ly = my - mouse.y;

        silhouette.push(lx * nx + ly * ny < 0);
    }

    // --- Extract contiguous silhouette runs ---
    let run = [];

    for (let i = 0; i < pts.length; i++) {
        if (silhouette[i]) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            if (run.length === 0) run.push(p1);
            run.push(p2);
        } else if (run.length > 1) {
            drawShadowRun(c, mouse, run, radius);
            run = [];
        }
    }

    // Wraparound case
    if (run.length > 1) {
        drawShadowRun(c, mouse, run, radius);
    }
}

function drawShadowRun(c, mouse, run, radius) {
    const far = run.map(p => {
        const a = Math.atan2(p.y - mouse.y, p.x - mouse.x);
        const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        const l = d * (radius / CONFIG.lightHeight);
        return {
            x: p.x + Math.cos(a) * l,
            y: p.y + Math.sin(a) * l
        };
    });

    c.fillStyle = CONFIG.shadowColor;
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

/* ---------------- ANIMATION LOOP ---------------- */

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sctx.clearRect(0, 0, shadowBuffer.width, shadowBuffer.height);

    currentRadius += ((isOnPage ? CONFIG.radius : 0) - currentRadius) * CONFIG.smoothSpeed;
    currentOpacity += ((isOnPage ? (isClicked ? CONFIG.clickedOpacity : CONFIG.baseOpacity) : 0) - currentOpacity) * CONFIG.smoothSpeed;

    if (currentOpacity > 0.005) {
        // 1. Draw standard background light
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, currentRadius);
        grad.addColorStop(0, `rgba(${CONFIG.color}, ${currentOpacity})`);
        grad.addColorStop(1, `rgba(${CONFIG.color}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. --- NEW: Brighten the Divs ---
        // We clip the canvas to the div shapes and draw a brighter/more opaque version of the light
        ctx.save();
        ctx.beginPath();
        for (const b of blockers) {
            // We reuse the rounded rect path as a clip mask
            const r = Math.min(b.borderRadius, b.width / 2, b.height / 2);
            ctx.moveTo(b.left + r, b.top);
            ctx.lineTo(b.right - r, b.top);
            ctx.arcTo(b.right, b.top, b.right, b.top + r, r);
            ctx.lineTo(b.right, b.bottom - r);
            ctx.arcTo(b.right, b.bottom, b.right - r, b.bottom, r);
            ctx.lineTo(b.left + r, b.bottom);
            ctx.arcTo(b.left, b.bottom, b.left, b.bottom - r, r);
            ctx.lineTo(b.left, b.top + r);
            ctx.arcTo(b.left, b.top, b.left + r, b.top, r);
            ctx.closePath();
        }
        ctx.clip();

        // Draw a second light pass inside the clip at higher opacity
        // You can adjust the 0.3 multiplier to make them even brighter
        const divGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, currentRadius);
        divGrad.addColorStop(0, `rgba(${CONFIG.color}, ${currentOpacity + CONFIG.divBrightness})`);
        divGrad.addColorStop(1, `rgba(${CONFIG.color}, 0)`);
        
        ctx.fillStyle = divGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // 3. Process Shadows (Buffer logic remains same)
        for (const b of blockers) {
            drawUnifiedShadow(sctx, mouse, b, currentRadius);
        }

        // Cut blocker shapes out of shadow buffer
        sctx.globalCompositeOperation = 'destination-out';
        for (const b of blockers) {
            pathRoundedRect(sctx, b);
            sctx.fill();
        }
        sctx.globalCompositeOperation = 'source-over';

        // 4. Erase light from main canvas using shadow buffer
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(shadowBuffer, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }

    requestAnimationFrame(animate);
}
/* ---------------- EVENTS ---------------- */

function resize() {
    canvas.width = shadowBuffer.width = window.innerWidth;
    canvas.height = shadowBuffer.height = window.innerHeight;
    updateBlockers();
}

window.addEventListener('resize', resize);
window.addEventListener('scroll', updateBlockers, { passive: true });

window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    isOnPage = true;
}, { passive: true });

window.addEventListener('mousedown', () => isClicked = true);
window.addEventListener('mouseup', () => isClicked = false);

window.addEventListener('mouseout', e => {
    if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
        isOnPage = false;
    }
});

/* ---------------- INIT ---------------- */

resize();
animate();
