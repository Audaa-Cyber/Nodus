import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const postcss=require('postcss');
const sources=[['merchant','nodus-merchant-invoice.html'],['payer','Invoice from Apex Studio Group — Nodus.html'],['scroll','nodus. — Thank You Scroll.html']];

for(const [name,file] of sources) test(`${name} CSS preserves every approved declaration and keyframe`,async()=>{
  const original=(await readFile(new URL(`../public/${file}`,import.meta.url),'utf8')).match(/<style>([\s\S]*?)<\/style>/)[1];
  const scoped=await readFile(new URL(`../src/components/designs/${name}.css`,import.meta.url),'utf8');
  const before=postcss.parse(original),after=postcss.parse(scoped);
  const animations=[];before.walkAtRules('keyframes',rule=>animations.push(rule.params));
  const collect=root=>{const declarations=[];root.walkDecls(decl=>declarations.push([decl.prop,decl.value.replace(new RegExp(`\\b${name}-(${animations.join('|')})\\b`,'g'),'$1'),decl.important??false]));return declarations;};
  assert.deepEqual(collect(after),collect(before));
});

test('payer isolation keeps pseudo-element selectors valid and excludes nested receipts',async()=>{
  const css=await readFile(new URL('../src/components/designs/payer.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/::(?:before|after):not\(/);
  const root=postcss.parse(css);
  root.walkRules(rule=>{if(rule.parent.name==='keyframes')return;assert.ok(rule.selector.includes(':not(:where(.scroll-design,.scroll-design *))'));});
});
