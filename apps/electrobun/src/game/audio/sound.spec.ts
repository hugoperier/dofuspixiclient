import { afterEach, beforeEach, expect, it } from "bun:test";

import { createHtmlSound } from "./sound";

class FakeAudio extends EventTarget {
  static all: FakeAudio[] = [];
  loop = false;
  volume = 0;
  preload = "";
  currentTime = 0;
  muted = false;
  readyState = 0;
  plays = 0;
  paused = false;
  reject = false;
  constructor(public src: string) {
    super();
    FakeAudio.all.push(this);
  }
  play(): Promise<void> {
    this.plays++;
    return this.reject
      ? Promise.reject(new DOMException("blocked", "NotAllowedError"))
      : Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
}
const original = {
  Audio: globalThis.Audio,
  document: globalThis.document,
  HTMLMediaElement: globalThis.HTMLMediaElement,
};
beforeEach(() => {
  FakeAudio.all = [];
  Object.assign(globalThis, {
    Audio: FakeAudio,
    document: new EventTarget(),
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
  });
});
afterEach(() => {
  Object.assign(globalThis, original);
});
it("cancels canplay when a sound is stopped before loading", () => {
  const sound = createHtmlSound("a.mp3", { loop: true, startAt: 12 });
  sound.play();
  sound.stop();
  const audio = FakeAudio.all[0]!;
  audio.dispatchEvent(new Event("canplay"));
  expect(audio.plays).toBe(0);
  expect(audio.src).toBe("");
});
it("a blocked loop retries on a gesture, but not after stop", async () => {
  const sound = createHtmlSound("a.mp3", { loop: true, startAt: 12 });
  const audio = FakeAudio.all[0]!;
  audio.readyState = 2;
  audio.reject = true;
  sound.play();
  await Promise.resolve();
  audio.reject = false;
  document.dispatchEvent(new Event("click"));
  expect(audio.plays).toBe(2);
  expect(audio.currentTime).toBe(12);
  sound.stop();
  document.dispatchEvent(new Event("keydown"));
  expect(audio.plays).toBe(2);
});
it("stop removes a pending autoplay retry and stale one-shots are discarded", async () => {
  for (const loop of [true, false]) {
    let ended = 0;
    const sound = createHtmlSound("a.mp3", {
      loop,
      startAt: 0,
      onEnded: () => ended++,
    });
    const audio = FakeAudio.all[FakeAudio.all.length - 1]!;
    audio.readyState = 2;
    audio.reject = true;
    sound.play();
    await Promise.resolve();
    sound.stop();
    document.dispatchEvent(new Event("click"));
    expect(audio.plays).toBe(1);
    expect(ended).toBe(loop ? 0 : 1);
  }
});
it("releases an ended effect once", () => {
  let ended = 0;
  const sound = createHtmlSound("a.mp3", {
    loop: false,
    startAt: 0,
    onEnded: () => ended++,
  });
  const audio = FakeAudio.all[0]!;
  audio.readyState = 2;
  sound.play();
  audio.dispatchEvent(new Event("ended"));
  audio.dispatchEvent(new Event("ended"));
  expect(ended).toBe(1);
  expect(audio.src).toBe("");
});
