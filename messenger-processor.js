class MessengerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "customVolumeAdjust",
        defaultValue: 32768,
      }
    ];
  }

  constructor() {
    super();
    this.numOfBuffers = 3; // needs to be at least 2
    this.buffers = Array.from(Array(this.numOfBuffers), () =>
      new Array(2048).fill(0)
    );
    this.buffersInitiallyFilled = false;
    this.bufferbeingplayed = 0;
    this.bufferslicecount = 0;
    this.buffercontainsdata = new Array(this.numOfBuffers).fill(false);
    this.stopNeeded = false;
    this.immediateStopRequested = false;
    this.stopBuffer = 0; // if stop is needed as we have run out of data, this is the buffer we stop at end of.

    this.port.onmessage = this.handleMessage_.bind(this);

    // lets get some data in our buffers!
    for (let i = 0; i < this.numOfBuffers; i++) {
      this.port.postMessage(1);
    }
  }

  handleMessage_(event) {
    var buffercheck = 0;
    var bufferFilled = false;
    while (buffercheck < this.numOfBuffers) {
      if (!this.buffercontainsdata[buffercheck] && !bufferFilled) {
        var passedData = [...event.data];
        var sampledata = passedData.slice(0, 2048);
        var status = passedData[2048];

        this.buffers[buffercheck] = sampledata;
        if (status == 1 && !this.stopNeeded) {
          // we have to stop at this block, run out of data
          this.stopNeeded = true;
          this.stopBuffer = buffercheck;
        }
        if (status == 2) {
          // immediate stop requested
          this.immediateStopRequested = true;
        }

        this.buffercontainsdata[buffercheck] = true;
        bufferFilled = true;
      }
      buffercheck++;
    }

    // We want to fill our buffers before starting normal playback
    if (!this.buffersInitiallyFilled) {
      var emptyBufferFound = false;
      buffercheck = 0;
      while (buffercheck < this.numOfBuffers) {
        if (!this.buffercontainsdata[buffercheck]) {
          emptyBufferFound = true;
        }
        buffercheck++;
      }

      if (!emptyBufferFound) {
        this.buffersInitiallyFilled = true;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    const channelCount = output.length;
    let framesize = outputs[0][0].length;

    if (this.immediateStopRequested) {
      return false;
    }

    var outcnt = 0;
    var cnt = 0;
    var stopNow = false;

    // currently framesize used by browsers are only 128 samples, but in the future it may be larger
    if (
      framesize != 128 &&
      framesize != 256 &&
      framesize != 512 &&
      framesize != 1024
    ) {
      console.log("Framesize is unsupported");
      return false;
    }

    // we confirm that we have filled our initial buffers, otherwise we play silence
    if (!this.buffersInitiallyFilled) {
      while (outcnt < framesize) {
        output[0][outcnt] = 0; //silence
        if (channelCount == 2) {
          output[1][outcnt] = 0;
        }
        outcnt++;
      }
      return true;
    }

    let maxBufferSliceCount = 1024 / framesize;

    var pcm_buffer = new Int32Array(
      this.buffers[this.bufferbeingplayed].splice(0, framesize * channelCount)
    );

    this.bufferslicecount++;
    if (this.bufferslicecount == maxBufferSliceCount) {
      this.bufferslicecount = 0;
      this.buffercontainsdata[this.bufferbeingplayed] = false;

      if (this.stopNeeded) {
        if (this.bufferbeingplayed == this.stopBuffer) {
          // a stop is needed at the end of this buffer
          this.immediateStopRequested = true; // so we stop immediately at next call to process()
        }
      }

      this.bufferbeingplayed++;
      if (this.bufferbeingplayed == this.numOfBuffers) {
        this.bufferbeingplayed = 0;
      }

      // request more data
      this.port.postMessage(1);
    }
    var c = 0;
    let volumeAdjust = parameters["customVolumeAdjust"][0];
    let loopMax = framesize * channelCount;
    while (cnt < loopMax) {
      output[0][outcnt] = pcm_buffer[cnt++] / volumeAdjust;
      if (channelCount == 2) {
        output[1][outcnt] = pcm_buffer[cnt++] / volumeAdjust;
      }
      outcnt++;
    }

    return true;
  }
}

registerProcessor("messenger-processor", MessengerProcessor);
