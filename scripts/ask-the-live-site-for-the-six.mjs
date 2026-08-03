#!/usr/bin/env node
/* ask-the-live-site-for-the-six
   ---------------------------------------------------------------------------
   Asks the real, live arkhimedes.ai for the six safety instructions and prints
   which ones actually arrived. It reads and changes nothing.

   WHAT A SAFETY INSTRUCTION IS. When a browser asks for a page, the server can
   send short instructions alongside it telling the browser how to behave. They
   are called response headers. Six are standard, and each switches off a way a
   site can be attacked.

   WHY THIS EXISTS RATHER THAN A NOTE SAYING THEY WERE ADDED. Adding a line to a
   file is not the same as a browser receiving it. Two of the six work when they
   come from inside the page itself, written as meta tags in index.html. The
   other four only work as real headers, and whether a host sends them is the
   host's decision, not ours. So this asks the live address and reports what
   came back, rather than reading our own files and believing them.

   IT REPORTS. IT DOES NOT JUDGE. Exit 0 when it reached the site and could say
   what arrived, exit 2 when it could not reach the site, because a checker that
   cannot reach what it checks has not passed, it has gone blind. Pass
   --must-have-all-six to make it exit 1 when any of the six is missing, which is
   what to use the day the site moves to a host that sends them.

   RUN IT
     node scripts/ask-the-live-site-for-the-six.mjs
     node scripts/ask-the-live-site-for-the-six.mjs --must-have-all-six
     node scripts/ask-the-live-site-for-the-six.mjs https://somewhere.else/
*/

const args = process.argv.slice(2);
const STRICT = args.includes('--must-have-all-six');
const SITE = args.find((a) => a.startsWith('http')) || 'https://arkhimedes.ai/';

/* The six, each with what it stops in plain words, and whether a browser will
   obey it when it comes from inside the page instead of from the server.
   The two marked inPage are the two written into index.html as meta tags. The
   other four are ignored by every browser when they are put in a page, by
   design: a page that could switch off its own frame rules could be tricked
   into switching them off. */
const SIX = [
  {
    header: 'strict-transport-security',
    stops: 'a visitor being sent over an unencrypted connection, even once, even if they type the address without the s',
    inPage: false,
    meta: null,
  },
  {
    header: 'content-security-policy',
    stops: 'the page loading anything from anywhere else, so an injected script has nowhere to fetch from and nothing to send to',
    inPage: true,
    meta: 'Content-Security-Policy',
  },
  {
    header: 'x-content-type-options',
    stops: 'the browser guessing what a file is instead of believing the label, which is how an image can be made to run as a script',
    inPage: false,
    meta: null,
  },
  {
    header: 'x-frame-options',
    stops: 'somebody else putting your page inside theirs, invisibly, so a click on their page lands on yours',
    inPage: false,
    meta: null,
  },
  {
    header: 'referrer-policy',
    stops: 'the full address a visitor came from being handed to the next site they reach',
    inPage: true,
    meta: 'name="referrer"',
  },
  {
    header: 'permissions-policy',
    stops: 'the page, or anything that gets into it, asking for the camera, the microphone, the location or a payment',
    inPage: false,
    meta: null,
  },
];

let res;
try {
  res = await fetch(SITE, { redirect: 'follow' });
} catch (err) {
  console.error(`Could not reach ${SITE}: ${err.message}`);
  console.error('Nothing was checked. This is not a pass.');
  process.exit(2);
}

console.log(`Asked ${SITE} at ${new Date().toISOString()}. Nothing was changed.`);
console.log(`It answered ${res.status}, served by ${res.headers.get('server') || 'a server that did not say'}.`);
console.log('');

const arrived = [];
const missing = [];
for (const s of SIX) {
  const got = res.headers.get(s.header);
  if (got) { arrived.push(s); console.log(`  ARRIVED   ${s.header}: ${got}`); }
  else { missing.push(s); console.log(`  MISSING   ${s.header}`); }
}

console.log('');
console.log(`${arrived.length} of ${SIX.length} arrived as real instructions from the server.`);

/* The page itself is fetched and read, because two of the six work from inside
   it. This looks at the bytes the server actually sent, not at the file on this
   machine, so a page that failed to publish cannot pass. */
let page = '';
try { page = await res.text(); } catch (_) { /* a body we cannot read leaves the in-page part unproven, and it is reported as such below */ }

if (page) {
  const inPage = SIX.filter((s) => s.inPage);
  console.log('');
  console.log('IN THE PAGE ITSELF, which is the only route a browser obeys for these two:');
  for (const s of inPage) {
    const there = s.meta && page.includes(s.meta);
    console.log(`  ${there ? 'IN THE PAGE' : 'NOT IN THE PAGE'}   ${s.header}`);
  }
} else {
  console.log('');
  console.log('The page body could not be read, so the two that work from inside the page are unproven here.');
}

console.log('');
console.log('WHAT EACH ONE STOPS');
for (const s of SIX) console.log(`  ${s.header}: ${s.stops}`);

if (missing.length) {
  console.log('');
  console.log('WHY SOME ARE MISSING, and what would fix it. This host serves files and');
  console.log('nothing else: it has no place to write a header. The file named _headers at');
  console.log('the top of this repository holds all six in the format every other static');
  console.log('host reads, so moving the site to one of those hosts makes all six arrive');
  console.log('with no further work. Until then the two that a browser obeys from inside');
  console.log('the page are carried in index.html and do work today.');
}

if (STRICT && missing.length) {
  console.log('');
  console.log(`${missing.length} of the six did not arrive: ${missing.map((m) => m.header).join(', ')}`);
  process.exit(1);
}
process.exit(0);
