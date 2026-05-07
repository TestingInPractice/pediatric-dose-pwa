import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

globalThis.Dexie = class Dexie {
  constructor(name) { this.name = name; }
  version() { return { stores() {} }; }
  open() { return Promise.resolve(); }
};

function loadModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const Module = { exports: {} };
  const fn = new Function('module', 'exports', code + '\nreturn module.exports;');
  const result = fn(Module, Module.exports);
  return result || Module.exports;
}

const calcExports = loadModule(path.join(root, 'js', 'calculator.js'));
const rulesExports = loadModule(path.join(root, 'js', 'level2_rules.js'));

globalThis.Calculator = calcExports.Calculator;
globalThis.Level2Rules = rulesExports.Level2Rules;
