"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/ebml.ts
  var EBMLFloat32, EBMLFloat64;
  var init_ebml = __esm({
    "src/ebml.ts"() {
      "use strict";
      EBMLFloat32 = class {
        constructor(value) {
          this.value = value;
        }
      };
      EBMLFloat64 = class {
        constructor(value) {
          this.value = value;
        }
      };
    }
  });

  // src/write_target.ts
  var WriteTarget, measureUnsignedInt, measureEBMLVarInt, ArrayBufferWriteTarget, FILE_CHUNK_SIZE, FileSystemWritableFileStreamWriteTarget, insertSectionIntoFileChunk;
  var init_write_target = __esm({
    "src/write_target.ts"() {
      "use strict";
      init_ebml();
      WriteTarget = class {
        constructor() {
          this.pos = 0;
          this.helper = new Uint8Array(8);
          this.helperView = new DataView(this.helper.buffer);
          this.offsets = /* @__PURE__ */ new WeakMap();
        }
        writeFloat32(value) {
          this.helperView.setFloat32(0, value, false);
          this.write(this.helper.subarray(0, 4));
        }
        writeFloat64(value) {
          this.helperView.setFloat64(0, value, false);
          this.write(this.helper);
        }
        writeUnsignedInt(value, width = measureUnsignedInt(value)) {
          let pos = 0;
          switch (width) {
            case 5:
              this.helperView.setUint8(pos++, Math.floor(value / 2 ** 32));
            case 4:
              this.helperView.setUint8(pos++, value >> 24);
            case 3:
              this.helperView.setUint8(pos++, value >> 16);
            case 2:
              this.helperView.setUint8(pos++, value >> 8);
            case 1:
              this.helperView.setUint8(pos++, value);
              break;
            default:
              throw new Error("Bad UINT size " + width);
          }
          this.write(this.helper.subarray(0, pos));
        }
        writeEBMLVarInt(value, width = measureEBMLVarInt(value)) {
          let pos = 0;
          switch (width) {
            case 1:
              this.helperView.setUint8(pos++, 1 << 7 | value);
              break;
            case 2:
              this.helperView.setUint8(pos++, 1 << 6 | value >> 8);
              this.helperView.setUint8(pos++, value);
              break;
            case 3:
              this.helperView.setUint8(pos++, 1 << 5 | value >> 16);
              this.helperView.setUint8(pos++, value >> 8);
              this.helperView.setUint8(pos++, value);
              break;
            case 4:
              this.helperView.setUint8(pos++, 1 << 4 | value >> 24);
              this.helperView.setUint8(pos++, value >> 16);
              this.helperView.setUint8(pos++, value >> 8);
              this.helperView.setUint8(pos++, value);
              break;
            case 5:
              this.helperView.setUint8(pos++, 1 << 3 | value / 4294967296 & 7);
              this.helperView.setUint8(pos++, value >> 24);
              this.helperView.setUint8(pos++, value >> 16);
              this.helperView.setUint8(pos++, value >> 8);
              this.helperView.setUint8(pos++, value);
              break;
            default:
              throw new Error("Bad EBML VINT size " + width);
          }
          this.write(this.helper.subarray(0, pos));
        }
        writeString(str) {
          this.write(new Uint8Array(str.split("").map((x) => x.charCodeAt(0))));
        }
        writeEBML(data) {
          var _a;
          if (data instanceof Uint8Array) {
            this.write(data);
          } else if (Array.isArray(data)) {
            for (let elem of data) {
              this.writeEBML(elem);
            }
          } else {
            this.offsets.set(data, this.pos);
            this.writeUnsignedInt(data.id);
            if (typeof data.data === "number") {
              let size = (_a = data.size) != null ? _a : measureUnsignedInt(data.data);
              this.writeEBMLVarInt(size);
              this.writeUnsignedInt(data.data, size);
            } else if (Array.isArray(data.data)) {
              let sizePos = this.pos;
              this.seek(this.pos + 4);
              let startPos = this.pos;
              this.writeEBML(data.data);
              let size = this.pos - startPos;
              let endPos = this.pos;
              this.seek(sizePos);
              this.writeEBMLVarInt(size, 4);
              this.seek(endPos);
            } else if (typeof data.data === "string") {
              this.writeEBMLVarInt(data.data.length);
              this.writeString(data.data);
            } else if (data.data instanceof Uint8Array) {
              this.writeEBMLVarInt(data.data.byteLength, data.size);
              this.write(data.data);
            } else if (data.data instanceof EBMLFloat32) {
              this.writeEBMLVarInt(4);
              this.writeFloat32(data.data.value);
            } else if (data.data instanceof EBMLFloat64) {
              this.writeEBMLVarInt(8);
              this.writeFloat64(data.data.value);
            }
          }
        }
      };
      measureUnsignedInt = (value) => {
        if (value < 1 << 8) {
          return 1;
        } else if (value < 1 << 16) {
          return 2;
        } else if (value < 1 << 24) {
          return 3;
        } else if (value < 2 ** 32) {
          return 4;
        } else {
          return 5;
        }
      };
      measureEBMLVarInt = (value) => {
        if (value < (1 << 7) - 1) {
          return 1;
        } else if (value < (1 << 14) - 1) {
          return 2;
        } else if (value < (1 << 21) - 1) {
          return 3;
        } else if (value < (1 << 28) - 1) {
          return 4;
        } else if (value < 2 ** 35 - 1) {
          return 5;
        } else {
          throw new Error("EBML VINT size not supported " + value);
        }
      };
      ArrayBufferWriteTarget = class extends WriteTarget {
        constructor() {
          super();
          this.buffer = new ArrayBuffer(2 ** 16);
          this.bytes = new Uint8Array(this.buffer);
        }
        ensureSize(size) {
          while (this.buffer.byteLength < size) {
            let newBuffer = new ArrayBuffer(2 * this.buffer.byteLength);
            let newBytes = new Uint8Array(newBuffer);
            newBytes.set(this.bytes, 0);
            this.buffer = newBuffer;
            this.bytes = newBytes;
          }
        }
        write(data) {
          this.ensureSize(this.pos + data.byteLength);
          this.bytes.set(data, this.pos);
          this.pos += data.byteLength;
        }
        seek(newPos) {
          this.pos = newPos;
        }
        finalize() {
          this.ensureSize(this.pos);
          return this.buffer.slice(0, this.pos);
        }
      };
      FILE_CHUNK_SIZE = 2 ** 24;
      FileSystemWritableFileStreamWriteTarget = class extends WriteTarget {
        constructor(stream) {
          super();
          this.chunks = [];
          this.toFlush = [];
          this.stream = stream;
        }
        write(data) {
          this.writeDataIntoChunks(data, this.pos);
          this.flushChunks();
          this.pos += data.byteLength;
        }
        writeDataIntoChunks(data, position) {
          let chunkIndex = this.chunks.findIndex((x) => x.start <= position && position < x.start + FILE_CHUNK_SIZE);
          if (chunkIndex === -1)
            chunkIndex = this.createChunk(position);
          let chunk = this.chunks[chunkIndex];
          let relativePosition = position - chunk.start;
          let toWrite = data.subarray(0, Math.min(FILE_CHUNK_SIZE - relativePosition, data.byteLength));
          chunk.data.set(toWrite, relativePosition);
          let section = {
            start: relativePosition,
            end: relativePosition + toWrite.byteLength
          };
          insertSectionIntoFileChunk(chunk, section);
          if (chunk.written[0].start === 0 && chunk.written[0].end === FILE_CHUNK_SIZE) {
            this.toFlush.push(chunk);
            this.chunks.splice(chunkIndex, 1);
          }
          if (toWrite.byteLength < data.byteLength) {
            this.writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
          }
        }
        createChunk(includesPosition) {
          let start = Math.floor(includesPosition / FILE_CHUNK_SIZE) * FILE_CHUNK_SIZE;
          let chunk = {
            start,
            data: new Uint8Array(FILE_CHUNK_SIZE),
            written: []
          };
          this.chunks.push(chunk);
          return this.chunks.length - 1;
        }
        flushChunks() {
          if (this.toFlush.length > 0) {
            for (let chunk of this.toFlush) {
              for (let section of chunk.written) {
                this.stream.write({
                  type: "write",
                  data: chunk.data.subarray(section.start, section.end),
                  position: chunk.start + section.start
                });
              }
            }
            this.toFlush.length = 0;
          }
        }
        seek(newPos) {
          this.pos = newPos;
        }
        finalize() {
          this.toFlush.push(...this.chunks);
          this.chunks.length = 0;
          this.flushChunks();
        }
      };
      insertSectionIntoFileChunk = (chunk, section) => {
        let low = 0;
        let high = chunk.written.length - 1;
        let index = -1;
        while (low <= high) {
          let mid = Math.floor(low + (high - low + 1) / 2);
          if (chunk.written[mid].start <= section.start) {
            low = mid + 1;
            index = mid;
          } else {
            high = mid - 1;
          }
        }
        chunk.written.splice(index + 1, 0, section);
        if (index === -1 || chunk.written[index].end < section.start)
          index++;
        while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
          chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
          chunk.written.splice(index + 1, 1);
        }
      };
    }
  });

  // src/main.ts
  var require_main = __commonJS({
    "src/main.ts"(exports, module) {
      init_ebml();
      init_write_target();
      var VIDEO_TRACK_NUMBER = 1;
      var AUDIO_TRACK_NUMBER = 2;
      var VIDEO_TRACK_TYPE = 1;
      var AUDIO_TRACK_TYPE = 2;
      var MAX_CHUNK_LENGTH_MS = 32e3;
      var WebMWriter = class {
        constructor(options) {
          this.duration = 0;
          this.videoChunkQueue = [];
          this.audioChunkQueue = [];
          this.lastVideoTimestamp = 0;
          this.lastAudioTimestamp = 0;
          this.options = options;
          if (options.target === "buffer") {
            this.target = new ArrayBufferWriteTarget();
          } else {
            this.target = new FileSystemWritableFileStreamWriteTarget(options.target);
          }
          this.writeHeader();
        }
        writeHeader() {
          let ebmlHeader = { id: 440786851 /* EBML */, data: [
            { id: 17030 /* EBMLVersion */, data: 1 },
            { id: 17143 /* EBMLReadVersion */, data: 1 },
            { id: 17138 /* EBMLMaxIDLength */, data: 4 },
            { id: 17139 /* EBMLMaxSizeLength */, data: 8 },
            { id: 17026 /* DocType */, data: "webm" },
            { id: 17031 /* DocTypeVersion */, data: 2 },
            { id: 17029 /* DocTypeReadVersion */, data: 2 }
          ] };
          this.target.writeEBML(ebmlHeader);
          const kaxCues = new Uint8Array([28, 83, 187, 107]);
          const kaxInfo = new Uint8Array([21, 73, 169, 102]);
          const kaxTracks = new Uint8Array([22, 84, 174, 107]);
          let seekHead = { id: 290298740 /* SeekHead */, data: [
            { id: 19899 /* Seek */, data: [
              { id: 21419 /* SeekID */, data: kaxCues },
              { id: 21420 /* SeekPosition */, size: 5, data: 0 }
            ] },
            { id: 19899 /* Seek */, data: [
              { id: 21419 /* SeekID */, data: kaxInfo },
              { id: 21420 /* SeekPosition */, size: 5, data: 0 }
            ] },
            { id: 19899 /* Seek */, data: [
              { id: 21419 /* SeekID */, data: kaxTracks },
              { id: 21420 /* SeekPosition */, size: 5, data: 0 }
            ] }
          ] };
          this.seekHead = seekHead;
          let segmentDuration = { id: 17545 /* Duration */, data: new EBMLFloat64(0) };
          this.segmentDuration = segmentDuration;
          let segmentInfo = { id: 357149030 /* Info */, data: [
            { id: 2807729 /* TimestampScale */, data: 1e6 },
            { id: 19840 /* MuxingApp */, data: "Vani's epic muxer" },
            { id: 22337 /* WritingApp */, data: "Vani's epic muxer" },
            segmentDuration
          ] };
          this.segmentInfo = segmentInfo;
          let tracksElement = { id: 374648427 /* Tracks */, data: [] };
          this.tracksElement = tracksElement;
          if (this.options.video) {
            this.videoCodecPrivate = { id: 236 /* Void */, size: 4, data: new Uint8Array(2 ** 12) };
            let colourElement = { id: 21936 /* Colour */, data: [
              { id: 21937 /* MatrixCoefficients */, data: 2 },
              { id: 21946 /* TransferCharacteristics */, data: 2 },
              { id: 21947 /* Primaries */, data: 2 },
              { id: 21945 /* Range */, data: 0 }
            ] };
            this.colourElement = colourElement;
            tracksElement.data.push({ id: 174 /* TrackEntry */, data: [
              { id: 215 /* TrackNumber */, data: VIDEO_TRACK_NUMBER },
              { id: 29637 /* TrackUID */, data: VIDEO_TRACK_NUMBER },
              { id: 131 /* TrackType */, data: VIDEO_TRACK_TYPE },
              { id: 134 /* CodecID */, data: this.options.video.codec },
              this.videoCodecPrivate,
              this.options.video.frameRate ? { id: 2352003 /* DefaultDuration */, data: 1e9 / this.options.video.frameRate } : null,
              { id: 224 /* Video */, data: [
                { id: 176 /* PixelWidth */, data: this.options.video.width },
                { id: 186 /* PixelHeight */, data: this.options.video.height },
                colourElement
              ] }
            ].filter(Boolean) });
          }
          if (this.options.audio) {
            this.audioCodecPrivate = { id: 236 /* Void */, size: 4, data: new Uint8Array(2 ** 12) };
            tracksElement.data.push({ id: 174 /* TrackEntry */, data: [
              { id: 215 /* TrackNumber */, data: AUDIO_TRACK_NUMBER },
              { id: 29637 /* TrackUID */, data: AUDIO_TRACK_NUMBER },
              { id: 131 /* TrackType */, data: AUDIO_TRACK_TYPE },
              { id: 134 /* CodecID */, data: this.options.audio.codec },
              this.audioCodecPrivate,
              { id: 225 /* Audio */, data: [
                { id: 181 /* SamplingFrequency */, data: new EBMLFloat32(this.options.audio.sampleRate) },
                { id: 159 /* Channels */, data: this.options.audio.numberOfChannels },
                this.options.audio.bitDepth ? { id: 25188 /* BitDepth */, data: this.options.audio.bitDepth } : null
              ].filter(Boolean) }
            ] });
          }
          let segment = { id: 408125543 /* Segment */, size: 5, data: [
            seekHead,
            segmentInfo,
            tracksElement
          ] };
          this.segment = segment;
          this.target.writeEBML(segment);
          this.cues = { id: 475249515 /* Cues */, data: [] };
        }
        addVideoChunk(chunk, meta) {
          this.lastVideoTimestamp = chunk.timestamp;
          while (this.audioChunkQueue.length > 0 && this.audioChunkQueue[0].timestamp <= chunk.timestamp) {
            let audioChunk = this.audioChunkQueue.shift();
            this.writeSimpleBlock(audioChunk);
          }
          if (!this.options.audio || chunk.timestamp <= this.lastAudioTimestamp) {
            this.writeSimpleBlock(chunk);
          } else {
            this.videoChunkQueue.push(chunk);
          }
          if (meta.decoderConfig) {
            if (meta.decoderConfig.colorSpace) {
              let colorSpace = meta.decoderConfig.colorSpace;
              this.colourElement.data = [
                { id: 21937 /* MatrixCoefficients */, data: {
                  "rgb": 1,
                  "bt709": 1,
                  "bt470bg": 5,
                  "smpte170m": 6
                }[colorSpace.matrix] },
                { id: 21946 /* TransferCharacteristics */, data: {
                  "bt709": 1,
                  "smpte170m": 6,
                  "iec61966-2-1": 13
                }[colorSpace.transfer] },
                { id: 21947 /* Primaries */, data: {
                  "bt709": 1,
                  "bt470bg": 5,
                  "smpte170m": 6
                }[colorSpace.primaries] },
                { id: 21945 /* Range */, data: [1, 2][Number(colorSpace.fullRange)] }
              ];
              let endPos = this.target.pos;
              this.target.seek(this.target.offsets.get(this.colourElement));
              this.target.writeEBML(this.colourElement);
              this.target.seek(endPos);
            }
            if (meta.decoderConfig.description) {
              this.writeCodecPrivate(this.videoCodecPrivate, meta.decoderConfig.description);
            }
          }
        }
        addAudioChunk(chunk, meta) {
          this.lastAudioTimestamp = chunk.timestamp;
          while (this.videoChunkQueue.length > 0 && this.videoChunkQueue[0].timestamp <= chunk.timestamp) {
            let videoChunk = this.videoChunkQueue.shift();
            this.writeSimpleBlock(videoChunk);
          }
          if (!this.options.video || chunk.timestamp <= this.lastVideoTimestamp) {
            this.writeSimpleBlock(chunk);
          } else {
            this.audioChunkQueue.push(chunk);
          }
          if (meta.decoderConfig) {
            this.writeCodecPrivate(this.audioCodecPrivate, meta.decoderConfig.description);
          }
        }
        writeSimpleBlock(chunk) {
          let msTime = Math.floor(chunk.timestamp / 1e3);
          if (!this.currentCluster || chunk instanceof EncodedVideoChunk && chunk.type === "key" && msTime - this.currentClusterTimestamp >= 1e3 || msTime - this.currentClusterTimestamp >= MAX_CHUNK_LENGTH_MS) {
            this.createNewCluster(msTime);
          }
          let prelude = new Uint8Array(4);
          let view = new DataView(prelude.buffer);
          view.setUint8(0, 128 | (chunk instanceof EncodedVideoChunk ? VIDEO_TRACK_NUMBER : AUDIO_TRACK_NUMBER));
          view.setUint16(1, msTime - this.currentClusterTimestamp, false);
          view.setUint8(3, Number(chunk.type === "key") << 7);
          let data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          let simpleBlock = { id: 163 /* SimpleBlock */, data: [
            prelude,
            data
          ] };
          this.target.writeEBML(simpleBlock);
          this.duration = Math.max(this.duration, msTime);
        }
        writeCodecPrivate(element, data) {
          let endPos = this.target.pos;
          this.target.seek(this.target.offsets.get(element));
          element = [
            { id: 25506 /* CodecPrivate */, size: 4, data: new Uint8Array(data) },
            { id: 236 /* Void */, size: 4, data: new Uint8Array(2 ** 12 - 2 - 4 - data.byteLength) }
          ];
          this.target.writeEBML(element);
          this.target.seek(endPos);
        }
        createNewCluster(timestamp) {
          if (this.currentCluster) {
            this.finalizeCurrentCluster();
          }
          this.currentCluster = { id: 524531317 /* Cluster */, data: [
            { id: 231 /* Timestamp */, data: timestamp }
          ] };
          this.target.writeEBML(this.currentCluster);
          this.currentClusterTimestamp = timestamp;
          this.cues.data.push({ id: 187 /* CuePoint */, data: [
            { id: 179 /* CueTime */, data: timestamp },
            { id: 183 /* CueTrackPositions */, data: [
              { id: 247 /* CueTrack */, data: VIDEO_TRACK_NUMBER },
              { id: 241 /* CueClusterPosition */, data: this.target.offsets.get(this.currentCluster) - (this.target.offsets.get(this.segment) + 8) }
            ] }
          ] });
        }
        finalizeCurrentCluster() {
          let clusterSize = this.target.pos - (this.target.offsets.get(this.currentCluster) + 8);
          let endPos = this.target.pos;
          this.target.seek(this.target.offsets.get(this.currentCluster) + 4);
          this.target.writeEBMLVarInt(clusterSize, 4);
          this.target.seek(endPos);
        }
        finalize() {
          while (this.videoChunkQueue.length > 0)
            this.writeSimpleBlock(this.videoChunkQueue.shift());
          while (this.audioChunkQueue.length > 0)
            this.writeSimpleBlock(this.audioChunkQueue.shift());
          this.finalizeCurrentCluster();
          this.target.writeEBML(this.cues);
          let endPos = this.target.pos;
          let segmentSize = this.target.pos - (this.target.offsets.get(this.segment) + 8);
          this.target.seek(this.target.offsets.get(this.segment) + 4);
          this.target.writeEBMLVarInt(segmentSize, 4);
          this.segmentDuration.data = new EBMLFloat64(this.duration);
          this.target.seek(this.target.offsets.get(this.segmentDuration));
          this.target.writeEBML(this.segmentDuration);
          this.seekHead.data[0].data[1].data = this.target.offsets.get(this.cues) - (this.target.offsets.get(this.segment) + 8);
          this.seekHead.data[1].data[1].data = this.target.offsets.get(this.segmentInfo) - (this.target.offsets.get(this.segment) + 8);
          this.seekHead.data[2].data[1].data = this.target.offsets.get(this.tracksElement) - (this.target.offsets.get(this.segment) + 8);
          this.target.seek(this.target.offsets.get(this.seekHead));
          this.target.writeEBML(this.seekHead);
          this.target.seek(endPos);
          if (this.target instanceof ArrayBufferWriteTarget) {
            return this.target.finalize();
          } else if (this.target instanceof FileSystemWritableFileStreamWriteTarget) {
            this.target.finalize();
          }
          return null;
        }
      };
      if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
        module.exports = WebMWriter;
      }
      if (typeof globalThis !== "undefined") {
        globalThis.WebMWriter = WebMWriter;
      }
    }
  });
  require_main();
})();
