'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_EXTENSIONS = [
  'beosonic',
  'channels',
  'equaliser',
  'feedback',
  'general-settings',
  'hifiberry-system-tools',
  'setup',
  'speaker-preset',
  'volume-limit'
];

const DISABLED_EXTENSION_REASONS = {
  'alsa-eq': 'invokes platform audio helpers',
  'alsa-ttable': 'invokes platform audio helpers',
  alsaloop: 'reads service configuration and invokes systemd',
  bluetooth: 'reads service configuration and invokes systemd',
  'choose-country': 'changes deployed operating-system settings',
  'daisy-chain': 'contains absolute deployed DSP paths',
  dlna: 'reads service configuration and invokes systemd',
  'dsp-programs': 'invokes DSPToolkit, GPIO and systemd during startup',
  'hifiberry-audiocontrol': 'reads AudioControl state and invokes systemd',
  interact: 'depends on platform source integrations',
  'last-fm': 'depends on platform source integrations',
  mpd: 'invokes MPD and systemd tools',
  network: 'accesses network interfaces and system services',
  'now-playing': 'depends on platform source integrations',
  openhome: 'invokes platform service tools',
  privacy: 'writes platform privacy and service state',
  'product-information': 'reads Raspberry Pi and operating-system identity',
  'room-compensation': 'invokes platform measurement tools',
  roon: 'invokes platform service tools',
  'shairport-sync': 'reads service configuration and invokes systemd',
  snapcast: 'reads service configuration and invokes systemd',
  'software-update': 'invokes platform update tools',
  sound: 'invokes ALSA and player reconfiguration tools',
  sources: 'invokes platform source tools',
  spotify: 'reads service configuration and invokes systemd',
  squeezelite: 'reads service configuration and invokes systemd',
  ssh: 'reads service configuration and invokes systemd',
  toslink: 'polls DSP state continuously',
  'ui-settings': 'invokes display-related systemd services'
};

function assertDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('Required ' + label + ' is missing: ' + directory);
  }
}

function prepareRuntime(options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const runtimeRoot = path.resolve(options.runtimeRoot);
  const dataDirectory = path.join(runtimeRoot, 'state');
  const layoutRoot = path.join(runtimeRoot, 'layout');
  const deployedRoot = path.join(layoutRoot, 'opt', 'beocreate');

  assertDirectory(path.join(repositoryRoot, 'Beocreate2', 'beo-system'), 'server directory');
  options.prepareLayout(layoutRoot, repositoryRoot);
  fs.mkdirSync(dataDirectory, {recursive: true});
  fs.mkdirSync(path.join(dataDirectory, 'beo-extensions'), {recursive: true});

  return {
    repositoryRoot: repositoryRoot,
    runtimeRoot: runtimeRoot,
    dataDirectory: dataDirectory,
    deployedRoot: deployedRoot,
    serverEntry: path.join(deployedRoot, 'beo-system', 'beo-server.js'),
    enabledExtensions: DEFAULT_EXTENSIONS.slice(),
    disabledExtensionReasons: Object.assign({}, DISABLED_EXTENSION_REASONS)
  };
}

function environmentFor(runtime, options) {
  const port = options.port === undefined ? 0 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Local development port must be an integer from 0 to 65535.');
  }
  const dspState = options.dspState || 'connected';
  if (dspState !== 'connected' && dspState !== 'disconnected') {
    throw new Error('DSP state must be "connected" or "disconnected".');
  }
  return {
    SPEAKERLAB_LOCAL_DEVELOPMENT: '1',
    SPEAKERLAB_DATA_DIRECTORY: runtime.dataDirectory,
    SPEAKERLAB_BIND_ADDRESS: '127.0.0.1',
    SPEAKERLAB_PORT: String(port),
    SPEAKERLAB_DSP_TRANSPORT: 'simulated',
    SPEAKERLAB_DSP_STATE: dspState,
    SPEAKERLAB_ENABLED_EXTENSIONS: runtime.enabledExtensions.join(',')
  };
}

module.exports = {
  DEFAULT_EXTENSIONS,
  DISABLED_EXTENSION_REASONS,
  prepareRuntime,
  environmentFor
};
