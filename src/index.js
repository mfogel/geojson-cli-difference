const fs = require('fs')
const { Transform } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
const turfDifference = require('@turf/difference')
const turfHelpers = require('@turf/helpers')
const turfReverse = require('turf-reverse')

const subtractGeojsons = (minuend, subtrahends) => {
  if (minuend['coordinates']) {
    subtrahends.some(subtrahend => {
      minuend = turfDifference(minuend, subtrahend)
      if (!minuend) return true
      minuend = turfReverse(minuend).geometry
    })
    return minuend
  }

  return minuend
}

class GeojsonNullTransform extends Transform {
  constructor (options = {}) {
    const warn = options['warn']
    delete options['warn']

    options['decodeStrings'] = false
    super(options)

    this.input = ''
    this.warn = warn
  }

  _transform (chunk, encoding, callback) {
    this.input += chunk
    callback()
  }

  _flush (callback) {
    try {
      let geojson = this.parse(this.input)
      geojson = this.operate(geojson)
      callback(null, JSON.stringify(geojson))
    } catch (err) {
      callback(err)
    }
  }

  parse (str) {
    let geojson
    try {
      geojson = JSON.parse(str)
    } catch (err) {
      throw new SyntaxError(`Unable to parse input as JSON: ${err.message}`)
    }

    const errors = geojsonhint.hint(geojson)
    errors.forEach(e =>
      this.warn(`Warning: Input is not valid GeoJSON: ${e.message}`)
    )

    return geojson
  }

  operate (geojson) {
    // makes for easy testing
    return geojson
  }
}

class DifferenceTransform extends GeojsonNullTransform {
  constructor (options = {}) {
    const subtractFiles = options['subtractFiles']
    delete options['subtractFiles']

    super(options)

    this.subtractFiles = subtractFiles
  }

  operate (geojson) {
    const subtrahends = this.subtractFiles.map(file =>
      this.parse(fs.readFileSync(file, 'utf8'))
    )
    let diff = subtractGeojsons(geojson, subtrahends)
    /* Using an empty FeatureCollection to represent an empty result */
    if (!diff) diff = turfHelpers.featureCollection([])
    return diff
  }
}
module.exports = { GeojsonNullTransform, DifferenceTransform }
