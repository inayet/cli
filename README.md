# Superface CLI

Superface CLI provides access to superface tooling from the CLI.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Development](#development)
- [Publishing](#publishing)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Install

To install the package, first create `.npmrc` file in your project root and put the following line into it.

```
@superfaceai:registry=https://npm.pkg.github.com
```

Then authenticate to github npm package registry. Use your github name as your login and generate a personal access token with at least the `repo` and `read:packages` permissions in Github to use as password:

```
npm login --registry=https://npm.pkg.github.com
```

After doing this, you should be able to install the package globally by running one of the following:

```
yarn global add @superfaceai/cli
npm install --global @superfaceai/cli
```

## Usage

```
superface play
```

### CLI

You can obtain the full CLI help by running `superface --help`.

 Command | Description
---------|-------------
`compile`| Compiles given profiles and/or maps into ASTs locally.
 `create`| Creates a new profile and/or map locally.
 `lint`  | Lints given profiles and/or maps locally.
 `play`  | Manages and executes interactive playgrounds.
 `generate` | Generates TypeScript interfaces from profile.

## Development

When developing, start with cloning the repository using `git clone https://github.com/superfaceai/cli.git` (or `git clone git@github.com:superfaceai/cli.git` if you have repository access).

After cloning, the dependencies must be downloaded using `yarn install` or `npm install`.

Now the repository is ready for code changes.

The `package.json` also contains scripts (runnable by calling `yarn <script-name>` or `npm run <script-name>`):
- `test` - run all tests
- `lint` - lint the code (use `lint --fix` to run autofix)
- `format` - check the code formatting (use `firmat:fix` to autoformat)
- `prepush` - run `test`, `lint` and `format` checks. This should run without errors before you push anything to git.

Lastly, to build a local artifact run `yarn build` or `npm run build`.

To install a local artifact globally, symlink the binary (`ln -s bin/superface <target>`) into one of the following folders:

- `~/.local/bin` - local binaries for your user only (may not be in `PATH` yet)
- `/usr/local/bin` - system-wide binaries installed by the system administrator
- output of `yarn global bin` - usually the same as `/use/local/bin`

**Note**: The project needs to be built (into the `dist` folder) to run cli commands.

## Publishing

Package publishing is done through GitHub release functionality.

[Draft a new release](https://github.com/superfaceai/cli/releases/new) to publish a new version of the package.

Use semver for the version tag. It must be in format of `v<major>.<minor>.<patch>`.

Github Actions workflow will pick up the release and publish it as one of the [packages](https://github.com/superfaceai/cli/packages).

## Maintainers

- [@Lukáš Valenta](https://github.com/lukas-valenta)
- [@Edward](https://github.com/TheEdward162)
- [@Vratislav Kalenda](https://github.com/Vratislav)
- [@Z](https://github.com/zdne)

## Contributing

PRs accepted.

Licenses of node_modules are checked during CI/CD for every commit. Only the following licenses are allowed:

- 0BDS
- MIT
- Apache-2.0
- ISC
- BSD-3-Clause
- BSD-2-Clause
- CC-BY-4.0
- CC-BY-3.0;BSD
- CC0-1.0
- Unlicense
- UNLICENSED

Note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

`<TBD>` © 2020 Superface
