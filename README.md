# geojson-cli-difference

Subtract Polygons & MultiPolygons in your GeoJSON files from each other.

[![npm version](https://img.shields.io/npm/v/geojson-cli-difference.svg)](https://www.npmjs.com/package/geojson-cli-difference)
[![build status](https://img.shields.io/travis/mfogel/geojson-cli-difference.svg)](https://travis-ci.org/mfogel/geojson-cli-difference)
[![test coverage](https://img.shields.io/coveralls/mfogel/geojson-cli-difference/master.svg)](https://coveralls.io/r/mfogel/geojson-cli-difference)

## Quickstart

```sh
$ npm install -g geojson-cli-difference
$ cat world.geojson | geojson-cli-difference water.geojson > land.geojson
```

## Usage

A geojson object containing polygons and/or multipolygons is expected via `stdin`. This will be the [minuend](https://en.wiktionary.org/wiki/minuend).

Zero or more [subtrahends](https://en.wiktionary.org/wiki/subtrahend) are expected to be specified via positional arguments. Each positional argument may be either

* a path to a geojson file containing polygons and/or multipolygons
* a path to a directory full of geojson files containing polygons and/or multipolygons

The result of performing the subtraction will be written to `stdout` as a geojson object.

If no subtrahends are specifed, the minuend will be passed through from `stdin` to `stdout` unchanged.

## Options

### `--respect-bboxes-in-filenames`

Scan each subtrahend filename for something that looks like a stringified geojson [bounding box](https://tools.ietf.org/html/rfc7946#section-5). Examples of matching filenames:

* `[-10,-10,10,10].json`
* `424242.[-58.5314588,-34.705637,-58.3351249,-34.5265535].geojson`

If a bounding box is found in a filename, a comparison is made with the bounding box of the minuend. If there is no overlap, the subtraction process for that subtrahend is short-curcuited, thus avoiding the need to perform the I/O of reading the contents of the file in from disk to memory.

This feature can be used as a performance boost in the case when trying to employ a large number of subtrahends of which only a small percent actually overlap the minuend.

### `-s` / `--silent`

Send any warnings (normally written to `stderr`) straight to `/dev/null`.

## Changelog

### 0.2.1

* set up CI: travis, coveralls
* performance imprv: don't read in all subtrahends at the same time

### 0.2

* Add option --respect-bboxes-in-filenames
* Allow paths to directories full of geojson files to be used as subtrahends to be given as positional arguemnts
* Allow no-op: calling without specifying any subtrahends

### 0.1

* Initial release
