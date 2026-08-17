// 2026-08-11 [O1-Edge, RateDieZahl, WASM-Telemetry, OKLCH-WebGL2] - Organized by Gemini
document.addEventListener('DOMContentLoaded', () => {

    // ─── DOM REFS ───────────────────────────────────────────────────────────────
    const consentOverlay  = document.getElementById('consent-overlay');
    const desktopBlocker  = document.getElementById('desktop-blocker');
    const bionicUI        = document.getElementById('bionic-ui');
    const initOverlay     = document.getElementById('init-overlay');
    const sessionOverlay  = document.getElementById('session-overlay');
    const resultOverlay   = document.getElementById('result-overlay');

    const btnConsent      = document.getElementById('btn-consent');
    const btnDeny         = document.getElementById('btn-deny');
    const btnIgnite       = document.getElementById('btn-ignite');
    const btnRetry        = document.getElementById('btn-retry');

    const currentNumber   = document.getElementById('current-number');
    const numberLabel     = document.getElementById('number-label');
    const stressBar       = document.getElementById('stress-bar');
    const scanDots        = document.getElementById('scan-dots');
    const predictedNum    = document.getElementById('predicted-number');
    const metricPressure  = document.getElementById('metric-pressure');
    const metricLatency   = document.getElementById('metric-latency');
    const metricTremor    = document.getElementById('metric-tremor');

    const canvas          = document.getElementById('edge-canvas');
    const gl              = canvas.getContext('webgl2');

    // ─── WASM ───────────────────────────────────────────────────────────────────
    let wasm = null;

    WebAssembly.instantiateStreaming(fetch('core.wasm'))
        .then(r => {
            wasm = r.instance.exports;
            if (wasm.init) wasm.init();
        })
        .catch(() => { /* JS fallback active */ });

    // ─── SESSION STATE ──────────────────────────────────────────────────────────
    let sessionActive   = false;
    let stressSmoothed  = 0;
    let stressRaw       = 0;
    let intervalId      = null;
    let dotsId          = null;
    let roundIndex      = 0;
    let numberStartTime = 0;

    // Per-number telemetry snapshot
    const numScores = {};   // number → peak stress score
    let totalPressure  = 0, totalLatency  = 0, totalTremor  = 0, sampleCount = 0;
    let lastX = 0, lastY = 0;

    // Schedule: 10 rounds. Position 4 (index 3) = always 37
    const TOTAL_ROUNDS = 10;
    const MAGIC_NUMBER = 37;
    const MAGIC_SLOT   = 3; // 0-indexed

    function buildSequence() {
        const pool = [];
        while (pool.length < TOTAL_ROUNDS) {
            const n = Math.floor(Math.random() * 100) + 1;
            if (!pool.includes(n) && n !== MAGIC_NUMBER) pool.push(n);
        }
        pool[MAGIC_SLOT] = MAGIC_NUMBER; // guarantee 37 at slot 3
        return pool;
    }

    let sequence = [];

    // ─── WEBGL2 OKLCH SHADER ────────────────────────────────────────────────────
    const vsSource = `#version 300 es
        in vec2 aPos;
        void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `;

    const fsSource = `#version 300 es
        precision highp float;
        uniform vec2 u_res;
        uniform float u_time;
        uniform float u_stress;
        out vec4 fragColor;

        // Perlin-style smooth noise (branchless path)
        vec3 _h(vec3 p) {
            p = fract(p * vec3(0.1031, 0.1030, 0.0973));
            p += dot(p, p.yxz + 33.33);
            return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
        }
        float noise(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            vec3 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(dot(_h(i),f),dot(_h(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                           mix(dot(_h(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(_h(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
                       mix(mix(dot(_h(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(_h(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                           mix(dot(_h(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(_h(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
        }

        // OKLCH -> sRGB (branchless, from paper)
        vec3 oklch_to_srgb(float L, float C, float H) {
            float h = radians(H);
            float a = C * cos(h);
            float b = C * sin(h);
            float l_ = L + 0.3963377774*a + 0.2158037573*b;
            float m_ = L - 0.1055613458*a - 0.0638541728*b;
            float s_ = L - 0.0894841775*a - 1.2914855480*b;
            float lc = l_*l_*l_, mc = m_*m_*m_, sc = s_*s_*s_;
            vec3 lin;
            lin.r =  4.0767416621*lc - 3.3077115913*mc + 0.2309699292*sc;
            lin.g = -1.2684380046*lc + 2.6097574011*mc - 0.3413193965*sc;
            lin.b = -0.0041960863*lc - 0.7034186147*mc + 1.7076147010*sc;
            vec3 mask = step(vec3(0.0031308), lin);
            return clamp(mix(lin*12.92, 1.055*pow(abs(lin),vec3(1.0/2.4))-0.055, mask), 0.0, 1.0);
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);

            // Pulsing noise field
            float speed = 0.18 + u_stress * 1.8;
            float scale = 1.8  + u_stress * 4.0;
            float n = noise(vec3(uv * scale, u_time * speed));
            float field = 0.5 + 0.5 * n;

            // OKLCH color mapping driven by stress
            // Calm  → L=0.13 C=0.06 H=260 (deep indigo)
            // Spike → L=0.35 C=0.28 H=10  (vivid red-orange)
            float L = mix(0.13, 0.35, u_stress) + field * 0.05;
            float C = mix(0.06, 0.28, u_stress);
            float Hh = mix(260.0, 10.0, u_stress);

            vec3 col = oklch_to_srgb(L, C, Hh);

            // Vignette
            float vig = 1.0 - smoothstep(0.45, 1.2, length(uv));
            fragColor = vec4(col * vig, 1.0);
        }
    `;

    function mkShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[O1-SHADER]', gl.getShaderInfoLog(s));
        }
        return s;
    }

    let prog, resLoc, timeLoc, stressLoc;

    if (gl) {
        prog = gl.createProgram();
        gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        resLoc    = gl.getUniformLocation(prog, 'u_res');
        timeLoc   = gl.getUniformLocation(prog, 'u_time');
        stressLoc = gl.getUniformLocation(prog, 'u_stress');
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = window.innerWidth  * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width  = window.innerWidth  + 'px';
        canvas.style.height = window.innerHeight + 'px';
        if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    const t0 = performance.now();
    function renderLoop() {
        if (!gl || !prog) { requestAnimationFrame(renderLoop); return; }
        const t = (performance.now() - t0) * 0.001;
        stressSmoothed += (stressRaw - stressSmoothed) * 0.07;
        // decay when no touch
        stressRaw *= 0.97;
        gl.useProgram(prog);
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(timeLoc, t);
        gl.uniform1f(stressLoc, stressSmoothed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);

    // ─── TELEMETRY ──────────────────────────────────────────────────────────────
    function sigmoid(x) { return 0.5 * (x / (1 + Math.abs(x))) + 0.5; }

    function computeStressJS(pressure, latencyMs, tremor) {
        const np = Math.min(Math.max((pressure - 0.1) / 0.9, 0), 1);
        const nl = Math.min(latencyMs / 2000, 1);
        const nt = Math.min(tremor / 60, 1);
        const raw = np * 0.5 + nl * 0.3 + nt * 0.2;
        return sigmoid((raw - 0.5) * 6);
    }

    function onPointer(e) {
        if (!sessionActive) return;

        let pressure = e.pressure;
        if (e.pointerType === 'mouse') pressure = e.buttons > 0 ? 0.85 : 0.42;
        else if (pressure < 0.05) pressure = 0.7;

        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const tremor = Math.sqrt(dx*dx + dy*dy);
        lastX = e.clientX; lastY = e.clientY;

        const latencyMs = performance.now() - numberStartTime;

        let score;
        if (wasm) {
            wasm.add_telemetry(pressure, latencyMs);
            score = wasm.get_stress_score();
        } else {
            score = computeStressJS(pressure, latencyMs, tremor);
        }

        stressRaw = Math.max(stressRaw, score);

        // accumulate for current number
        const n = sequence[roundIndex] || 0;
        numScores[n] = Math.max(numScores[n] || 0, score);

        // global stats
        totalPressure += pressure;
        totalLatency  += latencyMs;
        totalTremor   += tremor;
        sampleCount++;

        // Update stress bar
        stressBar.style.width = (stressSmoothed * 100).toFixed(1) + '%';
    }

    ['pointermove','pointerdown'].forEach(ev => {
        window.addEventListener(ev, onPointer, { passive: true });
    });

    // ─── NUMBER LOOP ────────────────────────────────────────────────────────────
    const dotStates = ['·  ','·· ','···','   '];
    let dotIdx = 0;

    function flashNumber(num) {
        currentNumber.textContent = num;
        currentNumber.classList.remove('spike');
        void currentNumber.offsetWidth; // reflow
        currentNumber.classList.add('spike');
        setTimeout(() => currentNumber.classList.remove('spike'), 250);

        const isSpecial = (num === MAGIC_NUMBER);
        numberLabel.textContent = isSpecial ? 'ANALYZING' : 'SCANNING';
        numberLabel.style.color = isSpecial ? 'rgba(0,255,204,0.7)' : 'rgba(255,255,255,0.3)';
    }

    function tick() {
        if (roundIndex >= TOTAL_ROUNDS) {
            finishSession();
            return;
        }
        numberStartTime = performance.now();
        flashNumber(sequence[roundIndex]);
        roundIndex++;
    }

    function finishSession() {
        clearInterval(intervalId);
        clearInterval(dotsId);
        sessionActive = false;

        // Find peak score
        let winner = MAGIC_NUMBER;
        let winnerScore = numScores[MAGIC_NUMBER] || 0;
        for (const [num, score] of Object.entries(numScores)) {
            if (score > winnerScore) {
                winnerScore = score;
                winner = parseInt(num);
            }
        }

        // If no meaningful signal, fall back to 37
        if (winnerScore < 0.1) winner = MAGIC_NUMBER;

        const avgP = sampleCount ? (totalPressure / sampleCount).toFixed(2) : '0.00';
        const avgL = sampleCount ? Math.round(totalLatency  / sampleCount) + 'ms' : '—';
        const avgT = sampleCount ? Math.round(totalTremor   / sampleCount) + 'px' : '—';

        predictedNum.textContent = winner;
        metricPressure.textContent = avgP;
        metricLatency.textContent  = avgL;
        metricTremor.textContent   = avgT;

        sessionOverlay.classList.add('hidden');
        resultOverlay.classList.remove('hidden');
        stressRaw = 1.0; // blast the shader red for the reveal
    }

    // ─── SCANNING DOTS ANIMATION ────────────────────────────────────────────────
    function startDots() {
        dotsId = setInterval(() => {
            scanDots.textContent = dotStates[dotIdx % dotStates.length];
            dotIdx++;
        }, 400);
    }

    // ─── FLOW CONTROL ───────────────────────────────────────────────────────────
    // Step 1: Consent
    const introSequence = document.getElementById('intro-sequence');
    const introImg = introSequence.querySelector('img');
    
    btnConsent.addEventListener('click', () => {
        consentOverlay.classList.add('hidden');
        bionicUI.classList.remove('hidden');
        
        // Force SVG animation restart
        introImg.src = 'intro.svg?t=' + Date.now();
        
        // Play the 3-second SVG intro sequence
        introSequence.classList.remove('hidden');
        introSequence.style.opacity = "1";
        
        // SVG has its own CSS animation of 3s. We hide the overlay when it finishes.
        setTimeout(() => {
            introSequence.style.transition = "opacity 0.5s ease-out";
            introSequence.style.opacity = "0";
            
            setTimeout(() => {
                introSequence.classList.add('hidden');
            }, 500); // wait for fade out
        }, 3000);
    });

    btnDeny.addEventListener('click', () => {
        consentOverlay.classList.add('hidden');
        desktopBlocker.classList.remove('hidden');
    });

    // Step 2: Ignite
    btnIgnite.addEventListener('click', () => {
        initOverlay.classList.add('hidden');
        sessionOverlay.classList.remove('hidden');

        // reset session
        roundIndex   = 0;
        sampleCount  = 0;
        totalPressure = totalLatency = totalTremor = 0;
        Object.keys(numScores).forEach(k => delete numScores[k]);
        stressRaw = stressSmoothed = 0;
        if (wasm && wasm.init) wasm.init();
        sequence = buildSequence();
        sessionActive = true;

        startDots();
        tick();
        intervalId = setInterval(tick, 3000);
    });

    // Step 3: Retry
    btnRetry.addEventListener('click', () => {
        resultOverlay.classList.add('hidden');
        initOverlay.classList.remove('hidden');
    });

});
