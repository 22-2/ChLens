export function defer() {
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function wait5s() {
  return new Promise((resolve) => {
    setTimeout(resolve, 5 * 1000);
  });
}

export function waitAF() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
