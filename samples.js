// BeatRoom Client-Side Programmatic Audio Buffer Generator
// Synthesizes high-quality instruments using Web Audio OfflineAudioContext.
// This runs once on load, meaning zero external assets need to be downloaded!

(function() {
  const SAMPLE_RATE = 44100;
  window.sampleBuffers = {};

  // Helper to render a specific sound setup programmatically
  async function renderBuffer(duration, setupFn) {
    const ctx = new OfflineAudioContext(2, SAMPLE_RATE * duration, SAMPLE_RATE);
    setupFn(ctx);
    return await ctx.startRendering();
  }

  // Dictionary of sound rendering functions
  const generators = {
    // 1. Kick - Classic 808
    'kick-808': () => renderBuffer(0.8, (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(130, 0);
      osc.frequency.exponentialRampToValueAtTime(38, 0.22);
      
      gain.gain.setValueAtTime(1.0, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.7);
      
      osc.start(0);
      osc.stop(0.8);
    }),

    // 2. Kick - Punchy Acoustic
    'kick-acoustic': () => renderBuffer(0.25, (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(260, 0);
      osc.frequency.exponentialRampToValueAtTime(52, 0.08);
      
      gain.gain.setValueAtTime(1.0, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.2);
      
      // Noise click
      const bufSize = SAMPLE_RATE * 0.015;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1500, 0);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, 0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.01);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      osc.start(0);
      noise.start(0);
    }),

    // 3. Kick - Lo-Fi Sub
    'kick-lofi': () => renderBuffer(0.4, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, 0);
      
      const gain = ctx.createGain();
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(95, 0);
      osc.frequency.exponentialRampToValueAtTime(42, 0.18);
      
      gain.gain.setValueAtTime(0.8, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.35);
      
      osc.start(0);
      osc.stop(0.4);
    }),

    // 4. Snare - Analog Noise
    'snare-analog': () => renderBuffer(0.3, (ctx) => {
      // Noise component
      const bufSize = SAMPLE_RATE * 0.3;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, 0);
      filter.Q.setValueAtTime(1.5, 0);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, 0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.2);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      // Drum body
      const osc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      osc.frequency.setValueAtTime(175, 0);
      osc.frequency.exponentialRampToValueAtTime(90, 0.08);
      bodyGain.gain.setValueAtTime(0.5, 0);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, 0.1);
      
      osc.connect(bodyGain);
      bodyGain.connect(ctx.destination);
      
      noise.start(0);
      osc.start(0);
    }),

    // 5. Snare - Rimshot / Sidestick
    'snare-acoustic': () => renderBuffer(0.2, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, 0);
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, 0);
      filter.Q.setValueAtTime(4.0, 0);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.08);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      // Add a tiny wood click (very high pass noise)
      const bufSize = SAMPLE_RATE * 0.05;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3000, 0);
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.3, 0);
      clickGain.gain.exponentialRampToValueAtTime(0.001, 0.015);
      
      noise.connect(hp);
      hp.connect(clickGain);
      clickGain.connect(ctx.destination);
      
      osc.start(0);
      noise.start(0);
    }),

    // 6. Snare - 808 Handclap
    'snare-clap': () => renderBuffer(0.35, (ctx) => {
      const bufSize = SAMPLE_RATE * 0.35;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, 0);
      filter.Q.setValueAtTime(1.0, 0);
      
      const gain = ctx.createGain();
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      // Clap pre-burst triggers
      gain.gain.setValueAtTime(0, 0);
      
      gain.gain.linearRampToValueAtTime(0.5, 0.002);
      gain.gain.linearRampToValueAtTime(0.0, 0.010);
      
      gain.gain.setValueAtTime(0.0, 0.012);
      gain.gain.linearRampToValueAtTime(0.6, 0.014);
      gain.gain.linearRampToValueAtTime(0.0, 0.024);
      
      gain.gain.setValueAtTime(0.0, 0.026);
      gain.gain.linearRampToValueAtTime(0.7, 0.028);
      gain.gain.linearRampToValueAtTime(0.0, 0.040);
      
      gain.gain.setValueAtTime(0.0, 0.044);
      gain.gain.linearRampToValueAtTime(0.8, 0.046);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.28);
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.connect(filter);
      noise.start(0);
    }),

    // 7. Hi-Hat - Closed
    'hat-closed': () => renderBuffer(0.08, (ctx) => {
      const bufSize = SAMPLE_RATE * 0.08;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(8000, 0);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.045);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(0);
    }),

    // 8. Hi-Hat - Open
    'hat-open': () => renderBuffer(0.4, (ctx) => {
      const bufSize = SAMPLE_RATE * 0.4;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7500, 0);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.28);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(0);
    }),

    // 9. Hi-Hat - Crunchy Lo-Fi
    'hat-lofi': () => renderBuffer(0.12, (ctx) => {
      const bufSize = SAMPLE_RATE * 0.12;
      const noiseBuf = ctx.createBuffer(1, bufSize, SAMPLE_RATE);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4500, 0);
      filter.Q.setValueAtTime(3.0, 0);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.09);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      // Metallic frequency modulation resonance tone
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(5800, 0);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.1, 0);
      oscGain.gain.exponentialRampToValueAtTime(0.001, 0.05);
      
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      
      noise.start(0);
      osc.start(0);
    }),

    // 10. Bass - Sub Sine (Mapped to C2)
    'bass-sub': () => renderBuffer(1.5, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65.41, 0); // C2
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.7, 0.03);
      gain.gain.exponentialRampToValueAtTime(0.3, 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, 1.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(0);
      osc.stop(1.5);
    }),

    // 11. Bass - Acid 303 (Mapped to C2)
    'bass-acid': () => renderBuffer(1.5, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65.41, 0); // C2
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(8.5, 0); // Squelchy Resonance
      filter.frequency.setValueAtTime(900, 0);
      filter.frequency.exponentialRampToValueAtTime(140, 0.28);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.4, 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.75);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(0);
      osc.stop(1.5);
    }),

    // 12. Synth - Lead Square Pluck (Mapped to C4)
    'synth-lead': () => renderBuffer(1.2, (ctx) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(261.63, 0); // C4
      
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(261.63, 0); // C4
      
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.12, 0);
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, 0);
      filter.frequency.exponentialRampToValueAtTime(500, 0.15);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.4, 0.01);
      gain.gain.exponentialRampToValueAtTime(0.08, 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, 1.0);
      
      osc1.connect(filter);
      osc2.connect(osc2Gain);
      osc2Gain.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(0);
      osc2.start(0);
      osc1.stop(1.2);
      osc2.stop(1.2);
    }),

    // 13. Synth - FM Bell (Mapped to C4)
    'synth-bell': () => renderBuffer(1.5, (ctx) => {
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(261.63, 0); // C4
      
      const modulator = ctx.createOscillator();
      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(261.63 * 3.5, 0);
      
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(800, 0);
      modGain.gain.exponentialRampToValueAtTime(0.01, 0.35);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.5, 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, 1.3);
      
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(gain);
      gain.connect(ctx.destination);
      
      carrier.start(0);
      modulator.start(0);
      carrier.stop(1.5);
      modulator.stop(1.5);
    }),

    // 14. Pad - Detuned Warm Ambient (Mapped to C3)
    'pad-ambient': () => renderBuffer(2.0, (ctx) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(130.81, 0); // C3
      
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(130.81 - 1.5, 0); // detuned down
      
      const osc3 = ctx.createOscillator();
      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(130.81 + 1.5, 0); // detuned up
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, 0);
      filter.frequency.linearRampToValueAtTime(650, 0.8);
      filter.frequency.exponentialRampToValueAtTime(220, 1.8);
      filter.Q.setValueAtTime(1.5, 0);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.25, 0.55); // Slow attack
      gain.gain.exponentialRampToValueAtTime(0.08, 1.3);
      gain.gain.exponentialRampToValueAtTime(0.001, 2.0);
      
      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(0);
      osc2.start(0);
      osc3.start(0);
      osc1.stop(2.0);
      osc2.stop(2.0);
      osc3.stop(2.0);
    })
  };

  // Main global function to trigger synthesis on all channels
  window.synthesizeSamples = async function() {
    const promises = Object.keys(generators).map(async (key) => {
      try {
        const buffer = await generators[key]();
        window.sampleBuffers[key] = buffer;
      } catch (err) {
        console.error(`Failed to synthesize sound preset: ${key}`, err);
      }
    });
    
    await Promise.all(promises);
    console.log("All collaborative synth instruments generated locally!");
  };
})();
