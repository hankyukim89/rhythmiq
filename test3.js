const fs = require('fs');
const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <body>
    <div id="vexflow-output"></div>
    <canvas id="interaction-canvas" width="800" height="200"></canvas>
  </body>
</html>`, { runScripts: "dangerously" });

const window = dom.window;
global.window = window;
global.document = window.document;
global.HTMLCanvasElement = window.HTMLCanvasElement;

// Load vexflow
const VF = require('vexflow').Flow;
window.Vex = { Flow: VF };

// Load script.js
const scriptCode = fs.readFileSync('script.js', 'utf-8');
const scriptEl = window.document.createElement('script');
scriptEl.textContent = scriptCode.replace(/window\.addEventListener/g, '//')
                                 .replace(/requestAnimationFrame/g, 'function(){}')
                                 .replace(/document\.querySelectorAll/g, 'function(){return []}')
                                 .replace(/document\.getElementById/g, 'function(id){return window.document.getElementById(id) || {addEventListener: function(){}, classList: {toggle: function(){}, remove: function(){}, replace: function(){}, add: function(){}}}}')
                                 ;
window.document.body.appendChild(scriptEl);

try {
  window.state.bars = 1;
  window.state.notes = [{
    id: Date.now(),
    startBeat: 0,
    type: 'note',
    val: 1, // quarter note
    dot: 1, // dotted
    triplet: false,
    tie: false
  }];
  window.render();
  console.log("SUCCESS");
} catch (e) {
  console.error("CRASH:", e);
}
