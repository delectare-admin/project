'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const PROJECT = 'testo-movie-site';
const NAME = 'submovieValidateUpload';
const REGION = 'us-east1';

function gcloud(args, capture = true) {
  if (args.some(arg => /[%"!^&|<>\r\n]/.test(arg))) {
    throw new Error('Unsafe command argument.');
  }

  const windows = process.platform === 'win32';
  const command = windows
    ? 'gcloud.cmd ' + args.map(arg => '"' + arg + '"').join(' ')
    : 'gcloud';

  const result = spawnSync(command, windows ? [] : args, {
    shell: windows,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    if (capture && result.stderr) console.error(result.stderr);
    throw new Error(
      'gcloud failed. Check installation, login and permissions.'
    );
  }

  return result.stdout || '';
}

function describe() {
  return JSON.parse(gcloud([
    'functions', 'describe', NAME, '--v2',
    '--region=' + REGION,
    '--project=' + PROJECT,
    '--format=json(state,buildConfig)'
  ]));
}

function main() {
  const mode = process.argv[2];

  if (!['--check', '--repair'].includes(mode)
      || process.argv.length !== 3) {
    throw new Error('Use --check or --repair.');
  }

  if (process.env.GCLOUD_PROJECT
      && process.env.GCLOUD_PROJECT !== PROJECT) {
    throw new Error('Wrong Firebase project. Deployment stopped.');
  }

  const folder = path.join(__dirname, 'functions');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(folder, 'package.json'), 'utf8')
  );

  if (pkg.scripts?.['gcp-build'] !== 'node build-media-tools.cjs'
      || !fs.existsSync(path.join(folder, 'build-media-tools.cjs'))) {
    throw new Error(
      'Expected local media build configuration was not found.'
    );
  }

  const current = describe();

  if (current.state !== 'ACTIVE') {
    throw new Error(
      'Validator is not ACTIVE. Check its deployment first.'
    );
  }

  if (mode === '--check') {
    console.log('Validator predeploy check: OK');
    return;
  }

  const setting =
    current.buildConfig?.environmentVariables?.GOOGLE_NODE_RUN_SCRIPTS;

  if (setting !== 'gcp-build') {
    const source = current.buildConfig?.source?.storageSource;

    if (!source
        || !/^[a-z0-9][a-z0-9._-]+$/.test(source.bucket || '')
        || !/^[A-Za-z0-9_./-]+\.zip$/.test(source.object || '')) {
      throw new Error(
        'Published source was not recognized. No changes made.'
      );
    }

    console.log('Restoring validator media build setting...');

    gcloud([
      'functions', 'deploy', NAME, '--gen2',
      '--region=' + REGION,
      '--project=' + PROJECT,
      '--source=gs://' + source.bucket + '/' + source.object,
      '--update-build-env-vars=GOOGLE_NODE_RUN_SCRIPTS=gcp-build'
    ], false);
  }

  const verified = describe();

  if (verified.state !== 'ACTIVE'
      || verified.buildConfig?.environmentVariables
        ?.GOOGLE_NODE_RUN_SCRIPTS !== 'gcp-build') {
    throw new Error(
      'Validator build verification failed. Deployment is not complete.'
    );
  }

  console.log('Validator build setting: OK (gcp-build)');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}