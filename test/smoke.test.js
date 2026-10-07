"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Open, Parse } = require("..");

test("exports the app-builder-lib compatibility surface", () => {
  assert.equal(typeof Open.file, "function");
  assert.equal(typeof Parse, "function");
});

test("Parse returns an object-mode duplex stream", () => {
  const parser = Parse();
  assert.equal(parser.readableObjectMode, true);
  assert.equal(parser.writableObjectMode, true);
  parser.destroy();
});
