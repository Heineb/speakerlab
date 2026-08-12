#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const layout = require('./prepare-local-beocreate-layout');
const localRuntime = require('./local-development-runtime');

function parseArguments(argv) {
  const options = {
    runtimeRoot: path.join(layout.locateRepositoryRoot(__dirname), '.speakerlab-local', 'runtime'),
    port: 0,
    dspState: 'connected',
    prepareOnly: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--runtime-root') options.runtimeRoot = argv[++index];
    else if (argument === '--port') options.port = argv[++index];
    else if (argument === '--dsp-state') options.dspState = argv[++index];
    else if (argument === '--prepare-only') options.prepareOnly = true;
    else throw new Error('Unknown or incomplete option: ' + argument);
  }
  return options;
}

function ensureServerDependencies(repositoryRoot) {
  const moduleDirectory = path.join(repositoryRoot, 'Beocreate2', 'beo-system', 'node_modules');
  const required = ['express', 'eventemitter3', 'aplay', 'underscore'];
  let missing = required.filter(function (name) {
    return !fs.existsSync(path.join(moduleDirectory, name));
  });
  if (missing.length) {
    console.log('[SpeakerLab local] installing existing locked server dependencies...');
    const result = childProcess.spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci', '--prefix', path.join(repositoryRoot, 'Beocreate2', 'beo-system')],
      {cwd: repositoryRoot, stdio: 'inherit'}
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error('Unable to install the existing locked server dependencies.');
    }
    missing = required.filter(function (name) {
      return !fs.existsSync(path.join(moduleDirectory, name));
    });
    if (missing.length) {
      throw new Error('Locked server dependencies remain unavailable: ' + missing.join(', ') + '.');
    }
  }
  return moduleDirectory;
}

function main(argv) {
  let child;
  try {
    const options = parseArguments(argv);
    const repositoryRoot = layout.locateRepositoryRoot(__dirname);
    const runtime = localRuntime.prepareRuntime({
      repositoryRoot: repositoryRoot,
      runtimeRoot: options.runtimeRoot,
      prepareLayout: layout.prepareLayout
    });
    const environment = localRuntime.environmentFor(runtime, options);

    console.log('[SpeakerLab local] runtime root: ' + runtime.runtimeRoot);
    console.log('[SpeakerLab local] state directory: ' + runtime.dataDirectory);
    console.log('[SpeakerLab local] deployed layout: ' + runtime.deployedRoot);
    console.log('[SpeakerLab local] DSP transport: simulated (' + options.dspState + ')');
    console.log('[SpeakerLab local] enabled extensions: ' + runtime.enabledExtensions.join(', '));
    Object.keys(runtime.disabledExtensionReasons).sort().forEach(function (extension) {
      console.log('[SpeakerLab local] disabled ' + extension + ': ' + runtime.disabledExtensionReasons[extension]);
    });
    if (options.prepareOnly) return 0;

    const serverModules = ensureServerDependencies(repositoryRoot);
    environment.NODE_PATH = [
      serverModules,
      process.env.NODE_PATH
    ].filter(Boolean).join(path.delimiter);

    child = childProcess.spawn(process.execPath, [
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      runtime.serverEntry,
      'dev',
      'v',
      'q'
    ], {
      cwd: path.dirname(runtime.serverEntry),
      env: Object.assign({}, process.env, environment),
      stdio: 'inherit'
    });
    const forward = function (signal) {
      if (child && child.exitCode === null) child.kill(signal);
    };
    process.once('SIGINT', function () { forward('SIGINT'); });
    process.once('SIGTERM', function () { forward('SIGTERM'); });
    child.on('exit', function (code, signal) {
      if (signal) console.log('[SpeakerLab local] server stopped by ' + signal + '.');
      else console.log('[SpeakerLab local] server exited with status ' + code + '.');
      process.exitCode = code === null ? 1 : code;
    });
    child.on('error', function (error) {
      console.error('[SpeakerLab local] unable to start server: ' + error.message);
      process.exitCode = 1;
    });
    return null;
  } catch (error) {
    console.error('[SpeakerLab local] ' + error.message);
    return 1;
  }
}

if (require.main === module) {
  const result = main(process.argv.slice(2));
  if (result !== null) process.exitCode = result;
}

module.exports = {parseArguments, ensureServerDependencies, main};
