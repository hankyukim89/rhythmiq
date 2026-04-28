const fs = require('fs');
const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <body>
    <div id="notation-container"></div>
    <div id="vexflow-output"></div>
    <canvas id="interaction-canvas" width="800" height="200"></canvas>
    <div class="canvas-wrapper"></div>
    <button id="btn-play" class="btn-play"></button>
    <button id="btn-clear"></button>
    <input id="cb-metronome" type="checkbox">
    <input id="cb-countin" type="checkbox">
    <input id="cb-guides" type="checkbox">
    <input id="input-bpm" type="number">
    <input id="input-bars" type="number">
    <button id="btn-dot"></button>
    <button id="btn-ddot"></button>
    <button id="btn-triplet"></button>
    <button id="btn-tie"></button>
  </body>
</html>`, { runScripts: "dangerously" });

const window = dom.window;
global.window = window;
global.document = window.document;

// Mock canvas API
const canvas = document.getElementById('interaction-canvas');
canvas.getContext = () => ({
  clearRect: () => {},
  setTransform: () => {},
  scale: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fillRect: () => {},
  strokeRect: () => {},
  setLineDash: () => {},
});
window.devicePixelRatio = 1;
window.HTMLCanvasElement = window.HTMLCanvasElement;

const VF = require('vexflow').Flow;
window.Vex = { Flow: VF };

const scriptCode = fs.readFileSync('script.js', 'utf-8');
const scriptEl = window.document.createElement('script');
scriptEl.textContent = scriptCode;
window.document.body.appendChild(scriptEl);

try {
  const state = window.state || window.eval('state');
  const render = window.render || window.eval('render');
  state.bars = 1;
  state.notes = [{
    id: Date.now(),
    startBeat: 0,
    type: 'note',
    val: 1, // quarter note
    dot: 1, // dotted
    triplet: false,
    tie: false
  }];
  render();
  console.log("SUCCESS");
} catch (e) {
  console.error("CRASH:", e);
}
