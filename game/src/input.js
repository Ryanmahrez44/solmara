// input.js: keyboard + mouse, with edge-triggered actions the game loop consumes.
// WASD/arrows move and drive, Shift runs, E enters/exits a car, Space handbrakes,
// F punches, C cycles weapons, mouse aims and click shoots, Q cycles the radio,
// M mutes, Esc pauses. Held keys live in one set, one-press actions in one bit
// field, so the loop can read "held" and "just pressed" without guessing.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RADIO = 16;
export const ACTION_MUTE = 32;
export const ACTION_RELOAD = 64;
export const ACTION_MISSION = 128;
export const ACTION_WEAPON = 256;

// Held-down movement keys, by KeyboardEvent.code.
const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'brake',
};

// One-press action keys, by code: a press sets a bit the loop consumes once.
const ACTION_KEYS = {
  Enter: ACTION_CONFIRM,
  Escape: ACTION_PAUSE, KeyP: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  KeyQ: ACTION_RADIO,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RELOAD,
  KeyT: ACTION_MISSION,
  KeyC: ACTION_WEAPON,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;
  let attached = true;

  function onKeyDown(event) {
    if (event.repeat) return;
    const move = MOVE_KEYS[event.code];
    if (move) { keys.add(move); event.preventDefault(); return; }
    const bit = ACTION_KEYS[event.code];
    if (bit !== undefined) { actions |= bit; event.preventDefault(); }
  }
  function onKeyUp(event) {
    const move = MOVE_KEYS[event.code];
    if (move) keys.delete(move);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    if (event.button === 0) { mouseDown = true; clicked = true; }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onBlur() { keys.clear(); mouseDown = false; }
  function onContextMenu(event) { event.preventDefault(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** {x, y} in -1..1: the held movement keys. */
    move() {
      return {
        x: (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0),
        y: (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0),
      };
    },
    /** True while the named held key ('up', 'run', 'brake', ...) is down. */
    isDown(name) { return keys.has(name); },
    running() { return keys.has('run'); },
    braking() { return keys.has('brake'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown, clicked }; },
    takeActions() {
      const taken = actions | (clicked ? ACTION_CONFIRM : 0);
      actions = 0;
      clicked = false;
      return taken;
    },
    consumeClick() { clicked = false; },
    /** Detach every listener (tests, teardown); the object stays usable. */
    destroy() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
