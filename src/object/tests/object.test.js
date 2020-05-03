// core
import path from 'path';

// modules
import * as R from 'ramda';
import { expect } from 'chai';

// local
import {
  clear,
  deepFreeze,
  del,
  firstKey,
  firstPair,
  firstValue,
  flattenWith,
  mapDeep,
  mapKeys,
  mapPairs,
  mapValues,
  nestWith,
  pickAs,
  toHumanJSON,
} from '..';


describe('object lib', () => {
  
  describe('clear', () => {
    
    let obj;
    beforeEach(() => {
      obj = {
        a: 1,
        b: true,
        c: [2, { d: 3 }],
        d: {
          e: undefined,
          f: Symbol('g'),
        },
      };
    });
    
    it('should delete all keys', () => {
      clear(obj);
      expect(obj).to.eql({});
    });

  });
  
  describe('deepFreeze', () => {
    
    let obj;
    beforeEach(() => {
      obj = {
        a: 1,
        b: true,
        c: [2, { d: 3 }],
        d: {
          e: undefined,
          f: Symbol('g'),
        },
      };
    });
    
    it('should deeply freeze', () => {
      deepFreeze(obj);
      
      expect(() => {
        obj.a = 2;
      }).to.throw(Error);
      
      expect(() => {
        obj.c[0] = 3;
      }).to.throw(Error);
      
      expect(() => {
        obj.c[1].e = 4;
      }).to.throw(Error);
      
      expect(() => {
        obj.d.e = 5;
      }).to.throw(Error);
      
    });
    
    it('should handle empty / falsey object values', () => {
      obj = {
        thing: null,
        other: undefined,
        deep: { thing: null, other: NaN },
      };
      expect(() => deepFreeze(obj)).not.to.throw(Error);
      expect(() => {
        obj.thing = 4;
      }).to.throw(Error);
    });
    
  });
  
  describe('del', () => {
    
    let obj;
    beforeEach(() => {
      obj = {
        a: 1,
        b: true,
      };
    });
    
    it('should delete the key', () => {
      del('b', obj);
      expect(obj).to.eql({ a: 1 });
    });

  });
  
  describe('flattenWith', () => {
    
    let obj, flat;
    beforeEach(() => {
      obj = {
        aaa: { bbb: 111, ccc: { ddd: 222 } },
        ddd: { eee: 333 },
      };
      flat = {
        'aaa/bbb': 111,
        'aaa/ccc/ddd': 222,
        'ddd/eee': 333,
      };
    });
    
    it('should join nested object keys by predicate', () => {
      expect(flattenWith(path.join, obj)).to.eql(flat);
    });
    
    it('should work with overlapping + nested keys', () => {
      const obj = {
        a: { b: 2, c: { d: 4 } },
        'a/c/d/e': 3,
      };
      expect(flattenWith(path.join, obj)).to.eql({
        'a/b': 2,
        'a/c/d': 4,
        'a/c/d/e': 3,
      });
    });
    
    it('should be the inverse of nestWith for inverse predicates', () => {
      const res = R.pipe(
        nestWith(R.split('/')),
        flattenWith(path.join),
      )(flat);
      expect(res).to.eql(flat);
    });
    
  });
  
  describe('mapDeep', () => {
    
    it('should recursively map values', () => {
      
      const input = {
        a: [1],
        b: { c: 2, d: { e: 3 } },
      };
            
      expect(mapDeep(n => n + 1, input)).to.eql({
        a: '11',
        b: { c: 3, d: { e: 4 } },
      });
      
    });
    
  });
  
  describe('nestWith', () => {
    
    let obj, flat;
    beforeEach(() => {
      obj = {
        aaa: { bbb: 111, ccc: { ddd: 222 } },
        ddd: { eee: 333 },
      };
      flat = {
        'aaa/bbb': 111,
        'aaa/ccc/ddd': 222,
        'ddd/eee': 333,
      };
    });
    
    it('should split and nest keys by predicate', () => {
      expect(nestWith(R.split('/'), flat)).to.eql(obj);
    });
    
    it('should work with overlapping + nested keys', () => {
      const flat = {
        'a/c/d/e': 3,
        'a/c/d/f': 4,
      };
      expect(nestWith(R.split('/'), flat)).to.eql({
        a: { c: { d: { e: 3, f: 4 } } },
      });
    });
    
    it('should be the inverse of flattenWith for inverse predicates', () => {
      const res = R.pipe(
        flattenWith(path.join),
        nestWith(R.split('/')),
      )(obj);
      expect(res).to.eql(obj);
    });
    
  });

  describe('pickAs', () => {
    
    let obj;
    beforeEach(() => {
      obj = { a: 1, b: 2, c: 3, d: 4 };
    });
    
    it('should rename keys', () => {
      const result = pickAs({ a: 'b', c: 'd' })(obj);
      expect(result.b).to.eql(1);
      expect(result.d).to.eql(3);
    });
    
    it('should discard keys not in picker', () => {
      const result = pickAs({ a: 'b', c: 'd' })(obj);
      expect(result).to.not.have.ownProperty('a');
      expect(result).to.not.have.ownProperty('c');
    });
    
  });
  
  describe('mapKeys', () => {
    
    it('should update keys by predicate', () => {
      const input = {
        one: 1,
        two: 2,
        three: 3,
      };
      const pred = (key) => [...key].reverse().join('');
      const expected = {
        eno: 1,
        owt: 2,
        eerht: 3,
      };
      expect(mapKeys(pred, input)).to.eql(expected);
    });
    
  });
  
  describe('mapValues', () => {
    
    let input, pred, expected;
    beforeEach(() => {
      input = {
        1: 'one',
        2: 'two',
        3: 'three',
      };
      pred = (val) => [...val].reverse().join('');
      expected = {
        1: 'eno',
        2: 'owt',
        3: 'eerht',
      };
    });
    
    it('should update values by predicate', () => {
      expect(mapValues(pred, input)).to.eql(expected);
    });
    
    it('should be curried', () => {
      expect(mapValues(pred)(input)).to.eql(expected);
    });
    
  });

  describe('mapPairs', () => {
    
    it('should transform pairs by predicate', () => {
      const input = {
        one: 1,
        two: 2,
        three: 3,
      };
      const pred = ([key, val]) => [
        [...key].reverse().join(''),
        val * 3,
      ];
      const expected = {
        eno: 3,
        owt: 6,
        eerht: 9,
      };
      expect(mapPairs(pred, input)).to.eql(expected);
    });
    
  });

  describe('firstKey', () => {
    
    it('should return the first object key', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(firstKey(obj)).to.eql('a');
    });
    
    it('should return the first array key', () => {
      const arr = [5, 6, 7];
      expect(firstKey(arr)).to.eql('0');
    });
    
  });
  
  describe('firstValue', () => {
    
    it('should return the first object value', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(firstValue(obj)).to.eql(1);
    });
    
    it('should return the first array value', () => {
      const arr = [5, 6, 7];
      expect(firstValue(arr)).to.eql(5);
    });
    
  });
  
  describe('firstPair', () => {
    
    it('should return the first object pair', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(firstPair(obj)).to.eql(['a', 1]);
    });
    
    it('should return the first array pair', () => {
      const arr = [5, 6, 7];
      expect(firstPair(arr)).to.eql(['0', 5]);
    });
    
  });

  describe('toHumanJSON', () => {
    
    it('should return json with whitespace', () => {
      const obj = {
        a: 1,
        b: true,
        c: [2, 3, 4, { 5: 6 }],
        d: { 7: { 8: [9] } },
      };
      expect(toHumanJSON(obj)).to.eql(JSON.stringify(obj, null, 2));
    });
    
  });

});
