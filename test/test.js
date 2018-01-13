/* eslint-env jest */

const fs = require('fs')
const stream = require('stream')
const toString = require('stream-to-string')
const turfBooleanClockwise = require('@turf/boolean-clockwise')
const { GeojsonNullTransform, DifferenceTransform } = require('../src/index.js')

const GeojsonEquality = require('geojson-equality')
const geojsonEq = new GeojsonEquality()

const readInStream = fn => fs.createReadStream('test/geojson/' + fn, 'utf8')
const readInStr = fn => fs.readFileSync('test/geojson/' + fn, 'utf8')
const readInJson = fn => JSON.parse(readInStr(fn))

/* NOTE: PR open to add this to geojson-equality
 *       https://github.com/geosquare/geojson-equality/pull/11 */
const areGeometryCollectionsEqual = (gc1, gc2) => {
  if (gc1['type'] !== 'GeometryCollection') return false
  if (gc2['type'] !== 'GeometryCollection') return false
  if (!gc1['geometries'] || !gc2['geometries']) return false
  if (gc1['geometries'].length !== gc2['geometries'].length) return false
  for (let i = 0; i < gc1['geometries'].length; i++) {
    if (!geojsonEq.compare(gc1['geometries'][i], gc2['geometries'][i])) {
      return false
    }
  }
  return true
}

/* NOTE: PR open to add this to geojson-equality
 *       https://github.com/geosquare/geojson-equality/pull/10 */
const areFeatureCollectionsEqual = (gc1, gc2) => {
  if (gc1['type'] !== 'FeatureCollection') return false
  if (gc2['type'] !== 'FeatureCollection') return false
  if (!gc1['features'] || !gc2['features']) return false
  if (gc1['features'].length !== gc2['features'].length) return false
  for (let i = 0; i < gc1['features'].length; i++) {
    if (!geojsonEq.compare(gc1['features'][i], gc2['features'][i])) {
      return false
    }
  }
  return true
}

test('error on invalid json input', () => {
  const streamIn = readInStream('not-json.geojson')
  const nullTransform = new GeojsonNullTransform()
  const streamOut = stream.PassThrough()

  const tracker = jest.fn()
  const onError = () => {
    tracker()
    streamOut.end() // error doesn't propogate, must close final stream explicitly
  }

  streamIn
    .pipe(nullTransform)
    .on('error', onError)
    .pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(tracker).toHaveBeenCalled()
  })
})

test('warn on valid json but invalid geojson input', () => {
  const streamIn = readInStream('json-but-not-geojson.geojson')
  const warn = jest.fn()
  const nullTransform = new GeojsonNullTransform({ warn })
  const streamOut = stream.PassThrough()
  streamIn.pipe(nullTransform).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(warn).toHaveBeenCalled()
  })
})

test('warn on non multipolygon/polygon geometries input', () => {
  const streamIn = readInStream('point-origin.geojson')
  const warn = jest.fn()
  const subtracter = new DifferenceTransform({ warn, filesToSubtract: [] })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(warn).toHaveBeenCalled()
  })
})

test('error on invalid json in subtrahend', () => {
  const streamIn = readInStream('polygon-2x2.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['not-json.geojson']
  })
  const streamOut = stream.PassThrough()

  const tracker = jest.fn()
  const onError = () => {
    tracker()
    streamOut.end() // error doesn't propogate, must close final stream explicitly
  }

  streamIn
    .pipe(subtracter)
    .on('error', onError)
    .pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(tracker).toHaveBeenCalled()
  })
})

test('warn on valid json but invalid geojson in subtrahend', () => {
  const streamIn = readInStream('polygon-2x2.geojson')
  const warn = jest.fn()
  const subtracter = new DifferenceTransform({
    warn,
    filesToSubtract: ['test/geojson/json-but-not-geojson.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(warn).toHaveBeenCalled()
  })
})

test('warn on non multipolygon/polygon geometries in subtrahend', () => {
  const streamIn = readInStream('json-but-not-geojson.geojson')
  const warn = jest.fn()
  const subtracter = new DifferenceTransform({
    warn,
    filesToSubtract: ['test/geojson/point-origin.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    expect(warn).toHaveBeenCalled()
  })
})

test('stream json in one chunk', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const nullTransform = new GeojsonNullTransform()
  const streamOut = stream.PassThrough()
  streamIn.pipe(nullTransform).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('stream json in awkward chunks', () => {
  const strIn = readInStr('polygon-20x20.geojson')
  const nullTransform = new GeojsonNullTransform()
  const streamOut = stream.PassThrough()
  nullTransform.pipe(streamOut)

  // feed the str in in 50 char increments
  for (let i = 0; i <= strIn.length; i += 50) {
    nullTransform.write(strIn.substr(i, 50))
  }
  nullTransform.end()

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('subtract encompassing polygon from one polygon', () => {
  const streamIn = readInStream('polygon-2x2.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/polygon-20x20.geojson',
      'test/geojson/polygon-2x2.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('featurecollection-empty.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('subtract one polygon from one polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20-with-2x2-hole.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('ensure correct winding order on output', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(2)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    expect(turfBooleanClockwise(jsonOut.coordinates[0])).toBeFalsy()
    expect(turfBooleanClockwise(jsonOut.coordinates[1])).toBeTruthy()
  })
})

test('subtract one polygon from one feature polygon', () => {
  const streamIn = readInStream('feature-polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('feature-polygon-20x20-with-2x2-hole.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one feature polygon from one feature polygon', () => {
  const streamIn = readInStream('feature-polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/feature-polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('feature-polygon-20x20-with-2x2-hole.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one feature polygon from one polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/feature-polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20-with-2x2-hole.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one polygon from one polygon to get multipolygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x20.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'multipolygon-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract multipolygon from polygon to get polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/multipolygon-20x20-missing-vertical-stripe-2x20.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-2x20.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract multipolygon from multipolygon to get multipolygon', () => {
  const streamIn = readInStream(
    'multipolygon-20x20-adjacent-vertical-stripes.geojson'
  )
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/multipolygon-2x20-adjacent-vertical-stripes.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'multipolygon-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract polygon from geometrycollection to get geometrycollection', () => {
  const streamIn = readInStream(
    'geometrycollection-20x20-adjacent-vertical-stripes.geojson'
  )
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x20.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'geometrycollection-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(areGeometryCollectionsEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

/* https://github.com/Turfjs/turf/issues/1224 */
test.skip('subtract multipolygon from geometrycollection to get geometrycollection', () => {
  const streamIn = readInStream(
    'geometrycollection-20x20-adjacent-vertical-stripes.geojson'
  )
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/multipolygon-2x20-adjacent-vertical-stripes.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'geometrycollection-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(areGeometryCollectionsEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract geometrycollection from polygon to get polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/geometrycollection-20x20-missing-vertical-stripe-2x20.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-2x20.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract polygon from featurecollection to get featurecollection', () => {
  const streamIn = readInStream(
    'featurecollection-20x20-adjacent-vertical-stripes.geojson'
  )
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x20.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'featurecollection-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(areFeatureCollectionsEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract featurecollection from polygon to get polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/featurecollection-20x20-missing-vertical-stripe-2x20.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-2x20.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})
