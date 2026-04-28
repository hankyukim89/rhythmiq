const { JSDOM } = require("jsdom");
const dom = new JSDOM('<!DOCTYPE html><div id="vexflow-output"></div>');
global.document = dom.window.document;
global.window = dom.window;
const VF = require('vexflow').Flow;

const vfOutput = document.getElementById('vexflow-output');
const renderer = new VF.Renderer(vfOutput, VF.Renderer.Backends.SVG);
renderer.resize(800, 200);
const context = renderer.getContext();

const stave = new VF.Stave(10, 10, 200);
stave.addClef("treble");
stave.setContext(context).draw();

const note = new VF.StaveNote({ keys: ["b/4"], duration: "qd" });
VF.Dot.buildAndAttach([note], { all: true });

note.setStave(stave);
const tc = new VF.TickContext();
tc.addTickable(note);
tc.preFormat();
tc.setX(50);
note.setTickContext(tc);

// CHECK IF YS ARE CALCULATED
console.log("ys length:", note.ys ? note.ys.length : "undefined");

try {
  note.setContext(context).draw();
  console.log("DRAW SUCCESS");
} catch (e) {
  console.log("DRAW CRASH", e.message);
}
