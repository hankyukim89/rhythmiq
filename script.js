const VF = Vex.Flow;

const state = {
  mode: 'note',
  val: 4,
  dot: 0,
  triplet: false,
  tie: false,
  bpm: 120,
  bars: 4,
  beatsPerBar: 4,
  notes: [],
  hoverBeat: -1,
  playing: false,
  playheadBeat: 0,
  metronome: false,
  countIn: false,
  isCountingIn: false
};

const vfOutput = document.getElementById('vexflow-output');
const canvas = document.getElementById('interaction-canvas');
const ctx = canvas.getContext('2d');

let audioCtx;
let startTime;
let animationFrameId;
let activeNodes = [];

// Precision Layout Constants
const STAFF_PADDING_LEFT = 20;
const FIRST_BAR_MODIFIER_WIDTH = 70; // Space for Treble Clef and Time Signature
const BAR_START_PADDING = 20;        // Space after barline before first note
const PIXELS_PER_BEAT = 100;
const STAFF_HEIGHT = 160;
const PIANO_ROLL_HEIGHT = 24;

function init() {
  setupEventListeners();
  resizeAndRender();
  window.addEventListener('resize', resizeAndRender);
}

function getBarWidth(b) {
  const baseW = BAR_START_PADDING + (state.beatsPerBar * PIXELS_PER_BEAT);
  return b === 0 ? baseW + FIRST_BAR_MODIFIER_WIDTH : baseW;
}

function resizeAndRender() {
  let totalWidth = STAFF_PADDING_LEFT;
  for (let b = 0; b < state.bars; b++) totalWidth += getBarWidth(b);
  totalWidth += 40; // right padding

  const height = STAFF_HEIGHT + PIANO_ROLL_HEIGHT + 30;

  document.getElementById('notation-container').style.width = totalWidth + 'px';
  document.getElementById('notation-container').style.height = height + 'px';

  canvas.width = totalWidth * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = totalWidth + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  render();
}

function setupEventListeners() {
  document.querySelectorAll('.btn[data-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn[data-type]').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.mode = e.currentTarget.dataset.type;
      state.val = parseFloat(e.currentTarget.dataset.val);
    });
  });

  const toggleBtn = (id, prop, exclusiveList = []) => {
    document.getElementById(id).addEventListener('click', (e) => {
      state[prop] = !state[prop];
      e.currentTarget.classList.toggle('active', state[prop]);
      if (state[prop]) {
        exclusiveList.forEach(ex => {
          state[ex.prop] = false;
          document.getElementById(ex.id).classList.remove('active');
        });
      }
    });
  };

  toggleBtn('btn-dot', 'dot', [{ id: 'btn-ddot', prop: 'ddot' }]);
  document.getElementById('btn-ddot').addEventListener('click', (e) => {
    let active = e.currentTarget.classList.toggle('active');
    state.dot = active ? 2 : 0;
    if (active) document.getElementById('btn-dot').classList.remove('active');
  });

  document.getElementById('btn-dot').addEventListener('click', (e) => {
    let active = e.currentTarget.classList.toggle('active');
    state.dot = active ? 1 : 0;
    if (active) document.getElementById('btn-ddot').classList.remove('active');
  });

  document.getElementById('btn-triplet').addEventListener('click', (e) => {
    state.triplet = !state.triplet;
    e.currentTarget.classList.toggle('active', state.triplet);
  });

  document.getElementById('btn-tie').addEventListener('click', (e) => {
    state.tie = !state.tie;
    e.currentTarget.classList.toggle('active', state.tie);
  });



  document.getElementById('cb-metronome').addEventListener('change', (e) => {
    state.metronome = e.target.checked;
  });

  document.getElementById('cb-countin').addEventListener('change', (e) => {
    state.countIn = e.target.checked;
  });

  document.getElementById('input-bpm').addEventListener('change', (e) => {
    state.bpm = parseInt(e.target.value) || 120;
  });

  document.getElementById('input-bars').addEventListener('change', (e) => {
    state.bars = parseInt(e.target.value) || 4;
    resizeAndRender();
  });

  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-clear').addEventListener('click', () => { state.notes = []; render(); });

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', () => { state.hoverBeat = -1; render(); });
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('contextmenu', handleRightClick);
}

function getEffectiveDuration(val, dot, triplet) {
  let dur = val;
  if (dot === 1) dur *= 1.5;
  if (dot === 2) dur *= 1.75;
  if (triplet) dur = dur * 2 / 3;
  return dur;
}

const EXTRA_END_PADDING = 0;

function getXFromBeat(beat) {
  if (barBounds.length === 0) return -1;
  const barIdx = Math.floor(beat / state.beatsPerBar);
  const beatInBar = beat % state.beatsPerBar;

  if (barIdx >= barBounds.length) {
    const last = barBounds[barBounds.length - 1];
    return last.endX - EXTRA_END_PADDING;
  }

  const bounds = barBounds[barIdx];
  const usableWidth = (bounds.endX - bounds.startX) - EXTRA_END_PADDING;
  return bounds.startX + (beatInBar / state.beatsPerBar) * usableWidth;
}

function getBeatFromX(x) {
  if (barBounds.length === 0) return -1;

  for (let b = 0; b < barBounds.length; b++) {
    const bounds = barBounds[b];
    const usableWidth = (bounds.endX - bounds.startX) - EXTRA_END_PADDING;

    // Create snapping area around the bar's usable bounds
    if (x >= bounds.startX - 20 && x <= bounds.startX + usableWidth + 20) {
      const constrainedX = Math.max(bounds.startX, Math.min(x, bounds.startX + usableWidth));
      const rawBeat = ((constrainedX - bounds.startX) / usableWidth) * state.beatsPerBar;

      const snap = getEffectiveDuration(state.val, state.dot, state.triplet);
      const snapedBeat = Math.floor(rawBeat / snap) * snap;
      return (b * state.beatsPerBar) + Math.max(0, Math.min(snapedBeat, state.beatsPerBar));
    }
  }
  return -1;
}

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let beat = getBeatFromX(x);
  if (beat < 0) { state.hoverBeat = -1; render(); return; }

  const dur = getEffectiveDuration(state.val, state.dot, state.triplet);
  if (beat + dur > state.bars * state.beatsPerBar) {
    beat = state.bars * state.beatsPerBar - dur;
  }
  if (state.hoverBeat !== beat) {
    state.hoverBeat = beat;
    render();
  }
}

function handleClick(e) {
  if (state.playing || state.hoverBeat < 0) return;
  const dur = getEffectiveDuration(state.val, state.dot, state.triplet);
  const endBeat = state.hoverBeat + dur;

  const exactMatchIdx = state.notes.findIndex(n => Math.abs(n.startBeat - state.hoverBeat) < 0.001);
  if (exactMatchIdx >= 0) {
    state.notes.splice(exactMatchIdx, 1);
    render();
    return;
  }

  const collision = state.notes.some(n => {
    const nEnd = n.startBeat + getEffectiveDuration(n.val, n.dot, n.triplet);
    return Math.max(state.hoverBeat, n.startBeat) < Math.min(endBeat, nEnd) - 0.001;
  });

  if (!collision) {
    state.notes.push({
      id: Date.now(),
      startBeat: state.hoverBeat,
      type: state.mode,
      val: state.val,
      dot: state.dot,
      triplet: state.triplet,
      tie: state.tie
    });
    state.notes.sort((a, b) => a.startBeat - b.startBeat);
    render();
  }
}

function handleRightClick(e) {
  e.preventDefault();
  if (state.playing) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const beat = getBeatFromX(x);

  const idx = state.notes.findIndex(n => {
    const nEnd = n.startBeat + getEffectiveDuration(n.val, n.dot, n.triplet);
    return beat >= n.startBeat && beat <= nEnd;
  });

  if (idx >= 0) {
    state.notes.splice(idx, 1);
    render();
  }
}

function valToVexDur(val, type) {
  let v = "q";
  if (val >= 4) v = "w";
  else if (val >= 2) v = "h";
  else if (val >= 1) v = "q";
  else if (val >= 0.5) v = "8";
  else if (val >= 0.25) v = "16";

  return v + (type === 'rest' ? 'r' : '');
}

function render() {
  vfOutput.innerHTML = '';
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  const renderer = new VF.Renderer(vfOutput, VF.Renderer.Backends.SVG);
  renderer.resize(w, h);
  const context = renderer.getContext();

  barBounds = [];
  const allRenderedNotes = [];

  let currentStaveX = STAFF_PADDING_LEFT;
  const staves = [];
  for (let b = 0; b < state.bars; b++) {
    const staveWidth = getBarWidth(b);
    const stave = new VF.Stave(currentStaveX, 10, staveWidth);
    if (b === 0) stave.addClef("treble").addTimeSignature(state.beatsPerBar + "/4");
    stave.setContext(context).draw();
    staves.push(stave);
    currentStaveX += staveWidth;
  }

  for (let b = 0; b < state.bars; b++) {
    barBounds.push({
      startX: staves[b].getNoteStartX(),
      endX: b < state.bars - 1 ? staves[b+1].getNoteStartX() : staves[b].getNoteEndX()
    });
  }

  for (let b = 0; b < state.bars; b++) {
    const stave = staves[b];
    const barStartBeat = b * state.beatsPerBar;
    const barEndBeat = barStartBeat + state.beatsPerBar;
    const barNotes = state.notes.filter(n => n.startBeat >= barStartBeat && n.startBeat < barEndBeat);

    const usableWidth = (barBounds[b].endX - barBounds[b].startX) - EXTRA_END_PADDING;

    let vexNotes = [];
    let currentBeatInBar = 0;

    let i = 0;
    while (currentBeatInBar < state.beatsPerBar && i <= barNotes.length) {
      if (i < barNotes.length) {
        const n = barNotes[i];
        const noteStartBeatInBar = n.startBeat - barStartBeat;

        if (currentBeatInBar < noteStartBeatInBar - 0.001) {
          let gap = noteStartBeatInBar - currentBeatInBar;
          while (gap > 0.01) {
            let fillVal = gap >= 4 ? 4 : gap >= 2 ? 2 : gap >= 1 ? 1 : gap >= 0.5 ? 0.5 : 0.25;
            const rest = new VF.StaveNote({ keys: ["b/4"], duration: valToVexDur(fillVal, 'rest') }).setStyle({ fillStyle: '#cbd5e1', strokeStyle: '#cbd5e1' });

            const tickContext = new VF.TickContext();
            tickContext.setX((currentBeatInBar / state.beatsPerBar) * usableWidth);
            tickContext.addTickable(rest);
            tickContext.preFormat();
            rest.setStave(stave);
            rest.setTickContext(tickContext);
            vexNotes.push(rest);

            gap -= fillVal;
            currentBeatInBar += fillVal;
          }
        }

        const color = n.type === 'rest' ? '#64748b' : '#0f172a';
        let staveNote = new VF.StaveNote({
          keys: [n.type === 'rest' ? "b/4" : "b/4"],
          duration: valToVexDur(n.val, n.type)
        }).setStyle({ fillStyle: color, strokeStyle: color });

        if (n.dot > 0) VF.Dot.buildAndAttach([staveNote], { all: true });
        if (n.dot > 1) VF.Dot.buildAndAttach([staveNote], { all: true });

        const tickContext = new VF.TickContext();
        tickContext.setX((currentBeatInBar / state.beatsPerBar) * usableWidth);
        tickContext.addTickable(staveNote);
        tickContext.preFormat();
        staveNote.setStave(stave);
        staveNote.setTickContext(tickContext);

        vexNotes.push(staveNote);
        allRenderedNotes.push({ stateNote: n, vexNote: staveNote });

        currentBeatInBar += getEffectiveDuration(n.val, n.dot, n.triplet);
        i++;
      } else {
        let gap = state.beatsPerBar - currentBeatInBar;
        if (gap > 0.001) {
          while (gap > 0.01) {
            let fillVal = gap >= 4 ? 4 : gap >= 2 ? 2 : gap >= 1 ? 1 : gap >= 0.5 ? 0.5 : 0.25;
            const rest = new VF.StaveNote({ keys: ["b/4"], duration: valToVexDur(fillVal, 'rest') }).setStyle({ fillStyle: '#cbd5e1', strokeStyle: '#cbd5e1' });

            const tickContext = new VF.TickContext();
            tickContext.setX((currentBeatInBar / state.beatsPerBar) * usableWidth);
            tickContext.addTickable(rest);
            tickContext.preFormat();
            rest.setStave(stave);
            rest.setTickContext(tickContext);
            vexNotes.push(rest);

            gap -= fillVal;
            currentBeatInBar += fillVal;
          }
        }
        break;
      }
    }

    if (vexNotes.length > 0) {
      const beams = VF.Beam.generateBeams(vexNotes.filter(n => !n.isRest()));
      vexNotes.forEach(note => note.setContext(context).draw());
      beams.forEach(beam => beam.setContext(context).draw());
    }
  }

  // Draw Ties
  const ties = [];
  for (let i = 0; i < allRenderedNotes.length - 1; i++) {
    const current = allRenderedNotes[i];
    if (current.stateNote.tie && current.stateNote.type !== 'rest') {
      const next = allRenderedNotes[i + 1];
      if (next.stateNote.type !== 'rest') {
        ties.push(new VF.StaveTie({
          first_note: current.vexNote,
          last_note: next.vexNote,
          first_indices: [0],
          last_indices: [0]
        }));
      }
    }
  }
  ties.forEach(t => t.setContext(context).draw());

  // Draw Piano Roll Track Background
  const rollY = 130;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;

  // Continuous Track background
  if (barBounds.length > 0) {
    const firstBar = barBounds[0];
    const lastBar = barBounds[state.bars - 1];
    if (firstBar && lastBar) {
      const startX = firstBar.startX;
      const endX = lastBar.endX - EXTRA_END_PADDING;
      ctx.strokeRect(startX, rollY, endX - startX, PIANO_ROLL_HEIGHT);
    }
  }

  // Grid Lines mapped EXACTLY to VexFlow bounds
  ctx.beginPath();
  for (let b = 0; b < state.bars; b++) {
    if (!barBounds[b]) continue;
    const bounds = barBounds[b];
    const usableWidth = (bounds.endX - bounds.startX) - EXTRA_END_PADDING;

    // Draw beat lines inside the bar
    for (let beat = 0; beat <= state.beatsPerBar; beat++) {
      const x = bounds.startX + (beat / state.beatsPerBar) * usableWidth;
      ctx.moveTo(x, rollY);
      ctx.lineTo(x, rollY + PIANO_ROLL_HEIGHT);
    }
  }
  ctx.stroke();

  // Draw filled blocks matching strict DAW grid
  let noteIdx = 0;
  while (noteIdx < state.notes.length) {
    const note = state.notes[noteIdx];
    let x = getXFromBeat(note.startBeat);

    let totalDur = getEffectiveDuration(note.val, note.dot, note.triplet);
    let j = noteIdx;

    while (state.notes[j].tie && j + 1 < state.notes.length) {
      j++;
      if (state.notes[j].type !== 'rest') {
        totalDur += getEffectiveDuration(state.notes[j].val, state.notes[j].dot, state.notes[j].triplet);
      } else {
        break;
      }
    }

    const startBarIdx = Math.floor(note.startBeat / state.beatsPerBar);
    const endBarIdx = Math.floor((note.startBeat + totalDur - 0.001) / state.beatsPerBar);

    let blockWidth;
    if (startBarIdx === endBarIdx && barBounds[startBarIdx]) {
      const usableWidth = (barBounds[startBarIdx].endX - barBounds[startBarIdx].startX) - EXTRA_END_PADDING;
      blockWidth = (totalDur / state.beatsPerBar) * usableWidth;

      // Connect the block across the barline gap if it reaches the end of the measure
      if (note.startBeat + totalDur === (startBarIdx + 1) * state.beatsPerBar && startBarIdx + 1 < state.bars) {
        blockWidth = barBounds[startBarIdx + 1].startX - x;
      }

    } else {
      const endX = getXFromBeat(note.startBeat + totalDur);
      blockWidth = endX - x;
    }

    const color = note.type === 'rest' ? '#94a3b8' : '#3b82f6';

    ctx.fillStyle = color;
    ctx.fillRect(x, rollY, blockWidth, PIANO_ROLL_HEIGHT);

    noteIdx = j + 1;
  }

  // Draw Ghost Hover
  if (state.hoverBeat >= 0 && !state.playing) {
    const x = getXFromBeat(state.hoverBeat);
    const dur = getEffectiveDuration(state.val, state.dot, state.triplet);

    const startBarIdx = Math.floor(state.hoverBeat / state.beatsPerBar);
    const endBarIdx = Math.floor((state.hoverBeat + dur - 0.001) / state.beatsPerBar);

    let blockWidth;
    if (startBarIdx === endBarIdx && barBounds[startBarIdx]) {
      const usableWidth = (barBounds[startBarIdx].endX - barBounds[startBarIdx].startX) - EXTRA_END_PADDING;
      blockWidth = (dur / state.beatsPerBar) * usableWidth;
    } else {
      const endX = getXFromBeat(state.hoverBeat + dur);
      blockWidth = endX - x;
    }

    ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.fillRect(x, rollY, blockWidth, PIANO_ROLL_HEIGHT);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
    ctx.fillRect(x, 10, blockWidth, 120);
  }

  // Draw Playhead
  if (state.playing) {
    const px = getXFromBeat(state.playheadBeat);
    ctx.strokeStyle = state.isCountingIn ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 10); ctx.lineTo(px, rollY + PIANO_ROLL_HEIGHT + 10); ctx.stroke();

    if (state.isCountingIn) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillText('Count In...', px + 10, rollY - 10);
    }
  }
}

// Audio Engine
function togglePlay() {
  state.playing ? stopPlayback() : startPlayback();
}

function startPlayback() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  state.playing = true;
  document.getElementById('btn-play').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg> Stop';
  document.getElementById('btn-play').classList.replace('btn-play', 'btn-stop');

  const beatDuration = 60 / state.bpm;
  activeNodes = [];

  const countInBeats = state.countIn ? state.beatsPerBar : 0;
  state.isCountingIn = state.countIn;

  startTime = audioCtx.currentTime;
  const playbackStartTime = startTime + (countInBeats * beatDuration);

  // Schedule count-in clicks
  if (state.countIn) {
    for (let b = 0; b < state.beatsPerBar; b++) {
      playClick(startTime + b * beatDuration, b === 0);
    }
  }

  // Schedule metronome clicks
  if (state.metronome) {
    const totalPlaybackBeats = state.bars * state.beatsPerBar;
    for (let b = 0; b < totalPlaybackBeats; b++) {
      playClick(playbackStartTime + b * beatDuration, b % state.beatsPerBar === 0);
    }
  }

  let i = 0;
  while (i < state.notes.length) {
    const note = state.notes[i];
    if (note.type === 'rest') {
      i++;
      continue;
    }

    let totalDur = getEffectiveDuration(note.val, note.dot, note.triplet);
    let j = i;

    while (state.notes[j].tie && j + 1 < state.notes.length) {
      j++;
      if (state.notes[j].type !== 'rest') {
        totalDur += getEffectiveDuration(state.notes[j].val, state.notes[j].dot, state.notes[j].triplet);
      } else {
        break;
      }
    }

    const noteStart = playbackStartTime + (note.startBeat * beatDuration);
    playTone(noteStart, totalDur * beatDuration);

    i = j + 1;
  }

  const totalDuration = (countInBeats + state.bars * state.beatsPerBar) * beatDuration;

  function updatePlayhead() {
    if (!state.playing) return;
    const elapsed = audioCtx.currentTime - startTime;

    if (elapsed < countInBeats * beatDuration) {
      state.isCountingIn = true;
      state.playheadBeat = 0;
    } else {
      state.isCountingIn = false;
      state.playheadBeat = (elapsed - (countInBeats * beatDuration)) / beatDuration;
    }

    if (elapsed >= totalDuration) stopPlayback();
    else {
      render();
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }
  }
  animationFrameId = requestAnimationFrame(updatePlayhead);
}

function stopPlayback() {
  state.playing = false;
  state.playheadBeat = 0;
  state.isCountingIn = false;
  cancelAnimationFrame(animationFrameId);

  activeNodes.forEach(node => {
    try {
      node.stop();
      node.disconnect();
    } catch (e) { }
  });
  activeNodes = [];

  document.getElementById('btn-play').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M 8 5 L 19 12 L 8 19 Z" fill="currentColor"/></svg> Play';
  document.getElementById('btn-play').classList.replace('btn-stop', 'btn-play');
  render();
}

function playClick(time, isAccent) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(isAccent ? 880 : 440, time);

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.3, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 0.05);
  activeNodes.push(osc);
}

function playTone(time, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, time);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.5, time + 0.02);
  gain.gain.setValueAtTime(0.5, time + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + duration);
  activeNodes.push(osc);
}

init();
