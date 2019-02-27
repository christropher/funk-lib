import {
  chain,
  defaultTo,
  fromPairs,
  pipe,
  split,
} from 'ramda';

// parse a content-type http header into its parts
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type
// content-type -> { mimeType, charset, boundary }
// string -> object
export const parseContentType = pipe(
  defaultTo(''),
  split(/;\s*/),
  chain((str) => {
    const [left, right] = str.split('=');
    if (!left && !right) return [];
    return right ? [[left, right]] : [['mimeType', left]];
  }),
  fromPairs,
);
