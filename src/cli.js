#!/usr/bin/env node

const { stdin, stdout, exit } = require('process')
const { flattenPath, DifferenceTransform } = require('./index.js')

const onError = err => {
  console.error(`Error: ${err.message}`)
  exit(1)
}

const getWarn = silent => (silent ? () => {} : console.warn)

const flatPaths = []

require('yargs')
  .command(
    '$0 [paths..]',
    'Subtract polygons/multipolygons in <paths> from stdin',
    yargs =>
      yargs
        .check(({ paths }) => {
          if (paths === undefined) return true
          paths.forEach(path => flattenPath(path, flatPaths))
          return true
        })
        .epilog('Input is read from stdin, output is written to stdout')
        .example('cat world.geojson | $0 water.geojson > land.geojson'),
    yargs =>
      stdin
        .pipe(
          new DifferenceTransform({
            filesToSubtract: flatPaths,
            warn: getWarn(yargs.silent)
          })
        )
        .on('error', onError)
        .pipe(stdout)
  )
  .option('s', {
    alias: 'silent',
    describe: 'Do not write warnings to stderr',
    boolean: true
  })
  .alias('h', 'help')
  .alias('v', 'version')
  .strict()
  .parse()
