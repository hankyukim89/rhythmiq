const { JSDOM } = require("jsdom");
const dom = new JSDOM('<!DOCTYPE html><div id="vexflow-output"></div>');
global.document = dom.window.document;
global.window = dom.window;

const VF = require('vexflow').Flow;
const valToVexDur = (val, type, dot = 0) => {
  let v = "q";
  if (val >= 4) v = "w";
  else if (val >= 2) v = "h";
  else if (val >= 1) v = "q";
  else if (val >= 0.5) v = "8";
  else if (val >= 0.25) v = "16";
  if (dot === 1) v += "d";
  else if (dot === 2) v += "dd";
  return v + (type === 'rest' ? 'r' : '');
};

try {
  const vfOutput = document.getElementById('vexflow-output');
  const renderer = new VF.Renderer(vfOutput, VF.Renderer.Backends.SVG);
  renderer.resize(800, 200);
  const context = renderer.getContext();
  
  const stave = new VF.Stave(10, 10, 200);
  stave.addClef("treble").addTimeSignature("4/4");
  stave.setContext(context).draw();

  const vexNotes = [];
  const note = new VF.StaveNote({ keys: ["b/4"], duration: "qd", stem_direction: -1 });
  VF.Dot.buildAndAttach([note], { all: true });
  
  const tc = new VF.TickContext();
  tc.setX(50);
  tc.addTickable(note);
  tc.preFormat();
  note.setStave(stave);
  note.setTickContext(tc);
  vexNotes.push(note);
  
  const rest1 = new VF.StaveNote({ keys: ["b/4"], duration: "hr" });
  const tc2 = new VF.TickContext(); tc2.addTickable(rest1); tc2.preFormat();
  rest1.setStave(stave); rest1.setTickContext(tc2); vexNotes.push(rest1);
  
  const rest2 = new VF.StaveNote({ keys: ["b/4"], duration: "8r" });
  const tc3 = new VF.TickContext(); tc3.addTickable(rest2); tc3.preFormat();
  rest2.setStave(stave); rest2.setTickContext(tc3); vexNotes.push(rest2);

  const beams = VF.Beam.generateBeams(vexNotes, { groups: [new VF.Fraction(1, 4)], beam_rests: true, beam_middle_only: true });
  
  const validBeams = [];
  beams.forEach(beam => {
    const nonRests = beam.notes.filter(n => !n.isRest());
    if (nonRests.length < 2) {
      beam.notes.forEach(n => {
        if (!n.isRest()) {
          const newNote = new VF.StaveNote({ keys: ["b/4"], duration: "qd", stem_direction: -1 });
          VF.Dot.buildAndAttach([newNote], { all: true });
          const ntc = new VF.TickContext();
          ntc.setX(n.getTickContext().getX());
          ntc.addTickable(newNote);
          ntc.preFormat();
          newNote.setStave(stave);
          newNote.setTickContext(ntc);
          vexNotes[0] = newNote; // Replace
        } else {
          n.setBeam(null);
        }
      });
    } else {
      validBeams.push(beam);
    }
  });

  vexNotes.forEach(n => n.setContext(context).draw());
  validBeams.forEach(b => b.setContext(context).draw());
  console.log("SUCCESS");
} catch (e) {
  console.error("CRASH:", e);
}
