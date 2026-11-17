'use strict';
const { Key } = require('@nut-tree-fork/nut-js');

// Allow-list fechada: só os KeyboardEvent.code abaixo chegam ao nut.js.
// Qualquer outro código é ignorado tanto aqui quanto no navegador (public/js/features/remote-control.js).
const KEY_MAP = {};
for (let i = 0; i < 26; i++) KEY_MAP[`Key${String.fromCharCode(65 + i)}`] = Key[String.fromCharCode(65 + i)];
for (let i = 0; i <= 9; i++) { KEY_MAP[`Digit${i}`] = Key[`Num${i}`]; KEY_MAP[`Numpad${i}`] = Key[`NumPad${i}`]; }
for (let i = 1; i <= 12; i++) KEY_MAP[`F${i}`] = Key[`F${i}`];

Object.assign(KEY_MAP, {
  NumpadAdd: Key.Add, NumpadSubtract: Key.Subtract, NumpadMultiply: Key.Multiply, NumpadDivide: Key.Divide,
  NumpadDecimal: Key.Decimal, NumpadEnter: Key.Enter,
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  Enter: Key.Enter, Escape: Key.Escape, Tab: Key.Tab, Backspace: Key.Backspace, Delete: Key.Delete, Space: Key.Space,
  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  CapsLock: Key.CapsLock, Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown, Insert: Key.Insert,
  Minus: Key.Minus, Equal: Key.Equal, BracketLeft: Key.LeftBracket, BracketRight: Key.RightBracket,
  Semicolon: Key.Semicolon, Quote: Key.Quote, Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash,
  Backslash: Key.Backslash, Backquote: Key.Grave
});

function resolveKey(code) { return typeof code === 'string' ? KEY_MAP[code] || null : null; }
function allowedCode(code) { return typeof code === 'string' && Object.prototype.hasOwnProperty.call(KEY_MAP, code); }

module.exports = { resolveKey, allowedCode };
