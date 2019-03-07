"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randomHsl = exports.randomHex = exports.randomRgb = exports.hexToHsl = exports.hslToHex = exports.rgbToHex = exports.hexToRgb = exports.hslToRgb = exports.rgbToHsl = void 0;

var R = _interopRequireWildcard(require("ramda"));

var _number = require("../number");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const rgbToHsl = ({
  r,
  g,
  b
}) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
      s,
      l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;

      case g:
        h = (b - r) / d + 2;
        break;

      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: h * 360,
    s,
    l
  };
};

exports.rgbToHsl = rgbToHsl;

const hslToRgb = ({
  h,
  s,
  l
}) => {
  h /= 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

exports.hslToRgb = hslToRgb;

const hexToRgb = hex => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

exports.hexToRgb = hexToRgb;
const rgbToHex = R.pipe(R.map(color => {
  const hex = color.toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}), ({
  r,
  g,
  b
}) => `#${r}${g}${b}`);
exports.rgbToHex = rgbToHex;
const hslToHex = R.pipe(hslToRgb, rgbToHex);
exports.hslToHex = hslToHex;
const hexToHsl = R.pipe(hexToRgb, rgbToHsl);
exports.hexToHsl = hexToHsl;

const randomRgb = () => ({
  r: (0, _number.random)(0, 255),
  g: (0, _number.random)(0, 255),
  b: (0, _number.random)(0, 255)
});

exports.randomRgb = randomRgb;
const randomHex = R.pipe(randomRgb, rgbToHex);
exports.randomHex = randomHex;
const randomHsl = R.pipe(randomRgb, rgbToHsl);
exports.randomHsl = randomHsl;