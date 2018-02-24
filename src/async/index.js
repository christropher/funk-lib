'use strict';

// modules
const R = require('ramda');
const { isPromise } = require('is');

// @async number -> undefined
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// wraps a function to always return a promise
const toAsync = (func) => async (...args) => func(...args);

// inverse of callbackify
const promisify = (func) => (...args) => {
  return new Promise((resolve, reject) => {
    func(...args, (err, data) => {
      // eslint-disable-next-line no-unused-expressions
      err ? reject(err) : resolve(data);
    });
  });
};

// inverse of promisify
const callbackify = (func) => (...args) => {
  const cb = args.pop();
  try {
    let output = func(...args);
    // all callbacks async
    if (!isPromise(output)) {
      output = delay(0).then(R.always(output));
    }
    output
      .then((data) => cb(null, data))
      .catch((err) => cb(err));
  } catch (err) {
    cb(err);
  }
};

// @async (parallel)
// predicate -> iterable -> iterable
const forEach = R.curry(async (pred, iterable) => {
  await Promise.all(iterable.map((item) => pred(item)));
  return iterable;
});

// @async (parallel)
// predicate -> iterable -> iterable
const map = R.curry(async (pred, iterable) => {
  return Promise.all(iterable.map((item) => pred(item)));
});

// @async (parallel)
// predicate -> iterable -> iterable
const filter = R.curry(async (pred, iterable) => {
  const bools = await map(pred, iterable);
  return iterable.filter((el, i) => bools[i]);
});

// @async (parallel)
// predicate -> iterable -> iterable
const flatMap = R.curry(async (pred, iterable) => {
  const arrs = await map(pred, iterable);
  return [].concat(...arrs);
});

// @async (series)
// predicate -> * -> iterable -> iterable
const reduce = R.curry(async (pred, init, iterable) => {
  let result = init;
  for (const el of iterable) result = await pred(result, el);
  return result;
});

module.exports = {
  callbackify,
  delay,
  filter,
  flatMap,
  forEach,
  map,
  promisify,
  reduce,
  toAsync,
};
