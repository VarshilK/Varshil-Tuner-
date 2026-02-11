document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('tuner-slider');
  const valueLabel = document.getElementById('tuner-value');
  const friends = Array.from(document.querySelectorAll('.friend'));
  const micToggle = document.getElementById('mic-toggle');
  const micStatus = document.getElementById('mic-status');
  const metronomeSlider = document.getElementById('metronome-slider');
  const metronomeBpmLabel = document.getElementById('metronome-bpm');
  const metronomeEasterEgg = document.getElementById('metronome-easter-egg');
  const metronomeVolumeSlider = document.getElementById('metronome-volume-slider');
  const titleEl = document.querySelector('h1');
  const defaultTitleText = titleEl ? titleEl.textContent : '';

  let amplitude = 0; // how intense the wiggle is (in px / deg units)
  let audioContext = null;
  let analyser = null;
  let timeData = null;
  let micEnabled = false;

  let metronomeAudioCtx = null;
  let metronomeGain = null;
  let metronomeIntervalId = null;

  const arnavFriend = friends.find((f) => f.dataset.name === 'Arnav');
  const arnavNameEl = arnavFriend ? arnavFriend.querySelector('.name') : null;
  const arnavFace = arnavFriend ? arnavFriend.querySelector('.face') : null;

  const rithikFriend = friends.find((f) => f.dataset.name === 'Rithik');
  const rithikFace = rithikFriend ? rithikFriend.querySelector('.face') : null;

  function ensureMetronomeAudioContext() {
    if (metronomeAudioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    metronomeAudioCtx = new AudioCtx();
    metronomeGain = metronomeAudioCtx.createGain();
    const initialVolume = metronomeVolumeSlider
      ? Number(metronomeVolumeSlider.value || 60) / 100
      : 0.6;
    metronomeGain.gain.value = initialVolume;
    metronomeGain.connect(metronomeAudioCtx.destination);
  }

  function playMetronomeClick() {
    if (!metronomeAudioCtx || !metronomeGain) return;

    const now = metronomeAudioCtx.currentTime;

    const osc = metronomeAudioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);

    const clickGain = metronomeAudioCtx.createGain();
    clickGain.gain.setValueAtTime(1, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(clickGain);
    clickGain.connect(metronomeGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  function restartMetronomeTimer(bpm) {
    if (!metronomeAudioCtx || !metronomeGain) return;
    if (metronomeIntervalId) {
      clearInterval(metronomeIntervalId);
    }
    const intervalMs = 60000 / bpm;
    metronomeIntervalId = setInterval(playMetronomeClick, intervalMs);
  }

  function createRithikSymbols() {
    if (!rithikFace) return;

    const symbols = ['{', '}', '#', '$', '%', '*', 'Σ', 'π', '√', '∫', '∑', 'λ', '≈', '≥', '≤', '∞'];
    const size = rithikFace.clientWidth || 96;
    const radius = size / 2 - 8; // padding so we stay well inside the circle
    const center = size / 2;

    const count = 14;
    for (let i = 0; i < count; i += 1) {
      const span = document.createElement('span');
      span.className = 'face-symbol';
      span.textContent = symbols[Math.floor(Math.random() * symbols.length)];

      // random point inside a circle
      let angle = Math.random() * Math.PI * 2;
      let r = Math.sqrt(Math.random()) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);

      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      span.style.transform = 'translate(-50%, -50%)';

      rithikFace.appendChild(span);
    }
  }

  function mapOffsetToAmplitude(offset) {
    const maxOffset = 50; // slider range end
    const t = Math.min(Math.abs(offset) / maxOffset, 1); // 0..1
    const minAmp = 1.2;
    const maxAmp = 40;
    return minAmp + (maxAmp - minAmp) * t;
  }

  function classifyIntensity(offset) {
    const d = Math.abs(offset);
    if (d < 5) return 'low';
    if (d < 15) return 'medium';
    if (d < 30) return 'high';
    return 'max';
  }

  // Very simple auto-correlation pitch detection.
  function autoCorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i += 1) {
      const v = buffer[i];
      sumOfSquares += v * v;
    }
    const rms = Math.sqrt(sumOfSquares / SIZE);
    if (rms < 0.001) return -1; // signal too weak

    let bestOffset = -1;
    let bestCorrelation = 0;
    const MAX_SAMPLES = Math.floor(SIZE / 2);

    for (let offset = 1; offset < MAX_SAMPLES; offset += 1) {
      let correlation = 0;
      for (let i = 0; i < MAX_SAMPLES; i += 1) {
        correlation += buffer[i] * buffer[i + offset];
      }
      correlation /= MAX_SAMPLES;

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestCorrelation < 0.02 || bestOffset === -1) return -1;

    const fundamentalFreq = sampleRate / bestOffset;
    return fundamentalFreq;
  }

  function frequencyToNoteData(freq) {
    const A4 = 440;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = 69 + 12 * Math.log2(freq / A4);
    const nearest = Math.round(midi);
    const noteIndex = ((nearest % 12) + 12) % 12;
    const octave = Math.floor(nearest / 12) - 1;
    const noteName = `${noteNames[noteIndex]}${octave}`;
    const refFreq = A4 * Math.pow(2, (nearest - 69) / 12);
    const cents = 1200 * Math.log2(freq / refFreq);
    return { noteName, cents };
  }

  function detectPitchFromMic() {
    if (!analyser || !timeData) return null;

    analyser.getFloatTimeDomainData(timeData);
    const freq = autoCorrelate(timeData, audioContext.sampleRate);
    if (freq <= 0 || !Number.isFinite(freq)) return null;
    if (freq < 20 || freq > 4000) return null; // broader range, more responsive

    return frequencyToNoteData(freq);
  }

  function updateMetronomeFromSlider() {
    if (!metronomeSlider || !metronomeBpmLabel) return;
    const bpm = Number(metronomeSlider.value || 67);
    metronomeBpmLabel.textContent = bpm.toString();

    if (metronomeAudioCtx && metronomeGain) {
      restartMetronomeTimer(bpm);
    }

    if (metronomeEasterEgg) {
      if (bpm === 911) {
        metronomeEasterEgg.classList.add('metronome-easter-egg--visible');
        metronomeEasterEgg.setAttribute('aria-hidden', 'false');
      } else {
        metronomeEasterEgg.classList.remove('metronome-easter-egg--visible');
        metronomeEasterEgg.setAttribute('aria-hidden', 'true');
      }
    }

    if (titleEl) {
      if (bpm === 911) {
        titleEl.textContent = 'Erikan tuner';
      } else {
        titleEl.textContent = defaultTitleText || 'Varshil Tuner';
      }
    }
  }

  function updateArnavLabel(offset) {
    if (!arnavNameEl) return;
    const abs = Math.abs(offset);
    if (abs <= 10) {
      arnavNameEl.innerHTML = 'Arnav <span class="name-suffix name-suffix--ummadi">Ummadi</span>';
      if (arnavFace) {
        arnavFace.classList.add('arnav-ummadi');
        arnavFace.classList.remove('arnav-raj');
      }
    } else {
      arnavNameEl.innerHTML = 'Arnav <span class="name-suffix name-suffix--raj">Raj</span>';
      if (arnavFace) {
        arnavFace.classList.add('arnav-raj');
        arnavFace.classList.remove('arnav-ummadi');
      }
    }
  }

  function updateFromSlider() {
    const offset = Number(slider.value || 0);
    valueLabel.textContent = offset.toString();
    amplitude = mapOffsetToAmplitude(offset);
    const intensity = classifyIntensity(offset);

    friends.forEach((friend) => {
      friend.setAttribute('data-intensity', intensity);
    });

    updateArnavLabel(offset);
  }

  slider.addEventListener('input', updateFromSlider);
  updateFromSlider();
  createRithikSymbols();

  if (metronomeSlider) {
    metronomeSlider.addEventListener('input', () => {
      ensureMetronomeAudioContext();
      updateMetronomeFromSlider();
    });
    updateMetronomeFromSlider();
  }

  if (metronomeVolumeSlider) {
    metronomeVolumeSlider.addEventListener('input', () => {
      if (!metronomeGain) return;
      const vol = Number(metronomeVolumeSlider.value || 0) / 100;
      metronomeGain.gain.value = vol;
    });
  }

  async function enableMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (micStatus) {
        micStatus.textContent = 'Microphone not supported in this browser.';
      }
      return;
    }

    if (micEnabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      timeData = new Float32Array(analyser.fftSize);

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      micEnabled = true;
      if (micStatus) {
        micStatus.textContent = 'Listening… play a note near your mic';
      }
      if (micToggle) {
        micToggle.textContent = 'Microphone on';
      }
    } catch (err) {
      if (micStatus) {
        micStatus.textContent = 'Microphone permission denied or unavailable.';
      }
    }
  }

  if (micToggle) {
    micToggle.addEventListener('click', () => {
      enableMicrophone();
    });
  }

  function handleDeviceOrientation(event) {
    if (!metronomeSlider) return;
    const { gamma } = event; // left-right tilt in degrees when device is upright
    if (gamma == null) return;

    const minAngle = -45; // strong left tilt
    const maxAngle = 45; // strong right tilt
    const clampedGamma = Math.max(minAngle, Math.min(maxAngle, gamma));
    let t = (clampedGamma - minAngle) / (maxAngle - minAngle); // 0..1

    const minBpm = 67;
    const maxBpm = 911;
    const bpm = minBpm + t * (maxBpm - minBpm);
    metronomeSlider.value = Math.round(bpm).toString();
    updateMetronomeFromSlider();
  }

  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
  }

  // Simple wiggle loop using JS-driven transforms so amplitude can change smoothly
  function tick() {
    const now = performance.now();

    friends.forEach((friend, index) => {
      const face = friend.querySelector('.face');
      if (!face) return;

      // Slightly different phase per friend so they don't sync perfectly
      const phase = now / 80 + index * 20;
      const wobbleX = Math.sin(phase) * amplitude * 1.7;
      const wobbleY = Math.cos(phase * 1.35) * amplitude * 1.1;
      const rotate = Math.sin(phase * 1.7) * (amplitude * 0.9);

      face.style.transform = `translate(${wobbleX.toFixed(2)}px, ${wobbleY.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg)`;
    });

    if (micEnabled && audioContext && analyser && timeData) {
      const noteData = detectPitchFromMic();
      if (noteData) {
        const { noteName, cents } = noteData;
        const clampedCents = Math.max(-50, Math.min(50, cents));
        slider.value = clampedCents.toFixed(0);
        updateFromSlider();
        if (micStatus) {
          micStatus.textContent = `${noteName} (${cents.toFixed(1)} cents)`;
        }
      }
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
});

