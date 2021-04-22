import { EasingFunction } from '../types/easing-function';

const easeOutBounce: EasingFunction = function (elapsed, start, delta, duration) {
  if ((elapsed /= duration) < (1 / 2.75)) {
    return delta * (7.5625 * elapsed * elapsed) + start;
  } else if (elapsed < (2 / 2.75)) {
    return delta * (7.5625 * (elapsed -= (1.5 / 2.75)) * elapsed + .75) + start;
  } else if (elapsed < (2.5 / 2.75)) {
    return delta * (7.5625 * (elapsed -= (2.25 / 2.75)) * elapsed + .9375) + start;
  } else {
    return delta * (7.5625 * (elapsed -= (2.625 / 2.75)) * elapsed + .984375) + start;
  }
};

const easeInBounce: EasingFunction = function (elapsed, start, delta, duration) {
  return delta - easeOutBounce(duration - elapsed, 0, delta, duration) + start;
};

const easeInOutBounce: EasingFunction = function (elapsed, start, delta, duration) {
  if (elapsed < duration / 2) return easeInBounce(elapsed * 2, 0, delta, duration) * .5 + start;
  return easeOutBounce(elapsed * 2 - duration, 0, delta, duration) * .5 + delta * .5 + start;
};

export const easingFunctions: Record<string, EasingFunction> = {
  easeInQuad: function (elapsed, start, delta, duration) {
    return delta * (elapsed /= duration) * elapsed + start;
  },
  easeOutQuad: function (elapsed, start, delta, duration) {
    return -delta * (elapsed /= duration) * (elapsed - 2) + start;
  },
  easeInOutQuad: function (elapsed, start, delta, duration) {
    if ((elapsed /= duration / 2) < 1) return delta / 2 * elapsed * elapsed + start;
    return -delta / 2 * ((--elapsed) * (elapsed - 2) - 1) + start;
  },
  easeInCubic: function (elapsed, start, delta, duration) {
    return delta * (elapsed /= duration) * elapsed * elapsed + start;
  },
  easeOutCubic: function (elapsed, start, delta, duration) {
    return delta * ((elapsed = elapsed / duration - 1) * elapsed * elapsed + 1) + start;
  },
  easeInOutCubic: function (elapsed, start, delta, duration) {
    if ((elapsed /= duration / 2) < 1) return delta / 2 * elapsed * elapsed * elapsed + start;
    return delta / 2 * ((elapsed -= 2) * elapsed * elapsed + 2) + start;
  },
  easeInQuart: function (elapsed, start, delta, duration) {
    return delta * (elapsed /= duration) * elapsed * elapsed * elapsed + start;
  },
  easeOutQuart: function (elapsed, start, delta, duration) {
    return -delta * ((elapsed = elapsed / duration - 1) * elapsed * elapsed * elapsed - 1) + start;
  },
  easeInOutQuart: function (elapsed, start, delta, duration) {
    if ((elapsed /= duration / 2) < 1) return delta / 2 * elapsed * elapsed * elapsed * elapsed + start;
    return -delta / 2 * ((elapsed -= 2) * elapsed * elapsed * elapsed - 2) + start;
  },
  easeInQuint: function (elapsed, start, delta, duration) {
    return delta * (elapsed /= duration) * elapsed * elapsed * elapsed * elapsed + start;
  },
  easeOutQuint: function (elapsed, start, delta, duration) {
    return delta * ((elapsed = elapsed / duration - 1) * elapsed * elapsed * elapsed * elapsed + 1) + start;
  },
  easeInOutQuint: function (elapsed, start, delta, duration) {
    if ((elapsed /= duration / 2) < 1) return delta / 2 * elapsed * elapsed * elapsed * elapsed * elapsed + start;
    return delta / 2 * ((elapsed -= 2) * elapsed * elapsed * elapsed * elapsed + 2) + start;
  },
  easeInSine: function (elapsed, start, delta, duration) {
    return -delta * Math.cos(elapsed / duration * (Math.PI / 2)) + delta + start;
  },
  easeOutSine: function (elapsed, start, delta, duration) {
    return delta * Math.sin(elapsed / duration * (Math.PI / 2)) + start;
  },
  easeInOutSine: function (elapsed, start, delta, duration) {
    return -delta / 2 * (Math.cos(Math.PI * elapsed / duration) - 1) + start;
  },
  easeInExpo: function (elapsed, start, delta, duration) {
    return (elapsed == 0) ? start : delta * Math.pow(2, 10 * (elapsed / duration - 1)) + start;
  },
  easeOutExpo: function (elapsed, start, delta, duration) {
    return (elapsed == duration) ? start + delta : delta * (-Math.pow(2, -10 * elapsed / duration) + 1) + start;
  },
  easeInOutExpo: function (elapsed, start, delta, duration) {
    if (elapsed == 0) return start;
    if (elapsed == duration) return start + delta;
    if ((elapsed /= duration / 2) < 1) return delta / 2 * Math.pow(2, 10 * (elapsed - 1)) + start;
    return delta / 2 * (-Math.pow(2, -10 * --elapsed) + 2) + start;
  },
  easeInCirc: function (elapsed, start, delta, duration) {
    return -delta * (Math.sqrt(1 - (elapsed /= duration) * elapsed) - 1) + start;
  },
  easeOutCirc: function (elapsed, start, delta, duration) {
    return delta * Math.sqrt(1 - (elapsed = elapsed / duration - 1) * elapsed) + start;
  },
  easeInOutCirc: function (elapsed, start, delta, duration) {
    if ((elapsed /= duration / 2) < 1) return -delta / 2 * (Math.sqrt(1 - elapsed * elapsed) - 1) + start;
    return delta / 2 * (Math.sqrt(1 - (elapsed -= 2) * elapsed) + 1) + start;
  },
  easeInElastic: function (elapsed, start, delta, duration) {
    var s = 1.70158; var p = 0; var a = delta;
    if (elapsed == 0) return start; if ((elapsed /= duration) == 1) return start + delta; if (!p) p = duration * .3;
    if (a < Math.abs(delta)) { a = delta; var s = p / 4; }
    else var s = p / (2 * Math.PI) * Math.asin(delta / a);
    return -(a * Math.pow(2, 10 * (elapsed -= 1)) * Math.sin((elapsed * duration - s) * (2 * Math.PI) / p)) + start;
  },
  easeOutElastic: function (elapsed, start, delta, duration) {
    var s = 1.70158; var p = 0; var a = delta;
    if (elapsed == 0) return start; if ((elapsed /= duration) == 1) return start + delta; if (!p) p = duration * .3;
    if (a < Math.abs(delta)) { a = delta; var s = p / 4; }
    else var s = p / (2 * Math.PI) * Math.asin(delta / a);
    return a * Math.pow(2, -10 * elapsed) * Math.sin((elapsed * duration - s) * (2 * Math.PI) / p) + delta + start;
  },
  easeInOutElastic: function (elapsed, start, delta, duration) {
    var s = 1.70158; var p = 0; var a = delta;
    if (elapsed == 0) return start; if ((elapsed /= duration / 2) == 2) return start + delta; if (!p) p = duration * (.3 * 1.5);
    if (a < Math.abs(delta)) { a = delta; var s = p / 4; }
    else var s = p / (2 * Math.PI) * Math.asin(delta / a);
    if (elapsed < 1) return -.5 * (a * Math.pow(2, 10 * (elapsed -= 1)) * Math.sin((elapsed * duration - s) * (2 * Math.PI) / p)) + start;
    return a * Math.pow(2, -10 * (elapsed -= 1)) * Math.sin((elapsed * duration - s) * (2 * Math.PI) / p) * .5 + delta + start;
  },
  easeInBack: function (elapsed, start, delta, duration, s) {
    if (s == undefined) s = 1.70158;
    return delta * (elapsed /= duration) * elapsed * ((s + 1) * elapsed - s) + start;
  },
  easeOutBack: function (elapsed, start, delta, duration, s) {
    if (s == undefined) s = 1.70158;
    return delta * ((elapsed = elapsed / duration - 1) * elapsed * ((s + 1) * elapsed + s) + 1) + start;
  },
  easeInOutBack: function (elapsed, start, delta, duration, s) {
    if (s == undefined) s = 1.70158;
    if ((elapsed /= duration / 2) < 1) return delta / 2 * (elapsed * elapsed * (((s *= (1.525)) + 1) * elapsed - s)) + start;
    return delta / 2 * ((elapsed -= 2) * elapsed * (((s *= (1.525)) + 1) * elapsed + s) + 2) + start;
  },
  easeInBounce: easeInBounce,
  easeOutBounce: easeOutBounce,
  easeInOutBounce: easeInOutBounce
};
