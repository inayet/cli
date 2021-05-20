import { getLocal } from 'mockttp';
import { join as joinPath } from 'path';

import { exists, mkdirQuiet, rimraf } from '../common/io';
import { execCLI, mockResponsesForProfile, setUpTempDir } from '../test/utils';

const mockServer = getLocal();

describe('Install CLI command', () => {
  const TEMP_PATH = joinPath('test', 'tmp');

  beforeAll(async () => {
    await mkdirQuiet(TEMP_PATH);
    await mockServer.start();
    await mockResponsesForProfile(mockServer, 'starwars/character-information');
  });

  afterAll(async () => {
    await mockServer.stop();
    await rimraf(TEMP_PATH);
  });

  describe('when installing new profile', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await setUpTempDir(TEMP_PATH);
    });

    it('installs the newest profile', async () => {
      const result = await execCLI(
        tempDir,
        ['install', 'starwars/character-information'],
        mockServer.url
      );
      expect(result).toMatch(
        'All profiles (1) have been installed successfully.'
      );
      expect(await exists(joinPath(tempDir, 'superface', 'super.json'))).toBe(
        true
      );
      expect(
        await exists(
          joinPath(
            tempDir,
            'superface',
            'grid',
            'starwars',
            'character-information@1.0.1.supr'
          )
        )
      ).toBe(true);
    });
  });
});
