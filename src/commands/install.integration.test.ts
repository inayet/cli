import { loadSuperJson, NodeFileSystem } from '@superfaceai/one-sdk';
import { getLocal } from 'mockttp';
import { join as joinPath } from 'path';

import { exists, mkdir, mkdirQuiet, rimraf } from '../common/io';
import { OutputStream } from '../common/output-stream';
import {
  execCLI,
  mockResponsesForProfile,
  mockResponsesForProfileProviders,
  setUpTempDir,
} from '../test/utils';

const mockServer = getLocal();

describe('Install CLI command', () => {
  const TEMP_PATH = joinPath('test', 'tmp');
  let tempDir: string;

  beforeAll(async () => {
    await mkdir(TEMP_PATH, { recursive: true });
    await mockServer.start();
    await mockResponsesForProfile(mockServer, 'starwars/character-information');
    await mockResponsesForProfile(
      mockServer,
      'starwars/character-information@1.0.2'
    );
    await mockResponsesForProfileProviders(
      mockServer,
      ['swapi'],
      'starwars/character-information'
    );
  });

  beforeEach(async () => {
    tempDir = await setUpTempDir(TEMP_PATH);
  });

  afterEach(async () => {
    await rimraf(tempDir);
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe('when installing new profile', () => {
    it('installs the newest profile', async () => {
      const result = await execCLI(
        tempDir,
        ['install', 'starwars/character-information'],
        mockServer.url
      );
      expect(result.stdout).toMatch(
        'All profiles (1) have been installed successfully'
      );
      await expect(
        exists(joinPath(tempDir, 'superface', 'super.json'))
      ).resolves.toBe(true);

      await expect(
        exists(
          joinPath(
            tempDir,
            'node_modules',
            '.cache',
            'superface',
            'profiles',
            'starwars',
            'character-information@1.0.1.supr.ast.json'
          )
        )
      ).resolves.toBe(true);
    }, 30000);

    it('installs the specified profile version with default provider configuration', async () => {
      const result = await execCLI(
        tempDir,
        ['install', 'starwars/character-information@1.0.2'],
        mockServer.url
      );
      expect(result.stdout).toMatch(
        'All profiles (1) have been installed successfully'
      );
      await expect(
        exists(joinPath(tempDir, 'superface', 'super.json'))
      ).resolves.toBe(true);

      await expect(
        exists(
          joinPath(
            tempDir,
            'node_modules',
            '.cache',
            'superface',
            'profiles',
            'starwars',
            'character-information@1.0.2.supr.ast.json'
          )
        )
      ).resolves.toBe(true);
    }, 20000);

    it('installs local profile', async () => {
      const profileId = 'starwars/character-information';
      const profileIdRequest =
        '../../../fixtures/profiles/starwars/character-information.supr';

      const result = await execCLI(
        tempDir,
        ['install', profileIdRequest, '--local'],
        mockServer.url
      );
      expect(result.stdout).toMatch(
        'All profiles (1) have been installed successfully'
      );
      await expect(
        exists(joinPath(tempDir, 'superface', 'super.json'))
      ).resolves.toBe(true);

      const superJson = (
        await loadSuperJson(
          joinPath(tempDir, 'superface', 'super.json'),
          NodeFileSystem
        )
      ).unwrap();

      expect(superJson.profiles![profileId]).toEqual({
        file: `../${profileIdRequest}`,
      });
    }, 20000);

    it('error when installing non-existent local profile', async () => {
      const profileIdRequest = 'none.supr';

      const result = await execCLI(
        tempDir,
        ['install', profileIdRequest, '--local'],
        mockServer.url
      );
      expect(result.stdout).toMatch('No profiles have been installed');

      await expect(
        exists(joinPath(tempDir, 'superface', 'super.json'))
      ).resolves.toBe(true);

      const superJson = (
        await loadSuperJson(
          joinPath(tempDir, 'superface', 'super.json'),
          NodeFileSystem
        )
      ).unwrap();

      expect(superJson.profiles).toStrictEqual({});
    }, 20000);

    it('errors without a force flag', async () => {
      const profileId = 'starwars/character-information';

      // set existing super.json
      const localSuperJson = {
        profiles: {
          [profileId]: {
            file:
              '../../../../fixtures/profiles/starwars/character-information.supr',
          },
        },
        providers: {},
      };
      await mkdirQuiet(joinPath(tempDir, 'superface'));
      await OutputStream.writeOnce(
        joinPath(tempDir, 'superface', 'super.json'),
        JSON.stringify(localSuperJson, undefined, 2)
      );

      await expect(
        execCLI(
          tempDir,
          ['install', 'starwars/character-information'],
          mockServer.url
        )
      ).rejects.toMatch('already installed from a different path');
    }, 20000);
  });
});
