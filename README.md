# geojson-cli-difference

Subtract polygon/multipolygons in your geojson files from each other.

## Quickstart

```sh
$ npm install -g geojson-cli-difference
$ cat world.geojson | geojson-cli-difference water.geojson > land.geojson
```

## Usage

A geojson file containing only polgons and/or multipolygons is expected via `stdin`.

One or more geojson files containing only polygons and/or multipolygons are expected as positional arguments.

To `stdout` will be written a geojson file containing the result of subtracting the polygons/multipolygons supplied via positional arguments from those provided via `stdin`.

## Options

### `-s` / `--silent`

Send any warnings (normally written to `stderr`) straight to `/dev/null`.

## Changelog

### Master

* Allow calling without any geojson features to subtract

### 0.1

* Initial release
