import { flags as oclifFlags } from '@oclif/command';
import { Source } from '@superfaceai/parser';
import { parseEnvFeatures } from '@superfaceai/parser/dist/language/syntax/features';
import { basename, join as joinPath } from 'path';

import { Command } from '../common/command.abstract';
import {
  DOCUMENT_PARSE_FUNCTION,
  inferDocumentTypeWithFlag,
} from '../common/document';
import { DocumentType } from '../common/document.interfaces';
import { userError } from '../common/error';
import { DocumentTypeFlag, documentTypeFlag } from '../common/flags';
import { isDirectoryQuiet, readFile } from '../common/io';
import { OutputStream } from '../common/output-stream';

export default class Compile extends Command {
  static description = 'Compiles the given profile or map.';

  static flags = {
    ...Command.flags,
    documentType: documentTypeFlag,
    output: oclifFlags.string({
      char: 'o',
      description:
        'Specifies directory or filename where the compiled file should be written. `-` is stdout, `-2` is stderr. By default, the output is written alongside the input file with `.ast.json` suffix added.',
      default: undefined,
    }),
    append: oclifFlags.boolean({
      default: false,
      description:
        'Open output file in append mode instead of truncating it if it exists. Has no effect with stdout and stderr streams.',
    }),

    compact: oclifFlags.boolean({
      char: 'c',
      default: false,
      description: 'Use compact JSON representation of the compiled file.',
    }),
  };

  // Require at least one file but allow multiple files
  static args = [{ name: 'file', required: true }];
  static strict = false;

  async run(): Promise<void> {
    const DEFAULT_EXTENSION = '.ast.json';
    // TODO: This should be called in parser automatically
    parseEnvFeatures();

    const { argv, flags } = this.parse(Compile);

    // process output path and prepare output stream
    // outputStream is set when the output points to a file and thus
    // is shared across all input files
    const outputPath = flags.output?.trim();
    let outputStream: OutputStream | undefined = undefined;
    if (outputPath !== undefined) {
      const isDirectory = await isDirectoryQuiet(outputPath);
      if (!isDirectory) {
        this.debug(`Compiling all files to "${outputPath}"`);
        outputStream = new OutputStream(outputPath, { append: flags.append });
      }
    }

    await Promise.all(
      argv.map(
        async (file): Promise<void> => {
          // Shared stream
          let fileOutputStream = outputStream;
          if (fileOutputStream === undefined) {
            if (outputPath !== undefined) {
              // Shared directory, name based on file
              const sharedDirectory = joinPath(
                outputPath,
                basename(file) + DEFAULT_EXTENSION
              );
              this.debug(`Compiling "${file}" to "${sharedDirectory}"`);

              fileOutputStream = new OutputStream(sharedDirectory, {
                append: flags.append,
              });
            } else {
              // File specific path based on file path
              this.debug(
                `Compiling "${file}" to "${file + DEFAULT_EXTENSION}"`
              );
              fileOutputStream = new OutputStream(file + DEFAULT_EXTENSION, {
                append: flags.append,
              });
            }
          }

          const ast = await Compile.compileFile(file, flags.documentType);
          const json = JSON.stringify(
            ast,
            undefined,
            flags.compact ? undefined : 2
          );

          await fileOutputStream.write(json);
          if (fileOutputStream != outputStream) {
            await fileOutputStream.cleanup();
          }
        }
      )
    );

    await outputStream?.cleanup();
  }

  static async compileFile(
    path: string,
    typeFlag: DocumentTypeFlag
  ): Promise<unknown> {
    const documentType = inferDocumentTypeWithFlag(typeFlag, path);
    if (
      documentType !== DocumentType.MAP &&
      documentType !== DocumentType.PROFILE
    ) {
      throw userError('Could not infer document type', 1);
    }

    const parseFunction = DOCUMENT_PARSE_FUNCTION[documentType];
    const content = (await readFile(path)).toString();
    const source = new Source(content, basename(path));

    return parseFunction(source);
  }
}
