const PLANCK_THRESHOLD: f32 = 0.05; // Shannon-Entropie Cut-off

struct QuantumState {
    query: vec2<f32>,     // RAG Such-Vektor Amplitude
    context: vec2<f32>,   // RAG Target-Vektor Amplitude
    relevance: f32,       // Wigner-Wahrscheinlichkeit
}

@group(0) @binding(0) 
var<storage, read_write> phase_space: array<QuantumState>;

@compute @workgroup_size(256)
fn wigner_interference(@builtin(global_invocation_id) id: vec3<u32>) {
    let q = phase_space[id.x].query;
    let c = phase_space[id.x].context;
    
    // 1. Die Superposition (Phasenkopplung / Yin-Yang)
    let superposition = q + c; // Konstruktive / Destruktive Interferenz
    
    // 2. Das Betragsquadrat (Die Wahrscheinlichkeit / Wigner-Funktion)
    // dot(v, v) ist unschlagbar in O(1) auf Hardware-Level
    let probability = dot(superposition, superposition);
    
    // 3. Dekohärenz-Filter (Lyapunov-Chaos Eliminierung)
    // Wenn die Phasen destruktiv interferiert haben (Binaural Beats Phasenauslöschung),
    // verwerfen wir das Rauschen.
    if (probability < PLANCK_THRESHOLD) {
        phase_space[id.x].relevance = 0.0;
    } else {
        // Phasen-Wrapping Modulo 2PI zur Sicherung auf f32 (HD 4000)
        phase_space[id.x].relevance = probability % 6.28318530718;
    }
}
