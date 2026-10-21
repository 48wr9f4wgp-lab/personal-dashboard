'use strict';
// Focused acceptance tests for the real Scriptable renderer. Every record and
// provider response is synthetic. No network, private Calendar or screenshot is
// used. Structural bounds do not measure native iOS glyph widths or truncation.
// Run: node scriptable-dashboard/tests/display-audit.cjs [path/to/main.js]
process.env.TZ = 'Asia/Tokyo';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.dirname(__dirname);
const source = fs.readFileSync(process.argv[2] || path.join(root, 'main.js'), 'utf8');
const results = [];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));

// Reuse the established offline API mock without executing its historical
// acceptance cases or writing test-results.json. Fail closed if its seam moves.
const harnessPath = path.join(__dirname, 'regression.cjs');
const harnessSource = fs.readFileSync(harnessPath, 'utf8');
const harnessEnd = harnessSource.indexOf('async function main(){');
assert.ok(harnessEnd > 0, 'Existing offline harness boundary was not found');
const harnessModule = {exports: {}};
new Function('require', 'module', 'exports', '__dirname', '__filename',
  harnessSource.slice(0, harnessEnd) +
  '\nmodule.exports = {run, env, nodes, texts, card, fixtures, weatherJSON};\n'
)(require, harnessModule, harnessModule.exports, __dirname, harnessPath);
const {run, nodes, texts, card, weatherJSON} = harnessModule.exports;

const clock = (day, hour, minute = 0) => Date.parse(
  '2030-01-' + String(day).padStart(2, '0') + 'T' +
  String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00+09:00');
const event = (title, start, end, allDay = false, notes = '') => ({
  title, notes, calendar: {title: 'Synthetic display tests'},
  startDate: new Date(start), endDate: new Date(end), isAllDay: allDay
});
const futureEvent = (title, hour = 0, minute = 0, allDay = false) =>
  event(title, clock(31, hour, minute), clock(31, hour, minute) + 3600000, allDay);
const titleNode = (widget, title) => nodes(widget, 'text').find(n => n.text.includes(title));
const parentOf = (widget, node) => nodes(widget, 'stack').find(n => n.children.includes(node));
const rowForTitle = (widget, title) => {
  const label = titleNode(widget, title);
  assert.ok(label, 'Missing title: ' + title);
  const cell = parentOf(widget, label);
  assert.ok(cell, 'Missing title cell');
  return {label, cell, row: parentOf(widget, cell)};
};
const snapshot = records => JSON.stringify(records);
// Sum declared box heights, not estimated glyph heights. This is valid for the
// full-content fixtures below because every text node is inside a fixed-height
// row. An unbounded text node is deliberately an error, not silently zero-height.
function declaredHeight(node) {
  if (node.kind === 'spacer') return node.length || 0;
  if (node.size?.height > 0) return node.size.height;
  if (node.kind === 'image') return node.imageSize?.height || 0;
  assert.ok(node.kind === 'stack' || node.kind === 'widget', 'Unbounded node in the declared-height fixture');
  const heights = node.children.map(declaredHeight);
  const content = node.kind === 'widget' || node.layout === 'vertical'
    ? heights.reduce((sum, height) => sum + height, 0) : Math.max(0, ...heights);
  return content + (node.padding?.[0] || 0) + (node.padding?.[2] || 0);
}
async function test(name, fn) {
  try { await fn(); results.push({name, status: 'PASS'}); }
  catch (error) { results.push({name, status: 'FAIL', error: error.stack}); }
}

async function main() {
  await test('Real main and unchanged Loader parse as Scriptable async bodies', () => {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction(source);
    new AsyncFunction(fs.readFileSync(path.join(root, 'loader.js'), 'utf8'));
  });
  await test('Medium geometry remains byte-identical to the audited baseline', () => {
    const metrics = source.slice(source.indexOf('function mediumMetrics(){'), source.indexOf('function singleText('));
    assert.equal(sha256(metrics), '26ec768e6a3d47fb0a37b96dcffc2debd2a0a4be385440f1db617bbcf6e04696');
  });
  await test('Loader bytes remain unchanged', () => {
    assert.equal(sha256(fs.readFileSync(path.join(root, 'loader.js'))),
      '2806858b80e5333b740e2d5caea44c7bb8aa66791defb24f40fa2cb40d4d359a');
  });

  const unknownLabels = [
    '時間未定', '時刻未定', '開始時間未定', '開始時刻未定',
    '時間未発表', '時刻未発表', '開始時間未発表', '開始時刻未発表',
    '時間未公表', '時刻未公表', '開始時間未公表', '開始時刻未公表'
  ];
  for (const family of ['medium', 'large']) {
    for (const label of unknownLabels) {
      await test('Explicit unknown time is not midnight: ' + family + ' ' + label, async () => {
        const title = '合成大会（' + label + '）';
        const records = [futureEvent(title)];
        const before = snapshot(records);
        const r = await run(source, {family, events: records});
        const {row} = rowForTitle(r.widget, '合成大会');
        assert.ok(texts(row).includes('未定'));
        assert.ok(!texts(row).some(t => /00:00|開催中|進行中|終了/.test(t)));
        assert.ok(texts(row).some(t => t.includes(label)), 'Keep original explicit qualifier');
        assert.equal(snapshot(records), before);
        assert.equal(r.record.calendarWrites, 0);
      });
    }
    await test('Today unknown placeholder never becomes a guessed ongoing event: ' + family, async () => {
      const records = [event('合成大会（開始時刻未定）', clock(30, 0), clock(31, 0))];
      const before = snapshot(records);
      const r = await run(source, {family, now: clock(30, 12), events: records});
      const tt = texts(rowForTitle(r.widget, '合成大会').row);
      assert.ok(tt.includes('未定'));
      assert.ok(!tt.some(t => /開催中|進行中|継続中|00:00|終了/.test(t)));
      assert.equal(snapshot(records), before);
      assert.equal(r.record.calendarWrites, 0);
    });
    await test('An elapsed synthetic placeholder does not drop a date-only unknown-time event: ' + family, async () => {
      const records = [event('合成大会（時間未定）', clock(30, 0), clock(30, 1))];
      const before = snapshot(records);
      const r = await run(source, {family, now: clock(30, 12), events: records});
      const tt = texts(rowForTitle(r.widget, '合成大会').row);
      assert.ok(tt.includes('未定'));
      assert.ok(!tt.some(t => /開催中|進行中|継続中|00:00|終了/.test(t)));
      assert.equal(snapshot(records), before);
    });
    for (const [hour, minute] of [[0, 0], [4, 7], [9, 59], [23, 59]]) {
      await test('A genuine timed event retains its complete clock: ' + family + ' ' + hour + ':' + minute, async () => {
        const r = await run(source, {family, events: [futureEvent('合成時刻確定予定', hour, minute)]});
        const expected = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
        assert.ok(texts(rowForTitle(r.widget, '合成時刻確定予定').row).includes(expected));
        assert.ok(!texts(rowForTitle(r.widget, '合成時刻確定予定').row).includes('未定'));
      });
    }
    await test('Notes-only uncertainty cannot relabel a timed event: ' + family, async () => {
      const e = futureEvent('合成時刻確定予定');
      e.notes = '別の大会については開始時間未定です。';
      const r = await run(source, {family, events: [e]});
      assert.ok(texts(rowForTitle(r.widget, '合成時刻確定予定').row).includes('00:00'));
    });
    for (const title of ['合成大会（会場未定）', '合成大会（対戦相手未定）', '合成大会（放送局未発表）',
      '合成大会（終了時間未定）', '合成大会（受付時間未定）',
      '合成大会（受付開始時刻未定）', '合成大会（入場開始時間未定）']) {
      await test('Non-time uncertainty does not erase a real time: ' + family + ' ' + title, async () => {
        const r = await run(source, {family, events: [futureEvent(title)]});
        const tt = texts(rowForTitle(r.widget, title).row);
        assert.ok(tt.includes('00:00'));
        assert.ok(!tt.includes('未定'));
      });
    }
    await test('Explicit all-day event remains all-day: ' + family, async () => {
      const r = await run(source, {family, events: [event('合成終日予定', clock(31, 0), clock(31, 0) + 86400000, true)]});
      assert.ok(texts(rowForTitle(r.widget, '合成終日予定').row).includes('終日'));
      assert.ok(!texts(rowForTitle(r.widget, '合成終日予定').row).includes('00:00'));
    });

    for (const dark of [false, true]) {
      for (const [name, start, end, now, until, extra] of [
        ['same day', clock(30, 11), clock(30, 13), clock(30, 12), '13:00まで', ''],
        ['overnight', clock(29, 23), clock(30, 1), clock(30, 0, 30), '01:00まで', '1/29'],
        ['ends next day', clock(30, 11), clock(31, 1), clock(30, 12), '01:00まで', '1/31'],
        ['timed twenty-four hours', clock(30, 0), clock(31, 0), clock(30, 12), '00:00まで', '1/31']
      ]) {
        await test('Ongoing state and complete until semantics: ' + family + ' ' + dark + ' ' + name, async () => {
          const records = [event('合成開催予定', start, end)];
          const before = snapshot(records);
          const r = await run(source, {family, dark, now, events: records});
          const row = rowForTitle(r.widget, '合成開催予定').row;
          const joined = texts(row).join('');
          assert.ok(joined.includes('開催中'), 'Ongoing must say 開催中');
          assert.ok(joined.includes(until), 'End time needs full HH:mmまで semantics');
          assert.ok(!joined.includes('終了'), 'Do not label a still-running event as 終了');
          if (extra) assert.ok(joined.includes(extra), 'Keep overnight/start or next-day context');
          const timeCell = row.children.find(n => n.kind === 'stack' && texts(n).some(t => /^\d{2}:\d{2}$/.test(t)));
          assert.ok(timeCell, 'End time retains a dedicated clock cell');
          assert.equal(timeCell.size.width, 44);
          const untilNode = nodes(timeCell, 'text').find(n => n.text === 'まで');
          assert.ok(untilNode, 'Until is rendered next to its own clock, not inferred from a distant title');
          assert.equal(untilNode.lineLimit, 1);
          assert.equal(untilNode.minimumScaleFactor, 1);
          if (family === 'large') {
            assert.equal(timeCell.layout, 'vertical');
            assert.ok(row.size.height >= 22, 'Stacked clock and until label need vertical room');
          } else {
            assert.equal(row.size.height, 15, 'Medium geometry must stay fixed');
            assert.ok(untilNode.font.size <= 8);
          }
          assert.equal(snapshot(records), before);
          assert.equal(r.record.calendarWrites, 0);
        });
      }
    }
    await test('Ended event stays absent at the exact boundary: ' + family, async () => {
      const r = await run(source, {family, now: clock(30, 13), events: [event('合成終了済', clock(30, 11), clock(30, 13))]});
      assert.ok(!texts(r.widget).some(t => t.includes('合成終了済')));
    });
    await test('Start crossed during loading uses the same truthful ongoing labels: ' + family, async () => {
      const r = await run(source, {family, now: clock(30, 16, 59), afterLocationNow: clock(30, 17, 1),
        events: [event('合成読込中開始', clock(30, 17), clock(30, 18))]});
      const joined = texts(rowForTitle(r.widget, '合成読込中開始').row).join('');
      assert.ok(joined.includes('開催中'));
      assert.ok(joined.includes('18:00まで'));
      assert.ok(!joined.includes('終了'));
    });
    for (const allDay of [false, true]) {
      await test('Explicit internal target cannot masquerade as an application cutoff: ' + family + ' ' + allDay, async () => {
        const title = '通信指導 全科目提出目標（内部締切）';
        const start = clock(30, allDay ? 0 : 20);
        const records = [event(title, start, allDay ? clock(31, 0) : start + 3600000, allDay)];
        const before = snapshot(records);
        const r = await run(source, {family, now: clock(30, 12), events: records});
        const tt = texts(r.widget);
        assert.ok(tt.some(t => t.includes('内部目標')), 'Internal classification must be visible');
        assert.ok(!tt.some(t => /20:00締切|【締切】|申込〆/.test(t)), 'An internal target is not the official application cutoff');
        if (family === 'large' && !allDay) assert.ok(tt.some(t => t.includes('20:00目標')));
        if (allDay) assert.ok(!tt.some(t => /00:00|20:00/.test(t)));
        assert.ok(tt.some(t => t.includes('全科目提出目標')));
        assert.equal(snapshot(records), before);
        assert.equal(r.record.calendarWrites, 0);
      });
    }
    await test('An actual application deadline retains its own cutoff status: ' + family, async () => {
      const records = [event('合成講習：受講申込期限（11/12回）', clock(30, 20), clock(30, 21))];
      const r = await run(source, {family, now: clock(30, 12), events: records});
      const tt = texts(r.widget);
      assert.ok(tt.some(t => t.includes('20:00')));
      assert.ok(!tt.some(t => t.includes('内部目標')));
      assert.ok(tt.some(t => t.includes('11/12回')));
      if (family === 'large') assert.ok(tt.some(t => t.includes('20:00締切')));
    });
    await test('Unqualified target wording alone cannot invent internal classification: ' + family, async () => {
      const r = await run(source, {family, events: [event('合成申込期限（目標）', clock(30, 20), clock(30, 21))]});
      assert.ok(!texts(r.widget).some(t => t.includes('内部目標')));
      assert.ok(texts(r.widget).some(t => t.includes('合成申込期限（目標）')));
    });
    await test('Elapsed internal target never becomes an elapsed official cutoff: ' + family, async () => {
      const r = await run(source, {family, now: clock(30, 21),
        events: [event('通信指導 全科目提出目標（内部締切）', clock(30, 20), clock(30, 22))]});
      const tt = texts(r.widget);
      assert.ok(tt.some(t => t.includes('内部目標')));
      assert.ok(!tt.some(t => /締切経過/.test(t)));
      assert.ok(tt.some(t => t.includes('経過')));
    });
  }

  for (const dark of [false, true]) {
    for (const weatherError of [false, true]) {
      await test('Large fallback is explicit alongside weather: ' + dark + ' ' + weatherError, async () => {
        const cfg = {fallbackCity: '合成代替市', fallbackLat: 36.125, fallbackLon: 140.25,
          anniversaryMonth: 8, anniversaryDay: 23, refreshMinutes: 12};
        const r = await run(source, {family: 'large', dark, weatherError, locationError: true, cfg});
        const header = r.widget.children.find(n => n.kind === 'stack');
        const weatherPane = header.children.filter(n => n.kind === 'stack').at(-1);
        const locationArea = weatherError ? weatherPane : card(r.widget, '週間天気').children[0];
        assert.ok(texts(locationArea).some(t => t.includes('代替地点')), 'Disclosure belongs next to weather');
        assert.ok(texts(locationArea).some(t => t.includes(cfg.fallbackCity)));
        const url = new URL(r.record.requests.find(u => u.includes('api.open-meteo.com')));
        assert.equal(url.searchParams.get('latitude'), String(cfg.fallbackLat));
        assert.equal(url.searchParams.get('longitude'), String(cfg.fallbackLon));
        for (const [key, value] of Object.entries(cfg)) assert.equal(r.context.ORE_DASH_CONFIG.cfg[key], value);
        assert.equal(r.record.writes.length, 0);
      });
    }
    for (const geocodeResult of [[{locality: '合成現在市'}], []]) {
      await test('Valid GPS never falsely says fallback: ' + dark + ' ' + geocodeResult.length, async () => {
        const r = await run(source, {family: 'large', dark, geocodeResult, cfg: {fallbackCity: '無関係代替市', fallbackLat: 36, fallbackLon: 140}});
        const tt = texts(r.widget);
        assert.ok(!tt.some(t => t.includes('代替地点') || t.includes('無関係代替市')));
        assert.ok(tt.some(t => t.includes(geocodeResult.length ? '合成現在市' : '現在地・地名不明')));
        const url = new URL(r.record.requests.find(u => u.includes('api.open-meteo.com')));
        assert.equal(url.searchParams.get('latitude'), '35.68');
      });
    }
  }
  await test('Narrow partial forecast keeps the fallback marker separate from the warning row', async () => {
    const data = weatherJSON();
    data.daily.weather_code[5] = null;
    const city = '合成代替地域名が非常に長い市区町村';
    const r = await run(source, {family: 'large', screenWidth: 320, data, locationError: true,
      cfg: {fallbackCity: city, fallbackLat: 36, fallbackLon: 140}});
    const forecast = card(r.widget, '週間天気');
    const heading = forecast.children[0];
    assert.ok(texts(heading).includes(city));
    assert.ok(texts(heading).includes('〈代替地点〉'));
    assert.ok(!texts(heading).includes('一部未取得'), 'Do not add an unbudgeted warning to the narrow location heading');
    assert.ok(texts(forecast).includes('一部未取得'));
    assert.ok(texts(forecast).includes('週間予報を取得できません'));
    assert.equal(nodes(forecast, 'image').length, 0);
    const marker = nodes(heading, 'text').find(n => n.text === '〈代替地点〉');
    const cityNode = nodes(heading, 'text').find(n => n.text === city);
    assert.notEqual(parentOf(heading, marker), parentOf(heading, cityNode), 'Long city cannot ellipsize away the separate marker');
    assert.equal(marker.minimumScaleFactor, 1);
  });
  await test('More than two deadlines keeps the explicit nearest-two disclosure', async () => {
    const events = Array.from({length: 3}, (_, i) => event('合成追加提出期限' + i,
      clock(31, 0) + i * 86400000, clock(31, 0) + (i + 1) * 86400000, true));
    const r = await run(source, {family: 'large', events});
    assert.ok(texts(card(r.widget, '予定').children[0]).includes('期限は直近2件'));
    assert.equal(texts(r.widget).filter(t => t.includes('合成追加提出期限')).length, 2);
    assert.ok(!texts(r.widget).some(t => t.includes('合成追加提出期限2')));
  });

  for (const [screenWidth, contentWidth] of [[320, 272], [375, 301], [393, 318], [430, 344]]) {
    for (const dark of [false, true]) {
      await test('Medium existing dimensions/counts/colors remain unchanged: ' + screenWidth + ' ' + dark, async () => {
        const r = await run(source, {family: 'medium', screenWidth, dark});
        assert.deepEqual(plain(r.widget.padding), [4, 10, 5, 10]);
        const content = r.widget.children[0];
        assert.equal(content.size.width, contentWidth);
        const header = content.children[0];
        assert.equal(header.size.height, 44);
        const agenda = nodes(r.widget, 'stack').find(n => n.backgroundColor?.hex === (dark ? '#1C1C1E' : '#FFFFFF'));
        assert.equal(agenda.size.width, contentWidth);
        const row = rowForTitle(r.widget, 'Schedule all day').row;
        assert.equal(row.size.height, 15);
        assert.equal(row.children[0].size.width, 38);
        assert.equal(row.children[2].size.width, 44);
        const forecastImages = nodes(header, 'image').filter(n => n.imageSize?.width === 14);
        assert.equal(forecastImages.length, 3);
        const highColor = dark ? '#FF453A' : '#C62828', lowColor = dark ? '#0A84FF' : '#0066CC';
        const numbers = nodes(header, 'text').filter(n => /^\d+$/.test(n.text) && n.font.size === 10);
        assert.equal(numbers.filter(n => n.textColor.hex === highColor).length, 3);
        assert.equal(numbers.filter(n => n.textColor.hex === lowColor).length, 3);
        const log = r.record.logs.find(t => t.includes(' medium; budget='));
        assert.ok(+/budget=(\d+)pt/.exec(log)[1] <= (screenWidth <= 320 ? 141 : 155));
      });
      await test('Medium fallback keeps its compact behavior/config: ' + screenWidth + ' ' + dark, async () => {
        const r = await run(source, {family: 'medium', screenWidth, dark, locationError: true,
          cfg: {fallbackCity: '合成代替市', fallbackLat: 36, fallbackLon: 140}});
        assert.ok(texts(r.widget).includes('予備 合成代替市'));
        assert.ok(!texts(r.widget).some(t => t.includes('代替地点')));
        assert.equal(r.widget.children[0].children[0].size.height, 44);
        assert.equal(r.context.ORE_DASH_CONFIG.cfg.fallbackCity, '合成代替市');
      });
    }
  }

  for (const screenWidth of [320, 375, 393, 430]) {
    for (const dark of [false, true]) {
      for (const deadlineCount of [0, 1, 2]) {
        await test('Large readable rows stay within a real fixed-column budget: ' + screenWidth + ' ' + dark + ' ' + deadlineCount, async () => {
          const schedules = Array.from({length: 7}, (_, i) => event(
            '合成長文予定' + i + ' ' + '大会名称・階級・追加条件の確認 '.repeat(9),
            clock(30, 19) + i * 86400000, clock(30, 20) + i * 86400000));
          const deadlines = Array.from({length: deadlineCount}, (_, i) => event(
            '合成提出期限' + i + ' ' + '対象学期と必着条件を保持 '.repeat(10),
            clock(31, 0) + i * 86400000, clock(31, 0) + (i + 1) * 86400000, true));
          const records = [...schedules, ...deadlines];
          const before = snapshot(records);
          const r = await run(source, {family: 'large', screenWidth, dark, events: records});
          const scheduleCard = card(r.widget, '予定');
          assert.ok(scheduleCard, 'Schedule section survives');
          const labels = nodes(scheduleCard, 'text').filter(n => n.text.includes('合成長文予定'));
          assert.equal(labels.length, 6);
          assert.ok(!labels.some(n => n.text.includes('合成長文予定6')), 'Do not grow past six schedules');
          for (const label of labels) {
            const {cell, row} = rowForTitle(r.widget, label.text);
            assert.ok(label.text.length > 100, 'Keep original full title for native layout');
            assert.ok([1, 2].includes(label.lineLimit), 'Titles are bounded to one/two lines');
            assert.equal(label.minimumScaleFactor, 1, 'Do not hide overflow by shrinking title glyphs');
            assert.ok(label.font.size >= 11, 'Readable schedule title type');
            assert.ok(row.size.height >= 15, 'Single-line rows retain their minimum height');
            if (label.lineLimit === 2) assert.ok(row.size.height >= 30, 'Two lines need bounded vertical space');
            assert.ok(cell.size.height > 0 && cell.size.height <= row.size.height);
            const timeCell = row.children.find(n => n.kind === 'stack' && texts(n).some(t => /^\d{2}:\d{2}$/.test(t)));
            assert.ok(timeCell, 'A complete clock stays visible');
            assert.equal(timeCell.size.width, 44);
            const time = nodes(timeCell, 'text').find(n => /^\d{2}:\d{2}$/.test(n.text));
            assert.equal(time.font.name, 'mediumMonospacedSystemFont');
            assert.equal(time.font.size, 10);
            assert.equal(time.lineLimit, 1);
            assert.equal(time.minimumScaleFactor, 1);
            const width = row.children.reduce((sum, child) => sum + (child.kind === 'stack' ? child.size.width : child.length), 0);
            assert.equal(width, row.size.width, 'Fixed columns cannot steal time/title width');
            assert.ok(row.size.width <= screenWidth - 28, 'Row does not exceed available outer screen width');
          }
          if (screenWidth > 414 || deadlineCount === 0 || (screenWidth > 375 && deadlineCount < 2))
            assert.ok(labels.some(n => n.lineLimit === 2), 'Spend available height on at least one long title');
          const deadlineLabels = nodes(r.widget, 'text').filter(n => n.text.includes('合成提出期限'));
          assert.equal(deadlineLabels.length, deadlineCount);
          for (const label of deadlineLabels) {
            assert.ok([1, 2].includes(label.lineLimit), 'Deadline title has an explicit bounded line allocation');
            assert.equal(label.minimumScaleFactor, 1);
            const box = parentOf(r.widget, label);
            assert.equal(box.children[0], label);
            assert.equal(box.children[1].kind, 'spacer');
            assert.equal(box.children[1].length, null, 'Keep leading alignment');
          }
          const forecast = card(r.widget, '週間天気');
          assert.ok(forecast, 'Forecast section survives');
          assert.equal(nodes(forecast, 'image').length, 6);
          const numbers = nodes(forecast, 'text').filter(n => /^\d+$/.test(n.text));
          assert.equal(numbers.length, 12);
          assert.ok(numbers.every(n => n.font.size === 10));
          assert.equal(numbers.filter(n => n.textColor.hex === (dark ? '#FF453A' : '#C62828')).length, 6);
          assert.equal(numbers.filter(n => n.textColor.hex === (dark ? '#0A84FF' : '#0066CC')).length, 6);
          const log = r.record.logs.find(t => t.includes('stateBudgetBound='));
          assert.ok(log, 'Computed state budget is logged');
          const budgetCap = screenWidth <= 320 ? 311 : screenWidth <= 375 ? 338 : screenWidth <= 414 ? 354 : 382;
          const reportedBudget = +/stateBudgetBound=(\d+)pt/.exec(log)[1];
          assert.ok(reportedBudget <= budgetCap);
          if (deadlineCount) {
            assert.equal(declaredHeight(r.widget), reportedBudget, 'Budget must match actual declared UI boxes, not only a self-reported estimate');
            assert.ok(declaredHeight(r.widget) <= budgetCap);
          }
          assert.equal(snapshot(records), before);
          assert.equal(r.record.calendarWrites, 0);
        });
      }
    }
  }

  await test('Calendar remains read-only and no multipart upload is introduced', () => {
    assert.ok(!/CalendarEvent\s*\.\s*(?:remove|save|presentCreate|presentEdit)/.test(source));
    assert.ok(!/new\s+CalendarEvent\s*\(/.test(source));
    assert.ok(!/\.addFileToMultipart\s*\(/.test(source));
  });

  const failed = results.filter(r => r.status === 'FAIL');
  for (const result of results) console.log(result.status + ' ' + result.name + (result.error ? '\n' + result.error : ''));
  console.log(JSON.stringify({suite: 'display-audit', passed: results.length - failed.length,
    failed: failed.length, total: results.length,
    limits: 'Synthetic offline VM/API/UI-tree checks only; no native iOS text fit, real GPS/weather, permissions or refresh-time guarantee.'}));
  if (failed.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
