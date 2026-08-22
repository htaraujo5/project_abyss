import { getChapter } from '@abyss/content';
import { VfsShell } from '../apps/api/src/runtime/shell.ts';

const ch = getChapter('prologue');
const shell = new VfsShell(ch.vfsSeed);
shell.setContext({
  chapter: 'prologue',
  hosts: ch.websites.map((w) => ({ host: w.host, title: w.title, html: w.html, headers: w.headers })),
});

const cmds = [
  'help | head -n 8',
  'pwd',
  'ls -la /home/null',
  'cat /home/null/.null',
  'echo hello | tr a-z A-Z',
  'printf "%s\\n" a b c | sort | uniq',
  'find /home/null -name "*.txt" | head -n 5',
  'jq -n \'{a:1,b:2} | .a\'',
  "awk 'BEGIN{print 1+1}'",
  "sed 's/null/NULL/g' <<< null-machine",
  'mkdir -p /tmp/demo && echo hi > /tmp/demo/a.txt && cat /tmp/demo/a.txt',
  'comm -12 <(printf "a\\nb\\n") <(printf "b\\nc\\n")',
  'md5sum /home/null/.null',
  'submit P-001 test',
  'command -v jq',
  'which ls',
];

for (const c of cmds) {
  const r = shell.exec(c);
  console.log('$', c);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  console.log(
    `[exit ${r.exitCode}]`,
    r.events.filter((e) => e.startsWith('file.opened') || e.startsWith('submit')).join(','),
  );
  console.log('---');
}
