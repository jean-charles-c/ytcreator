export interface Linear16WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

function readUint16Le(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readUint32Le(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) target[offset + i] = value.charCodeAt(i);
}

function writeUint16Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
}

export function parseLinear16WavFormat(data: Uint8Array): Linear16WavFormat {
  if (data.length < 44) {
    throw new Error("Audio LINEAR16 invalide — en-tête WAV incomplet.");
  }

  const riff = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const wave = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Audio LINEAR16 invalide — conteneur WAV attendu.");
  }

  let pos = 12;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (pos + 8 <= data.length) {
    const chunkId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
    const chunkSize = readUint32Le(data, pos + 4);
    const chunkStart = pos + 8;

    if (chunkId === "fmt ") {
      const audioFormat = readUint16Le(data, chunkStart);
      channels = readUint16Le(data, chunkStart + 2);
      sampleRate = readUint32Le(data, chunkStart + 4);
      bitsPerSample = readUint16Le(data, chunkStart + 14);
      if (audioFormat !== 1) {
        throw new Error("Audio LINEAR16 invalide — PCM requis.");
      }
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = Math.min(chunkSize, data.length - chunkStart);
      break;
    }

    pos = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataLength <= 0) {
    throw new Error("Audio LINEAR16 invalide — bloc data introuvable.");
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Audio LINEAR16 invalide — 16 bits attendus, reçu ${bitsPerSample}.`);
  }

  return { sampleRate, channels, bitsPerSample, dataOffset, dataLength };
}

function buildLinear16Wav(
  payload: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Uint8Array {
  const header = new Uint8Array(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  writeAscii(header, 0, "RIFF");
  writeUint32Le(header, 4, 36 + payload.length);
  writeAscii(header, 8, "WAVE");
  writeAscii(header, 12, "fmt ");
  writeUint32Le(header, 16, 16);
  writeUint16Le(header, 20, 1);
  writeUint16Le(header, 22, channels);
  writeUint32Le(header, 24, sampleRate);
  writeUint32Le(header, 28, byteRate);
  writeUint16Le(header, 32, blockAlign);
  writeUint16Le(header, 34, bitsPerSample);
  writeAscii(header, 36, "data");
  writeUint32Le(header, 40, payload.length);

  const output = new Uint8Array(header.length + payload.length);
  output.set(header, 0);
  output.set(payload, header.length);
  return output;
}

export function concatLinear16Wavs(wavChunks: Uint8Array[]): { wav: Uint8Array; durationSeconds: number } {
  if (wavChunks.length === 0) {
    return { wav: buildLinear16Wav(new Uint8Array(0), 24000, 1, 16), durationSeconds: 0 };
  }

  const firstFormat = parseLinear16WavFormat(wavChunks[0]);
  const payloads = wavChunks.map((chunk, index) => {
    const format = parseLinear16WavFormat(chunk);
    if (
      format.sampleRate !== firstFormat.sampleRate ||
      format.channels !== firstFormat.channels ||
      format.bitsPerSample !== firstFormat.bitsPerSample
    ) {
      throw new Error(`Audio LINEAR16 invalide — format WAV incohérent au segment ${index + 1}.`);
    }
    return chunk.slice(format.dataOffset, format.dataOffset + format.dataLength);
  });

  const totalPayloadLength = payloads.reduce((sum, payload) => sum + payload.length, 0);
  const combinedPayload = new Uint8Array(totalPayloadLength);
  let offset = 0;
  for (const payload of payloads) {
    combinedPayload.set(payload, offset);
    offset += payload.length;
  }

  const wav = buildLinear16Wav(
    combinedPayload,
    firstFormat.sampleRate,
    firstFormat.channels,
    firstFormat.bitsPerSample
  );
  const bytesPerSecond = firstFormat.sampleRate * firstFormat.channels * (firstFormat.bitsPerSample / 8);

  return { wav, durationSeconds: combinedPayload.length / bytesPerSecond };
}
