/* eslint-env jest */

const fs = require('fs')
const stream = require('stream')
const toString = require('stream-to-string')
const turfBooleanClockwise = require('@turf/boolean-clockwise')
const {
  bboxRegex,
  bboxOverlap,
  flattenPath,
  GeojsonNullTransform,
  DifferenceTransform
} = require('../src/index.js')

const GeojsonEquality = require('geojson-equality')
const geojsonEq = new GeojsonEquality()

const readInStream = fn => fs.createReadStream('test/geojson/' + fn, 'utf8')
const readInStr = fn => fs.readFileSync('test/geojson/' + fn, 'utf8')
const readInJson = fn => JSON.parse(readInStr(fn))

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
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
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
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
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
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
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

test('flattenPath complies flatten paths from file and directory paths', () => {
  const filePath = 'test/geojson/polygon-20x20.geojson'
  const dirPath = 'test/geojson/dir'

  const flatPaths = []
  const expectedFlatPaths = [
    filePath,
    'test/geojson/dir/polygon-2x2.geojson',
    'test/geojson/dir/polygon-2x20.geojson'
  ]

  flattenPath(filePath, flatPaths)
  flattenPath(dirPath, flatPaths)
  expect(flatPaths).toEqual(expectedFlatPaths)
})

test('flattenPath throws error on non-existent file', () => {
  const path = 'test/geojson/does-not-exist'

  expect(() => flattenPath(path, [])).toThrow()
})

test('respect bboxes in filenames - positive whole numbers - base case ignore bbox', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/bbox-wrong-positive-whole.[50,60,70,80].geojson'
    ]
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

test('respect bboxes in filenames - positive whole numbers - respect bbox', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/bbox-wrong-positive-whole.[50,60,70,80].geojson'
    ],
    respectBboxesInFilenames: true
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('respect bboxes in filenames - negative decimal numbers - base case ignore bbox', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/bbox-wrong-negative-decimal.[-121.2,-121.2,-111.11,-111.11].geojson'
    ]
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

test('respect bboxes in filenames - negative decimal numbers - respect bbox', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: [
      'test/geojson/bbox-wrong-negative-decimal.[-121.2,-121.2,-111.11,-111.11].geojson'
    ],
    respectBboxesInFilenames: true
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20.geojson')
    expect(geojsonEq.compare(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('respect bboxes in filenames - subtrahend files without bboxes unaffected', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/polygon-2x2.geojson'],
    respectBboxesInFilenames: true
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

test('respect bboxes in filenames - subtrahend files with overlapping bboxes', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    filesToSubtract: ['test/geojson/bbox-right.[-1,-1,1,1].geojson'],
    respectBboxesInFilenames: true
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

test('bbox regex misses', () => {
  expect(bboxRegex.test('')).toBeFalsy()
  expect(bboxRegex.test('[]')).toBeFalsy()
  expect(bboxRegex.test('[234]')).toBeFalsy()
  expect(bboxRegex.test('[,,,]')).toBeFalsy()
  expect(bboxRegex.test('[a,b,c,]')).toBeFalsy()
  expect(bboxRegex.test('[-,-,-,]')).toBeFalsy()
  expect(bboxRegex.test('[-234.34]')).toBeFalsy()
  expect(bboxRegex.test('[-,4,3,4]')).toBeFalsy()
})

test('bbox regex hits', () => {
  expect(bboxRegex.test('[0,0,0,0]')).toBeTruthy()
  expect(bboxRegex.test('asdf.[0,0,0,0].asdflkj')).toBeTruthy()
  expect(bboxRegex.test('[-0,-0,-0,-0]')).toBeTruthy()
  expect(bboxRegex.test('[4.,4,-3,34]')).toBeTruthy()
  expect(bboxRegex.test('[-2.3,5.4,-2.5,2.3][0,0,0,0]')).toBeTruthy()
})

test('bbox overlap misses', () => {
  expect(bboxOverlap([0, 0, 1, 1], [2, 2, 3, 3])).toBeFalsy()
  expect(bboxOverlap([0, 0, 1, 1], [-4, -4, -3, -3])).toBeFalsy()
  expect(bboxOverlap([0, 0, 10, 10], [12, 2, 13, 3])).toBeFalsy()
  expect(bboxOverlap([0, 0, 10, 10], [2, 12, 3, 13])).toBeFalsy()
})

test('bbox overlap hits', () => {
  expect(bboxOverlap([0, 0, 10, 10], [2, 2, 3, 3])).toBeTruthy()
  expect(bboxOverlap([0, 0, 10, 10], [8, 8, 13, 13])).toBeTruthy()
  expect(bboxOverlap([0, 0, 10, 10], [-8, -8, 13, 13])).toBeTruthy()
  expect(bboxOverlap([0, 0, 10, 10], [-8, -8, 3, 3])).toBeTruthy()
})

test('bbox overlap antimeridian', () => {
  expect(bboxOverlap([175, 0, -175, 1], [2, 2, 3, 3])).toBeFalsy()
  expect(bboxOverlap([175, 0, -175, 1], [-177, -1, -176, 3])).toBeTruthy()
})
