const { Transform } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
// const turfDifference = require('@turf/difference')

class GeojsonNullTransform extends Transform {
  constructor (options = {}) {
    options['decodeStrings'] = false
    super(options)
    this.warn = options['warn']
    this.input = ''
  }

  _transform (chunk, encoding, callback) {
    this.input += chunk
    callback()
  }

  _flush (callback) {
    try {
      let geojson = this.parse(this.input)
      this.operate(geojson)
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
  operate (geojson) {
    return geojson
  }
}
module.exports = { GeojsonNullTransform, DifferenceTransform }
