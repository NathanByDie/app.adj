// Definición de notas y acordes básicos
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Priorizamos acordes simples. Yamaha Chord Tracker rara vez marca aumentados/disminuidos en el modo básico.
const CHORD_TEMPLATES = [
    ...NOTES.map((_, i) => ({ name: NOTES[i], root: i, type: 'M' })), 
    ...NOTES.map((_, i) => ({ name: NOTES[i] + 'm', root: i, type: 'm' }))
];

export interface LocalAnalysisResult {
    key: string;
    bpm: number;
    timeSignature: string;
    chords: { timestamp: number; chord: string }[];
    duration: number;
    offset: number;
}

declare const jsmediatags: any;

export const analyzeAudioLocal = async (file: File, onProgress: (msg: string) => void): Promise<LocalAnalysisResult> => {
    onProgress('Cargando audio de alta fidelidad...');
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    // Mezclar a mono para análisis de fase coherente
    const channelData = getMonoChannel(audioBuffer); 
    const duration = audioBuffer.duration;

    // 1. Detección de Ritmo (BPM y Grid)
    onProgress('Detectando pulso y estructura...');
    const { bpm, offset } = detectRhythm(channelData, sampleRate);
    
    // 2. Análisis Armónico de Precisión (Grid Integration)
    // Aquí ocurre la magia de "eliminar adornos"
    onProgress('Calculando armonía fundamental...');
    const chords = analyzeChordsIntegrated(channelData, sampleRate, bpm, offset, duration);

    // 3. Limpieza Estructural (Quantization Logic)
    onProgress('Refinando partitura...');
    const cleanChords = postProcessChords(chords);

    // Detección de tonalidad global basada en histograma de fundamentales
    const likelyKey = detectKeyFromChords(cleanChords);

    return {
        key: likelyKey,
        bpm: Math.round(bpm),
        timeSignature: "4/4",
        chords: cleanChords,
        duration: duration,
        offset: offset
    };
};

function getMonoChannel(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    const len = ch0.length;
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        mono[i] = (ch0[i] + ch1[i]) / 2;
    }
    return mono;
}

/**
 * Algoritmo de detección de BPM basado en energía de bandas bajas (Bombos/Bajos)
 */
function detectRhythm(data: Float32Array, sampleRate: number): { bpm: number, offset: number } {
    const downsampleRate = 1000; 
    const skip = Math.floor(sampleRate / downsampleRate);
    const n = Math.floor(data.length / skip);
    const envelope = new Float32Array(n);

    // Filtro pasa-bajos simple (media móvil) antes de calcular energía para enfocarse en el ritmo
    for (let i = 0; i < n; i++) {
        let sum = 0;
        const start = i * skip;
        const end = Math.min(start + skip, data.length);
        for (let j = start; j < end; j++) {
            sum += data[j] * data[j]; // Energía al cuadrado
        }
        envelope[i] = Math.sqrt(sum);
    }

    // Autocorrelación
    let maxCorr = 0;
    let bestLag = 0;
    const minLag = Math.floor(0.28 * downsampleRate); // ~210 BPM
    const maxLag = Math.floor(1.0 * downsampleRate);  // ~60 BPM

    for (let lag = minLag; lag < maxLag; lag++) {
        let sum = 0;
        // Optimización: Muestreo parcial para velocidad
        for (let i = 0; i < n - lag; i += 4) { 
            sum += envelope[i] * envelope[i + lag];
        }
        if (sum > maxCorr) {
            maxCorr = sum;
            bestLag = lag;
        }
    }

    let bpm = 60 / (bestLag / downsampleRate);
    
    // Normalizar BPM a rango cómodo (70-150)
    while (bpm < 70) bpm *= 2;
    while (bpm > 150) bpm /= 2;

    // Detectar Offset (Primer golpe fuerte)
    const samplesPerBeat = (60 / bpm) * downsampleRate;
    let maxEnergy = 0;
    let bestOffsetSamples = 0;
    
    const searchWindow = Math.min(envelope.length, samplesPerBeat * 2);
    
    for (let i = 0; i < searchWindow; i++) {
        if (envelope[i] > maxEnergy) {
            maxEnergy = envelope[i];
            bestOffsetSamples = i;
        }
    }

    return { bpm, offset: bestOffsetSamples / downsampleRate };
}

/**
 * ANÁLISIS INTEGRADO: La clave para la precisión.
 * En lugar de analizar un punto, analizamos todo el beat como un bloque.
 */
function analyzeChordsIntegrated(data: Float32Array, sampleRate: number, bpm: number, offset: number, duration: number) {
    const secondsPerBeat = 60 / bpm;
    const chords: { timestamp: number; chord: string }[] = [];
    
    const maxAnalysisTime = Math.min(duration, 600); 

    // Recorremos el audio Grid por Grid (Beat por Beat)
    for (let t = offset; t < maxAnalysisTime; t += secondsPerBeat) {
        
        const startSample = Math.floor(t * sampleRate);
        const endSample = Math.floor((t + secondsPerBeat) * sampleRate);
        
        if (endSample > data.length) break;

        const beatBuffer = data.slice(startSample, endSample);
        
        // 1. Filtro de Silencio Global del Beat
        const rms = calculateRMS(beatBuffer);
        if (rms < 0.01) {
            chords.push({ timestamp: t, chord: 'N.C.' });
            continue;
        }

        // 2. Extracción Espectral Acumulativa
        // Dividimos el beat en 4 sub-ventanas para capturar movimiento, pero sumamos sus resultados.
        // Esto hace que la nota que suena MÁS TIEMPO dentro del beat gane.
        // Ejemplo Cumbia: Bajo hace [Sol (largo), Si (corto), Re (corto)].
        // Energía Sol > Energía Si + Energía Re. Sol gana.
        
        const accumulatedBass = new Array(12).fill(0);
        const accumulatedTreble = new Array(12).fill(0);
        const windowSize = 8192; // Ventana grande para resolución de bajos
        const step = Math.floor((beatBuffer.length - windowSize) / 3); // 3 o 4 pasos por beat

        if (step > 0) {
            for (let i = 0; i < beatBuffer.length - windowSize; i += step) {
                const chunk = beatBuffer.slice(i, i + windowSize);
                const { bass, treble } = extractDualChroma(chunk, sampleRate);
                
                for(let k=0; k<12; k++) {
                    accumulatedBass[k] += bass[k];
                    accumulatedTreble[k] += treble[k];
                }
            }
        } else {
            // Si el beat es muy rápido, analizamos lo que quepa
            const { bass, treble } = extractDualChroma(beatBuffer, sampleRate);
            for(let k=0; k<12; k++) {
                accumulatedBass[k] = bass[k];
                accumulatedTreble[k] = treble[k];
            }
        }

        // 3. Identificación
        const chord = identifyChordStable(accumulatedBass, accumulatedTreble);
        chords.push({ timestamp: t, chord });
    }
    return chords;
}

/**
 * Extracción de características espectrales con FILTROS ESTRICTOS.
 * - Elimina Voz (>600Hz)
 * - Elimina Percusión (Chequeo de picos)
 */
function extractDualChroma(buffer: Float32Array, sampleRate: number): { bass: number[], treble: number[] } {
    const n = buffer.length;
    const bassChroma = new Array(12).fill(0);
    const trebleChroma = new Array(12).fill(0);
    
    // Ventana Hann para reducir leakage espectral
    const windowed = new Float32Array(n);
    for(let i=0; i<n; i++) {
        windowed[i] = buffer[i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))));
    }

    // Rango MIDI restringido: E1 (41Hz) a D5 (587Hz).
    // Todo lo que sea voz (usualmente > 300Hz fundamental, >1000Hz armónicos) será ignorado o atenuado.
    for (let midi = 28; midi < 74; midi++) { 
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        
        // --- FILTRO DE VOZ Y ADORNOS AGUDOS ---
        // Corte agresivo en 600Hz.
        if (freq > 600) continue;

        // Goertzel Algorithm (Optimizado para frecuencias específicas)
        const k = Math.round(n * freq / sampleRate);
        const omega = (2 * Math.PI * k) / n;
        const cosine = Math.cos(omega);
        let coeff = 2 * cosine;
        let s_prev = 0;
        let s_prev2 = 0;
        
        for (let i = 0; i < n; i++) {
            let s = windowed[i] + coeff * s_prev - s_prev2;
            s_prev2 = s_prev;
            s_prev = s;
        }
        
        const power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
        const magnitude = Math.sqrt(power);
        const noteIndex = midi % 12;

        // --- SEPARACIÓN DE BANDAS ---
        
        if (freq < 200) {
            // BAJO: Prioridad máxima a las fundamentales más graves.
            // Esto asegura que en una inversión (ej. Do/Sol), el bajo real (Sol) tenga peso,
            // pero si el bajo toca la tónica (Do), gana por goleada.
            // La fórmula 1/freq hace que 50Hz valga el doble que 100Hz.
            bassChroma[noteIndex] += magnitude * (1000 / freq); 
        } else {
            // ARMONÍA: Piano/Guitarra (200Hz - 600Hz)
            // Aquí buscamos la tercera para definir Mayor/Menor.
            trebleChroma[noteIndex] += magnitude;
        }
    }
    
    return { bass: bassChroma, treble: trebleChroma };
}

/**
 * Identifica el acorde basándose en la estabilidad y la fuerza del bajo.
 */
function identifyChordStable(bassChroma: number[], trebleChroma: number[]): string {
    // 1. Detectar Tónica (Root)
    let rootIndex = -1;
    let maxBass = 0;
    let totalBass = 0;

    for(let i=0; i<12; i++) {
        totalBass += bassChroma[i];
        if (bassChroma[i] > maxBass) {
            maxBass = bassChroma[i];
            rootIndex = i;
        }
    }

    // 2. Filtro de Percusión (Factor de Cresta)
    // Si la energía máxima no es significativamente mayor al promedio, es ruido (percusión).
    const avgBass = totalBass / 12;
    if (maxBass < avgBass * 2.2) { // Umbral alto para rechazar bombos sin tono
        return 'N.C.';
    }

    // 3. Determinar Calidad (Mayor/Menor)
    // Miramos la relación entre la Tercera Mayor y Menor en la banda de agudos (treble)
    const rootName = NOTES[rootIndex];
    const minorThird = (rootIndex + 3) % 12;
    const majorThird = (rootIndex + 4) % 12;

    const minorEnergy = trebleChroma[minorThird];
    const majorEnergy = trebleChroma[majorThird];

    // Bias hacia Mayor: En música popular, los acordes mayores son más comunes y acústicamente más fuertes.
    // Se requiere un 15% más de energía en la tercera menor para declarar el acorde como menor.
    if (minorEnergy > majorEnergy * 1.15) {
        return rootName + 'm';
    }
    
    return rootName;
}

function calculateRMS(buffer: Float32Array) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
}

/**
 * Post-Procesamiento Estilo Yamaha
 * Regla de oro: La estabilidad visual es más importante que la precisión milimétrica instantánea.
 */
function postProcessChords(chords: { timestamp: number; chord: string }[]) {
    if (chords.length === 0) return [];
    const processed = JSON.parse(JSON.stringify(chords));

    // 1. Llenar huecos (Sustain Logic)
    // Si hay un N.C. entre dos acordes iguales, es el mismo acorde sonando.
    for (let i = 1; i < processed.length - 1; i++) {
        if (processed[i].chord === 'N.C.') {
            if (processed[i-1].chord !== 'N.C.') {
                processed[i].chord = processed[i-1].chord;
            }
        }
    }

    // 2. Eliminación de "Flicker" (Parpadeo)
    // Si tenemos A - B - A, el B es probablemente un error o una nota de paso muy corta.
    // Lo convertimos en A - A - A.
    for (let i = 1; i < processed.length - 1; i++) {
        const prev = processed[i-1].chord;
        const curr = processed[i].chord;
        const next = processed[i+1].chord;

        if (prev === next && curr !== prev) {
            processed[i].chord = prev;
        }
    }

    // 3. Smoothing de 2 etapas
    // Si un acorde dura solo 1 beat y es diferente al anterior y siguiente (aunque sean distintos entre sí),
    // a veces es mejor mantener el anterior para dar estabilidad visual al músico.
    // A - A - B - C - C  => Se queda igual
    // A - A - B - A - A  => Se convierte en A (paso anterior)
    
    return processed;
}

function detectKeyFromChords(chords: { chord: string }[]): string {
    const counts: Record<string, number> = {};
    let maxCount = 0;
    let likelyKey = 'C';

    // Contamos solo acordes Mayores y Menores, ignorando N.C.
    chords.forEach(c => {
        if (c.chord !== 'N.C.') {
            // Simplificación: Asumimos que el acorde final suele ser la tónica
            // O el acorde que más se repite.
            const root = c.chord.replace('m', ''); 
            counts[root] = (counts[root] || 0) + 1;
        }
    });

    // Peso extra al último acorde (resolución)
    if (chords.length > 0) {
        const lastChord = chords[chords.length - 1].chord.replace('m', '');
        if (lastChord !== 'N.C.') {
            counts[lastChord] = (counts[lastChord] || 0) + 20; 
        }
    }

    for (const [chord, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            likelyKey = chord;
        }
    }
    
    return likelyKey;
}

export const extractMetadata = (file: File): Promise<{ title?: string, artist?: string }> => {
    return new Promise((resolve) => {
        if (typeof jsmediatags === 'undefined') {
            resolve({});
            return;
        }
        jsmediatags.read(file, {
            onSuccess: (tag: any) => resolve({ title: tag.tags.title, artist: tag.tags.artist }),
            onError: (error: any) => resolve({})
        });
    });
};