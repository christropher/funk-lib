'use strict';

// local
const async = require('./async');
const color = require('./color');
const crypto = require('./crypto');
const datetime = require('./datetime');
const func = require('./function');
const object = require('./object');
const stream = require('./stream');
const string = require('./string');
const uuid = require('./uuid');

module.exports = {
  async,
  color,
  crypto,
  datetime,
  function: func,
  object,
  process,
  stream,
  string,
  uuid,
};
