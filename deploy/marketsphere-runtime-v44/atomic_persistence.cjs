'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fsyncDirectorySync(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function atomicWriteFileSync(targetPath, data, options = {}) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  fs.mkdirSync(dir, { recursive: true });

  const suffix = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const tmp = path.join(dir, `.${base}.${suffix}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', options.mode || 0o600);
    fs.writeFileSync(fd, data, { encoding: options.encoding || 'utf8' });
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    fs.renameSync(tmp, targetPath);
    fsyncDirectorySync(dir);
  } catch (err) {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function atomicWriteJsonSync(targetPath, value) {
  atomicWriteFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendJsonlRecordSync(targetPath, value) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  let fd;
  try {
    fd = fs.openSync(targetPath, 'a', 0o600);
    fs.writeSync(fd, line, null, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = {
  fsyncDirectorySync,
  atomicWriteFileSync,
  atomicWriteJsonSync,
  appendJsonlRecordSync,
};
