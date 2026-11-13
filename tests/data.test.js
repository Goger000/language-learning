import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packs } from '../lang/index.js';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

for (const pack of Object.values(packs)) {
  const ids = new Set();

  test(`${pack.id}: note ids are unique`, () => {
    for (const n of pack.notes) {
      assert.ok(!ids.has(n.id), `duplicate id ${n.id}`);
      ids.add(n.id);
    }
  });

  test(`${pack.id}: lessons reference existing notes`, () => {
    for (const l of pack.lessons) {
      for (const id of [...l.items, ...l.words]) assert.ok(ids.has(id), `${l.id} -> missing ${id}`);
      for (const group of l.contrasts) assert.ok(group.length >= 2, `${l.id} contrast group too small`);
    }
  });

  test(`${pack.id}: contrast sets are valid minimal-pair groups`, () => {
    const groupIds = new Set();
    for (const g of pack.contrasts || []) {
      assert.ok(!groupIds.has(g.id), `duplicate contrast group ${g.id}`);
      groupIds.add(g.id);
      assert.ok(g.name && g.tip && g.sets.length, g.id);
      for (const set of g.sets) {
        assert.ok(set.length >= 2 && set.length <= 3, `${g.id}: set size ${set}`);
        assert.equal(new Set(set).size, set.length, `${g.id}: repeated item in ${set}`);
        for (const s of set) assert.ok(/^[가-힯]+$/.test(s), `${g.id}: not Hangul syllables: ${s}`);
      }
    }
  });

  test(`${pack.id}: fields are filled in`, () => {
    const cats = new Set(pack.categories.map(c => c.id));
    for (const n of pack.notes) {
      assert.ok(n.dirs.length > 0, n.id);
      if (n.type === 'jamo') {
        assert.ok(n.jamo && n.roman && n.tip && HANGUL.test(n.ex), n.id);
      } else {
        assert.ok(HANGUL.test(n.ko) && n.roman && n.zh, n.id);
        assert.ok(!/[가-힯]/.test(n.roman), `${n.id}: romanization contains Hangul`);
      }
      if (n.type === 'phrase') assert.ok(cats.has(n.category), `${n.id}: unknown category`);
    }
  });
}
