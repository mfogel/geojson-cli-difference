#!/usr/bin/env node

const fs = require('fs')
const { stdin, stdout, exit } = require('process')
const { DifferenceTransform } = require('./index.js')

const onError = err => {
  console.error(`Error: ${err.message}`)
  exit(1)
}

const getWarn = silent => (silent ? () => {} : console.warn)

require('yargs')
  .command(
    '$0 [files..]',
    'Subtract polygons/multipolygons in <files> from stdin',
    yargs =>
      yargs
        .check(({ files }) => {
          if (files === undefined) return true
          files.forEach(file => fs.accessSync(file, fs.constants.R_OK))
          return true
        })
        .epilog('Input is read from stdin, output is written to stdout')
        .example('cat world.geojson | $0 water.geojson > land.geojson'),
    yargs =>
      stdin
        .pipe(
          new DifferenceTransform({
            filesToSubtract: yargs.files || [],
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
