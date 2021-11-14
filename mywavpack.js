const min_sample_duration = 2; // sec
let sample_rate = 44100; // Hz - may be updated once file is loaded
// how much data is needed to play for at least min_sample_duration

let min_sample_size = 100;

var numChannels = 1;

const fetching_interval = 5; // ms

let chunk_size = 2048; // bytes

var decodedamount = 1;

let stopped = false;
let is_reading = false;
let end_of_song_reached = false;
let pcm_buffer_in_use = false;

let floatDivisor = 1.0;


const butOpenFile = document.getElementById("fileloader");
const butStop = document.getElementById("stopplay");
const textArea = document.getElementById("mytextarea");


var arrayPointer;
var ctx;
var gain;

var fetched_data_left  = new Float32Array( 0 );
var fetched_data_right  = new Float32Array( 0 );
// keep it accessible so we can stop() it
let active_node;

let fileHandle;
butOpenFile.addEventListener('click', async () => {
  [fileHandle] = await window.showOpenFilePicker();
  const file = await fileHandle.getFile();
  let data = new Uint8Array(await file.arrayBuffer());
  

  // we are making a copy of the input WavPack file with a known name so
  // the WebAssembly code can load it

  let filename = 'input.wv';
  let stream = FS.open(filename, 'w+');
  FS.write(stream, data, 0, data.length, 0);
  FS.close(stream);

  end_of_song_reached = false;
  stopped = false;
  fetched_data_left  = new Float32Array( 0 );
  fetched_data_right  = new Float32Array( 0 );

  const bytes_per_element = Module.HEAP32.BYTES_PER_ELEMENT;

  if (typeof arrayPointer == 'undefined') {
  arrayPointer = Module._malloc(4096 * bytes_per_element);
  }

  let musicdata = new Int32Array(4096).fill(0);
  Module.HEAP32.set(musicdata,arrayPointer/bytes_per_element);


  // lets initialise the WavPack file so we know its sample rate, 
  // number of channels, bytes per sample etc.

  Module.ccall('initialiseWavPack',null,['string'],[filename]);

  sample_rate = Module.ccall('GetSampleRate',null,[],[]);
  console.log("sample_rate is ", sample_rate);

  numChannels = Module.ccall('GetNumChannels',null,[],[]);
  console.log("(reduced) number of channels is ", numChannels);

  min_sample_size = min_sample_duration * sample_rate;

  let bps = Module.ccall('GetBytesPerSample',null,[],[]);
  console.log("bytes per sample is ", bps);

  floatDivisor = Math.pow(2, ((bps*8)-1));

  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0.01;
  gain.connect( ctx.destination );

  periodicFetch();


});

butStop.addEventListener('click', async () => {

  if(!end_of_song_reached)
  {
    stopped = true;
    if( active_node ) { active_node.stop(0); }
  }
});

function periodicFetch() {

  decodedamount = Module.ccall('DecodeWavPackBlock','number',['number','number','number'],[2,2,arrayPointer]);

  while(pcm_buffer_in_use)
  {
    // wait - this shouldn't be called but have as a sanity check, if we are currently adding PCM (decoded) music
    // data to the AudioBuffer context we don't want to overwrite it
    console.log("~");
  }

  pcm_buffer_in_use = true;

  if(decodedamount!=0)
  {
    let output_array = new Int32Array(Module.HEAP32.buffer, arrayPointer, 4096);

    var floatsLeft = new Float32Array(1024);
    var floatsRight = new Float32Array(1024);

    if(numChannels==2)
    {
      for (var i = 2047; i >= 0; i--) {
        if(i%2 == 0)
          floatsLeft[i/2] = output_array[i] / floatDivisor;
        else
          floatsRight[(i-1)/2] = output_array[i] / floatDivisor;
      }; 
    }
    else
    {
      // mono music (1 channel)
      for (var i = 1023; i >= 0; i--) {
        floatsLeft[i] = output_array[i] / floatDivisor;
      }; 
    }

    fetched_data_left = concatFloat32Arrays( fetched_data_left, floatsLeft );
    if(numChannels==2)
    {
      fetched_data_right = concatFloat32Arrays( fetched_data_right, floatsRight );
    }

  }
  else
  {
    // we decoded zero bytes, so end of song reached 
    // we fill our decoded music buffer (PCM) with zeroes (silence)
    end_of_song_reached = true;
    let buffergap = min_sample_size - fetched_data_left.length;
    var emptyArray = new Float32Array();

    for(var i=0; i<buffergap; i++)
    {
      emptyArray[i] = 0.0;
    }

    fetched_data_left = concatFloat32Arrays( fetched_data_left, emptyArray );
    if(numChannels==2)
    {
      fetched_data_right = concatFloat32Arrays( fetched_data_right, emptyArray );
    }
  }


  pcm_buffer_in_use = false;


  if( !stopped && !end_of_song_reached) {
    // lets load more data (decode more audio from the WavPack file)
    setTimeout( periodicFetch , fetching_interval );
  }


  // if we are not actively reading and have fetched enough
  if( !is_reading && fetched_data_left.length >= min_sample_size ) {
    readingLoop(); // start reading
  }

}

function readingLoop() {
  
  if( stopped  || fetched_data_left.length < min_sample_size ) {
    is_reading = false;
    return;
  }

  addBufferToAudioContext();

}


function addBufferToAudioContext()
{  
  // let the world know we are actively reading
  is_reading = true;

  while(pcm_buffer_in_use)
  {
    // wait, this shouldn't be called, but if we're adding more data to the PCM buffer, don't want
    // to overwrite it
    console.log("-");
  }

  pcm_buffer_in_use = true;

  // create a new AudioBuffer
  const aud_buf = ctx.createBuffer( numChannels, fetched_data_left.length, sample_rate );
  // copy our fetched data to its first channel
  aud_buf.copyToChannel( fetched_data_left, 0 );
  if(numChannels==2)
  {
    aud_buf.copyToChannel( fetched_data_right, 1 );
  }

  // clear the buffered data
  fetched_data_left = new Float32Array( 0 );
  fetched_data_right = new Float32Array( 0 );
  
  // the actual player
  active_node = ctx.createBufferSource();
  active_node.buffer = aud_buf;
  active_node.onended = readingLoop; // callback to readingLoop
  active_node.connect( gain );
  active_node.start( 0 );

  pcm_buffer_in_use = false;
}

function concatFloat32Arrays( arr1, arr2 ) {
  if( !arr1 || !arr1.length ) {
    return arr2 && arr2.slice();
  }
  if( !arr2 || !arr2.length ) {
    return arr1 && arr1.slice();
  }
  const out = new Float32Array( arr1.length + arr2.length );
  out.set( arr1 );
  out.set( arr2, arr1.length );
  return out;
}





