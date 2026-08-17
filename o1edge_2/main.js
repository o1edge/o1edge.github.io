// =============================================================================
// o1edge_2 · HAUS IM RAM · O(1) Ideomotor Scanner
// Prof.Sonnet (VIP*) · Ising-Konform · Zero-Allocation · No TensorFlow
// =============================================================================
(function () {
    'use strict';

    // =========================================================================
    // 0. TOUCH GUARD (erste und letzte Entscheidung)
    // =========================================================================
    const hasTouch = ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     window.matchMedia('(pointer: coarse)').matches;

    if (!hasTouch) {
        document.getElementById('desktop-blocker').style.display = 'flex';
        return;
    }
    document.getElementById('desktop-blocker').style.display = 'none';
    document.getElementById('bionic-ui').classList.remove('hidden');

    // =========================================================================
    // 1. DAS HAUS — Memory Block (64 Bytes = 1 Cache-Line, Ising-Heilig)
    //    SAB benötigt COOP+COEP Headers (GitHub Pages hat diese nicht).
    //    Wir nutzen graceful fallback: SAB wenn verfügbar, sonst ArrayBuffer.
    //    Im Main-Thread ist das Zero-Allocation-Dogma trotzdem erfüllt.
    // =========================================================================
    const SAB  = (typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated)
                 ? new SharedArrayBuffer(64)
                 : new ArrayBuffer(64);
    const haus = new Float32Array(SAB);

    // =========================================================================
    // 2. CANVAS + WEBGL2 — nach bionic-ui.show(), resize() korrekt
    // =========================================================================
    const canvas = document.getElementById('feynman-canvas');

    // Declare BEFORE resize() call to avoid temporal dead zone
    let gl = null;
    let prog = null, uRes, uTime, uDrift, uPhase;
    let ctx2d = null;

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize(); // bionic-ui ist sichtbar → korrekte Dimensions

    // WebGL2 init — in try/catch für sichere Degradation
    try {
        gl = canvas.getContext('webgl2');
        if (!gl) throw new Error('webgl2 null');

        const VS = `#version 300 es
            in vec2 aPos;
            void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
        `;

        // Feynman Quantum Foam — pure scalar hash, no dot(float,float)
        const FS = `#version 300 es
            precision highp float;
            uniform vec2  u_res;
            uniform float u_time;
            uniform float u_drift;
            uniform float u_phase;
            out vec4 fragColor;

            float hash(vec3 p) {
                p = fract(p * 0.3183099 + 0.1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float noise(vec3 p) {
                vec3 i = floor(p), f = fract(p);
                vec3 u = f * f * (3.0 - 2.0 * f);
                float n000 = hash(i);
                float n100 = hash(i + vec3(1,0,0));
                float n010 = hash(i + vec3(0,1,0));
                float n110 = hash(i + vec3(1,1,0));
                float n001 = hash(i + vec3(0,0,1));
                float n101 = hash(i + vec3(1,0,1));
                float n011 = hash(i + vec3(0,1,1));
                float n111 = hash(i + vec3(1,1,1));
                return mix(
                    mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y),
                    mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y), u.z
                ) * 2.0 - 1.0;
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
                float n  = noise(vec3(uv*(2.0+u_drift*5.0), u_time*(0.2+u_drift*1.5)));
                float n2 = noise(vec3(uv*4.0+0.5, u_time*0.35));
                float field = smoothstep(0.0, 0.3+u_drift*0.4, abs(n+n2*0.4));
                vec3 cCyan  = vec3(0.0, 1.0, 1.0);
                vec3 cMag   = vec3(1.0, 0.0, 1.0);
                vec3 cBlue  = vec3(0.05, 0.08, 0.25);
                vec3 cBase  = vec3(0.02, 0.02, 0.06);
                vec3 col;
                if (u_phase < 0.5) {
                    col = mix(cBase, cBlue*0.9 + cCyan*0.1, (1.0-field)*0.6*(u_drift+0.15));
                } else if (u_phase < 1.5) {
                    col = mix(cBase, cCyan, (1.0-field)*0.9);
                } else {
                    col = mix(cBase, cMag,  (1.0-field)*0.9);
                }
                fragColor = vec4(col, 1.0);
            }
        `;

        function makeShader(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(s);
                gl.deleteShader(s);
                throw new Error('Shader compile: ' + log);
            }
            return s;
        }

        prog = gl.createProgram();
        gl.attachShader(prog, makeShader(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, makeShader(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error('Program link: ' + gl.getProgramInfoLog(prog));
        }

        // Buffer: fullscreen quad
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER,
            new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),
            gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        uRes   = gl.getUniformLocation(prog, 'u_res');
        uTime  = gl.getUniformLocation(prog, 'u_time');
        uDrift = gl.getUniformLocation(prog, 'u_drift');
        uPhase = gl.getUniformLocation(prog, 'u_phase');

        gl.useProgram(prog);
        console.log('[HAUS] WebGL2 Feynman Foam online.');

    } catch (e) {
        gl = null; prog = null;
        console.warn('[HAUS] WebGL2 Fallback auf Canvas2D:', e.message);
        ctx2d = canvas.getContext('2d');
    }

    // =========================================================================
    // 3. WASM CORE — Zig bare-metal (async, JS-Fallback wenn nicht verfügbar)
    // =========================================================================
    let wasm_calibrate = null, wasm_evaluate = null, wasm_reset = null;
    let wasmOk = false;

    WebAssembly.instantiateStreaming(fetch('./wasm/core.wasm')).then(obj => {
        const ex = obj.instance.exports;
        wasm_calibrate = ex.calibrate;
        wasm_evaluate  = ex.evaluateThought;
        wasm_reset     = ex.reset;
        if (ex.init_patterns) ex.init_patterns();
        wasmOk = true;
        console.log('[HAUS] WASM Core: Zero-Allocation Fundament aktiv.');
    }).catch(err => {
        console.warn('[HAUS] WASM nicht geladen, JS-Fallback:', err.message);
    });

    // =========================================================================
    // 4. AUDIO — Neurofeedback Direktional-System
    //    Links → Pan-L, tieferer Ton (78-85Hz, Delta/Theta Grenze)
    //    Rechts → Pan-R, höherer Ton (89-100Hz, Theta/Alpha Grenze)
    //    Der User HÖRT wohin sein Nervensystem tendiert — echtes Neurofeedback!
    // =========================================================================
    let audioCtx, masterGain, pannerL, pannerR, biquadFilter, osc1, osc2;

    function initAudio() {
        audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.12;
        masterGain.connect(audioCtx.destination);

        biquadFilter = audioCtx.createBiquadFilter();
        biquadFilter.type = 'lowpass';
        biquadFilter.frequency.value = 600;
        biquadFilter.Q.value = 1.0;
        biquadFilter.connect(masterGain);

        // STEREO PANNER — directional neurofeedback
        pannerL = audioCtx.createStereoPanner();
        pannerR = audioCtx.createStereoPanner();
        pannerL.pan.value =  0.0; // center initially
        pannerR.pan.value =  0.0;
        pannerL.connect(biquadFilter);
        pannerR.connect(biquadFilter);

        // osc1 = LEFT channel (lower carrier 78-85Hz)
        osc1 = audioCtx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 85;
        osc1.connect(pannerL);

        // osc2 = RIGHT channel (higher carrier 89-100Hz)
        osc2 = audioCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 89;
        osc2.connect(pannerR);

        osc1.start(); osc2.start();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Update directional audio from drift (normX = -1..1)
    function updateAudio(normX) {
        if (!audioCtx || !osc1) return;
        const t = audioCtx.currentTime;
        if (normX < 0) {
            // Drifting LEFT: freq drops, pan moves left, filter darkens
            const mag = Math.abs(normX);
            osc1.frequency.setTargetAtTime(85 - mag * 7, t, 0.15);  // 85 → 78Hz
            osc2.frequency.setTargetAtTime(89 - mag * 3, t, 0.15);  // 89 → 86Hz beat shrinks
            pannerL.pan.setTargetAtTime(-mag * 0.85, t, 0.1);
            pannerR.pan.setTargetAtTime(-mag * 0.4,  t, 0.1);
            biquadFilter.frequency.setTargetAtTime(300 - mag * 180, t, 0.2); // darker
        } else if (normX > 0) {
            // Drifting RIGHT: freq rises, pan moves right, filter brightens
            const mag = normX;
            osc1.frequency.setTargetAtTime(85 + mag * 3, t, 0.15);  // 85 → 88Hz beat grows
            osc2.frequency.setTargetAtTime(89 + mag * 11, t, 0.15); // 89 → 100Hz
            pannerL.pan.setTargetAtTime(mag * 0.4,  t, 0.1);
            pannerR.pan.setTargetAtTime(mag * 0.85, t, 0.1);
            biquadFilter.frequency.setTargetAtTime(300 + mag * 500, t, 0.2); // brighter
        } else {
            // Center: restore neutral 4Hz binaural theta
            osc1.frequency.setTargetAtTime(85, t, 0.3);
            osc2.frequency.setTargetAtTime(89, t, 0.3);
            pannerL.pan.setTargetAtTime(0, t, 0.3);
            pannerR.pan.setTargetAtTime(0, t, 0.3);
            biquadFilter.frequency.setTargetAtTime(300, t, 0.3);
        }
    }

    function collapseAudio(side) {
        if (!audioCtx || !biquadFilter) return;
        const t = audioCtx.currentTime;
        // Collapse burst: sweeps to 2.4kHz cutoff (reward signal)
        biquadFilter.frequency.setTargetAtTime(2400, t, 0.04);
        biquadFilter.frequency.setTargetAtTime(300,  t + 0.8, 0.4);
        masterGain.gain.setTargetAtTime(0.22, t, 0.04);
        masterGain.gain.setTargetAtTime(0.12, t + 1.0, 0.3);
    }

    // =========================================================================
    // 5. STATE MACHINE
    // =========================================================================
    const PHASE = { IDLE:0, CALIBRATE:1, SUPER:2, LEFT:3, RIGHT:4 };
    let phase = PHASE.IDLE;
    let smoothDrift = 0.0, collapsePhase = 0.0;
    let calibFrames = 0;
    const CALIB_FRAMES = 45;
    let isActive = false, lastTime = performance.now();

    // JS Ideomotor fallback
    function jsCalib(x,y,f,r) {
        if (calibFrames < CALIB_FRAMES) {
            haus[0]+=(x-haus[0])*0.1; haus[1]+=(y-haus[1])*0.1;
            haus[2]+=(f-haus[2])*0.1; haus[3]+=(r-haus[3])*0.1;
            calibFrames++; return 0;
        }
        return 1;
    }
    function jsEval(x,y,f,r) {
        haus[4]=x-haus[0]; haus[5]=y-haus[1]; haus[6]=f-haus[2]; haus[7]=r-haus[3];
        const L = -haus[4]+haus[5]*0.5+haus[6]*0.2-haus[7]*0.1;
        const R =  haus[4]-haus[5]*0.5-haus[6]*0.2+haus[7]*0.1;
        return (L>1.2 && L>R) ? 1 : (R>1.2 && R>L) ? 2 : 0;
    }

    // =========================================================================
    // 6. TOUCH PIPELINE
    // =========================================================================
    function feedTouch(x, y, force, radius) {
        if (phase === PHASE.CALIBRATE) {
            const done = wasmOk ? wasm_calibrate(x,y,force,radius) : jsCalib(x,y,force,radius);
            if (done === 1) {
                phase = PHASE.SUPER;
                document.getElementById('hud-phase').textContent = 'SUPERPOSITION';
                showIndicators(true); // show △ and ⊙ corner indicators
            }
        } else if (phase === PHASE.SUPER) {
            haus[4] = x - haus[0]; haus[5] = y - haus[1];
            const rawDrift = Math.sqrt(haus[4]*haus[4]+haus[5]*haus[5]) / 60.0;
            smoothDrift += (Math.min(rawDrift,1.0) - smoothDrift) * 0.1;
            updateCursor(haus[4]);

            const dec = wasmOk ? wasm_evaluate(x,y,force,radius) : jsEval(x,y,force,radius);
            if (dec === 1) collapse('LEFT');
            if (dec === 2) collapse('RIGHT');
        }
    }

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (phase===PHASE.IDLE||phase===PHASE.LEFT||phase===PHASE.RIGHT) {
            resetAll(); phase = PHASE.CALIBRATE; calibFrames = 0;
        }
        // Retry audio init (iOS needs touch gesture)
        if (!audioCtx) { try { initAudio(); } catch(_) {} }
        else if (audioCtx.state==='suspended') audioCtx.resume();
        isActive = true;
        const t = e.touches[0];
        feedTouch(t.clientX, t.clientY, t.force||0.5, t.radiusX||8);
        lastTime = performance.now();
    }, {passive:false});

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (!isActive) return;
        const t = e.touches[0];
        feedTouch(t.clientX, t.clientY, t.force||0.5, t.radiusX||8);
        lastTime = performance.now();
    }, {passive:false});

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        isActive = false;
        if (phase===PHASE.CALIBRATE||phase===PHASE.SUPER) resetAll();
    }, {passive:false});

    // =========================================================================
    // 7. COLLAPSE
    // =========================================================================
    function collapse(side) {
        phase        = side==='LEFT' ? PHASE.LEFT : PHASE.RIGHT;
        collapsePhase= side==='LEFT' ? 1.0 : 2.0;
        document.getElementById(side==='LEFT'?'menu-left':'menu-right').classList.add('active');
        document.getElementById('hud-phase').textContent = 'KOLLAPS · ' + side;
        showIndicators(false); // hide corner indicators on collapse
        collapseAudio(side);   // reward sound burst
    }

    function resetAll() {
        phase=PHASE.IDLE; smoothDrift=0; collapsePhase=0; calibFrames=0;
        for(let i=0;i<15;i++) haus[i]=0;
        if (wasmOk && wasm_reset) wasm_reset();
        document.getElementById('menu-left').classList.remove('active');
        document.getElementById('menu-right').classList.remove('active');
        document.getElementById('hud-phase').textContent = 'SUPERPOSITION';
        document.getElementById('hud-drift').textContent = '\u0394 0.000';
        setCursor(0);
        showIndicators(false);
        updateAudio(0); // return to center binaural theta
    }

    // 20s idle sweep
    setInterval(()=>{ if(performance.now()-lastTime>20000&&phase!==PHASE.IDLE) resetAll(); }, 4000);

    // =========================================================================
    // 8. CURSOR + LIVE SHAPE DEFORMATION (Telemetrie-driven)
    // =========================================================================
    function setCursor(normX) {
        const barL = document.getElementById('cursor-bar-l');
        const barR = document.getElementById('cursor-bar-r');
        const dot  = document.getElementById('cursor-dot');
        const px   = Math.abs(normX) * 100;
        if (normX < 0) {
            barL.style.width = px+'px'; barR.style.width='0';
            dot.style.background=`rgba(0,255,255,${0.5+Math.abs(normX)*0.5})`;
            dot.style.boxShadow=`0 0 12px rgba(0,255,255,${Math.abs(normX)})`;
        } else {
            barR.style.width = px+'px'; barL.style.width='0';
            dot.style.background=`rgba(255,0,255,${0.5+normX*0.5})`;
            dot.style.boxShadow=`0 0 12px rgba(255,0,255,${normX})`;
        }
        document.getElementById('hud-drift').textContent = '\u0394 '+normX.toFixed(3);
    }

    // Show/hide corner indicators — ONLY opacity/transform, no display:none
    function showIndicators(show) {
        document.getElementById('indicator-left').classList.toggle('show', show);
        document.getElementById('indicator-right').classList.toggle('show', show);
    }

    // Live shape deformation based on normX
    function updateShapes(normX) {
        const magL = normX < 0 ? Math.abs(normX) : 0;
        const magR = normX > 0 ? normX : 0;

        // --- TRIANGLE (left indicator) — grows taller/more acute as left drift increases
        const tri = document.getElementById('ind-tri');
        if (tri) {
            const tipY  = 8 - magL * 18;       // tip moves up (more acute)
            const baseW = 32 + magL * 30;       // base widens
            const baseY = 70 + magL * 8;        // base drops slightly
            tri.setAttribute('points',
                `40,${tipY} ${40-baseW},${baseY} ${40+baseW},${baseY}`);
        }
        // --- CIRCLE + CROSSHAIRS (right indicator) — expands and rotates
        const circ = document.getElementById('ind-circ');
        if (circ) {
            const r = 30 + magR * 14;           // radius grows
            circ.setAttribute('r', r);
            // Crosshair lines track radius
            const circH = document.getElementById('ind-circ-h');
            const circV = document.getElementById('ind-circ-v');
            if (circH) { circH.setAttribute('x1', 40-r); circH.setAttribute('x2', 40+r); }
            if (circV) { circV.setAttribute('y1', 40-r); circV.setAttribute('y2', 40+r); }
        }

        // --- Audio neurofeedback update
        updateAudio(normX);
    }

    function updateCursor(dX) {
        const n = Math.max(-1, Math.min(1, dX / 50));
        setCursor(n);
        updateShapes(n);
    }

    // =========================================================================
    // 9. IGNITE + FULLSCREEN BUTTONS
    // =========================================================================
    document.getElementById('btn-ignite').addEventListener('click', () => {
        document.getElementById('init-overlay').classList.add('hidden');
        try { initAudio(); } catch(e) { console.warn('[HAUS] Audio defer:', e.message); }
        lastTime = performance.now();
        phase = PHASE.IDLE;
        console.log('[HAUS] IGNITION. O(1) Field aktiv.');
        requestAnimationFrame(renderLoop);
    });

    // Fullscreen toggle
    const btnFs = document.getElementById('btn-fullscreen');
    if (btnFs) {
        btnFs.addEventListener('click', () => {
            const docEl = document.documentElement;
            const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen;
            const exitFs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
            if (!document.fullscreenElement) {
                if (reqFs) reqFs.call(docEl).catch(() => {});
            } else {
                if (exitFs) exitFs.call(document).catch(() => {});
            }
        });
        document.addEventListener('fullscreenchange', () => {
            btnFs.textContent = document.fullscreenElement ? '⊠' : '⛶';
        });
        document.addEventListener('webkitfullscreenchange', () => {
            btnFs.textContent = document.webkitFullscreenElement ? '⊠' : '⛶';
        });
    }

    // =========================================================================
    // 10. RENDER LOOP
    // =========================================================================
    const t0 = performance.now();

    function renderLoop(now) {
        const t = (now - t0) * 0.001;

        if (!isActive && phase !== PHASE.LEFT && phase !== PHASE.RIGHT) {
            smoothDrift *= 0.96;
        }

        if (gl && prog) {
            // WebGL2 Feynman Foam
            gl.useProgram(prog);
            gl.uniform2f(uRes,   canvas.width, canvas.height);
            gl.uniform1f(uTime,  t);
            gl.uniform1f(uDrift, smoothDrift);
            gl.uniform1f(uPhase, collapsePhase);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

        } else if (ctx2d) {
            // Canvas2D Fallback — Quantum rings
            const w=canvas.width, h=canvas.height, cx=w/2, cy=h/2;
            ctx2d.fillStyle='#050508';
            ctx2d.fillRect(0,0,w,h);
            const rings = 6;
            for (let i=0; i<rings; i++) {
                const phi = t*(0.3+i*0.05) + i*(Math.PI*2/rings);
                const r   = (Math.min(w,h)*0.25)*(0.5+i/rings)*(1+smoothDrift*0.5);
                const x   = cx + Math.cos(phi)*r*0.3;
                const y   = cy + Math.sin(phi)*r*0.3;
                const alpha = 0.15 + smoothDrift*0.4;
                const col = collapsePhase<0.5 ? `rgba(80,130,255,${alpha})`
                          : collapsePhase<1.5 ? `rgba(0,255,255,${alpha+0.2})`
                          :                     `rgba(255,0,255,${alpha+0.2})`;
                ctx2d.beginPath();
                ctx2d.arc(x,y,r*(0.08+smoothDrift*0.1),0,Math.PI*2);
                ctx2d.strokeStyle=col; ctx2d.lineWidth=1.5; ctx2d.stroke();
            }
            const grd=ctx2d.createRadialGradient(cx,cy,0,cx,cy,Math.min(w,h)*0.4);
            const gc = collapsePhase<0.5 ? 'rgba(50,100,255,0.12)' : collapsePhase<1.5 ? 'rgba(0,255,255,0.18)' : 'rgba(255,0,255,0.18)';
            grd.addColorStop(0, gc); grd.addColorStop(1,'transparent');
            ctx2d.beginPath(); ctx2d.arc(cx,cy,Math.min(w,h)*0.4,0,Math.PI*2);
            ctx2d.fillStyle=grd; ctx2d.fill();
        }

        requestAnimationFrame(renderLoop);
    }

})();
