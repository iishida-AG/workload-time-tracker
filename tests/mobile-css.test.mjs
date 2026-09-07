import assert from 'node:assert/strict';
import fs from 'node:fs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('mobile CSS stacks timeline columns and actual item controls without horizontal overflow', () => {
  const mobileSection = css.slice(css.indexOf('@media (max-width: 760px)'));

  assert.match(mobileSection, /\.timeline-grid\s*{\s*grid-template-columns:\s*1fr;/);
  assert.match(mobileSection, /\.actual-item-row\s*{[^}]*grid-template-areas:\s*"task start remove"[^}]*"note note note"/s);
  assert.match(mobileSection, /\.actual-note-input\s*{[^}]*grid-area:\s*note;/s);
  assert.match(mobileSection, /\.timeline-panel\s*{[^}]*overflow-x:\s*hidden;/s);
  assert.match(mobileSection, /\.mobile-timeline-controls\s*{[^}]*display:\s*grid;/s);
  assert.match(mobileSection, /\.shortcut-panel\s*{[^}]*position:\s*fixed;[^}]*bottom:\s*10px;/s);
  assert.match(mobileSection, /\.app-shell\s*{[^}]*padding-bottom:\s*310px;/s);
});

test('review v2 CSS uses three desktop columns and one mobile column', () => {
  assert.match(css, /\.review-goal-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.review-reflection-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.review-tabs\s*{[^}]*overflow-x:\s*auto;/s);

  const mobileSection = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(mobileSection, /\.review-goal-grid\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileSection, /\.review-reflection-grid\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileSection, /\.review-v2\s*{[^}]*overflow-x:\s*hidden;/s);
});
