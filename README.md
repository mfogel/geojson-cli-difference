# geojson-cli-difference

Subtract polygon/multipolygons in your geojson files from each other.

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

### `-s` / `--silent`

Send any warnings (normally written to `stderr`) straight to `/dev/null`.

## Changelog

### Master

* Allow no-op: calling without specifying any subtrahends

### 0.1

* Initial release
