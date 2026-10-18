// Touch controls call the same game actions used by the keyboard and mouse.
export function createMobileControls({ canvas, canPlay, move, look, zoom, actions, block, sprint }) {
  const stick = document.getElementById('joystick');
  const knob = stick.querySelector('i');
  const sprintButton = document.querySelector('[data-action="sprint"]');
  const cameraTouches = new Map();
  const captures = new Map();
  const blockPointers = new Set();
  const buttonPointers = new Map();
  let stickId = null;
  let running = false;
  let pinchDistance = 0;

  function capture(element, event) {
    captures.set(event.pointerId, element);
    // Synthetic accessibility events may not have an active browser pointer.
    try { element.setPointerCapture(event.pointerId); } catch {}
  }
  function release(id) {
    const element = captures.get(id);
    captures.delete(id);
    if (element?.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function setSprint(value) {
    running = value;
    sprintButton.classList.toggle('is-active', value);
    sprintButton.setAttribute('aria-pressed', String(value));
    sprintButton.querySelector('span').textContent = value ? 'مشي' : 'ركض';
    sprint(value);
  }
  function updateStick(event) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * .34;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy);
    const travel = Math.min(length, radius);
    const scale = travel / (length || 1);
    const strength = Math.max(0, (Math.min(length / radius, 1) - .12) / .88);
    move(length ? dx / length * strength : 0, length ? dy / length * strength : 0);
    knob.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  }
  function resetStick() {
    const previous = stickId;
    stickId = null;
    move(0, 0);
    knob.style.transform = '';
    stick.classList.remove('is-active');
    if (previous !== null) release(previous);
  }
  stick.addEventListener('pointerdown', event => {
    if (!canPlay() || stickId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    stickId = event.pointerId;
    stick.classList.add('is-active');
    capture(stick, event);
    updateStick(event);
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId !== stickId) return;
    event.preventDefault();
    updateStick(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, event => { if (event.pointerId === stickId) resetStick(); });
  }

  for (const button of document.querySelectorAll('[data-action]')) {
    const pressed = new Set();
    buttonPointers.set(button, pressed);
    button.addEventListener('pointerdown', event => {
      if (!canPlay() || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.action;
      // One physical gesture triggers an action once, even with several fingers.
      const first = pressed.size === 0;
      pressed.add(event.pointerId);
      capture(button, event);
      button.classList.add('is-pressed');
      if (action === 'block') {
        const start = blockPointers.size === 0;
        blockPointers.add(event.pointerId);
        if (start) block(true);
      } else if (first && action === 'sprint') setSprint(!running);
      else if (first) actions[action]?.();
    });
    function finish(event) {
      if (!pressed.delete(event.pointerId)) return;
      if (!pressed.size) button.classList.remove('is-pressed');
      if (button.dataset.action === 'block') {
        blockPointers.delete(event.pointerId);
        if (!blockPointers.size) block(false);
      }
      release(event.pointerId);
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, finish);
    button.addEventListener('contextmenu', event => event.preventDefault());
    // Keep native keyboard activation available for the contextual rest button.
    button.addEventListener('click', event => {
      if (event.detail !== 0 || !canPlay() || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'sprint') setSprint(!running);
      else if (action !== 'block') actions[action]?.();
    });
  }

  function distance() {
    const [a, b] = cameraTouches.values();
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !canPlay()) return;
    event.preventDefault();
    event.stopPropagation();
    cameraTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(canvas, event);
    pinchDistance = distance();
  });
  canvas.addEventListener('pointermove', event => {
    const previous = cameraTouches.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    cameraTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cameraTouches.size === 1) look(event.clientX - previous.x, event.clientY - previous.y);
    else {
      const next = distance();
      if (pinchDistance) zoom((pinchDistance - next) * .025);
      pinchDistance = next;
    }
  });
  function endCamera(event) {
    if (!cameraTouches.delete(event.pointerId)) return;
    pinchDistance = distance();
    release(event.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endCamera);

  function reset() {
    resetStick();
    cameraTouches.clear();
    blockPointers.clear();
    for (const pressed of buttonPointers.values()) pressed.clear();
    pinchDistance = 0;
    block(false);
    setSprint(false);
    const held = [...captures.keys()];
    for (const id of held) release(id);
    for (const button of document.querySelectorAll('[data-action]')) button.classList.remove('is-pressed');
  }

  return { reset, setSprint };
}
