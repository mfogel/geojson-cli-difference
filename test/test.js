/* eslint-env jest */

const fs = require('fs')
const stream = require('stream')
const toString = require('stream-to-string')
const turfBooleanEqual = require('@turf/boolean-equal')
const { GeojsonNullTransform, DifferenceTransform } = require('../src/index.js')

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
    subtractFiles: [
      'test/geojson/polygon-20x20.geojson',
      'test/geojson/polygon-2x2.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('feature-collection-empty.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('subtract one polygon from one polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: ['test/geojson/polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20-with-2x2-hole.geojson')
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one polygon from one feature polygon', () => {
  const streamIn = readInStream('feature-polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: ['test/geojson/polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('feature-polygon-20x20-with-2x2-hole.geojson')
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one feature polygon from one feature polygon', () => {
  const streamIn = readInStream('feature-polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: ['test/geojson/feature-polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('feature-polygon-20x20-with-2x2-hole.geojson')
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one feature polygon from one polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: ['test/geojson/feature-polygon-2x2.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-20x20-with-2x2-hole.geojson')
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract one polygon from one polygon to get multipolygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: ['test/geojson/polygon-2x20.geojson']
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson(
      'multipolygon-20x20-missing-vertical-stripe-2x20.geojson'
    )
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract multipolygon from polygon to get polygon', () => {
  const streamIn = readInStream('polygon-20x20.geojson')
  const subtracter = new DifferenceTransform({
    subtractFiles: [
      'test/geojson/multipolygon-20x20-missing-vertical-stripe-2x20.geojson'
    ]
  })
  const streamOut = stream.PassThrough()
  streamIn.pipe(subtracter).pipe(streamOut)

  expect.assertions(1)
  return toString(streamOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-2x20.geojson')
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract multipolygon from multipolygon to get multipolygon', () => {
  const streamIn = readInStream(
    'multipolygon-20x20-adjacent-vertical-stripes.geojson'
  )
  const subtracter = new DifferenceTransform({
    subtractFiles: [
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
    expect(turfBooleanEqual(jsonOut, jsonExp)).toBeTruthy()
  })
})

test('subtract multiple polygons in different files from one polygon', () => {})

test('subtract multiple polygons in different files from multiple polygons', () => {})
