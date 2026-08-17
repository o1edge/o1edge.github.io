// =============================================================================
// o1edge_3 · ISING WORKER (WebNN / ONNX / Monte-Carlo Fallback)
// Zero-Allocation VRAM/NPU Pipeline
// =============================================================================

let isingSession = null;
let useWebNN = false;
let fallbackMode = false;

// 64x64 Spin Lattice for Fallback Monte-Carlo
const L = 64;
const N = L * L;
const spins = new Int8Array(N);
for (let i = 0; i < N; i++) spins[i] = Math.random() < 0.5 ? 1 : -1;

let temp = 2.269; // Critical temperature

// ONNX/WebNN Initialization
async function initNPU() {
    try {
        // Attempt to import ONNX Runtime Web
        importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
        
        ort.env.wasm.numThreads = 1;
        // Try to load the model (user must provide ising.onnx later)
        isingSession = await ort.InferenceSession.create('assets/ising.onnx', {
            executionProviders: ['webnn', 'wasm', 'cpu']
        });
        
        useWebNN = isingSession.clientExecutionProvider === 'webnn';
        postMessage({ type: 'INIT_OK', backend: useWebNN ? 'WebNN' : 'WASM' });
    } catch (e) {
        // Fallback to pure JS Monte-Carlo Ising Model if no model is found
        console.warn("[IsingWorker] ONNX Init failed, falling back to CPU Monte-Carlo.", e.message);
        fallbackMode = true;
        postMessage({ type: 'INIT_OK', backend: 'CPU-Fallback' });
    }
}

// Monte-Carlo Step (Zero-Allocation)
function isingStepJS(driftX, driftY) {
    // Modulate temperature based on user drift (friction)
    const friction = Math.sqrt(driftX*driftX + driftY*driftY);
    temp = 2.269 + friction * 1.5; 
    
    let flips = 0;
    for (let step = 0; step < N; step++) {
        // Random site
        const idx = Math.floor(Math.random() * N);
        const x = idx % L;
        const y = Math.floor(idx / L);
        
        // Neighbors (Periodic Boundary)
        const up = y === 0 ? (L-1)*L + x : (y-1)*L + x;
        const down = y === L-1 ? x : (y+1)*L + x;
        const left = x === 0 ? y*L + (L-1) : y*L + (x-1);
        const right = x === L-1 ? y*L : y*L + (x+1);
        
        const sumNeighbors = spins[up] + spins[down] + spins[left] + spins[right];
        const deltaE = 2 * spins[idx] * sumNeighbors;
        
        if (deltaE <= 0 || Math.random() < Math.exp(-deltaE / temp)) {
            spins[idx] *= -1;
            flips++;
        }
    }
    
    // Calculate magnetization
    let mag = 0;
    for (let i = 0; i < N; i++) mag += spins[i];
    
    return Math.abs(mag) / N; // 0 to 1 chaos/magnetization value
}

// Message Handler from Main Thread
self.onmessage = async function(e) {
    const data = e.data;
    
    if (data.type === 'INIT') {
        await initNPU();
    } 
    else if (data.type === 'COMPUTE') {
        const driftX = data.driftX || 0;
        const driftY = data.driftY || 0;
        let chaos = 0;

        if (fallbackMode) {
            chaos = isingStepJS(driftX, driftY);
            postMessage({ type: 'RESULT', chaos: chaos });
        } else if (isingSession) {
            try {
                const tensor = new ort.Tensor('float32', new Float32Array([driftX, driftY]), [1, 2]);
                const results = await isingSession.run({ 'telemetry': tensor });
                chaos = results.chaos.data[0];
                postMessage({ type: 'RESULT', chaos: chaos });
            } catch (err) {
                // If inference fails mid-flight, fallback
                fallbackMode = true;
            }
        }
    }
};
