#!/usr/bin/env node
// The gate between a commit and the live site.
//
// Porkbun publishes whatever sits on main, so a broken page here becomes a
// broken public page within a minute. Every check below exists because the
// thing it catches has actually gone wrong at least once during the build.
//
// Run: node .github/check.mjs
// Exit 0 = safe to merge. Exit 1 = blocked, with the reason.

import { readFileSync, existsSync } from 'node:fs';

const problems = [];
const passed = [];

function check(name, fn) {
  try {
    const detail = fn();
    passed.push(detail ? `${name}: ${detail}` : name);
  } catch (err) {
    problems.push(`${name}: ${err.message}`);
  }
}

// The two files the site is made of. logo.svg matters because the page's
// facts block points search engines at /logo.svg; without it that is a dead
// reference on a live site.
check('both files present', () => {
  for (const f of ['index.html', 'logo.svg']) {
    if (!existsSync(f)) throw new Error(`${f} is missing. The site is index.html plus logo.svg.`);
  }
  return 'index.html and logo.svg';
});

const html = existsSync('index.html') ? readFileSync('index.html', 'utf8') : '';

check('page is not empty', () => {
  if (html.length < 2000) throw new Error(`index.html is only ${html.length} bytes. That is not the built page; something has overwritten it.`);
  return `${Math.round(html.length / 1024)}kb`;
});

check('page has a title', () => {
  if (!/<title>[^<]+<\/title>/.test(html)) throw new Error('No title tag. The browser tab and every search result use it.');
  return html.match(/<title>([^<]+)<\/title>/)[1];
});

// A malformed rule does not error in a browser, it silently disables the rule
// after it. That happened during the build and went unnoticed until someone
// looked at the page.
check('CSS braces balance', () => {
  const block = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!block) throw new Error('No stylesheet found in the page.');
  const opens = (block[1].match(/\{/g) || []).length;
  const closes = (block[1].match(/\}/g) || []).length;
  if (opens !== closes) throw new Error(`${opens} open braces against ${closes} closing. A broken rule silently disables the one after it.`);
  return `${opens} rules`;
});

// The page must stand alone. An external request means the page breaks when
// that other server does, and leaks a visit to whoever runs it.
check('no external requests', () => {
  const found = html.match(/\ssrc\s*=\s*"https?:[^"]*"|url\(\s*https?:[^)]*\)|<link[^>]+rel="stylesheet"[^>]*>/gi);
  if (found) throw new Error(`the page fetches from elsewhere: ${found[0]}. It must be self contained.`);
  return 'self contained';
});

check('font is embedded', () => {
  if (!html.includes('data:font/woff2;base64')) throw new Error('The font is not embedded, so the page will fall back to a system face.');
  return 'Geist embedded';
});

// Anything in the shipped file is public. Working notes belong in the build
// scripts, which stay on our machine.
check('no comments in the shipped page', () => {
  const found = html.match(/<!--[\s\S]{0,80}?-->/g);
  if (found) throw new Error(`${found.length} comment(s) would be public, starting with: ${found[0].slice(0, 60)}`);
  return 'none';
});

// House style. Em dashes, en dashes and middots are banned across the project.
check('no banned characters', () => {
  const found = html.match(/[–—·]/g);
  if (found) throw new Error(`found ${found.length} banned character(s): ${[...new Set(found)].join(' ')}. Use commas, colons or full stops.`);
  return 'clean';
});

// The brand deliberately avoids the legacy product skin.
check('no legacy cyan', () => {
  if (/#0090DC/i.test(html)) throw new Error('#0090DC is the old product skin and is banned from this brand.');
  return 'clean';
});

check('brand colours present', () => {
  const missing = ['#0E7C66', '#C6A664'].filter((c) => !html.toUpperCase().includes(c));
  if (missing.length) throw new Error(`locked brand colours missing: ${missing.join(', ')}. Has the page been rebuilt from the canon?`);
  return 'emerald and champagne present';
});

// The facts block is what tells search engines Arkhimedes is an organisation
// rather than a misspelling. If it stops parsing, it stops working silently.
check('facts block is valid', () => {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!block) throw new Error('The search-engine facts block is missing.');
  let parsed;
  try {
    parsed = JSON.parse(block[1]);
  } catch (err) {
    throw new Error(`the facts block is not readable: ${err.message}`);
  }
  const graph = parsed['@graph'] || [];
  if (!graph.some((n) => n['@type'] === 'Organization')) throw new Error('The facts block no longer identifies an Organization.');
  return `${graph.length} entries`;
});

// The facts block points at /logo.svg. A dead reference there is worse than
// no reference, because it is asserted and then not there.
check('logo reference resolves', () => {
  if (html.includes('/logo.svg') && !existsSync('logo.svg')) {
    throw new Error('The page points search engines at /logo.svg and that file is not in this commit.');
  }
  return 'ok';
});

console.log('');
passed.forEach((p) => console.log(`  PASS  ${p}`));

if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  FAIL  ${p}`));
  console.log('');
  console.log(`${problems.length} problem(s). This cannot be merged to main, so it cannot reach the live site.`);
  console.log('Fix them in the draft branch and push again. The check will re-run by itself.');
  process.exit(1);
}

console.log('');
console.log(`All ${passed.length} checks passed. Safe to merge.`);
