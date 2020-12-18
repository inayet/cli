import nodePath from 'path';

import Compile from '../commands/compile';
import { validateDocumentName } from '../common/document';
import {
  assertIsExecError,
  assertIsGenericError,
  userError,
} from '../common/error';
import { SkipFileType } from '../common/flags';
import {
  execFile,
  mkdir,
  OutputStream,
  readdir,
  resolveSkipFile,
  rimraf,
  stat,
} from '../common/io';
import * as mapTemplate from '../templates/map';
import * as playgroundTemplate from '../templates/playground';
import * as profileTemplate from '../templates/profile';

export interface PlaygroundFolder {
  name: string;
  path: string;
  providers: Set<string>;
}

type LogCallback = (message: string) => void;

export async function initializePlayground(
  playgroundPath: string,
  providers: string[],
  logCb?: LogCallback
): Promise<void> {
  const name = nodePath.basename(playgroundPath);
  if (!validateDocumentName(name)) {
    throw userError('The playground name must be a valid slang identifier', 11);
  }

  logCb?.(`$ mkdir ${playgroundPath}`);
  await mkdir(playgroundPath, { recursive: true, mode: 0o744 });

  const packageJsonPath = nodePath.join(playgroundPath, 'package.json');
  logCb?.(`$ echo '<package template>' > ${packageJsonPath}`);
  const packageJsonPromise = OutputStream.writeOnce(
    packageJsonPath,
    playgroundTemplate.packageJson(name)
  );

  const gluesPromises = providers.map(provider => {
    const path = nodePath.join(playgroundPath, `${name}.${provider}.ts`);
    logCb?.(`$ echo '<glue template>' > ${path}`);

    return OutputStream.writeOnce(
      path,
      playgroundTemplate.pubs(name, provider)
    );
  });

  const profilePath = nodePath.join(playgroundPath, `${name}.supr`);
  logCb?.(`$ echo '<profile template>' > ${profilePath}`);
  const profilePromise = OutputStream.writeOnce(
    profilePath,
    profileTemplate.header(name) + profileTemplate.pubs(name)
  );

  const mapsPromises = providers.map(provider => {
    const path = nodePath.join(playgroundPath, `${name}.${provider}.suma`);
    logCb?.(`$ echo '<map template>' > ${path}`);

    return OutputStream.writeOnce(
      path,
      mapTemplate.header(name, provider) + mapTemplate.pubs(name)
    );
  });

  const npmrcPath = nodePath.join(playgroundPath, '.npmrc');
  logCb?.(`$ echo '<npmrc template>' > ${npmrcPath}`);
  const npmrcPromise = OutputStream.writeOnce(
    npmrcPath,
    playgroundTemplate.npmRc()
  );

  await Promise.all([
    packageJsonPromise,
    ...gluesPromises,
    profilePromise,
    ...mapsPromises,
    npmrcPromise,
  ]);
}

export async function executePlayground(
  playground: PlaygroundFolder,
  providers: string[],
  skip: Record<'npm' | 'ast' | 'tsc', SkipFileType>,
  options: {
    debugLevel: string;
    logCb?: LogCallback;
  }
): Promise<void> {
  const profilePath = nodePath.join(playground.path, `${playground.name}.supr`);
  const mapPaths = providers.map(provider =>
    nodePath.join(playground.path, `${playground.name}.${provider}.suma`)
  );

  const gluePaths = providers.map(
    provider => `${playground.name}.${provider}.ts`
  );
  const compiledGluePaths = providers.map(
    provider => `${playground.name}.${provider}.js`
  );

  const skipNpm = await resolveSkipFile(skip.npm, [
    nodePath.join(playground.path, 'node_modules'),
  ]);
  if (!skipNpm) {
    options.logCb?.('$ npm install');
    try {
      await execFile('npm', ['install'], {
        cwd: playground.path,
      });
    } catch (err) {
      assertIsExecError(err);
      throw userError(`npm install failed:\n${err.stdout}`, 22);
    }
  }

  const skipAst = await resolveSkipFile(
    skip.ast,
    mapPaths.map(m => `${m}.ast.json`)
  );
  if (!skipAst) {
    options.logCb?.(
      `$ superface compile '${profilePath}' ${mapPaths
        .map(p => `'${p}'`)
        .join(' ')}`
    );
    try {
      await Compile.run([profilePath, ...mapPaths]);
    } catch (err) {
      assertIsGenericError(err);
      throw userError(`superface compilation failed: ${err.message}`, 23);
    }
  }

  const skipTsc = await resolveSkipFile(
    skip.tsc,
    compiledGluePaths.map(g => nodePath.join(playground.path, g))
  );
  if (!skipTsc) {
    options.logCb?.(
      `$ tsc --strict --target ES2015 --module commonjs --outDir ${
        playground.path
      } ${gluePaths.map(p => `'${p}'`).join(' ')}`
    );
    try {
      await execFile(
        nodePath.join('node_modules', '.bin', 'tsc'),
        [
          '--strict',
          '--target',
          'ES2015',
          '--module',
          'commonjs',
          '--outDir',
          '.',
          ...gluePaths,
        ],
        {
          cwd: playground.path,
        }
      );
    } catch (err) {
      assertIsExecError(err);
      throw userError(`tsc failed:\n${err.stdout}`, 23);
    }
  }

  for (const compiledGluePath of compiledGluePaths) {
    // log and handle debug level flag
    options.logCb?.(
      `$ DEBUG='${options.debugLevel}' '${process.execPath}' '${compiledGluePath}'`
    );

    // actually exec
    await execFile(
      process.execPath,
      [compiledGluePath],
      {
        cwd: playground.path,
        env: {
          ...process.env,
          // enable colors since we are forwarding stdout
          DEBUG_COLORS: process.stdout.isTTY ? '1' : '',
          DEBUG: options.debugLevel,
        },
      },
      {
        forwardStdout: true,
        forwardStderr: true,
      }
    );
  }
}

export async function cleanPlayground(
  playground: PlaygroundFolder,
  logCb?: LogCallback
): Promise<void> {
  const files = [
    `${playground.name}.supr.ast.json`,
    'node_modules',
    'package-lock.json',
  ];
  for (const provider of playground.providers.values()) {
    files.push(`${playground.name}.${provider}.suma.ast.json`);
    files.push(`${playground.name}.${provider}.js`);
  }
  logCb?.(`$ rimraf ${files.map(f => `'${f}'`).join(' ')}`);

  await Promise.all(
    files.map(file => rimraf(nodePath.join(playground.path, file)))
  );
}

/**
 * Detects playground at specified directory path or rejects.
 *
 * Looks for all of these files:
 * - `package.json`
 * - `<folder-name>.supr`
 * - `<folder-name>.*.suma` (at least one pair with `.ts` below)
 * - `<folder-name>.*.ts`
 */
export async function detectPlayground(
  path: string
): Promise<PlaygroundFolder> {
  let statInfo;
  try {
    statInfo = await stat(path);
  } catch (e) {
    throw userError('The playground path must exist and be accessible', 31);
  }

  if (!statInfo.isDirectory()) {
    throw userError('The playground path must be a directory', 32);
  }

  const baseName = nodePath.basename(path);
  const startName = baseName + '.';
  const entries = await readdir(path);

  let foundPackageJson = false;
  let foundProfile = false;
  const foundMaps: Set<string> = new Set();
  const foundGlues: Set<string> = new Set();

  for (const entry of entries) {
    if (entry === 'package.json') {
      foundPackageJson = true;
    } else if (entry.startsWith(startName)) {
      if (entry === `${startName}supr`) {
        foundProfile = true;
        continue;
      }

      if (entry.endsWith('.suma')) {
        const provider = entry.slice(
          startName.length,
          entry.length - '.suma'.length
        );

        foundMaps.add(provider);
        continue;
      }

      if (entry.endsWith('.ts')) {
        const provider = entry.slice(
          startName.length,
          entry.length - '.ts'.length
        );

        foundGlues.add(provider);
        continue;
      }
    }
  }

  const providers: Set<string> = new Set();
  for (const provider of foundMaps) {
    if (foundGlues.has(provider)) {
      providers.add(provider);
    }
  }

  if (foundPackageJson && foundProfile && providers.size > 0) {
    return {
      name: baseName,
      path,
      providers,
    };
  }

  throw userError('The directory at playground path is not a playground', 33);
}
