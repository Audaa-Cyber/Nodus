/* Mechanical selector scoping only: public HTML remains the visual source. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectors from 'postcss-selector-parser';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const sources = [
  ['merchant', 'nodus-merchant-invoice.html'],
  ['payer', 'Invoice from Apex Studio Group — Nodus.html'],
  ['scroll', 'nodus. — Thank You Scroll.html'],
];
for (const [name, filename] of sources) {
  const html = fs.readFileSync(path.join(scriptDirectory, '..', 'public', filename), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const root = postcss.parse(css);
  const animations = new Map();
  root.walkAtRules('keyframes', rule => {
    animations.set(rule.params, `${name}-${rule.params}`);
    rule.params = animations.get(rule.params);
  });
  root.walkDecls(/^animation(?:-name)?$/, declaration => {
    for (const [original, scoped] of animations) {
      declaration.value = declaration.value.replace(new RegExp(`\\b${original}\\b`, 'g'), scoped);
    }
  });
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selector = selectors(list => {
      list.each(selector => {
        let hasRoot = false;
        selector.walk(node => {
          if ((node.type === 'tag' && ['body', 'html'].includes(node.value)) ||
              (node.type === 'pseudo' && node.value === ':root')) {
            node.replaceWith(selectors.className({ value: `${name}-design` }));
            hasRoot = true;
          }
        });
        if (!hasRoot) {
          selector.prepend(selectors.combinator({ value: ' ' }));
          selector.prepend(selectors.className({ value: `${name}-design` }));
        }
        // A settled receipt lives within the payer frame. Its design must not
        // inherit payer selectors that happen to share .sheet/.pill/.acts names.
        if (name === 'payer') {
          const exclusion = selectors.pseudo({ value: ':not', nodes: [
            selectors.selector({ nodes: [selectors.pseudo({ value: ':where', nodes: [
              selectors.selector({nodes:[selectors.className({value:'scroll-design'})]}),
              selectors.selector({nodes:[selectors.className({value:'scroll-design'}),selectors.combinator({value:' '}),selectors.universal({value:'*'})]})
            ]})] })
          ] });
          const pseudoElement = selector.nodes.find(node => node.type === 'pseudo' && node.value.startsWith('::'));
          if (pseudoElement) selector.insertBefore(pseudoElement, exclusion);
          else selector.append(exclusion);
        }
      });
    }).processSync(rule.selector);
  });
  const output = path.join(scriptDirectory, '..', 'src', 'components', 'designs', `${name}.css`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `/* Generated from public/${filename}; do not redesign. */\n${root.toString()}\n`);
}
