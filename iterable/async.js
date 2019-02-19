'use strict';

// modules
const R = require('ramda');

// local
const { pipeC } = require('../function');
const { pipeC: asyncPipeC, reduce: reduceP } = require('../async');
const { is, isIterable } = require('../is');
const StopIteration = require('./stop-iteration');
const { yieldWithAsync: yieldWith } = require('./yield-with');

const complementP = (func) => R.curryN(func.length)(async (...args) => !await func(...args));

// todo: consider replacing "is" with R.equals

// * -> Iterable<T> -> Promise<T|*>
const nextOr = R.curry(async (or, iterable) => {
  const { value, done } = await iterable.next();
  return done ? or : value;
});

// returns the first or "next" item. aka head
// Iterable<T> -> Promise<T>
const next = async (iterable) => {
  const err = new StopIteration();
  const out = await nextOr(err, iterable);
  if (out === err) throw err;
  return out;
};

// returns the last item
// Iterable<T> -> Promise<T>
const last = async (iterable) => {
  let last;
  for await (const item of iterable) last = item;
  return last;
};

// (A -> Iterable<B>) -> Iterable<A> -> AsyncIterator<B>
const flatMap = R.curry(async function* flatMap(pred, iterable) {
  for await (const item of iterable) yield* await pred(item);
});

// (A -> Promise<B>) -> Iterable<A> -> AsyncIterator<B>
const map = R.curry(async function* map(pred, iterable) {
  for await (const item of iterable) yield await pred(item);
});

// returns an iterator from an iterable
// Iterable<T> -> AsyncIterator<T>
const from = map(R.identity);

// create an iterator of one or more (variadic) arguments
// T... -> AsyncIterator<T>
const of = R.unapply(from);

// ((A, T) -> Promise<A>) -> A -> Iterable<T> -> AsyncIterator<A>
const scan = R.curry(async function* scan(pred, acc, iterable) {
  yield acc;
  yield* map(async (item) => (acc = await pred(acc, item)), iterable);
});

// ((A, T) -> Promise<A>) -> A -> Iterable<T> -> Promise<A>
const reduce = asyncPipeC(scan, last);

// ((...A) -> Promise<B>) -> [Iterable<A>] -> AsyncIterator<B>
const zipAllWith = R.curry(async function* zipAllWith(pred, iterators) {
  iterators = R.map(from, iterators);
  while (true) {
    const { done, values } = await reduceP(async (out, iterator) => {
      // todo: make R.reduced(out) work here
      if (out.done) return out;
      const { value, done } = await iterator.next();
      return R.evolve({
        values: R.append(value),
        done: R.or(done),
      }, out);
    }, { done: false, values: [] }, iterators);
    if (done) return;
    yield await pred(...values);
  }
});

// zip an array of iterables into an iterables of arrays of items from corresponding indices
// of the input iterables
// [Iterable<A>] -> AsyncIterator<B>
const zipAll = zipAllWith(Array.of);

const zipWithN = n => R.curryN(n + 1)((pred, ...iterables) => zipAllWith(pred, iterables));

// ((A, B) -> Promise<C>) -> Iterable<A> -> Iterable<B> -> AsyncIterator<C>
const zipWith = zipWithN(2);

// "zips" two iterables into pairs of items from corresponding indices
// of the input iterables. truncated to shorter of two iterables
// Iterable<A> -> Iterable<B> -> AsyncIterator<[A, B]>
const zip = zipWith(Array.of);

// iterates from 0 to n by with a step (exclusive)
// Number -> Number -> Number -> AsyncIterator<Number>
const rangeStep = R.curry(async function* rangeStep(step, start, stop) {
  if (step === 0) return;
  const cont = i => (step > 0 ? i < stop : i > stop);
  for (let i = start; cont(i); i += step) yield await i;
});

// iterates from 0 to n - 1 (exclusive)
// Number -> Number -> AsyncIterator<Number>
const range = rangeStep(1);

// transform an iterable to an iterable of pairs of indices and their items
// Iterable<T> -> AsyncIterator<[Integer, T]>
const enumerate = iterable => zip(range(0, Infinity), iterable);

// accumulate is to scan, like reduce with no init
// todo: consider ditching this. scan is more useful
// ((A, T) -> Promise<A>) -> Iterable<T> -> AsyncIterator<A>
const accumulate = R.curry((pred, iterable) => {
  let last;
  return map(async ([i, item]) => {
    return (last = i ? await pred(last, item) : item);
  }, enumerate(iterable));
});

// Integer -> Integer -> Iterable<T> -> AsyncIterator<T>
const slice = R.curry(async function* slice(start, stop, iterable) {
  for await (const [i, item] of enumerate(iterable)) {
    if (i >= start) yield item;
    if (i >= stop - 1) return;
  }
});

// yield all items from one iterator, then the other
// Iterable<T> -> Iterable<T> -> AsyncIterator<T>
const concat = R.curry(async function* concat(iterator1, iterator2) {
  yield* iterator1;
  yield* iterator2;
});

// prepend an item (T) to the end of an iterable
// T -> Iterable<T> -> AsyncIterator<T>
const prepend = R.useWith(concat, [of, R.identity]);

// append an item (T) to the start of an iterable
// T -> Iterable<T> -> AsyncIterator<T>
const append = R.useWith(R.flip(concat), [of, R.identity]);

// run a function (side-effect) once for each item
// (T -> Promise<*>) -> Iterable<T> -> AsyncIterator<T>
const forEach = R.curry(async function* forEach(pred, iterable) {
  // eslint-disable-next-line no-unused-expressions
  for await (const item of iterable) await pred(item), yield item;
});

// yield only items that pass the predicate
// (T -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<T>
const filter = R.curry(async function* filter(pred, iterable) {
  for await (const item of iterable) {
    if (await pred(item)) yield item;
  }
});

// yield only items that do not pass the predicate
// (T -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<T>
const reject = R.useWith(filter, [complementP, R.identity]);

// (A -> Promise<[B]>) -> * -> AsyncIterator<B>
const unfold = R.curry(async function* unfold(pred, item) {
  let pair = await pred(item);
  while (pair && pair.length) {
    yield pair[0];
    pair = await pred(pair[1]);
  }
});

// iterate infinitely, yielding items from seed through a predicate
// (T -> Promise<T>) -> T -> AsyncIterator<T>
const iterate = R.useWith(unfold, [
  pred => async item => [item, await pred(item)],
  R.identity,
]);

// todo: consider calling this any
// does any item pass its predicate?
// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<Boolean>
const some = R.curry(async (pred, iterable) => {
  for await (const item of iterable) if (await pred(item)) return true;
  return false;
});

// do all items fail their predicate?
// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<Boolean>
const none = complementP(some);

// yield only items that are unique by their predicate
// ((T, T) -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<T>
const uniqueWith = R.curry(async function* uniqueWith(pred, iterable) {
  const seen = [];
  const add = saw => seen.push(saw);
  const has = async item => some((saw) => pred(item, saw), seen);
  yield* filter(async (item) => {
    if (await has(item)) return false;
    add(item);
    return true;
  }, iterable);
});

// yield only the unique items in an iterable (using Set)
// Iterable<T> -> AsyncIterator<T>
const unique = async function* unique(iterable) {
  const set = new Set();
  yield* filter((item) => {
    if (set.has(item)) return;
    set.add(item);
    return true;
  }, iterable);
};

// yield only the first n items of an iterable
// Integer -> Iterable<T> -> AsyncIterator<T>
const take = R.curry(async function* take(n, iterable) {
  if (n <= 0) return;
  yield* slice(0, n, iterable);
});

// drop the first n items of an iterable
// Integer -> Iterable<T> -> AsyncIterator<T>
const drop = R.curry((n, iterable) => slice(n, Infinity, iterable));

// yield all but the first item
// Iterable<T> -> AsyncIterator<T>
const tail = drop(1);

// infinitely yield an item (T)
// T -> Iterator<T>
const repeat = iterate(R.identity);

// yield an item (T) n times
// aka replicate
// Integer -> T -> AsyncIterator<T>
const times = R.useWith(take, [R.identity, repeat]);

// Iterable<T> -> Promise<Integer>
const length = reduce(R.add(1), 0);

// return the number of items in an iterable. exhasts input
// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<Integer>
const count = pipeC(filter, length);

// (T -> Promise<Number>) -> Iterable<T> -> Promise<Number>
const sumBy = pipeC(map, reduce(R.add, 0));

// (T -> Promise<Number>) -> Iterable<T> -> Promise<Number>
const minBy = pipeC(map, reduce(Math.min, Infinity));

// (T -> Promise<Number>) -> Iterable<T> -> Promise<Number>
const maxBy = pipeC(map, reduce(Math.max, -Infinity));

// Iterable<Number> -> Promise<Number>
const sum = sumBy(R.identity);

// Iterable<Number> -> Promise<Number>
const min = minBy(R.identity);

// Iterable<Number> -> Promise<Number>
const max = maxBy(R.identity);

// transforms an iterable to an array. exhasts input
// Iterable<T> -> Promise<[T]>
const toArray = reduce(R.flip(R.append), []);

// returns the item at the nth index
// Integer -> Iterable<T> -> Promise<T|Undefined>
const nth = R.curry(async (n, iterable) => {
  for await (const [i, item] of enumerate(iterable)) {
    if (i === n) return item;
  }
});

// do all items pass their predicate?
// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<Boolean>
const every = R.curry(async (pred, iterable) => {
  for await (const item of iterable) {
    if (!await pred(item)) return false;
  }
  return true;
});

// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<T|Undefined>
const find = R.curry(async (pred, iterable) => {
  for await (const item of iterable) if (await pred(item)) return item;
});

// (T -> Promise<Boolean>) -> Iterable<T> -> Promise<Integer>
const findIndex = R.curry(async (pred, iterable) => {
  for await (const [i, item] of enumerate(iterable)) {
    if (await pred(item)) return i;
  }
  return -1;
});

// yield all items
// Iterable<T> -> Promise<Undefined>
const exhaust = async (iterable) => {
  // eslint-disable-next-line no-unused-vars
  for await (const item of iterable);
};

// (T -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<T>
const takeWhile = R.curry(async function* takeWhile(pred, iterable) {
  for await (const item of iterable) {
    if (!await pred(item)) return;
    yield item;
  }
});

// (T -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<T>
const dropWhile = R.curry(async function* dropWhile(pred, iterable) {
  const iterator = from(iterable);
  for await (const item of iterator) {
    if (!await pred(item)) return yield* prepend(item, iterator);
  }
});

// todo: there might be a more efficient strategy for arrays
// generators are not iterable in reverse
// Iterable<T> -> AsyncIterator<T>
const reverse = async function* reverse(iterable) {
  yield* (await toArray(iterable)).reverse();
};

// fixme
// ((T, T) -> Promise<Number>) -> Iterable<T> -> AsyncIterator<T>
const sort = R.useWith(R.sort, [R.identity, toArray]);

// yield a sliding "window" of length n
// note: caches of n items
// Integer -> Iterable<T> -> AsyncIterator<[T]>
const frame = R.curry(async function* frame(n, iterable) {
  const cache = [];
  yield* flatMap(async function* fmap(item) {
    if (cache.length === n) {
      yield [...cache];
      cache.shift();
    }
    cache.push(item);
  }, iterable);
  yield cache;
});

// yield all but the last n items
// note: caches n + 1 items
// Number -> Iterable<T> -> AsyncIterator<T>
const dropLast = R.curry(async function* dropLast(n, iterable) {
  const done = new StopIteration();
  for await (const group of frame(n + 1, append(done, iterable))) {
    if (R.last(group) === done) return;
    yield R.head(group);
  }
});

// yield all but the last 1 item
// Iterable<T> -> AsyncIterator<T>
const init = dropLast(1);

// T -> Iterable<T> -> Promise<Integer>
const indexOf = R.useWith(findIndex, [is, R.identity]);

// * -> Iterable<T> -> Promise<Boolean>
const includes = R.useWith(some, [is, R.identity]);

// yield groups of items where the predicate returns truthy
// for all adjacent items
// ((T , T) -> Promise<Boolean>) -> Iterable<T> -> AsyncIterator<[T]>
const groupWith = R.curry(async function* groupWith(pred, iterable) {
  let last, group = [];
  yield* flatMap(async function* fmap([i, item]) {
    if (i && !await pred(last, item)) {
      yield group;
      group = [];
    }
    group.push(last = item);
  }, enumerate(iterable));
  if (group.length) yield group;
});

// Iterable<T> -> AsyncIterator<[T]>
const group = groupWith(is);

// copy an iterator n times (exhausts its input)
// Integer -> Iterable<T> -> [AsyncIterator<T>]
const tee = R.curry((n, iterable) => {
  const iterator = from(iterable);
  return [...Array(n)]
    .map(() => [])
    .map(async function* gen(cache, i, caches) {
      while (true) {
        if (!cache.length) {
          const { done, value } = await iterator.next();
          if (done) {
            if (cache.length) yield* cache;
            return;
          }
          for (const cache of caches) cache.push(value);
        }
        yield cache.shift();
      }
    });
});

// yield groups of length n
// Integer -> Iterable<T> -> AsyncIterator<[T]>
const splitEvery = R.curry(async function* splitEvery(n, iterable) {
  let group = [];
  yield* flatMap(async function* fmap(item) {
    group.push(item);
    if (group.length < n) return;
    yield group;
    group = [];
  }, iterable);
  if (group.length) yield group;
});

// split an iterable into a pair of iterables at a particular index
// Integer -> Iterable<T> -> [AsyncIterator<T>, AsyncIterator<T>]
const splitAt = R.curry((n, iterable) => {
  const [it1, it2] = tee(2, iterable);
  return [take(n, it1), drop(n, it2)];
});

// split an iterable into a pair of iterables based on the truthiness of their predicate
// (T -> Promise<Boolean>) -> Iterable<T> -> [AsyncIterator<T>, AsyncIterator<T>]
const partition = R.curry((pred, iterable) => {
  const [pass, fail] = tee(2, iterable);
  return [
    filter(pred, pass),
    reject(pred, fail),
  ];
});

// flattens n-levels of a nested iterable of iterables
// Number -> Iterable<Iterable<T>> -> AsyncIterator<T>
const flattenN = R.curry((n, iterable) => {
  if (n < 1) return iterable;
  return flatMap(async function* fmap(item) {
    if (!isIterable(item)) return yield item;
    yield* flattenN(n - 1, item);
  }, iterable);
});

// flattens one level of a nested iterable of iterables
// Iterable<Iterable<T>> -> AsyncIterator<T>
const unnest = flattenN(1);

// flattens a nested iterable of iterables into a single iterable
// Iterable<Iterable<T>> -> AsyncIterator<T>
const flatten = flattenN(Infinity);

// yield all items from an iterator, n times
// Integer -> Iterable<T> -> AsyncIterator<T>
const cycleN = R.curry(async function* cycleN(n, iterable) {
  if (n < 1) return;
  const buffer = [];
  yield* forEach((item) => buffer.push(item), iterable);
  while (n-- > 1) yield* buffer;
});

// yield iterable items cyclically, infinitely looping when exhausted
// Iterable<T> -> AsyncIterator<T>
const cycle = cycleN(Infinity);

// transforms an iterable of n-tuple into an n-tuple of iterables
// Number -> Iterable<[A, B, ...Z]> -> [AsyncIterator<A>, AsyncIterator<B>, ...AsyncIterator<Z>]
const unzipN = pipeC(tee, R.addIndex(R.map)((iter, i) => map(nth(i), iter)));

// transforms an iterable of pairs into a pairs of iterables
// Iterable<[A, B]> -> [AsyncIterator<A>, AsyncIterator<B>]
const unzip = unzipN(2);

// insert an item (T) between every item in the iterable
// T -> Iterable<T> -> AsyncIterator<T>
const intersperse = R.useWith(flatMap, [
  spacer => ([i, item]) => (i ? [spacer, item] : [item]),
  enumerate,
]);

// serialize iterator items to a string with an arbitrary spacer
// String -> Iterable<T> -> Promise<String>
const joinWith = pipeC(
  intersperse,
  reduce(R.unapply(R.join('')), ''),
);

// serialize iterator items to a string
// Iterable<T> -> Promise<String>
const join = joinWith('');

// is an iterable empty? (done or length = 0)
// Iterable<T> -> Promise<Boolean>
const isEmpty = none(_ => true);

// ((T, T) -> Promise<Boolean>) -> Iterable<T> -> Iterable<T> -> Promise<Boolean>
const correspondsWith = R.useWith(async (pred, iterator1, iterator2) => {
  let done;
  do {
    const { done: done1, value: value1 } = await iterator1.next();
    const { done: done2, value: value2 } = await iterator2.next();
    if (done1 !== done2) return false;
    done = (done1 && done2);
    if (!done && !await pred(value1, value2)) return false;
  } while (!done);
  return true;
}, [R.identity, from, from]);

// Iterable<T> -> Iterable<T> -> Promise<Boolean>
const corresponds = correspondsWith(is);

// get an iterator of indices (0 to length - 1)
// Iterable<T> -> AsyncIterator<Integer>
const indices = R.pipe(enumerate, map(R.head));

// pad an iterable with with a finite number of items (T)
// Integer -> T -> Iterable<T> -> AsyncIterator<T>
const padTo = R.curry(async function* padTo(len, padder, iterable) {
  let n = 0;
  yield* forEach((item) => n++, iterable);
  if (n < len) yield* times(len - n, padder);
});

// pad iterable with an infinite number of items (T)
// T -> Iterable<T> -> AsyncIterator<T>
const pad = padTo(Infinity);

// const unionWith = R.curry(() => {});
// const union = unionWith(is);

// const intersectWith = R.curry(() => {});
// const intersect = intersectWith(is);

// const combinations = R.curry(async function* combinations() {});
// const permutations = R.curry(async function* permutations(n, iterable) {});

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
  dropLast,
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
  init,
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
  yieldWith,
  zip,
  zipAll,
  zipAllWith,
  zipWith,
  zipWithN,
};