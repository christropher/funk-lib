// modules
import * as R from 'ramda';

// aliased
import { isObject, isIterator } from 'funk-lib/is';
// import { map: mapIterable } from 'funk-lib/iterable/sync';

// local
import mapLimitCallback from './map-limit-cb';

export class TimeoutError extends Error {}

/** parallel resolve promises
  * @async
  * @func
  * @sig [Promise<t>] -> [t]
*/
export const all = Promise.all.bind(Promise);

/** race
  * @async
  * @func
  * @sig [Promise<t>] -> t
*/
export const race = Promise.race.bind(Promise);

/** delay
  * @async
  * @func
  * @sig Number -> undefined
*/
export const delay = async ms => new Promise(res => setTimeout(res, ms));

/** wraps a function to always return a promise
  * @async
  * @func
  * @sig (a -> b) -> (a -> Promise<b>)
*/
export const toAsync = f => async (...args) => f(...args);

// returns a promise that is resolved by an err-back function
export const fromCallback = async f => {
  return new Promise((resolve, reject) => {
    f((err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
};


/** make an errback-calling function promise-returning
  * inverse of callbackify
  * @async
  * @func
  * @sig ?
*/
export const promisify = f => async (...args) => {
  return fromCallback(cb => f(...args, cb));
};

// make a promise-returning function errback-yielding
// inverse of promisify
export const callbackify = f => (...args) => {
  const cb = args.pop();
  toAsync(f)(...args)
    .then(res => cb(null, res))
    .catch(err => cb(err));
};

/** creates an externally controlled promise
  * @async
  * @func
  * @sig * -> Object
*/
export const deferred = () => {
  let resolve, reject;
  return {
    promise: new Promise((...args) => {
      [resolve, reject] = args;
    }),
    resolve,
    reject,
  };
};


/** reduce
  * @async
  * @func
  * @sig ((a, t) -> Promise<a>) -> a -> [t] -> Promise<a>
*/
export const reduce = R.curry(async (f, acc, xs) => {
  for (const x of xs) acc = await f(acc, x);
  return acc;
});

/** serial + async R.pipe. works with sync or async functions
  * @async
  * @func
  * @sig (...f) -> f
*/
export const pipe = (f, ...fs) => async (...args) => {
  return reduce(R.applyTo, await f(...args), fs);
};

/** curried async pipe
  * @async
  * @func
  * @sig (...f) -> f
*/
export const pipeC = (...f) => R.curryN(f[0].length, pipe(...f));

/** map limit
  * @async
  * @func
  * @sig (a -> b) -> [a] -> [b]
*/
export const mapLimit = R.curry(async (limit, f, xs) => {
  if (isIterator(xs)) xs = [...xs];
  
  let before = R.identity;
  let after = R.identity;
  let asyncF = f;
      
  if (isObject(xs)) {
    before = R.toPairs;
    after = R.fromPairs;
    asyncF = async item => {
      const res = await f(item[1]);
      return [item[0], res];
    };
  }
  return promisify(mapLimitCallback)(
    before(xs),
    limit,
    callbackify(asyncF),
  ).then(after);
});

/** map pairs limit
  * @async
  * @func
  * @sig Number -> ([a, b] -> [c, d]) -> { a: b } -> { c: d }
*/
export const mapPairsLimit = R.curry(async (limit, f, object) => {
  return R.fromPairs(await mapLimit(limit, f, R.toPairs(object)));
});

/** for each limit
  * @async
  * @func
  * @sig Number -> (a -> b) -> [a] -> [a]
*/
export const forEachLimit = R.curry(async (limit, f, xs) => {
  await mapLimit(limit, f, xs);
  return xs;
});

/** every limit
  * @async
  * @func
  * @sig Number -> (a -> Boolean) -> [a] -> Boolean
*/
export const everyLimit = R.curry(async (limit, f, xs) => {
  return new Promise(async resolve => {
    await forEachLimit(limit, async x => {
      if (!await f(x)) resolve(false);
    }, xs);
    resolve(true);
  });
});

/** some limit
  * @async
  * @func
  * @sig Number -> (a -> Boolean) -> [a] -> Boolean
*/
export const someLimit = R.curry(async (limit, f, xs) => {
  return new Promise(async resolve => {
    await forEachLimit(limit, async x => {
      if (await f(x)) resolve(true);
    }, xs);
    resolve(false);
  });
});

/** find limit
  * @async
  * @func
  * @sig Number -> (a -> Boolean) -> [a]
*/
export const findLimit = R.curry(async (limit, f, xs) => {
  return new Promise(async (resolve, reject) => {
    await forEachLimit(limit, async x => {
      if (await f(x)) resolve(x);
    }, xs)
      // resolve undefined if none found
      .then(() => resolve())
      .catch(reject);
  });
});

/** flat map limit
  * @async
  * @func
  * @sig Number -> (a -> [b]) -> [a] -> [b]
  * @example
  * const array = [1, 2, 3];
  *
  * // [1, 2, 2, 4, 3, 6]
  * await flatMapLimit(2, async n => [n, n * 2], array)
*/
export const flatMapLimit = pipeC(mapLimit, R.chain(R.identity));

/** filter limit
  * @async
  * @func
  * @sig Number -> (a -> Boolean) -> [a] -> [a]
*/
export const filterLimit = R.curry(async (limit, f, xs) => {
  return flatMapLimit(limit, async x => (await f(x) ? [x] : []), xs);
});

/** all settled limit
  * @async
  * @func
  * @sig Number -> [Promise] -> [Object]
*/
export const allSettledLimit = R.curry((limit, promises) => {
  return mapLimit(limit, promise => {
    return Promise
      .resolve(promise)
      .then(value => ({ status: 'fulfilled', value }))
      .catch(reason => ({ status: 'rejected', reason }));
  }, promises);
});

/** map limit
  * @async
  * @func
  * @sig (a -> Promise<b>) -> [a] -> Promise<[b]>
*/
export const map = mapLimit(Infinity);

/** map series
  * @async
  * @func
  * @sig (a -> Promise<b>) -> [a] -> Promise<[b]>
*/
export const mapSeries = mapLimit(1);

/** map pairs
  * @async
  * @func
  * @sig ([a, b] -> Promise<[c, d]>) -> { a: b } -> Promise<{ c: d }>
*/
export const mapPairs = mapPairsLimit(Infinity);

/** map pairs series
  * @async
  * @func
  * @sig ([a, b] -> Promise<[c, d]>) -> { a: b } -> Promise<{ c: d }>
*/
export const mapPairsSeries = mapPairsLimit(1);

/** parallel for each
  * @async
  * @func
  * @sig (a -> b) -> [a] -> [a]
*/
export const forEach = forEachLimit(Infinity);

/** for each series
  * @async
  * @func
  * @sig (a -> b) -> [a] -> [a]
*/
export const forEachSeries = forEachLimit(1);

/** parallel every
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> Boolean
*/
export const every = everyLimit(Infinity);

/** every series
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> Boolean
*/
export const everySeries = everyLimit(1);

/** parallel some
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> Boolean
*/
export const some = someLimit(Infinity);

/** some series
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> Boolean
*/
export const someSeries = someLimit(1);

/** parallel find
  * @async
  * @func
  * @sig (t -> Boolean) -> [t] -> t
*/
export const find = findLimit(Infinity);

/** find series
  * @async
  * @func
  * @sig (t -> Boolean) -> [t] -> t
*/
export const findSeries = findLimit(1);

/** parallel flatMap (chain)
  * @async
  * @func
  * @sig (a -> [b]) -> [a] -> [b]
  * @example
  * const array = [1, 2, 3];
  *
  * // [1, 2, 2, 4, 3, 6]
  * await flatMap(async n => [n, n * 2], array)
*/
export const flatMap = flatMapLimit(Infinity);

/** flatMap series (chain)
  * @async
  * @func
  * @sig (a -> [b]) -> [a] -> [b]
  * @example
  * const array = [1, 2, 3];
  *
  * // [1, 2, 2, 4, 3, 6]
  * await flatMapSeries(async n => [n, n * 2], array)
*/
export const flatMapSeries = flatMapLimit(1);

/** parallel filter
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> [a]
  * @example
  * const array = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  * // [0, 1, 2, 3, 4, 5]
  * await filter(async n => (n <= 5), array);
*/
export const filter = filterLimit(Infinity);

/** filter series
  * @async
  * @func
  * @sig (a -> Boolean) -> [a] -> [a]
  * @example
  * const array = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  * // [0, 1, 2, 3, 4, 5]
  * await filterSeries(async n => (n <= 5), array);
*/
export const filterSeries = filterLimit(1);

/** parallel all settled
  * @async
  * @func
  * @sig [Promise] -> [Object]
*/
export const allSettled = allSettledLimit(Infinity);

/** all settled series
  * @async
  * @func
  * @sig [Promise] -> [Object]
*/
export const allSettledSeries = allSettledLimit(1);

/** parallel props
  * @async
  * @func
  * @sig { a: Promise<b> } -> Promise<{ a: b }>
  * @example
  * // { one: 1, two: 2 }
  * await props({
  *  one: Promise.resolve(1),
  *  two: Promise.resolve(2),
  * })
*/
export const props = mapPairs(async ([key, val]) => [key, await val]);

/** Async R.evolve
  * @async
  * @func
  * @sig { k: (a -> Promise<b>) } -> { k: a } -> Promise<{ k: b }>
*/
export const evolve = pipeC(R.evolve, props);

/** timeout a promise
  * @async
  * @func
  * @sig number -> Promise<t> -> Promise<t>
*/
export const timeout = R.curry((ms, promise) => race([
  promise,
  delay(ms).then(() => {
    throw new TimeoutError(`Promise timed out after ${ ms }ms`);
  }),
]));
