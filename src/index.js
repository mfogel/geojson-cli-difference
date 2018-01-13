const fs = require('fs')
const { Transform } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
const turfDifference = require('@turf/difference')
const turfHelpers = require('@turf/helpers')
const turfReverse = require('turf-reverse')

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

    const checkType = (type, from) => {
      if (!type) {
        this.warn(`JSON object without 'type' set found in ${from}. Ignoring`)
        return false
      }

      const operableTypes = [
        'Feature',
        'FeatureCollection',
        'GeometryCollection',
        'Polygon',
        'MultiPolygon'
      ]
      if (!operableTypes.includes(type)) {
        this.warn(
          `Geojson object with type '${type}' found in ${from}. Ignoring`
        )
        return false
      }

      return true
    }

    const subtractGeojsons = (minuend, subtrahends) => {
      if (!checkType(minuend['type'], 'minuend')) return minuend

      if (['Polygon', 'MultiPolygon'].includes(minuend['type'])) {
        subtrahends.some(subtrahend => {
          if (!checkType(subtrahend['type'], 'a subtrahend')) return false

          if (['Polygon', 'MultiPolygon'].includes(subtrahend['type'])) {
            minuend = turfDifference(minuend, subtrahend)
            if (minuend) minuend = turfReverse(minuend).geometry
          }

          if (subtrahend['type'] === 'Feature') {
            minuend = subtractGeojsons(minuend, [subtrahend['geometry']])
          }

          if (subtrahend['type'] === 'GeometryCollection') {
            minuend = subtractGeojsons(minuend, subtrahend['geometries'])
          }

          if (subtrahend['type'] === 'FeatureCollection') {
            minuend = subtractGeojsons(minuend, subtrahend['features'])
          }

          if (!minuend) return true
        })
        return minuend
      }

      if (minuend['type'] === 'Feature') {
        minuend['geometry'] = subtractGeojsons(minuend['geometry'], subtrahends)
      }

      if (minuend['type'] === 'GeometryCollection') {
        minuend['geometries'] = minuend['geometries']
          .map(geom => subtractGeojsons(geom, subtrahends))
          .filter(geom => geom !== null)
      }

      if (minuend['type'] === 'FeatureCollection') {
        minuend['features'] = minuend['features']
          .map(geom => subtractGeojsons(geom, subtrahends))
          .filter(geom => geom !== null)
      }

      return minuend
    }

    let diff = subtractGeojsons(geojson, subtrahends)

    /* Using an empty FeatureCollection to represent an empty result */
    if (!diff) diff = turfHelpers.featureCollection([])

    return diff
  }
}
module.exports = { GeojsonNullTransform, DifferenceTransform }
