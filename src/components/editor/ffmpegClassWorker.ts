/// <reference lib="webworker" />

const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js";

enum FFMessageType {
  LOAD = "LOAD",
  EXEC = "EXEC",
  FFPROBE = "FFPROBE",
  WRITE_FILE = "WRITE_FILE",
  READ_FILE = "READ_FILE",
  DELETE_FILE = "DELETE_FILE",
  RENAME = "RENAME",
  CREATE_DIR = "CREATE_DIR",
  LIST_DIR = "LIST_DIR",
  DELETE_DIR = "DELETE_DIR",
  ERROR = "ERROR",
  PROGRESS = "PROGRESS",
  LOG = "LOG",
  MOUNT = "MOUNT",
  UNMOUNT = "UNMOUNT",
}

const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

type FFmpegCoreModuleFactory = (config: { mainScriptUrlOrBlob: string }) => Promise<FFmpegCore>;

type FFmpegCore = {
  FS: {
    writeFile: (path: string, data: Uint8Array | string) => void;
    readFile: (path: string, options?: { encoding: string }) => Uint8Array | string;
    unlink: (path: string) => void;
    rename: (oldPath: string, newPath: string) => void;
    mkdir: (path: string) => void;
    readdir: (path: string) => string[];
    stat: (path: string) => { mode: number };
    isDir: (mode: number) => boolean;
    rmdir: (path: string) => void;
    mount: (fs: unknown, options: unknown, mountPoint: string) => void;
    unmount: (mountPoint: string) => void;
    filesystems: Record<string, unknown>;
  };
  setLogger: (callback: (data: unknown) => void) => void;
  setProgress: (callback: (data: unknown) => void) => void;
  setTimeout: (timeout: number) => void;
  exec: (...args: string[]) => void;
  ffprobe: (...args: string[]) => void;
  ret: number;
  reset: () => void;
};

type WorkerGlobalScopeWithFFmpeg = DedicatedWorkerGlobalScope &
  typeof globalThis & {
    createFFmpegCore?: FFmpegCoreModuleFactory;
  };

const workerScope = self as WorkerGlobalScopeWithFFmpeg;
let ffmpeg: FFmpegCore | undefined;

const load = async ({
  coreURL: providedCoreURL,
  wasmURL: providedWasmURL,
  workerURL: providedWorkerURL,
}: {
  coreURL?: string;
  wasmURL?: string;
  workerURL?: string;
}) => {
  const first = !ffmpeg;
  let resolvedCoreURL = providedCoreURL;

  try {
    if (!resolvedCoreURL) resolvedCoreURL = CORE_URL;
    importScripts(resolvedCoreURL);
  } catch {
    if (!resolvedCoreURL || resolvedCoreURL === CORE_URL) {
      resolvedCoreURL = CORE_URL.replace("/umd/", "/esm/");
    }

    workerScope.createFFmpegCore = (await import(
      /* @vite-ignore */ resolvedCoreURL
    )).default as FFmpegCoreModuleFactory;

    if (!workerScope.createFFmpegCore) {
      throw ERROR_IMPORT_FAILURE;
    }
  }

  const coreURL = resolvedCoreURL;
  const wasmURL = providedWasmURL ? providedWasmURL : coreURL.replace(/\.js$/g, ".wasm");
  const workerURL = providedWorkerURL ? providedWorkerURL : coreURL.replace(/\.js$/g, ".worker.js");

  ffmpeg = await workerScope.createFFmpegCore!({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
  });

  ffmpeg.setLogger((data) => workerScope.postMessage({ type: FFMessageType.LOG, data }));
  ffmpeg.setProgress((data) => workerScope.postMessage({ type: FFMessageType.PROGRESS, data }));

  return first;
};

const exec = ({ args, timeout = -1 }: { args: string[]; timeout?: number }) => {
  ffmpeg!.setTimeout(timeout);
  ffmpeg!.exec(...args);
  const ret = ffmpeg!.ret;
  ffmpeg!.reset();
  return ret;
};

const ffprobe = ({ args, timeout = -1 }: { args: string[]; timeout?: number }) => {
  ffmpeg!.setTimeout(timeout);
  ffmpeg!.ffprobe(...args);
  const ret = ffmpeg!.ret;
  ffmpeg!.reset();
  return ret;
};

const writeFile = ({ path, data }: { path: string; data: Uint8Array | string }) => {
  ffmpeg!.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }: { path: string; encoding: string }) =>
  ffmpeg!.FS.readFile(path, { encoding });

const deleteFile = ({ path }: { path: string }) => {
  ffmpeg!.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
  ffmpeg!.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }: { path: string }) => {
  ffmpeg!.FS.mkdir(path);
  return true;
};

const listDir = ({ path }: { path: string }) => {
  const names = ffmpeg!.FS.readdir(path);
  return names.map((name) => {
    const stat = ffmpeg!.FS.stat(`${path}/${name}`);
    return { name, isDir: ffmpeg!.FS.isDir(stat.mode) };
  });
};

const deleteDir = ({ path }: { path: string }) => {
  ffmpeg!.FS.rmdir(path);
  return true;
};

const mount = ({
  fsType,
  options,
  mountPoint,
}: {
  fsType: string;
  options: unknown;
  mountPoint: string;
}) => {
  const fs = ffmpeg!.FS.filesystems[fsType];
  if (!fs) return false;
  ffmpeg!.FS.mount(fs, options, mountPoint);
  return true;
};

const unmount = ({ mountPoint }: { mountPoint: string }) => {
  ffmpeg!.FS.unmount(mountPoint);
  return true;
};

workerScope.onmessage = async ({ data: { id, type, data: payload } }: MessageEvent<any>) => {
  const trans: Transferable[] = [];
  let data: unknown;

  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;

    switch (type) {
      case FFMessageType.LOAD:
        data = await load(payload);
        break;
      case FFMessageType.EXEC:
        data = exec(payload);
        break;
      case FFMessageType.FFPROBE:
        data = ffprobe(payload);
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(payload);
        break;
      case FFMessageType.READ_FILE:
        data = readFile(payload);
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(payload);
        break;
      case FFMessageType.RENAME:
        data = rename(payload);
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(payload);
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(payload);
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(payload);
        break;
      case FFMessageType.MOUNT:
        data = mount(payload);
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(payload);
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (error) {
    workerScope.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: error instanceof Error ? error.toString() : String(error),
    });
    return;
  }

  if (data instanceof Uint8Array) {
    trans.push(data.buffer);
  }

  workerScope.postMessage({ id, type, data }, trans);
};
