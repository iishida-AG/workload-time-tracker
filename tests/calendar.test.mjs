import assert from 'node:assert/strict';
import {
  getDateRange,
  getFiscalQuarter,
  getFiscalTermQuarters,
  getOperationalMonth,
  getOperationalMonthWeeks
} from '../src/domain/calendar.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('fiscal quarters follow the June anchor across years', () => {
  assert.deepEqual(getFiscalQuarter('2026-09-07'), {
    term: 20,
    quarter: 2,
    label: '20期2Q',
    start: '2026-09-01',
    end: '2026-11-30'
  });
  assert.equal(getFiscalQuarter('2026-12-01').end, '2027-02-28');
  assert.equal(getFiscalQuarter('2028-02-29').end, '2028-02-29');
  assert.equal(getFiscalQuarter('2027-06-01').label, '21期1Q');
  assert.deepEqual(getFiscalTermQuarters('2026-09-07').map((row) => row.label), [
    '20期1Q',
    '20期2Q',
    '20期3Q',
    '20期4Q'
  ]);
});

test('operational months number weeks from the first Monday', () => {
  assert.equal(getOperationalMonth('2026-09-01'), '2026-08');
  assert.equal(getOperationalMonth('2026-09-07'), '2026-09');
  assert.deepEqual(getOperationalMonthWeeks('2026-09'), [
    { index: 1, label: '1週目', start: '2026-09-07', end: '2026-09-13' },
    { index: 2, label: '2週目', start: '2026-09-14', end: '2026-09-20' },
    { index: 3, label: '3週目', start: '2026-09-21', end: '2026-09-27' },
    { index: 4, label: '4週目', start: '2026-09-28', end: '2026-10-04' }
  ]);
  assert.equal(getOperationalMonthWeeks('2026-08').length, 5);
});

test('inclusive date ranges include both endpoints', () => {
  assert.deepEqual(getDateRange('2026-09-30', '2026-10-02'), [
    '2026-09-30',
    '2026-10-01',
    '2026-10-02'
  ]);
});
