'use strict';

// modules
const R = require('ramda');

// local
const { pipeC } = require('../function');
const { is, isIterable } = require('../is');


class StopIteration extends Error {}

// * -> Iterable<T> -> T | *
const nextOr = R.curry((or, iterable) => {
  const { value, done } = iterable.next();
  return done ? or : value;
});

// todo: this is also "head" and "first"
// Iterable<T> -> T
const next = (iterable) => {
  const err = new StopIteration();
  const out = nextOr(err, iterable);
  if (out === err) throw err;
  return out;
};

// Iterable<T> -> T
const last = (iterable) => {
  let last;
  for (const item of iterable) last = item;
  return last;
};

// (A -> Iterable<B>) -> Iterable<A> -> Iterator<B>
const flatMap = R.curry(function* flatMap(pred, iterable) {
  for (const item of iterable) yield* pred(item);
});

// (A -> B) -> Iterable<A> -> Iterator<B>
const map = R.curry(function* map(pred, iterable) {
  for (const item of iterable) yield pred(item);
});

// returns an iterator from an iterable
// Iterable<T> -> Iterator<T>
const from = map(R.identity);

// create an iterator of one or more (variadic) arguments
// T... -> Iterator<T>
const of = R.unapply(from);

// ((A, T) -> A) -> A -> Iterable<T> -> Iterator<A>
const scan = R.curry(function* scan(pred, acc, iterable) {
  yield acc;
  yield* map((item) => (acc = pred(acc, item)), iterable);
});

// ((A, T) -> A) -> A -> Iterable<T> -> A
const reduce = pipeC(scan, last);

// ((...A) -> B) -> [Iterable<A>] -> Iterator<B>
const zipAllWith = R.curry(function* zipAllWith(pred, iterators) {
  iterators = R.map(from, iterators);
  while (true) {
    const { done, values } = R.reduce((out, iterator) => {
      if (out.done) return R.reduced(out);
      const { value, done } = iterator.next();
      return R.evolve({
        values: R.append(value),
        done: R.or(done),
      }, out);
    }, { done: false, values: [] }, iterators);
    if (done) return;
    yield pred(...values);
  }
});

// [Iterable<A>] -> Iterator<B>
const zipAll = zipAllWith(Array.of);

const zipWithN = n => R.curryN(n + 1)((pred, ...iterables) => zipAllWith(pred, iterables));

// ((A, B) -> C) -> Iterable<A> -> Iterable<B> -> Iterator<C>
const zipWith = zipWithN(2);

// Iterable<A> -> Iterable<B> -> Iterator<[A, B]>
const zip = zipWith(Array.of);

// Number -> Number -> Number -> Iterator<Number>
const rangeStep = R.curry(function* rangeStep(step, start, stop) {
  if (step === 0) return;
  const cont = i => (step > 0 ? i < stop : i > stop);
  for (let i = start; cont(i); i += step) yield i;
});

// Number -> Number -> Iterator<Number>
const range = rangeStep(1);

// Iterable<T> -> Iterator<[Integer, T]>
const enumerate = iterable => zip(range(0, Infinity), iterable);

// accumulate is to scan, like reduce with no init
// todo: consider ditching this. scan is more useful
// ((A, T) -> A) -> Iterable<T> -> Iterator<A>
const accumulate = R.curry((pred, iterable) => {
  let last;
  return map(([i, item]) => {
    return (last = i ? pred(last, item) : item);
  }, enumerate(iterable));
});

// Integer -> Integer -> Iterable<T> -> Iterator<T>
const slice = R.curry(function* slice(start, stop, iterable) {
  for (const [i, item] of enumerate(iterable)) {
    if (i >= start) yield item;
    if (i >= stop - 1) return;
  }
});

// Iterable<T> -> Iterator<T>
const tail = slice(1, Infinity);

// Iterable<T> -> Iterable<T> -> Iterable<T>
const concat = R.curry(function* concat(iterator1, iterator2) {
  yield* iterator1;
  yield* iterator2;
});

// T -> Iterable<T> -> Iterator<T>
const prepend = R.useWith(concat, [of, R.identity]);

// T -> Iterable<T> -> Iterator<T>
const append = R.useWith(R.flip(concat), [of, R.identity]);

// (T -> *) -> Iterable<T> -> Iterator<T>
const forEach = R.curry(function* forEach(pred, iterable) {
  // eslint-disable-next-line no-unused-expressions
  for (const item of iterable) pred(item), yield item;
});

// (T -> Boolean) -> Iterable<T> -> Iterator<T>
const filter = R.curry(function* filter(pred, iterable) {
  for (const item of iterable) if (pred(item)) yield item;
});

// (T -> Boolean) -> Iterable<T> -> Iterator<T>
const reject = R.useWith(filter, [R.complement, R.identity]);

// (A -> [B]) -> * -> Iterator<B>
const unfold = R.curry(function* unfold(pred, item) {
  let pair = pred(item);
  while (pair && pair.length) {
    yield pair[0];
    pair = pred(pair[1]);
  }
});

// (T -> T) -> T -> Iterator<T>
const iterate = R.useWith(unfold, [
  pred => item => [item, pred(item)],
  R.identity,
]);

// ((T, T) -> Boolean) -> Iterable<T> -> Iterator<T>
const uniqueWith = R.curry(function* uniqueWith(pred, iterable) {
  const seen = [];
  const add = saw => seen.push(saw);
  const has = item => seen.some((saw) => pred(item, saw));
  yield* filter((item) => {
    if (has(item)) return false;
    add(item);
    return true;
  }, iterable);
});

// Iterable<T> -> Iterator<T>
const unique = function* unique(iterable) {
  const set = new Set();
  yield* filter((item) => {
    if (set.has(item)) return;
    set.add(item);
    return true;
  }, iterable);
};

// Integer -> Iterable<T> -> Iterator<T>
const take = R.curry(function* take(n, iterable) {
  if (n <= 0) return;
  yield* slice(0, n, iterable);
});

// Integer -> Iterable<T> -> Iterator<T>
const drop = R.curry((n, iterable) => slice(n, Infinity, iterable));

// T -> Iterator<T>
const repeat = iterate(R.identity);

// aka replicate
// Integer -> T -> Iterator<T>
const times = R.useWith(take, [R.identity, repeat]);

// Iterable<T> -> Integer
const length = reduce(R.add(1), 0);

// (T -> Boolean) -> Iterable<T> -> Integer
const count = pipeC(filter, length);

// (T -> Number) -> Iterable<T> -> Number
const sumBy = pipeC(map, reduce(R.add, 0));

// (T -> Number) -> Iterable<T> -> Number
const minBy = pipeC(map, reduce(Math.min, Infinity));

// (T -> Number) -> Iterable<T> -> Number
const maxBy = pipeC(map, reduce(Math.max, -Infinity));

// Iterable<Number> -> Number
const sum = sumBy(R.identity);

// Iterable<Number> -> Number
const min = minBy(R.identity);

// Iterable<Number> -> Number
const max = maxBy(R.identity);

// Iterable<T> -> [T]
const toArray = reduce(R.flip(R.append), []);

// Integer -> Iterable<T> -> T | Undefined
const nth = R.curry((n, iterable) => {
  for (const [i, item] of enumerate(iterable)) {
    if (i === n) return item;
  }
});

// todo: consider calling this any
// (T -> Boolean) -> Iterable<T> -> Boolean
const some = R.curry((pred, iterable) => {
  for (const item of iterable) if (pred(item)) return true;
  return false;
});

// (T -> Boolean) -> Iterable<T> -> Boolean
const none = R.complement(some);

// (T -> Boolean) -> Iterable<T> -> Boolean
const every = R.curry((pred, iterable) => {
  for (const item of iterable) if (!pred(item)) return false;
  return true;
});

// (T -> Boolean) -> Iterable<T> -> T | Undefined
const find = R.curry((pred, iterable) => {
  for (const item of iterable) if (pred(item)) return item;
});

// (T -> Boolean) -> Iterable<T> -> Integer
const findIndex = R.curry((pred, iterable) => {
  for (const [i, item] of enumerate(iterable)) {
    if (pred(item)) return i;
  }
  return -1;
});

// Iterable<T> -> Undefined
const exhaust = (iterable) => {
  // eslint-disable-next-line no-unused-vars
  for (const item of iterable);
};

// (T -> Boolean) -> Iterable<T> -> Iterator<T>
const takeWhile = R.curry(function* takeWhile(pred, iterable) {
  for (const item of iterable) {
    if (!pred(item)) return;
    yield item;
  }
});

// (T -> Boolean) -> Iterable<T> -> Iterator<T>
const dropWhile = R.curry(function* dropWhile(pred, iterable) {
  const iterator = from(iterable);
  for (const item of iterator) {
    if (!pred(item)) return yield* prepend(item, iterator);
  }
});

// todo: there might be a more efficient strategy for arrays
// generators are not iterable in reverse
// Iterable<T> -> Iterator<T>
const reverse = R.pipe(toArray, R.reverse);

// ((T, T) -> Number) -> Iterable<T> -> Iterator<T>
const sort = R.useWith(R.sort, [R.identity, toArray]);

// Integer -> Iterable<T> -> Iterator<[T]>
const frame = R.curry(function* frame(size, iterable) {
  const cache = [];
  yield* flatMap(function* fmap(item) {
    if (cache.length === size) {
      yield [...cache];
      cache.shift();
    }
    cache.push(item);
  }, iterable);
  yield cache;
});

// T -> Iterable<T> -> Integer
const indexOf = R.useWith(findIndex, [is, R.identity]);

// * -> Iterable<T> -> Boolean
const includes = R.useWith(some, [is, R.identity]);

// ((T , T) -> Boolean) -> Iterable<T> -> Iterator<[T]>
const groupWith = R.curry(function* groupWith(pred, iterable) {
  let last, group = [];
  yield* flatMap(function* fmap([i, item]) {
    if (i && !pred(last, item)) {
      yield group;
      group = [];
    }
    group.push(last = item);
  }, enumerate(iterable));
  if (group.length) yield group;
});

// Iterable<T> -> Iterator<[T]>
const group = groupWith(is);

// Integer -> Iterable<T> -> [Iterator<T>]
const tee = R.curry((n, iterable) => {
  const iterator = from(iterable);
  return [...Array(n)]
    .map(() => [])
    .map(function* gen(cache, _, caches) {
      while (true) {
        if (!cache.length) {
          const { done, value } = iterator.next();
          if (done) return;
          for (const cache of caches) cache.push(value);
        }
        yield cache.shift();
      }
    });
});

// Integer -> Iterable<T> -> Iterator<[T]>
const splitEvery = R.curry(function* splitEvery(n, iterable) {
  let group = [];
  yield* flatMap(function* fmap(item) {
    group.push(item);
    if (group.length < n) return;
    yield group;
    group = [];
  }, iterable);
  if (group.length) yield group;
});

// Integer -> Iterable<T> -> [Iterator<T>, Iterator<T>]
const splitAt = R.curry((n, iterable) => {
  const [it1, it2] = tee(2, iterable);
  return [take(n, it1), drop(n, it2)];
});

// (T -> Boolean) -> Iterable<T> -> [Iterable<T>, Iterable<T>]
const partition = R.curry((pred, iterable) => {
  const [pass, fail] = tee(2, iterable);
  return [
    filter(pred, pass),
    reject(pred, fail),
  ];
});

// Number -> Iterable<Iterable<T>> -> Iterator<T>
const flattenN = R.curry((n, iterable) => {
  if (n < 1) return iterable;
  return flatMap(function* fmap(item) {
    if (!isIterable(item)) return yield item;
    yield* flattenN(n - 1, item);
  }, iterable);
});

// Iterable<Iterable<T>> -> Iterator<T>
const unnest = flattenN(1);

// Iterable<Iterable<T>> -> Iterator<T>
const flatten = flattenN(Infinity);

// Integer -> Iterable<T> -> Iterator<T>
const cycleN = R.curry(function* cycleN(n, iterable) {
  if (n < 1) return;
  const buffer = [];
  yield* forEach((item) => buffer.push(item), iterable);
  while (n-- > 1) yield* buffer;
});

// Iterable<T> -> Iterator<T>
const cycle = cycleN(Infinity);

// Number -> Iterable<[A, B, ...Z]> -> [Iterator<A>, Iterator<B>, ...Iterator<Z>]
const unzipN = pipeC(tee, R.addIndex(R.map)((iter, i) => map(nth(i), iter)));

// Iterable<[A, B]> -> [Iterator<A>, Iterator<B>]
const unzip = unzipN(2);

// T -> Iterable<T> -> Iterator<T>
const intersperse = R.useWith(flatMap, [
  spacer => ([i, item]) => (i ? [spacer, item] : [item]),
  enumerate,
]);

// String -> Iterable<T> -> String
const joinWith = pipeC(
  intersperse,
  reduce(R.unapply(R.join('')), ''),
);

// Iterable<T> -> String
const join = joinWith('');

// Iterable<T> -> Boolean
const isEmpty = none(_ => true);

// ((T, T) -> Boolean) -> Iterable<T> -> Iterable<T> -> Boolean
const correspondsWith = R.useWith((pred, iterator1, iterator2) => {
  let done;
  do {
    const { done: done1, value: value1 } = iterator1.next();
    const { done: done2, value: value2 } = iterator2.next();
    if (done1 !== done2) return false;
    done = (done1 && done2);
    if (!done && !pred(value1, value2)) return false;
  } while (!done);
  return true;
}, [R.identity, from, from]);

// todo: is this "equals" or "is"?
// Iterable<T> -> Iterable<T> -> Boolean
const corresponds = correspondsWith(is);

// Iterable<T> -> Iterable<Integer>
const indices = R.pipe(enumerate, map(R.head));

// Integer -> T -> Iterable<T> -> Iterator<T>
const padTo = R.curry(function* padTo(len, padder, iterable) {
  let n = 0;
  yield* forEach((item) => n++, iterable);
  if (n < len) yield* times(len - n, padder);
});

// T -> Iterable<T> -> Iterator<T>
const pad = padTo(Infinity);

// const unionWith = R.curry(() => {});
// const union = unionWith(is);

// const intersectWith = R.curry(() => {});
// const intersect = intersectWith(is);

// const combinations = R.curry(function* combinations() {});
// const permutations = R.curry(function* permutations(n, iterable) {});

module.exports = {
  accumulate,
  append,
  concat,
  corresponds,
  correspondsWith,
  count,
  cycle,
  cycleN,
  drop,
  dropWhile,
  enumerate,
  every,
  exhaust,
  filter,
  find,
  findIndex,
  flatMap,
  flatten,
  flattenN,
  forEach,
  frame,
  from,
  group,
  groupWith,
  includes,
  indexOf,
  indices,
  intersperse,
  isEmpty,
  iterate,
  join,
  joinWith,
  last,
  length,
  map,
  max,
  maxBy,
  min,
  minBy,
  next,
  nextOr,
  none,
  nth,
  of,
  pad,
  padTo,
  partition,
  prepend,
  range,
  rangeStep,
  reduce,
  reject,
  repeat,
  reverse,
  scan,
  slice,
  some,
  sort,
  splitAt,
  splitEvery,
  StopIteration,
  sum,
  sumBy,
  tail,
  take,
  takeWhile,
  tee,
  times,
  toArray,
  unfold,
  unique,
  uniqueWith,
  unnest,
  unzip,
  unzipN,
  zip,
  zipAll,
  zipAllWith,
  zipWith,
  zipWithN,
};
