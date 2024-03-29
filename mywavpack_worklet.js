const min_sample_duration = 2; // sec
let sample_rate = 44100; // Hz - may be updated once file is loaded

let min_sample_size = 100;

var numChannels = 1;

var decodedamount = 1;
let decodedsamples = 0;

let floatDivisor = 1.0;

let bps = 2;

let playbackStatus = 0; // 0 = normal play, 1 ran out of data, 2 requested to stop

const butOpenFile = document.getElementById("fileloader");
const butStop = document.getElementById("stopplay");
const playbackvolume = document.getElementById("volume");

let messengerWorkletNode;

var arrayPointer;
var context;
var volume = 1;

let fileHandle;

fileSelect.addEventListener("click", function (e) {
  if (fileElem) {
    fileElem.click();
  }
  e.preventDefault(); // prevent navigation to "#"
}, false);

fileElem.addEventListener("change", handleFiles, false);

 function handleFiles() {

  let file = this.files[0];
  let data; 


  var Reader = new FileReader();
  Reader.readAsArrayBuffer(file);
  Reader.onload = async function () {
     data = Reader.result;
     var array = new Uint8Array(data);

     let filename = "input.wv";
     let stream = FS.open(filename, "w+");
     FS.write(stream, array, 0, array.length, 0);
     FS.close(stream);

     fileElem.value = null; // so we can reload the same file is needed (otherwise change event may not be triggered)
   
     playbackStatus = 0;
     decodedsamples = 0;
   
     const bytes_per_element = Module.HEAP32.BYTES_PER_ELEMENT;
   
     if (typeof arrayPointer == "undefined") {
       arrayPointer = Module._malloc(4096 * bytes_per_element);
     }
   
     let musicdata = new Int32Array(4096).fill(0);
     Module.HEAP32.set(musicdata, arrayPointer / bytes_per_element);
   
     // lets initialise the WavPack file so we know its sample rate,
     // number of channels, bytes per sample etc.
   
     Module.ccall("initialiseWavPack", null, ["string"], [filename]);
   
     sample_rate = Module.ccall("GetSampleRate", null, [], []);
     console.log("sample_rate is ", sample_rate);
   
     numChannels = Module.ccall("GetNumChannels", null, [], []);
     console.log("(reduced) number of channels is ", numChannels);
   
     var totalNumSamples = Module.ccall("GetNumSamples", null, [], []);
     console.log("Number of samples is ", totalNumSamples);
   
     min_sample_size = min_sample_duration * sample_rate;
   
     bps = Module.ccall("GetBytesPerSample", null, [], []);
     console.log("bytes per sample is ", bps);
   
     floatDivisor = Math.pow(2, bps * 8 - 1);
   
     context = new AudioContext({
       latencyHint: "interactive",
       sampleRate: sample_rate,
     });
   
     oninput = handleVolumeEvents;
   
     //var aw = await context.audioWorklet.addModule("./messenger-processor.js");
   
     await fetch("messenger-processor.js")
       .then((response) => response.text())
       .then((text) => {
           const blob = new Blob([text], { type: 'application/javascript; charset=utf-8' });
           const objectUrl = URL.createObjectURL(blob);
   
           return context.audioWorklet.addModule(objectUrl)
               .finally(() => URL.revokeObjectURL(objectUrl));
       })
   
     
     var awopt = { outputChannelCount: [numChannels] }; // so we can get stereo output, this is our AudioWorkletNodeOptions
     messengerWorkletNode = new MessengerWorkletNode(context, awopt);
     messengerWorkletNode.connect(context.destination);
  };

  
}


function handleVolumeEvents(evt) {
  const value = evt.target.value;
  volume = +value;
}

butStop.addEventListener("click", async () => {
  playbackStatus = 2; // we have been requested to stop
});

// Extends AudioWorkletNode to simplify the cross-thread message posting.
class MessengerWorkletNode extends AudioWorkletNode {
  constructor(context, awopt) {
    super(context, "messenger-processor", awopt);
    this.counter_ = 0;
    this.port.onmessage = this.handleMessage_.bind(this);
  }

  handleMessage_(event) {
    if(isNaN(volume))
    {
      volume = 1;
    }
    messengerWorkletNode.parameters.get("customVolumeAdjust").value =
      Math.pow(2, bps * 8 - 1) / volume;


    decodedamount = Module.ccall(
      "DecodeWavPackBlock",
      "number",
      ["number", "number", "number"],
      [2, 2, arrayPointer]
    );

    let output_array = new Int32Array(Module.HEAP32.buffer, arrayPointer, 4096);
    decodedsamples = decodedsamples + decodedamount;

    if (decodedamount == 0) {
      // zero out to bytes just to be sure
      for (let i = 0; i < 2048; i++) {
        output_array[i] = 1;
      } 
      playbackStatus = 1;
    }

    // if decoded amount is less than 1024 (and not zero), we fill array with silence/zero
    if (decodedamount < 1024 && decodedamount > 0) {
      for (let i = decodedamount * numChannels; i < 1024 * numChannels; i++) {
        output_array[i] = 1;
      }
      playbackStatus = 1;
    }

    // We use 2048 as we decode 1024 samples and data may be stereo i.e. 2x1024
    const segment = output_array.slice(0, 2049); // 2048 plus 1 for status
    segment[2048] = playbackStatus;

    this.port.postMessage(segment, [segment.buffer]);
  }
}
