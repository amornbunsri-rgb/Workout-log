/* Joins the parts in src/ back into workout-log.js (the one file the app loads).
   Why parts: the code shares about 40 variables, so it has to run as one script, but it is easier to edit in sections.
   Usage:   node build.js           writes workout-log.js
            node build.js --check   exits with an error if workout-log.js is not what the parts produce */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const parts = fs.readdirSync(dir).filter(f => /^workout-log\.\d+-.*\.js$/.test(f)).sort((a, b) => parseInt(a.split('.')[1]) - parseInt(b.split('.')[1]));
const built = parts.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
const target = path.join(__dirname, 'workout-log.js');
if (process.argv.includes('--check')) {
  const same = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === built;
  console.log(same ? 'workout-log.js matches its ' + parts.length + ' parts' : 'workout-log.js is OUT OF DATE: run node build.js');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(target, built);
console.log('built workout-log.js from ' + parts.length + ' parts (' + built.split('\n').length + ' lines)');
