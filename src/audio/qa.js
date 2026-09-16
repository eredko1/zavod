// QA helpers: WAV encoding, loudness/peak/DC analysis, waveform+spectrogram PNG rendering (canvas, own FFT).
// Owned by: AUDIO agent. Only used by qaRender/qaSpectrogram; never in the hot path.

export function encodeWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, d[c][i])); dv.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
  let bin = ''; const u8 = new Uint8Array(ab);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}

const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9));

export function analyze(buf, { steady = false } = {}) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  let peak = 0, dcMax = 0, sumsq = 0;
  for (let c = 0; c < ch; c++) { let m = 0; for (let i = 0; i < n; i++) { const a = Math.abs(d[c][i]); if (a > peak) peak = a; m += d[c][i]; sumsq += d[c][i] * d[c][i]; } m /= n; if (Math.abs(m) > dcMax) dcMax = Math.abs(m); }
  // mono mix for windowed measures
  const mono = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += d[c][i]; mono[i] = s / ch; }
  // active region (> -60 dBFS)
  const thr = Math.pow(10, -60 / 20); let first = -1, last = -1;
  for (let i = 0; i < n; i++) if (Math.abs(mono[i]) > thr) { if (first < 0) first = i; last = i; }
  let rmsActive = 0; if (first >= 0) { let s = 0; for (let i = first; i <= last; i++) s += mono[i] * mono[i]; rmsActive = Math.sqrt(s / (last - first + 1)); }
  // max short-term RMS over 100 ms window (hop 5 ms)
  const w = Math.floor(sr * 0.1), hop = Math.floor(sr * 0.005); let rms100 = 0;
  for (let s0 = 0; s0 + w <= n; s0 += hop) { let s = 0; for (let i = s0; i < s0 + w; i++) s += mono[i] * mono[i]; const r = Math.sqrt(s / w); if (r > rms100) rms100 = r; }
  // boundary levels: first 1 ms and last 5 ms (clicks would show as energy right at the edges)
  const lvl = (a, b) => { let m = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) m = Math.max(m, Math.abs(mono[i])); return m; };
  const startLevel = lvl(0, Math.floor(sr * 0.001)), endLevel = lvl(n - Math.floor(sr * 0.005), n);
  // clipping: consecutive samples ≥ 0.98
  let clipRuns = 0, run = 0; for (let i = 0; i < n; i++) { if (Math.abs(mono[i]) >= 0.98) { run++; if (run === 3) clipRuns++; } else run = 0; }
  // crest / duration
  return {
    duration: +(n / sr).toFixed(3), sampleRate: sr, channels: ch,
    peak: +peak.toFixed(4), peakDb: +dB(peak).toFixed(1),
    rmsDb: +dB(Math.sqrt(sumsq / (n * ch))).toFixed(1), rmsActiveDb: +dB(rmsActive).toFixed(1), rms100Db: +dB(rms100).toFixed(1),
    dc: +dcMax.toFixed(5), dcDb: +dB(dcMax).toFixed(1),
    activeStart: first < 0 ? null : +(first / sr).toFixed(3), activeEnd: last < 0 ? null : +(last / sr).toFixed(3),
    startLevelDb: +dB(startLevel).toFixed(1), endLevelDb: +dB(endLevel).toFixed(1),
    clipRuns, steady,
    ok: peak < 0.98 && dcMax < 0.01 && startLevel < 0.01 && (steady || endLevel < 0.01) && clipRuns === 0,
  };
}

// ---- FFT (iterative radix-2, real input)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function color(t) { // black → purple → red → orange → yellow → white
  t = Math.max(0, Math.min(1, t));
  const r = Math.min(1, t * 2.2), g = Math.max(0, Math.min(1, t * 2.4 - 0.9)), b = t < 0.4 ? t * 1.6 : Math.max(0, (t - 0.85) * 6);
  return `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
}

export function spectrogramPNG(buf, name, stats, { width = 1000, waveH = 140, specH = 330, fmin = 40, fmax = 20000 } = {}) {
  const n = buf.length, sr = buf.sampleRate, ch = buf.numberOfChannels;
  const mono = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  const pad = 48, top = 26, W = width + pad + 12, H = top + waveH + 8 + specH + 30;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#0b0e12'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e8eef5'; g.font = '13px ui-monospace, Menlo, monospace';
  g.fillText(`${name}  ${buf.duration.toFixed(2)} s  peak ${stats.peakDb} dBFS  RMS100 ${stats.rms100Db}  RMSactive ${stats.rmsActiveDb}  DC ${stats.dcDb}  start ${stats.startLevelDb}  end ${stats.endLevelDb}  clip ${stats.clipRuns}  ${stats.ok ? 'OK' : 'CHECK'}`, pad, 17);
  // waveform (min/max per column)
  const wy = top, wc = wy + waveH / 2;
  g.fillStyle = '#141a22'; g.fillRect(pad, wy, width, waveH);
  g.strokeStyle = '#ff3b3b'; g.beginPath(); g.moveTo(pad, wc - 0.98 * waveH / 2); g.lineTo(pad + width, wc - 0.98 * waveH / 2); g.moveTo(pad, wc + 0.98 * waveH / 2); g.lineTo(pad + width, wc + 0.98 * waveH / 2); g.stroke();
  g.strokeStyle = '#2a3441'; g.beginPath(); g.moveTo(pad, wc); g.lineTo(pad + width, wc); g.stroke();
  g.strokeStyle = '#6fd3ff'; g.beginPath();
  for (let x = 0; x < width; x++) {
    const a = Math.floor(x * n / width), b = Math.max(a + 1, Math.floor((x + 1) * n / width));
    let mn = 1, mx = -1; for (let i = a; i < b; i++) { if (mono[i] < mn) mn = mono[i]; if (mono[i] > mx) mx = mono[i]; }
    g.moveTo(pad + x + 0.5, wc - mx * waveH / 2); g.lineTo(pad + x + 0.5, wc - mn * waveH / 2 + 0.5);
  }
  g.stroke();
  g.fillStyle = '#8fa3b8'; g.font = '10px ui-monospace, Menlo, monospace'; g.fillText('+1', 4, wy + 10); g.fillText('-1', 4, wy + waveH - 2); g.fillText('0', 4, wc + 3);
  // spectrogram
  const N = 2048, half = N / 2, hop = Math.max(64, Math.floor(n / width));
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const sy = wy + waveH + 8; const img = g.createImageData(width, specH); const px = img.data;
  const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(half);
  const lf0 = Math.log(fmin), lf1 = Math.log(fmax);
  for (let x = 0; x < width; x++) {
    const s0 = Math.floor(x * (n - N) / Math.max(1, width - 1));
    for (let i = 0; i < N; i++) { const k = s0 + i; re[i] = k < n && k >= 0 ? mono[k] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < half; k++) mag[k] = 20 * Math.log10(Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (N / 4) + 1e-9);
    for (let y = 0; y < specH; y++) {
      const f1 = Math.exp(lf0 + (lf1 - lf0) * (1 - y / specH)), f0 = Math.exp(lf0 + (lf1 - lf0) * (1 - (y + 1) / specH));
      let k0 = Math.floor(f0 * N / sr), k1 = Math.ceil(f1 * N / sr); if (k1 <= k0) k1 = k0 + 1; k0 = Math.max(0, Math.min(half - 1, k0)); k1 = Math.max(k0 + 1, Math.min(half, k1));
      let m = -200; for (let k = k0; k < k1; k++) if (mag[k] > m) m = mag[k];
      const t = (m + 96) / 96;
      const c = color(t); const o = (y * width + x) * 4;
      const rgb = c.slice(4, -1).split(','); px[o] = +rgb[0]; px[o + 1] = +rgb[1]; px[o + 2] = +rgb[2]; px[o + 3] = 255;
    }
  }
  g.putImageData(img, pad, sy);
  // axes
  g.fillStyle = '#8fa3b8'; g.font = '10px ui-monospace, Menlo, monospace';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const y = sy + specH * (1 - (Math.log(f) - lf0) / (lf1 - lf0));
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 4, y + 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(pad, y, width, 1); g.fillStyle = '#8fa3b8';
  }
  const ticks = buf.duration <= 1 ? 0.1 : buf.duration <= 4 ? 0.5 : 1;
  for (let t = 0; t <= buf.duration + 1e-6; t += ticks) { const x = pad + t / buf.duration * width; g.fillText(`${t.toFixed(ticks < 1 ? 1 : 0)}s`, x - 8, sy + specH + 14); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(x, sy, 1, specH); g.fillStyle = '#8fa3b8'; }
  g.fillText('dB scale: -96 (black) … 0 (white); log-frequency 40 Hz – 20 kHz; window 2048 Hann', pad, H - 4);
  return cv.toDataURL('image/png');
}
