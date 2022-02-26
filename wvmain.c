// wvmain.c
//
// Copyright (c) 2021 Peter McQuillan
//
// All Rights Reserved. 
// 
// Distributed under the BSD Software License (see wavpack_webassembly_license.txt) 
//
//
// This code is the main interface layer for the WebAssembly output, used
// for decoding a WavPack audio file. This file is built on top of the
// WavPack Tiny Decoder which is Copyright (c) Conifer Software. 


#include "wavpack.h"

#include <string.h>
#include <stdlib.h>
#include <emscripten.h>


FILE *fptr;
WavpackContext *wpc;


static int32_t read_bytes (void *buff, int32_t bcount);
static int32_t temp_buffer [2048];

int main()
{
	return 0;
}

int EMSCRIPTEN_KEEPALIVE initialiseWavPack(char* filename)
{

    char error [80];

   if ((fptr = fopen(filename,"r")) == NULL){
       printf("\nError! opening file, sorry!\n");
       exit(1);
   }

    wpc = WavpackOpenFileInput (read_bytes, error);

    if (!wpc) {
        fputs (error, stderr);
        fputs ("\n", stderr);
        return 1;
    }
    return 0;
}

int EMSCRIPTEN_KEEPALIVE GetSampleRate()
{
    return(WavpackGetSampleRate(wpc));
}

int EMSCRIPTEN_KEEPALIVE GetNumChannels()
{
    return(WavpackGetReducedChannels(wpc));
}

int EMSCRIPTEN_KEEPALIVE GetBytesPerSample()
{
    return(WavpackGetBytesPerSample(wpc));
}

uint32_t EMSCRIPTEN_KEEPALIVE GetNumSamples()
{
    return(WavpackGetNumSamples(wpc));
}

int EMSCRIPTEN_KEEPALIVE DecodeWavPackBlock(int num_channels, int bps, int *output)
{
    uint32_t samples_unpacked;

    samples_unpacked = WavpackUnpackSamples (wpc, temp_buffer, 2048 / num_channels);

    if (samples_unpacked) {
        for(int i=0; i<2048; i++)
        {
            output[i] = temp_buffer[i];
        }
    }

    return samples_unpacked;
}

static int32_t read_bytes (void *buff, int32_t bcount)
{
    return fread (buff, 1, bcount, fptr);
}

