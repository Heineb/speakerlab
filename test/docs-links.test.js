'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [path.join(root, 'README.md')].concat(
  fs.readdirSync(path.join(root, 'docs'))
    .filter(function (name) { return name.endsWith('.md'); })
    .map(function (name) { return path.join(root, 'docs', name); })
);
const failures = [];

files.forEach(function (file) {
  const source = fs.readFileSync(file, 'utf8');
  const expression = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = expression.exec(source))) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || target[0] === '#' || /^[a-z]+:/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) failures.push(path.relative(root, file) + ' -> ' + target);
  }
});

assert.deepStrictEqual(failures, [], 'Broken local documentation links:\n' + failures.join('\n'));
console.log('ok - ' + files.length + ' documentation files have valid local Markdown links');
