#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_LINKS = [
  ['beo-system', 'Beocreate2/beo-system'],
  ['beo-extensions', 'Beocreate2/beo-extensions'],
  ['beo-views', 'Beocreate2/beo-views'],
  ['beo-dsp-programs', 'Beocreate2/beo-dsp-programs'],
  ['beo-listening-modes', 'Beocreate2/beo-listening-modes'],
  ['beo-product-identities', 'Beocreate2/beo-product-identities'],
  ['beo-product-images', 'Beocreate2/beo-product-images'],
  ['beo-speaker-presets', 'Beocreate2/beo-speaker-presets'],
  ['beocreate_essentials', 'beocreate_essentials']
];

function fail(message) {
  throw new Error(message);
}

function locateRepositoryRoot(startDirectory) {
  let candidate = path.resolve(startDirectory);

  while (true) {
    if (
      fs.existsSync(path.join(candidate, 'AGENTS.md')) &&
      fs.existsSync(path.join(candidate, 'docs', 'PROJECT_CHARTER.md'))
    ) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      fail('Could not locate the SpeakerLab repository root from ' + startDirectory + '.');
    }
    candidate = parent;
  }
}

function assertDirectory(directory, description) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') fail('Required ' + description + ' is missing: ' + directory);
    throw error;
  }
  if (!stat.isDirectory()) fail('Required ' + description + ' is not a directory: ' + directory);
}

function assertFile(file, description) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') fail('Required ' + description + ' is missing: ' + file);
    throw error;
  }
  if (!stat.isFile()) fail('Required ' + description + ' is not a file: ' + file);
}

function inspectManagedPath(linkPath, expectedSource) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch (error) {
    if (error.code === 'ENOENT') return 'create';
    throw error;
  }

  if (!stat.isSymbolicLink()) fail('Refusing to overwrite unexpected existing path: ' + linkPath);

  let actualSource;
  try {
    actualSource = fs.realpathSync(linkPath);
  } catch (error) {
    fail('Existing symbolic link is broken: ' + linkPath);
  }

  if (actualSource !== fs.realpathSync(expectedSource)) {
    fail(
      'Refusing to replace symbolic link with an unexpected target: ' +
      linkPath + ' -> ' + fs.readlinkSync(linkPath)
    );
  }
  return 'keep';
}

function assertDirectoryOrMissing(directory, description) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isDirectory()) {
    fail('Expected ' + description + ' to be a directory or absent: ' + directory);
  }
}

function prepareLayout(destination, repositoryRoot) {
  const resolvedDestination = path.resolve(destination);
  const optDirectory = path.join(resolvedDestination, 'opt');
  const beocreateDirectory = path.join(optDirectory, 'beocreate');

  assertDirectoryOrMissing(resolvedDestination, 'destination');
  assertDirectoryOrMissing(optDirectory, 'local opt directory');
  assertDirectoryOrMissing(beocreateDirectory, 'local Beocreate directory');

  const links = REQUIRED_LINKS.map(function (mapping) {
    const source = path.join(repositoryRoot, mapping[1]);
    assertDirectory(source, 'source directory "' + mapping[1] + '"');
    return {name: mapping[0], source: source, linkPath: path.join(beocreateDirectory, mapping[0])};
  });

  assertFile(
    path.join(repositoryRoot, 'Beocreate2', 'beo-system', 'beo-server.js'),
    'server entry point'
  );
  assertFile(
    path.join(repositoryRoot, 'beocreate_essentials', 'communication.js'),
    'Beocreate communication module'
  );

  links.forEach(function (link) {
    link.action = inspectManagedPath(link.linkPath, link.source);
  });

  fs.mkdirSync(beocreateDirectory, {recursive: true});
  const canonicalBeocreateDirectory = fs.realpathSync(beocreateDirectory);
  links.forEach(function (link) {
    if (link.action === 'create') {
      const relativeTarget = path.relative(canonicalBeocreateDirectory, fs.realpathSync(link.source));
      fs.symlinkSync(relativeTarget, link.linkPath, 'dir');
    }
  });
  return beocreateDirectory;
}

function usage() {
  return 'Usage: node scripts/prepare-local-beocreate-layout.js <destination>';
}

function main(argv) {
  if (argv.length !== 1 || argv[0] === '--help' || argv[0] === '-h') {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log(usage());
      return 0;
    }
    console.error(usage());
    return 2;
  }

  try {
    const repositoryRoot = locateRepositoryRoot(__dirname);
    const layout = prepareLayout(argv[0], repositoryRoot);
    console.log('Prepared local Beocreate layout at ' + layout);
    return 0;
  } catch (error) {
    console.error('Unable to prepare local Beocreate layout: ' + error.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  REQUIRED_LINKS: REQUIRED_LINKS,
  locateRepositoryRoot: locateRepositoryRoot,
  prepareLayout: prepareLayout
};
