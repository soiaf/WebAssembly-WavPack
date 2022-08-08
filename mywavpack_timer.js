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

     fileElem.value = null; // so we can reload the same file is needed (otherwise change event may not be trigerred)
   
     playbackStatus = 0;
   
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

     var mytextarea = document.getElementById('mytextarea');
     mytextarea.innerHTML = "<br />";

     var startTime = performance.now();

     decodedamount = 1; // just so we call our main loop at least once
     decodedsamples = 0;

     while(decodedamount>0)
     {
   
     decodedamount = Module.ccall(
      "DecodeWavPackBlock",
      "number",
      ["number", "number", "number"],
      [2, 2, arrayPointer]
    );

    let output_array = new Int32Array(Module.HEAP32.buffer, arrayPointer, 4096);
    decodedsamples = decodedsamples + decodedamount;
     }

     var endTime = performance.now();

     console.log("It took " + (endTime-startTime) + " milliseconds to decode the file");
     console.log("We decoded " + decodedsamples + " samples");

     mytextarea.innerHTML += "It took " + (endTime-startTime) + " milliseconds to decode the file<br />";
     mytextarea.innerHTML += "We decoded " + decodedsamples + " samples"
  };

  
}


