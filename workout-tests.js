/* In-browser tests for the pure logic (workout-shared.js) and for the consistency of workout-library.json.
   They read no workout data and write nothing. The full end-to-end suite (merging, syncing, logging) lives in tests/e2e.py. */
(function () {
  'use strict';
  var S = window.WorkoutShared, out = document.getElementById('out'), pass = 0, fail = 0;
  function group(t) { var d = document.createElement('div'); d.className = 'grp'; d.textContent = t; out.appendChild(d); }
  function check(name, ok, detail) {
    var d = document.createElement('div'); d.className = 'row' + (ok ? '' : ' fail');
    d.textContent = (ok ? 'PASS  ' : 'FAIL  ') + name + (!ok && detail !== undefined ? '  ->  ' + JSON.stringify(detail) : '');
    out.appendChild(d); if (ok) pass++; else fail++;
  }
  function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }
  function near(name, got, want) { check(name, Math.abs(got - want) < 1e-6, { got: got, want: want }); }

  group('Reps and holds of a set');
  eq('plain reps', S.setReps({ reps: 6 }), 6);
  eq('left/right counts the weaker side', S.setReps({ left: 3, right: 5 }), 3);
  eq('oldest format (a bare number)', S.setReps(7), 7);
  eq('empty set', S.setReps(null), 0);
  eq('form broke counts as 0', S.cleanReps({ reps: 8, formBroke: true }), 0);
  eq('form not broken counts fully', S.cleanReps({ reps: 8 }), 8);

  group('Estimated 1RM of added weight');
  near('70 kg bodyweight, +10 kg x 5', S.est1rmAdded(70, 10, 5), 80 * (1 + 5 / 30) - 70);
  eq('a single rep is the load itself', S.est1rmAdded(70, 12.5, 1), 12.5);
  eq('more than 12 reps is not trusted', S.est1rmAdded(70, 10, 13), null);
  eq('no added weight gives nothing', S.est1rmAdded(70, 0, 5), null);
  eq('assistance (negative) gives nothing', S.est1rmAdded(70, -10, 5), null);
  near('no bodyweight logged: plain Epley', S.est1rmAdded(0, 10, 6), 10 * (1 + 6 / 30));

  group('Bodyweight on a date');
  var log = [{ date: '2026-09-01', kg: 70 }, { date: '2026-10-01', kg: 71 }];
  eq('latest weigh-in on or before the date', S.bodyweightKgOn(log, '2026-09-20'), { kg: 70, approx: false });
  eq('after the last weigh-in', S.bodyweightKgOn(log, '2026-12-01'), { kg: 71, approx: false });
  eq('before the first weigh-in is an estimate', S.bodyweightKgOn(log, '2026-08-01'), { kg: 70, approx: true });
  eq('no log', S.bodyweightKgOn([], '2026-08-01'), null);

  group('Weeks, pace, duration');
  eq('week starting Monday (a Monday)', S.weekStartISO('2026-10-19', 1), '2026-10-19');
  eq('week starting Monday (a Sunday)', S.weekStartISO('2026-10-25', 1), '2026-10-19');
  eq('week starting Sunday', S.weekStartISO('2026-10-21', 0), '2026-10-18');
  eq('pace 5.5 min per km', S.formatPace(5.5), '5:30');
  eq('pace rounds seconds up to the next minute', S.formatPace(5.999), '6:00');
  eq('no pace for zero', S.formatPace(0), null);
  eq('duration 139 min', S.formatDuration(139), '2h19m');
  eq('duration 45 min', S.formatDuration(45), '45m');
  near('km to miles', S.kmToDisplay('imperial', 10), 6.21371);
  eq('metric leaves km alone', S.kmToDisplay('metric', 10), 10);

  group('Names, patterns, text');
  eq('Tucked and Tuck are the same exercise', S.exKey('Tucked lever') === S.exKey('Tuck lever'), true);
  eq('plural and spacing ignored', S.exKey('Pull ups') === S.exKey('Pull-up'), true);
  eq('different exercises differ', S.exKey('Push-ups') === S.exKey('Pull-ups'), false);
  eq('pattern guess: pull-ups', S.guessPattern('Pull-ups'), 'vpull');
  eq('pattern guess: pike push-ups', S.guessPattern('Pike push-ups'), 'vpush');
  eq('pattern guess: rows', S.guessPattern('Inverted rows'), 'hpull');
  eq('pattern guess: pistol', S.guessPattern('Pistol squats'), 'legs');
  eq('straight-arm: front lever', S.guessStraightArm('Front lever'), true);
  eq('straight-arm: lever row is not', S.guessStraightArm('Lever row'), false);
  eq('escapes quotes and tags', S.escapeHtml('a"b<c>&\''), 'a&quot;b&lt;c&gt;&amp;&#39;');
  eq('today is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(S.todayISO()), true);

  group('Straight-arm load report');
  var today = S.todayISO();
  var rep = S.straightArmReport([{ date: today, exercise: 'Front lever', isometric: true, sets: [{ reps: 20 }, { reps: 15 }] }], function (n) { return /lever/i.test(n); }, 1, today);
  eq('adds up this week\'s holding seconds', rep.rows[rep.rows.length - 1].sec, 35);
  eq('8 weeks of rows', rep.rows.length, 8);
  var pain = S.straightArmReport([{ date: today, exercise: 'Front lever', isometric: true, sets: [{ reps: 10, pain: true }] }], function () { return true; }, 1, today);
  check('pain flag raises a warning', pain.flags.some(function (f) { return f[0] === 'warn'; }), pain.flags);

  group('Library file consistency');
  fetch('workout-library.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (L) {
    var ex = {}, vars = {}, key = {};
    L.exercises.forEach(function (e) { ex[e.name] = e; [e.name].concat(e.aliases || []).forEach(function (n) { (key[S.exKey(n)] = key[S.exKey(n)] || {})[e.name] = 1; }); });
    L.variations.forEach(function (v) { vars[v.exercise] = v.variations; });
    var shared = Object.keys(key).filter(function (k) { return Object.keys(key[k]).length > 1; });
    eq('no two library exercises share a name or alias', shared, []);
    var badAlias = L.variationAliases.filter(function (a) { return !ex[a.exercise] || (a.variation && !(vars[a.exercise] || []).includes(a.variation)); }).map(function (a) { return a.name; });
    eq('every alias points to a real exercise and variation', badAlias, []);
    var seen = {}, dup = [];
    L.variationAliases.forEach(function (a) { var k = S.exKey(a.name) + '|' + (a.category || ''); if (seen[k]) dup.push(a.name); seen[k] = 1; });
    eq('no alias is defined twice for the same category', dup, []);
    var badSkill = [];
    L.skills.forEach(function (s) { s.steps.forEach(function (st) {
      if (st.exercise && !ex[st.exercise] && !key[S.exKey(st.exercise)]) badSkill.push(s.name + ': ' + st.exercise);
      if (st.variation && st.variation !== '__none__' && vars[st.exercise] && !vars[st.exercise].includes(st.variation)) badSkill.push(s.name + ': ' + st.exercise + ' / ' + st.variation);
    }); });
    eq('every skill step names a real exercise and variation', badSkill, []);
    var routines = {}; L.warmups.concat(L.stretches).forEach(function (r) { routines[r.id] = 1; });
    var badRoutine = [];
    L.programmes.concat(L.workouts).forEach(function (p) { (p.days || [p]).forEach(function (d) { ['warmup', 'stretch'].forEach(function (k) { if (d[k] && !routines[d[k]]) badRoutine.push(p.id + ': ' + d[k]); }); }); });
    eq('every warm-up and stretch a plan names exists', badRoutine, []);
    var iso = {}; L.exercises.forEach(function (e) { iso[e.name] = !!e.isometric; });
    var mixed = L.variationAliases.filter(function (a) { return a.variation && vars[a.exercise] && L.variations.filter(function (v) { return v.exercise === a.exercise; })[0].measure === 'hold' && !iso[a.exercise]; }).map(function (a) { return a.name; });
    eq('hold-type variation lists belong to timed exercises', mixed, []);
  }).catch(function (e) { check('library file loads', false, String(e)); }).then(function () {
    var s = document.getElementById('summary');
    s.textContent = pass + ' passed, ' + fail + ' failed';
    s.className = fail ? 'bad' : 'ok';
  });
})();
