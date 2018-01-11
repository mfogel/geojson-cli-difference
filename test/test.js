/* eslint-env jest */

const fs = require('fs')
const stream = require('stream')
const toStream = require('string-to-stream')
const toString = require('stream-to-string')
const { GeojsonNullTransform, DifferenceTransform } = require('../src/index.js')

test('error on invalid json input', () => {
  const strIn = toStream('this is some bad bad json')
  const onError = jest.fn()
  const nullTransform = new GeojsonNullTransform()
  const strOut = stream.PassThrough()

  strIn
    .pipe(nullTransform)
    .on('error', onError)
    .pipe(strOut)
  strOut.end() // error doesn't propogate, must close final stream explicitly

  expect.assertions(1)
  return toString(strOut).then(function (str) {
    expect(onError).toHaveBeenCalled()
  })
})

test('warn on valid json but invalid geojson input', () => {
  const strIn = toStream('{"valid": "json, but not geojson"}')
  const warn = jest.fn()
  const nullTransform = new GeojsonNullTransform({ warn })
  const strOut = stream.PassThrough()
  strIn.pipe(nullTransform).pipe(strOut)

  expect.assertions(1)
  return toString(strOut).then(function (str) {
    expect(warn).toHaveBeenCalled()
  })
})

const readInStr = fn => fs.readFileSync('test/geojson/' + fn, 'utf8')
const readInJson = fn => JSON.parse(readInStr(fn))

test('stream json in one chunk', () => {
  const strIn = fs.createReadStream('test/geojson/polygon.geojson', 'utf8')
  const nullTransform = new GeojsonNullTransform()
  const strOut = stream.PassThrough()
  strIn.pipe(nullTransform).pipe(strOut)

  expect.assertions(1)
  return toString(strOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('stream json in awkward chunks', () => {
  const strIn = readInStr('polygon.geojson')
  const nullTransform = new GeojsonNullTransform()
  const strOut = stream.PassThrough()
  nullTransform.pipe(strOut)

  // feed the str in in 50 char increments
  for (let i = 0; i <= strIn.length; i += 50) {
    nullTransform.write(strIn.substr(i, 50))
  }
  nullTransform.end()

  expect.assertions(1)
  return toString(strOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon.geojson')
    expect(jsonOut).toEqual(jsonExp)
  })
})

test('subtract one polygon from one polygon', () => {})

test('subtract multiple polygons in different files from one polygon', () => {})

test('subtract multiple polygons in different files from multiple polygons', () => {})

test.skip('end-to-end general subtract multiple polygons in different files from multiple polygons', () => {
  const strIn = readInStr('featurecollection-no-bbox.geojson')
  const adder = new DifferenceTransform()
  const strOut = stream.PassThrough()
  adder.pipe(strOut)

  // feed the str in in 50 char increments
  for (let i = 0; i <= strIn.length; i += 50) {
    adder.write(strIn.substr(i, 50))
  }
  adder.end()

  expect.assertions(1)
  return toString(strOut).then(function (str) {
    const jsonOut = JSON.parse(str)
    const jsonExp = readInJson('polygon-with-all-subtracted.geojson') // TODO: file doesn't exist yet
    expect(jsonOut).toEqual(jsonExp)
  })
})
